"""
Family management routes for Settings modal
- GET /api/family/members - Get family members and children
- POST /api/family/invite - Invite a tutor (or other member)
- PATCH /api/family/tutors/{member_id} - Update tutor's child_scope
- POST /api/family/child/permanent_delete - Remove a child, their data, family membership, and linked auth users
- POST /api/family/child/unlink_login - Remove a child's linked login and child invites only; keeps the child record and data
"""
import json
import os
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field, EmailStr
from typing import Dict, List, Optional, Set
from datetime import datetime, timedelta, timezone
import sys
from pathlib import Path

# Add parent directory to path
backend_dir = Path(__file__).parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from auth import get_current_user, rate_limiter
from helpers import get_family_id_for_user, child_belongs_to_family, delete_signup_confirmation_sent_for_email
from logger import log_event
from supabase_client import get_admin_client
from email_service import send_invite_email

router = APIRouter(prefix="/api/family", tags=["family"])

# --- Pydantic Models ---

class ChildOut(BaseModel):
    id: str
    name: str
    first_name: Optional[str] = None
    grade: Optional[str] = None
    grade_level: Optional[str] = None
    archived: Optional[bool] = False


class ChildInviteSummaryOut(BaseModel):
    """Per-child invite/link state (service role; clients often cannot read invites via RLS)."""

    invite_status: str = "none"  # none | pending | accepted
    invite_email: Optional[str] = None
    invite_sent_at: Optional[str] = None

class MemberOut(BaseModel):
    id: str
    name: Optional[str] = None
    email: Optional[str] = None
    # Auth user for this row (child/student login, parent, tutor). Exposed for linked-child UI.
    user_id: Optional[str] = None
    role: str
    member_role: Optional[str] = None
    child_scope: List[str] = Field(default_factory=list)
    # Linked child/student row: which children.id this login is bound to (client uses for invite status + email)
    child_id: Optional[str] = None

class FamilyMembersOut(BaseModel):
    id: Optional[str] = None
    family_name: Optional[str] = None
    onboarding_completed: Optional[bool] = False  # stored flag (convenience only)
    onboarding_is_valid: Optional[bool] = False  # derived: default_planning_mode + has_children + has_subjects
    default_planning_mode: Optional[str] = None  # HOMESCHOOL_COMPLIANCE | AFTERSCHOOL_GOALS | NONE
    children: List[ChildOut] = Field(default_factory=list)
    members: List[MemberOut] = Field(default_factory=list)
    # True when the signed-in user is a child/student who joined via an accepted parent invite (RLS-safe for clients)
    child_linked_via_accepted_invite: Optional[bool] = None
    # children.id -> pending/accepted/none (admin client; fixes Family list when Supabase client cannot SELECT invites)
    child_invite_summaries: Dict[str, ChildInviteSummaryOut] = Field(default_factory=dict)

class InviteTutorIn(BaseModel):
    email: EmailStr = Field(..., description="Email of the member to invite")
    role: str = Field("tutor", description="Role: 'tutor', 'child', or 'parent'")
    child_ids: List[str] = Field(default_factory=list, description="List of child IDs (required for tutors, single ID for children, empty for parents)")

class InviteTutorOut(BaseModel):
    invite_code: str
    invite_url: str

class UpdateTutorScopeIn(BaseModel):
    child_ids: List[str] = Field(..., description="List of child IDs the tutor can see")

class UpdateFamilyIn(BaseModel):
    family_name: Optional[str] = Field(None, description="Family display name (e.g. 'Doodle Family')")

class PermanentDeleteChildIn(BaseModel):
    child_id: str = Field(..., description="children.id to permanently remove")
    confirm_name: str = Field(..., min_length=1, description="Must match child's first name (case-insensitive)")


class UnlinkChildLoginIn(BaseModel):
    child_id: str = Field(..., description="children.id whose linked learner login should be removed")


def _auth_admin_email_for_user_id(supabase, uid: str) -> Optional[str]:
    """Resolve login email from Auth when profiles.email is empty (supabase-py response shapes vary)."""
    try:
        res = supabase.auth.admin.get_user_by_id(uid)
    except Exception as e:
        log_event("family.get_members.auth_email_lookup_error", target_uid=uid, error=str(e))
        return None
    u = getattr(res, "user", None)
    if u is None and isinstance(res, dict):
        u = res.get("user")
    if u is None:
        return None
    if isinstance(u, dict):
        em = u.get("email")
        return str(em).strip() if em else None
    em = getattr(u, "email", None)
    if em:
        return str(em).strip()
    try:
        raw = u.model_dump()  # type: ignore[attr-defined]
        em2 = raw.get("email") if isinstance(raw, dict) else None
        return str(em2).strip() if em2 else None
    except Exception:
        return None


def _accepted_invite_email_by_child_id(supabase, family_id: str) -> Dict[str, str]:
    """Latest accepted child invite email per children.id (fallback when profile/auth email missing)."""
    best: Dict[str, tuple] = {}
    try:
        inv_res = (
            supabase.table("invites")
            .select("child_id, email, accepted_at")
            .eq("family_id", family_id)
            .eq("role", "child")
            .execute()
        )
        for row in inv_res.data or []:
            if not row.get("accepted_at"):
                continue
            scid = str(row.get("child_id") or "").strip()
            em = str(row.get("email") or "").strip()
            if not scid or not em:
                continue
            acc = str(row.get("accepted_at") or "")
            prev = best.get(scid)
            if prev is None or acc >= prev[1]:
                best[scid] = (em, acc)
    except Exception as e:
        log_event("family.get_members.invite_email_map_error", error=str(e))
        return {}
    return {k: v[0] for k, v in best.items()}


def _iso_or_none(v) -> Optional[str]:
    if v is None:
        return None
    if hasattr(v, "isoformat"):
        try:
            return v.isoformat()
        except Exception:
            return str(v)
    return str(v) if v else None


def _child_invite_summaries_map(supabase, family_id: str, child_ids: List[str]) -> Dict[str, ChildInviteSummaryOut]:
    """
    Match lib/services/childInviteStatus.fetchChildInviteSummaries using service role.
    Ensures pending invites appear in Family UI when RLS hides invites from the anon client.
    """
    ids = list({str(c).strip() for c in child_ids if c is not None and str(c).strip()})
    out: Dict[str, ChildInviteSummaryOut] = {
        cid: ChildInviteSummaryOut(invite_status="none", invite_email=None, invite_sent_at=None) for cid in ids
    }
    if not ids:
        return out

    linked: Dict[str, Optional[str]] = {}
    try:
        fm_res = (
            supabase.table("family_members")
            .select("child_id, child_scope, user_id, member_role")
            .eq("family_id", family_id)
            .execute()
        )
        for row in fm_res.data or []:
            role = _norm_member_role(row.get("member_role"))
            if role not in ("child", "student"):
                continue
            uid = row.get("user_id")
            cid = row.get("child_id")
            if cid is not None and str(cid).strip():
                linked[str(cid).strip()] = str(uid).strip() if uid else None
            raw_scope = row.get("child_scope") or []
            if isinstance(raw_scope, str):
                try:
                    raw_scope = json.loads(raw_scope)
                except Exception:
                    raw_scope = []
            if isinstance(raw_scope, list):
                for x in raw_scope:
                    if x is None:
                        continue
                    sid = str(x).strip()
                    if sid and sid not in linked:
                        linked[sid] = str(uid).strip() if uid else None
    except Exception as e:
        log_event("family.child_invite_summaries.fm_error", error=str(e))

    email_by_user: Dict[str, str] = {}
    uids = [u for u in set(linked.values()) if u]
    if uids:
        try:
            prof_res = supabase.table("profiles").select("id, email").in_("id", uids).execute()
            for p in prof_res.data or []:
                pid = p.get("id")
                em = p.get("email")
                if pid and em:
                    email_by_user[str(pid)] = str(em).strip()
        except Exception as e:
            log_event("family.child_invite_summaries.profiles_error", error=str(e))

    pending_by_child: Dict[str, tuple] = {}
    accepted_by_child: Dict[str, tuple] = {}
    try:
        # Child invites often store the target id only in child_scope (RPC/direct insert);
        # filtering by child_id alone misses pending rows.
        inv_res = (
            supabase.table("invites")
            .select("child_id, child_scope, email, accepted_at, created_at, updated_at, expires_at")
            .eq("family_id", family_id)
            .eq("role", "child")
            .execute()
        )
        id_set = set(out.keys())
        for inv in inv_res.data or []:
            raw_scope = inv.get("child_scope") or []
            if isinstance(raw_scope, str):
                try:
                    raw_scope = json.loads(raw_scope)
                except Exception:
                    raw_scope = []
            targets: List[str] = []
            cid = inv.get("child_id")
            if cid is not None and str(cid).strip():
                targets.append(str(cid).strip())
            if isinstance(raw_scope, list):
                for x in raw_scope:
                    if x is None:
                        continue
                    sx = str(x).strip()
                    if sx:
                        targets.append(sx)
            keys = sorted({t for t in targets if t in id_set})
            if not keys:
                continue
            for key in keys:
                if inv.get("accepted_at"):
                    em = str(inv.get("email") or "").strip() or None
                    acc = _iso_or_none(inv.get("accepted_at")) or ""
                    prev = accepted_by_child.get(key)
                    prev_t = prev[1] if prev else ""
                    if not prev or acc >= prev_t:
                        accepted_by_child[key] = (em, acc)
                    continue
                exp = inv.get("expires_at")
                if exp:
                    try:
                        exp_s = str(exp).replace("Z", "+00:00")
                        exp_dt = datetime.fromisoformat(exp_s)
                        if exp_dt.tzinfo is None:
                            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
                        if exp_dt < datetime.now(timezone.utc):
                            continue
                    except Exception:
                        pass
                sent = inv.get("updated_at") or inv.get("created_at")
                t = _iso_or_none(sent) or ""
                prev = pending_by_child.get(key)
                prev_t = prev[1] if prev else ""
                em = str(inv.get("email") or "").strip() or None
                if not prev or t > prev_t:
                    pending_by_child[key] = (em, t, sent)
    except Exception as e:
        log_event("family.child_invite_summaries.invites_error", error=str(e))

    for cid in ids:
        if cid in linked:
            uid = linked.get(cid)
            em = email_by_user.get(uid) if uid else None
            out[cid] = ChildInviteSummaryOut(invite_status="accepted", invite_email=em, invite_sent_at=None)
        elif cid in accepted_by_child:
            em_acc, _ = accepted_by_child[cid]
            out[cid] = ChildInviteSummaryOut(invite_status="accepted", invite_email=em_acc, invite_sent_at=None)
        elif cid in pending_by_child:
            em_p, _, sent_raw = pending_by_child[cid]
            out[cid] = ChildInviteSummaryOut(
                invite_status="pending",
                invite_email=em_p,
                invite_sent_at=_iso_or_none(sent_raw),
            )
    return out


# --- Permanent child delete helpers ---


def _norm_child_name(value: Optional[str]) -> str:
    if not value:
        return ""
    return " ".join(str(value).strip().lower().split())


def _norm_member_role(value: Optional[str]) -> str:
    return (value or "").strip().lower()


def _user_is_parent_for_family(supabase, user_id: str, family_id: str) -> bool:
    """
    True if this user may act as a parent for this family. Uses family_members when present;
    case-insensitive role checks; falls back to profiles when the account has no parent row
    (legacy/onboarding) but profiles.family_id matches and role is not child/student/tutor.
    """
    try:
        mem_res = (
            supabase.table("family_members")
            .select("member_role")
            .eq("user_id", user_id)
            .eq("family_id", family_id)
            .execute()
        )
        rows = mem_res.data or []
        saw_tutor_only = False
        for row in rows:
            mr = _norm_member_role(row.get("member_role"))
            if mr == "parent":
                return True
            if mr in ("child", "student"):
                return False
            if mr == "tutor":
                saw_tutor_only = True
        if saw_tutor_only and rows:
            return False
    except Exception:
        pass
    try:
        profile_res = (
            supabase.table("profiles")
            .select("role, family_id")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        prof_list = profile_res.data or []
        if not prof_list:
            return False
        prof = prof_list[0]
        pr = _norm_member_role(prof.get("role"))
        if pr == "parent":
            return True
        if pr in ("child", "student", "tutor"):
            return False
        fid = prof.get("family_id")
        if fid and str(fid) == str(family_id):
            return True
    except Exception:
        pass
    return False


def _safe_delete_eq(supabase, table: str, filters: dict) -> None:
    try:
        q = supabase.table(table).delete()
        for col, val in filters.items():
            q = q.eq(col, val)
        q.execute()
    except Exception as e:
        log_event("family.permanent_delete.skip_table", table=table, error=str(e))


def _delete_event_cascade(supabase, event_id: str) -> None:
    for tbl, col in (
        ("attendance_records", "event_id"),
        ("event_outcomes", "event_id"),
        ("activity_instances", "event_id"),
    ):
        try:
            supabase.table(tbl).delete().eq(col, event_id).execute()
        except Exception:
            pass
    try:
        supabase.table("events").delete().eq("id", event_id).execute()
    except Exception:
        pass


def _purge_child_from_events(supabase, family_id: str, child_id: str) -> None:
    cid = str(child_id)
    try:
        res = supabase.table("events").select("id").eq("family_id", family_id).eq("child_id", cid).execute()
        for row in res.data or []:
            eid = row.get("id")
            if eid:
                _delete_event_cascade(supabase, str(eid))
    except Exception as e:
        log_event("family.permanent_delete.events_primary", error=str(e))

    try:
        res = supabase.table("events").select("id, child_id, child_ids").eq("family_id", family_id).execute()
        for row in res.data or []:
            mult = row.get("child_ids")
            if not mult or not isinstance(mult, list):
                continue
            if cid not in [str(x) for x in mult]:
                continue
            eid = row.get("id")
            if not eid:
                continue
            new_mult = [x for x in mult if str(x) != cid]
            primary = row.get("child_id")
            if len(new_mult) == 0 and not primary:
                _delete_event_cascade(supabase, str(eid))
            else:
                try:
                    supabase.table("events").update({"child_ids": new_mult}).eq("id", str(eid)).execute()
                except Exception as ex:
                    log_event("family.permanent_delete.events_patch_child_ids", event_id=eid, error=str(ex))
    except Exception as e:
        log_event("family.permanent_delete.events_child_ids", error=str(e))


def _delete_child_scoped_rows(supabase, family_id: str, child_id: str) -> None:
    cid = str(child_id)
    tables_family_child = [
        "assignments",
        "attendance_records",
        "planner_exclusions",
        "family_compliance_checklist",
    ]
    for tbl in tables_family_child:
        _safe_delete_eq(supabase, tbl, {"family_id": family_id, "child_id": cid})

    tables_child_only = [
        "child_support_profiles",
        "subject_goals",
        "grades",
        "learning_suggestions",
        "plan_suggestions",
        "material_children",
        "subject_track",
        "evidence",
    ]
    for tbl in tables_child_only:
        _safe_delete_eq(supabase, tbl, {"child_id": cid})

    try:
        supabase.table("activity_instances").delete().eq("child_id", cid).execute()
    except Exception:
        pass


def _parse_child_scope_raw(raw) -> list:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except Exception:
            return []
    return []


def _detach_child_login_members(supabase, family_id: str, child_id: str) -> List[str]:
    """
    Remove family_members rows that bind a child/student login to this children.id.
    Returns distinct auth user IDs to remove via Admin API. Does not change tutors or the children row.
    """
    cid = str(child_id)
    auth_ids_to_delete: List[str] = []
    try:
        res = (
            supabase.table("family_members")
            .select("id, user_id, member_role, child_id, child_scope")
            .eq("family_id", family_id)
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        log_event("family.detach_child_login.family_members_read", error=str(e))
        return []

    for m in rows:
        mid = m.get("id")
        if not mid:
            continue
        role = (m.get("member_role") or "").lower()
        if role not in ("child", "student"):
            continue
        uid = m.get("user_id")
        m_child = m.get("child_id")
        scope = _parse_child_scope_raw(m.get("child_scope"))
        scope_strs = [str(x) for x in scope]

        if m_child and str(m_child) == cid:
            if uid:
                auth_ids_to_delete.append(str(uid))
            try:
                supabase.table("family_members").delete().eq("id", mid).execute()
            except Exception as e:
                log_event("family.detach_child_login.fm_child_row", member_id=mid, error=str(e))
            continue
        if cid in scope_strs:
            new_scope = [x for x in scope if str(x) != cid]
            try:
                if not new_scope:
                    if uid:
                        auth_ids_to_delete.append(str(uid))
                    supabase.table("family_members").delete().eq("id", mid).execute()
                else:
                    supabase.table("family_members").update(
                        {"child_scope": new_scope, "updated_at": datetime.now().isoformat()}
                    ).eq("id", mid).execute()
            except Exception as e:
                log_event("family.detach_child_login.fm_student_scope", member_id=mid, error=str(e))

    out: List[str] = []
    seen: Set[str] = set()
    for u in auth_ids_to_delete:
        if u and u not in seen:
            seen.add(u)
            out.append(u)
    return out


def _apply_family_members_for_deleted_child(supabase, family_id: str, child_id: str) -> List[str]:
    """
    Remove tutors' scope, remove child/student rows, return auth user IDs to delete.
    """
    cid = str(child_id)
    auth_ids_to_delete: List[str] = list(_detach_child_login_members(supabase, family_id, cid))

    try:
        res = (
            supabase.table("family_members")
            .select("id, user_id, member_role, child_id, child_scope")
            .eq("family_id", family_id)
            .execute()
        )
        rows = res.data or []
    except Exception as e:
        log_event("family.permanent_delete.family_members_read", error=str(e))
        return auth_ids_to_delete

    for m in rows:
        mid = m.get("id")
        if not mid:
            continue
        role = (m.get("member_role") or "").lower()
        if role != "tutor":
            continue
        scope = _parse_child_scope_raw(m.get("child_scope"))
        scope_strs = [str(x) for x in scope]
        if cid not in scope_strs:
            continue
        new_scope = [x for x in scope if str(x) != cid]
        try:
            if not new_scope:
                supabase.table("family_members").delete().eq("id", mid).execute()
            else:
                supabase.table("family_members").update(
                    {"child_scope": new_scope, "updated_at": datetime.now().isoformat()}
                ).eq("id", mid).execute()
        except Exception as e:
            log_event("family.permanent_delete.tutor_scope", member_id=mid, error=str(e))

    out: List[str] = []
    seen: Set[str] = set()
    for u in auth_ids_to_delete:
        if u and u not in seen:
            seen.add(u)
            out.append(u)
    return out


def _delete_linked_auth_users(supabase, user_ids: List[str]) -> None:
    admin = getattr(getattr(supabase, "auth", None), "admin", None)
    delete_user = getattr(admin, "delete_user", None) if admin else None
    if not callable(delete_user):
        log_event("family.permanent_delete.auth_admin_missing", hint="upgrade supabase-py or use service role client")
        return
    for uid in user_ids:
        if not uid:
            continue
        try:
            supabase.table("notification_preferences").delete().eq("user_id", uid).execute()
        except Exception:
            pass
        try:
            pr = supabase.table("profiles").select("email").eq("id", uid).maybe_single().execute()
            em = (pr.data or {}).get("email")
            if em:
                delete_signup_confirmation_sent_for_email(str(em))
        except Exception:
            pass
        try:
            delete_user(uid)
        except Exception as e:
            log_event("family.permanent_delete.auth_delete_failed", user_id=uid, error=str(e))


def _permanent_delete_child_data(supabase, family_id: str, child_id: str) -> List[str]:
    cid = str(child_id)
    try:
        supabase.table("invites").delete().eq("family_id", family_id).eq("child_id", cid).execute()
    except Exception as e:
        log_event("family.permanent_delete.invites", error=str(e))

    _delete_child_scoped_rows(supabase, family_id, cid)
    _purge_child_from_events(supabase, family_id, cid)

    auth_ids = _apply_family_members_for_deleted_child(supabase, family_id, cid)

    try:
        supabase.table("children").delete().eq("id", cid).eq("family_id", family_id).execute()
    except Exception as e:
        log_event("family.permanent_delete.children_row", error=str(e))
        raise

    return auth_ids


# --- Routes ---

@router.get("/members", response_model=FamilyMembersOut)
async def get_family_members(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Get family members and children for the current user's family.
    Returns family name, children list, and all members (parents, tutors, children).
    Resilient: never returns 500; returns empty data if a table is missing or query fails.
    """
    log_event("family.get_members.start", user_id=user["id"])

    try:
        try:
            family_id = get_family_id_for_user(user["id"])
        except Exception as e:
            log_event("family.get_members.get_family_id_error", user_id=user["id"], error=str(e))
            family_id = None

        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )

        supabase = get_admin_client()
        family_name = None
        children = []
        members = []

        # Get family row (name, onboarding_completed, default_planning_mode)
        onboarding_completed = False
        default_planning_mode = None
        try:
            family_res = supabase.table("family").select("*").eq("id", family_id).maybe_single().execute()
            if family_res.data:
                family_name = family_res.data.get("family_name") or family_res.data.get("name")
                # Prefer onboarding_completed; fallback to legacy has_completed_onboarding
                onboarding_completed = family_res.data.get("onboarding_completed")
                if onboarding_completed is None and family_res.data.get("has_completed_onboarding") is True:
                    onboarding_completed = True
                default_planning_mode = family_res.data.get("default_planning_mode")
        except Exception as e:
            log_event("family.get_members.family_table_error", user_id=user["id"], error=str(e))

        # Get children
        try:
            children_res = supabase.table("children").select("id, first_name, grade, grade_level, archived").eq("family_id", family_id).execute()
            for child in (children_res.data or []):
                first_name = child.get("first_name") or "Child"
                grade = child.get("grade") or child.get("grade_level")
                archived = child.get("archived") is True
                children.append(ChildOut(
                    id=child["id"],
                    name=first_name,
                    first_name=first_name,
                    grade=grade,
                    grade_level=child.get("grade_level"),
                    archived=archived
                ))
        except Exception as e:
            log_event("family.get_members.children_table_error", user_id=user["id"], error=str(e))

        # Derived onboarding validity (avoids stale onboarding_completed)
        has_children = len(children) > 0
        has_subjects = False
        try:
            subj_res = supabase.table("subject").select("id").eq("family_id", family_id).limit(1).execute()
            has_subjects = bool(subj_res.data and len(subj_res.data) > 0)
        except Exception as e:
            log_event("family.get_members.subjects_check_error", user_id=user["id"], error=str(e))
        onboarding_is_valid = bool(
            default_planning_mode is not None
            and default_planning_mode != ""
            and has_children
            and has_subjects
        )

        # Get family members - table may not exist or RLS/migration not applied
        members_data = []
        try:
            members_res = supabase.table("family_members").select(
                "id, user_id, member_role, child_scope, child_id"
            ).eq("family_id", family_id).execute()
            members_data = list(members_res.data or [])
        except Exception as e:
            log_event("family.get_members.family_members_table_error", user_id=user["id"], error=str(e))

        # Batch fetch profile emails
        user_ids = [m.get("user_id") for m in members_data if m.get("user_id")]
        profiles_map = {}
        if user_ids:
            try:
                profiles_res = supabase.table("profiles").select("id, email").in_("id", user_ids).execute()
                for profile in (profiles_res.data or []):
                    profiles_map[profile["id"]] = profile.get("email")
            except Exception as e:
                log_event("family.get_members.profiles_table_error", user_id=user["id"], error=str(e))

        # Many accounts only have email on auth.users; profiles.email may be null
        for uid in set(user_ids):
            if profiles_map.get(uid):
                continue
            em = _auth_admin_email_for_user_id(supabase, uid)
            if em:
                profiles_map[uid] = em

        invite_email_by_child = _accepted_invite_email_by_child_id(supabase, family_id)

        for member in members_data:
            mid = member.get("id")
            if not mid:
                continue
            email = profiles_map.get(member.get("user_id")) if member.get("user_id") else None
            raw_cid = member.get("child_id")
            child_id_out = None
            if raw_cid is not None and str(raw_cid).strip() != "":
                child_id_out = str(raw_cid).strip()
            if not email and child_id_out:
                email = invite_email_by_child.get(child_id_out)
            name = email or None
            raw_scope = member.get("child_scope", []) or []
            if isinstance(raw_scope, str):
                try:
                    raw_scope = json.loads(raw_scope)
                except Exception:
                    raw_scope = []
            if not isinstance(raw_scope, list):
                raw_scope = []
            child_scope_out = [str(x) for x in raw_scope if x is not None and str(x).strip() != ""]
            uid_raw = member.get("user_id")
            user_id_out = str(uid_raw).strip() if uid_raw is not None and str(uid_raw).strip() != "" else None
            members.append(MemberOut(
                id=str(mid),
                name=name,
                email=email,
                user_id=user_id_out,
                role=member.get("member_role", "parent"),
                member_role=member.get("member_role"),
                child_scope=child_scope_out,
                child_id=child_id_out,
            ))

        child_linked_via_accepted_invite = None
        try:
            uid = user["id"]
            my_row = next((m for m in members_data if m.get("user_id") == uid), None)
            if my_row and (my_row.get("member_role") or "") in ("child", "student"):
                cid = my_row.get("child_id")
                if not cid:
                    cs = my_row.get("child_scope") or []
                    if isinstance(cs, list) and len(cs) > 0:
                        cid = cs[0]
                if cid and family_id:
                    inv_res = (
                        supabase.table("invites")
                        .select("id, accepted_at")
                        .eq("family_id", family_id)
                        .eq("child_id", str(cid))
                        .eq("role", "child")
                        .execute()
                    )
                    rows = inv_res.data or []
                    child_linked_via_accepted_invite = any(bool(r.get("accepted_at")) for r in rows)
                else:
                    child_linked_via_accepted_invite = False
        except Exception as e:
            log_event("family.get_members.invite_link_check_error", user_id=user["id"], error=str(e))
            child_linked_via_accepted_invite = None

        log_event("family.get_members.success", user_id=user["id"], family_id=family_id, members_count=len(members))

        invite_summaries: Dict[str, ChildInviteSummaryOut] = {}
        try:
            invite_summaries = _child_invite_summaries_map(supabase, family_id, [c.id for c in children])
        except Exception as e:
            log_event("family.get_members.invite_summaries_build_error", user_id=user["id"], error=str(e))

        return FamilyMembersOut(
            id=family_id,
            family_name=family_name,
            onboarding_completed=onboarding_completed,
            onboarding_is_valid=onboarding_is_valid,
            default_planning_mode=default_planning_mode,
            children=children,
            members=members,
            child_linked_via_accepted_invite=child_linked_via_accepted_invite,
            child_invite_summaries=invite_summaries,
        )
    except HTTPException:
        raise
    except Exception as e:
        log_event("family.get_members.unexpected_error", user_id=user["id"], error=str(e))
        # Never return 500: return 200 with empty/safe data so UI can still load
        return FamilyMembersOut(
            id=family_id,
            family_name=None,
            onboarding_completed=False,
            onboarding_is_valid=False,
            default_planning_mode=None,
            children=[],
            members=[],
            child_linked_via_accepted_invite=None,
            child_invite_summaries={},
        )


@router.patch("", response_model=dict)
async def update_family(
    body: UpdateFamilyIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Update family details (e.g. family name). Uses service role so it is not blocked by RLS.
    Verifies the user belongs to the family before updating.
    """
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    if body.family_name is None:
        return {"success": True, "family_id": family_id}

    supabase = get_admin_client()
    try:
        value = body.family_name.strip() if body.family_name else None
        update_payload = {"family_name": value}
        resp = supabase.table("family").update(update_payload).eq("id", family_id).execute()
        if not resp.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family record not found")
        log_event("family.update.success", user_id=user["id"], family_id=family_id)
        return {"success": True, "family_id": family_id, "family_name": value}
    except HTTPException:
        raise
    except Exception as e:
        log_event("family.update.error", user_id=user["id"], family_id=family_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save family name: {str(e)}",
        )


@router.post("/reset_data")
async def reset_family_data(
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Delete all family-scoped data (events, children, subjects, materials, plans, etc.)
    and reset onboarding so the onboarding flow can be re-run. For testing only.
    Keeps the family and family_members; removes calendar/children/subjects/events.
    """
    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
    supabase = get_admin_client()

    def _delete(table: str, column: str, value: str):
        try:
            supabase.table(table).delete().eq(column, value).execute()
        except Exception as e:
            log_event("family.reset_data.delete_error", table=table, error=str(e))

    def _delete_in(table: str, column: str, values: list):
        if not values:
            return
        try:
            supabase.table(table).delete().in_(column, values).execute()
        except Exception as e:
            log_event("family.reset_data.delete_in_error", table=table, error=str(e))

    # Get IDs before deleting parents
    try:
        ay_res = supabase.table("academic_years").select("id").eq("family_id", family_id).execute()
        ay_ids = [r["id"] for r in (ay_res.data or [])]
    except Exception:
        ay_ids = []
    try:
        child_res = supabase.table("children").select("id").eq("family_id", family_id).execute()
        child_ids = [r["id"] for r in (child_res.data or [])]
    except Exception:
        child_ids = []
    try:
        subj_res = supabase.table("subject").select("id").eq("family_id", family_id).execute()
        subject_ids = [r["id"] for r in (subj_res.data or [])]
    except Exception:
        subject_ids = []

    # Delete in dependency order
    _delete("events", "family_id", family_id)
    _delete("academic_year_plan", "family_id", family_id)
    for ay_id in ay_ids:
        _delete("academic_year_holiday_settings", "academic_year_id", ay_id)
    _delete("academic_years", "family_id", family_id)
    _delete_in("child_support_profiles", "child_id", child_ids)
    _delete("children", "family_id", family_id)
    _delete("subject_track", "family_id", family_id)
    if subject_ids:
        _delete_in("materials", "subject_id", subject_ids)
    _delete("subject", "family_id", family_id)
    try:
        supabase.table("calendar_days").delete().eq("family_id", family_id).execute()
    except Exception:
        pass
    try:
        supabase.table("family_teaching_days").delete().eq("family_id", family_id).execute()
    except Exception:
        pass
    try:
        supabase.table("family_years").delete().eq("family_id", family_id).execute()
    except Exception:
        pass

    # Reset onboarding so modal shows again
    supabase.table("family").update({
        "onboarding_completed": False,
        "default_planning_mode": None,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", family_id).execute()

    log_event("family.reset_data.success", user_id=user["id"], family_id=family_id)
    return {"success": True, "message": "Family data reset. Refresh the page to see the onboarding flow."}


@router.post("/child/permanent_delete")
async def permanent_delete_child(
    body: PermanentDeleteChildIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Permanently remove one child from the family: child-scoped rows, invites, family_members
    (including linked child/student logins), and the children record. Deletes linked Supabase
    Auth users via the Admin API so their login is removed.
    """
    log_event("family.permanent_delete.start", user_id=user["id"], child_id=body.child_id)

    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    if not child_belongs_to_family(body.child_id, family_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    supabase = get_admin_client()
    if not _user_is_parent_for_family(supabase, user["id"], family_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only parents can delete a child")

    try:
        ch = (
            supabase.table("children")
            .select("id, first_name")
            .eq("id", body.child_id)
            .eq("family_id", family_id)
            .maybe_single()
            .execute()
        )
        row = ch.data or {}
        first_name = row.get("first_name") or ""
    except Exception as e:
        log_event("family.permanent_delete.load_child", error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not load child record",
        )

    if _norm_child_name(body.confirm_name) != _norm_child_name(first_name):
        return {"ok": False, "reason": "name_mismatch"}

    try:
        deleted_auth_ids = _permanent_delete_child_data(supabase, family_id, body.child_id)
    except Exception as e:
        log_event("family.permanent_delete.error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete child: {str(e)}",
        )

    _delete_linked_auth_users(supabase, deleted_auth_ids)

    log_event(
        "family.permanent_delete.success",
        user_id=user["id"],
        family_id=family_id,
        child_id=body.child_id,
        auth_users=len(deleted_auth_ids),
    )
    return {"ok": True, "deleted_auth_user_ids": deleted_auth_ids}


@router.post("/child/unlink_login")
async def unlink_child_login(
    body: UnlinkChildLoginIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Remove this child's linked learner login (family_members child/student row), all invites for
    that child record, and the Supabase Auth user(s) for that login. The children row and all
    learning data stay; parent can send a new invite to a different email.
    """
    log_event("family.unlink_login.start", user_id=user["id"], child_id=body.child_id)

    family_id = get_family_id_for_user(user["id"])
    if not family_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    if not child_belongs_to_family(body.child_id, family_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Child not found")

    supabase = get_admin_client()
    if not _user_is_parent_for_family(supabase, user["id"], family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only parents can remove a child's linked login",
        )

    try:
        removed_auth_ids = _detach_child_login_members(supabase, family_id, body.child_id)
    except Exception as e:
        log_event("family.unlink_login.detach_error", user_id=user["id"], error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update family membership: {str(e)}",
        )

    try:
        supabase.table("invites").delete().eq("family_id", family_id).eq("child_id", str(body.child_id)).execute()
    except Exception as e:
        log_event("family.unlink_login.invites", error=str(e))

    try:
        supabase.table("children").update({"email": None}).eq("id", str(body.child_id)).eq(
            "family_id", family_id
        ).execute()
    except Exception as e:
        log_event("family.unlink_login.children_email", error=str(e))

    _delete_linked_auth_users(supabase, removed_auth_ids)

    log_event(
        "family.unlink_login.success",
        user_id=user["id"],
        family_id=family_id,
        child_id=body.child_id,
        auth_users=len(removed_auth_ids),
    )
    return {"ok": True, "removed_auth_user_ids": removed_auth_ids}


@router.post("/invite", response_model=InviteTutorOut)
async def invite_tutor(
    body: InviteTutorIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Invite a member (tutor, child, or parent) to the family.
    - Tutors: require child_ids specifying which children they can see
    - Children: require exactly one child_id (the child record being invited)
    - Parents: child_ids can be empty
    Only parents can create invites.
    """
    log_event("family.invite_tutor.start", user_id=user["id"], email=body.email, child_ids=body.child_ids)

    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )

        supabase = get_admin_client()

        # Verify current user is a parent
        # Use maybe_single() instead of single() to handle case where user doesn't have a family_members row yet
        current_member_res = supabase.table("family_members").select("member_role").eq("user_id", user["id"]).eq("family_id", family_id).maybe_single().execute()
        is_parent = False
        
        # Check family_members first
        if current_member_res and current_member_res.data and current_member_res.data.get("member_role") == 'parent':
            is_parent = True
        else:
            # Fallback: check profiles.role
            profile_res = supabase.table("profiles").select("role").eq("id", user["id"]).maybe_single().execute()
            if profile_res and profile_res.data and profile_res.data.get("role") == 'parent':
                is_parent = True
        
        if not is_parent:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can invite members"
            )

        # Validate child_ids belong to family
        # For tutors: require at least one child
        # For children: require exactly one child (the child being invited)
        # For parents: child_ids can be empty
        if body.role == "tutor":
            if not body.child_ids or len(body.child_ids) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Tutors must have access to at least one child"
                )
            for child_id in body.child_ids:
                if not child_belongs_to_family(child_id, family_id):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Child ID {child_id} does not belong to your family"
                    )
        elif body.role == "child":
            if not body.child_ids or len(body.child_ids) != 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Child invites must specify exactly one child record"
                )
            child_id = body.child_ids[0]
            if not child_belongs_to_family(child_id, family_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Child ID {child_id} does not belong to your family"
                )

        # Use existing invite system
        import secrets
        from datetime import timedelta
        
        log_event("family.invite_tutor.before_token_gen", user_id=user["id"])
        token = secrets.token_urlsafe(32)
        expires_at = (datetime.now() + timedelta(days=30)).isoformat()
        log_event("family.invite_tutor.after_token_gen", user_id=user["id"], token_preview=token[:8])

        # Create invite
        # Use RPC to bypass PostgREST RLS issues
        invite = None
        
        # Log that we're starting
        log_event("family.invite_tutor.starting", user_id=user["id"], method="rpc_first")
        
        # Ensure we're using the admin client (service_role) to bypass RLS
        log_event("family.invite_tutor.before_get_admin_client", user_id=user["id"])
        supabase = get_admin_client()
        log_event("family.invite_tutor.after_get_admin_client", user_id=user["id"])
        
        log_event("family.invite_tutor.before_try_block", user_id=user["id"])
        try:
            log_event("family.invite_tutor.inside_try_block", user_id=user["id"])
            # Call an RPC function that will insert the invite using SECURITY DEFINER
            # This bypasses RLS entirely
            log_event("family.invite_tutor.rpc_attempt", 
                     user_id=user["id"], 
                     rpc_function="create_family_invite",
                     family_id=family_id,
                     email=body.email[:10] if body.email else None)
            
            # Wrap the RPC call in try/except to catch PostgREST exceptions
            # PostgREST may raise APIError or other exceptions
            try:
                log_event("family.invite_tutor.about_to_call_rpc", user_id=user["id"])
                rpc_result = supabase.rpc(
                    "create_family_invite",
                    {
                        "p_family_id": family_id,
                        "p_email": body.email,
                        "p_token": token,
                        "p_role": body.role,
                        "p_child_scope": body.child_ids or [],
                        "p_expires_at": expires_at,
                        "p_invited_by": user["id"],
                    }
                ).execute()
                
                log_event("family.invite_tutor.rpc_execute_success", user_id=user["id"], has_data=bool(rpc_result.data))
            except BaseException as rpc_exec_error:  # Catch ALL exceptions including APIError
                # Log the RPC execution error specifically
                error_str = str(rpc_exec_error)
                error_type = type(rpc_exec_error).__name__
                error_repr = repr(rpc_exec_error)
                
                log_event("family.invite_tutor.rpc_exec_exception",
                         user_id=user["id"],
                         error=error_str,
                         error_type=error_type,
                         error_repr=error_repr[:500])
                
                # Check if it's a "function doesn't exist" error
                if "function" in error_str.lower() and ("does not exist" in error_str.lower() or "not found" in error_str.lower()):
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Failed to create invite: RPC function 'create_family_invite' does not exist. Please run create_family_invite_rpc.sql migration."
                    )
                
                # Check for PGRST116 error (0 rows returned)
                if "PGRST116" in error_str or "0 rows" in error_str.lower():
                    log_event("family.invite_tutor.rpc_pgrst116_error", 
                             user_id=user["id"],
                             error=error_str,
                             error_repr=error_repr[:500])
                    # Don't raise here - fall through to direct insert fallback
                    # PostgREST may have issues with jsonb-returning functions
                    log_event("family.invite_tutor.falling_back_to_direct_insert", user_id=user["id"])
                    raise Exception("PGRST116 - falling back to direct insert")  # This will trigger fallback
                
                # For other RPC errors, fall through to fallback
                raise  # Re-raise to be caught by outer handler
            
            # Check for errors in the response
            if hasattr(rpc_result, 'error') and rpc_result.error:
                error_msg = str(rpc_result.error)
                log_event("family.invite_tutor.rpc_error_attr", user_id=user["id"], error=error_msg)
                raise Exception(f"RPC error: {error_msg}")
            
            # Log detailed response info
            log_event("family.invite_tutor.rpc_response", 
                     user_id=user["id"],
                     has_data=bool(rpc_result.data),
                     data_type=str(type(rpc_result.data)) if rpc_result.data else None,
                     data_content=str(rpc_result.data)[:200] if rpc_result.data else None,
                     has_error=hasattr(rpc_result, 'error'),
                     error_value=str(rpc_result.error) if hasattr(rpc_result, 'error') and rpc_result.error else None)
            
            # Handle RPC response - it should return a JSONB object
            # PostgREST may wrap jsonb returns in an array or return as a single value
            if rpc_result.data is None:
                log_event("family.invite_tutor.rpc_data_is_none", user_id=user["id"])
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="RPC function returned no data. This may indicate the function failed or doesn't exist."
                )
            
            # PostgREST may return jsonb as an array with one element, or as a single dict
            raw_data = rpc_result.data
            if isinstance(raw_data, list) and len(raw_data) > 0:
                # PostgREST wrapped it in an array - extract the first element
                raw_data = raw_data[0]
                log_event("family.invite_tutor.rpc_data_was_array", user_id=user["id"], array_len=len(rpc_result.data))
            
            if raw_data:
                # RPC returns jsonb, which might be parsed as dict or string
                if isinstance(raw_data, dict):
                    rpc_data = raw_data
                elif isinstance(raw_data, str):
                    import json
                    try:
                        rpc_data = json.loads(raw_data)
                    except:
                        rpc_data = {"raw": raw_data}
                else:
                    # Try to convert to dict
                    rpc_data = dict(raw_data) if hasattr(raw_data, '__dict__') else {"raw": str(raw_data)}
                
                if rpc_data.get("success"):
                    invite_id = rpc_data.get("invite_id")
                    log_event("family.invite_tutor.rpc_success", user_id=user["id"], invite_id=invite_id)
                    invite = {"id": invite_id, "token": token}
                else:
                    error_msg = rpc_data.get("error", "Unknown error")
                    log_event("family.invite_tutor.rpc_error_response", user_id=user["id"], error=error_msg)
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail=f"Failed to create invite: {error_msg}"
                    )
            else:
                log_event("family.invite_tutor.rpc_no_data", user_id=user["id"])
                raise Exception("RPC returned no data")
        except HTTPException:
            raise
        except Exception as rpc_error:
            # Fallback to direct insert if RPC doesn't exist or fails
            error_str = str(rpc_error)
            error_type = type(rpc_error).__name__
            log_event("family.invite_tutor.rpc_fallback", 
                     user_id=user["id"], 
                     error=error_str,
                     error_type=error_type,
                     rpc_function="create_family_invite")
            
            # If RPC function doesn't exist, provide helpful error message
            if "function" in error_str.lower() and ("does not exist" in error_str.lower() or "not found" in error_str.lower()):
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to create invite: RPC function 'create_family_invite' does not exist. Please run create_family_invite_rpc.sql migration."
                )
            
            # Try direct insert as fallback
            log_event("family.invite_tutor.direct_insert_fallback", user_id=user["id"])
            try:
                insert_invite = {
                    "family_id": family_id,
                    "email": body.email,
                    "token": token,
                    "role": body.role,
                    "child_scope": body.child_ids or [],
                    "expires_at": expires_at,
                    "invited_by": user["id"],
                }
                if body.role == "child" and body.child_ids and len(body.child_ids) == 1:
                    insert_invite["child_id"] = body.child_ids[0]
                invite_res = supabase.table("invites").insert(insert_invite).execute()
                
                log_event("family.invite_tutor.direct_insert_response",
                         user_id=user["id"],
                         has_data=bool(invite_res.data),
                         data_len=len(invite_res.data) if invite_res.data else 0)
                
                if invite_res.data and len(invite_res.data) > 0:
                    invite = invite_res.data[0]
                else:
                    # Try to fetch by token
                    log_event("family.invite_tutor.fetch_by_token_fallback", user_id=user["id"], token=token[:8])
                    fetch_res = supabase.table("invites").select("id, token").eq("token", token).limit(1).execute()
                    if fetch_res.data and len(fetch_res.data) > 0:
                        invite = fetch_res.data[0]
                        log_event("family.invite_tutor.fetch_success", user_id=user["id"], invite_id=invite.get("id"))
                    else:
                        raise HTTPException(
                            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Failed to create invite: Insert was blocked by RLS. Please run create_family_invite_rpc.sql migration to create the RPC function."
                        )
            except HTTPException:
                raise
            except Exception as insert_error:
                error_str_insert = str(insert_error)
                log_event("family.invite_tutor.insert_fallback_error", 
                         user_id=user["id"], 
                         error=error_str_insert,
                         error_type=type(insert_error).__name__)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail=f"Failed to create invite: {error_str_insert}. Please run create_family_invite_rpc.sql migration."
                )
        
        if not invite:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create invite: No invite was created"
            )

        # Generate invite URLs: copy link = landing page; email button = create-password page (for child) or same (for others)
        invite_landing_base = os.environ.get("INVITE_LANDING_URL", "https://learnadoodle.com")
        invite_url = f"{invite_landing_base}/invites/{token}"
        accept_url = f"{invite_landing_base}/invites/{token}/accept"

        # Get inviter's name for email
        inviter_name = None
        try:
            inviter_profile = supabase.table("profiles").select("first_name, name").eq("id", user["id"]).single().execute()
            if inviter_profile.data:
                inviter_name = inviter_profile.data.get("first_name") or inviter_profile.data.get("name")
        except:
            pass

        # Get child name if this is a child invite
        child_name = None
        if body.role == "child" and body.child_ids and len(body.child_ids) > 0:
            try:
                child_res = supabase.table("children").select("first_name, name").eq("id", body.child_ids[0]).single().execute()
                if child_res.data:
                    child_name = child_res.data.get("first_name") or child_res.data.get("name")
            except:
                pass

        # Send invite email via Postmark (button = accept_url, copy-paste link = invite_url)
        email_sent = send_invite_email(
            to_email=body.email,
            invite_url=invite_url,
            role=body.role,
            inviter_name=inviter_name,
            child_name=child_name,
            accept_url=accept_url,
        )

        log_event(
            "family.invite_tutor.success",
            user_id=user["id"],
            invite_id=invite.get("id"),
            email_sent=email_sent,
        )

        return InviteTutorOut(
            invite_code=token,
            invite_url=invite_url
        )

    except HTTPException:
        log_event("family.invite_tutor.http_exception", user_id=user["id"])
        raise
    except BaseException as e:  # Catch ALL exceptions including APIError
        error_str = str(e)
        error_type = type(e).__name__
        import traceback
        tb_str = ''.join(traceback.format_exception(type(e), e, e.__traceback__)) if hasattr(e, '__traceback__') else None
        
        log_event("family.invite_tutor.error", 
                 user_id=user["id"], 
                 error=error_str,
                 error_type=error_type,
                 error_repr=repr(e)[:500],
                 traceback=tb_str[:1000] if tb_str else None)
        
        # Provide more helpful error message
        if "PGRST116" in error_str or "0 rows" in error_str.lower():
            detail_msg = "Failed to create invite: Insert was blocked by RLS. The RPC function may not exist or may have failed. Please verify create_family_invite_rpc.sql was run successfully."
        elif "function" in error_str.lower() and "does not exist" in error_str.lower():
            detail_msg = "Failed to create invite: RPC function 'create_family_invite' does not exist. Please run create_family_invite_rpc.sql migration."
        else:
            detail_msg = f"Failed to invite tutor: {error_str}"
        
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=detail_msg
        )

@router.patch("/tutors/{member_id}", response_model=MemberOut)
async def update_tutor_scope(
    member_id: str,
    body: UpdateTutorScopeIn,
    user: dict = Depends(get_current_user),
    __: None = Depends(rate_limiter),
):
    """
    Update a tutor's child_scope (which children they can see).
    Only parents can update tutor access.
    """
    log_event("family.update_tutor_scope.start", user_id=user["id"], member_id=member_id, child_ids=body.child_ids)

    try:
        family_id = get_family_id_for_user(user["id"])
        if not family_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Family not found"
            )

        supabase = get_admin_client()

        # Verify current user is a parent (family_members or profiles fallback)
        is_parent = False
        try:
            current_member_res = supabase.table("family_members").select("member_role").eq("user_id", user["id"]).eq("family_id", family_id).maybe_single().execute()
            if current_member_res.data and current_member_res.data.get("member_role") == 'parent':
                is_parent = True
        except Exception:
            pass
        if not is_parent:
            try:
                profile_res = supabase.table("profiles").select("role").eq("id", user["id"]).maybe_single().execute()
                if profile_res.data and profile_res.data.get("role") == 'parent':
                    is_parent = True
            except Exception:
                pass
        if not is_parent:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only parents can update tutor access"
            )

        # Verify member exists and is a tutor in this family
        try:
            member_res = supabase.table("family_members").select("*").eq("id", member_id).eq("family_id", family_id).maybe_single().execute()
        except Exception as e:
            log_event("family.update_tutor_scope.family_members_error", user_id=user["id"], error=str(e))
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tutor member not found"
            )
        if not member_res.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tutor member not found"
            )
        
        if member_res.data.get("member_role") != 'tutor':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Member is not a tutor"
            )

        # Validate child_ids belong to family
        for child_id in body.child_ids:
            if not child_belongs_to_family(child_id, family_id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Child ID {child_id} does not belong to your family"
                )

        # Update child_scope
        update_res = supabase.table("family_members").update({
            "child_scope": body.child_ids,
            "updated_at": datetime.now().isoformat()
        }).eq("id", member_id).select("*").single().execute()

        if not update_res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to update tutor scope"
            )

        # Get profile email for response
        profile_res = supabase.table("profiles").select("email").eq("id", update_res.data["user_id"]).single().execute()
        email = profile_res.data.get("email") if profile_res.data else None

        log_event("family.update_tutor_scope.success", user_id=user["id"], member_id=member_id)

        raw_tid = update_res.data.get("child_id")
        tutor_child_id = str(raw_tid).strip() if raw_tid is not None and str(raw_tid).strip() != "" else None
        raw_uid = update_res.data.get("user_id")
        tutor_user_id = str(raw_uid).strip() if raw_uid is not None and str(raw_uid).strip() != "" else None
        return MemberOut(
            id=str(update_res.data["id"]),
            name=email,
            email=email,
            user_id=tutor_user_id,
            role="tutor",
            member_role="tutor",
            child_scope=update_res.data.get("child_scope", []) or [],
            child_id=tutor_child_id,
        )

    except HTTPException:
        raise
    except Exception as e:
        log_event("family.update_tutor_scope.error", user_id=user["id"], member_id=member_id, error=str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update tutor scope: {str(e)}"
        )

