/**
 * Derive per-child invite / link status from family_members + invites.
 * invite_status: 'none' | 'pending' | 'accepted'
 */

export function formatInviteLastSent(iso) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diff = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

/** @returns {Promise<Record<string, { invite_status: 'none'|'pending'|'accepted', invite_email: string|null, invite_sent_at: string|null }>>} */
export async function fetchChildInviteSummaries(supabase, familyId, childIds) {
  const empty = () => ({
    invite_status: 'none',
    invite_email: null,
    invite_sent_at: null,
  });
  const out = {};
  if (!familyId || !childIds?.length || !supabase) {
    for (const id of childIds || []) out[String(id)] = empty();
    return out;
  }
  const ids = [...new Set(childIds.map((id) => String(id)))];
  for (const id of ids) out[id] = empty();

  try {
    // App treats member_role "student" like "child" (SessionContext, WebContent, etc.)
    const { data: fmRows, error: fmErr } = await supabase
      .from('family_members')
      .select('child_id, child_scope, user_id')
      .eq('family_id', familyId)
      .in('member_role', ['child', 'student']);

    if (fmErr) {
      return out;
    }

    const linked = new Map();
    for (const row of fmRows || []) {
      if (row.child_id) {
        linked.set(String(row.child_id), { user_id: row.user_id });
      }
    }
    for (const row of fmRows || []) {
      if (!Array.isArray(row.child_scope)) continue;
      for (const cid of row.child_scope) {
        if (!cid) continue;
        const sid = String(cid);
        if (!linked.has(sid)) linked.set(sid, { user_id: row.user_id });
      }
    }

    const userIds = [...new Set([...linked.values()].map((v) => v.user_id).filter(Boolean))];
    const emailByUserId = {};
    if (userIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, email').in('id', userIds);
      for (const p of profs || []) {
        if (p?.id) emailByUserId[p.id] = p.email ?? null;
      }
    }

    const now = Date.now();
    const pendingByChild = new Map();
    /** child_id -> email from accepted invite (fallback if family_members not visible under RLS) */
    const acceptedInviteByChild = new Map();
    let invRows = null;
    let invErr = null;
    if (ids.length > 0) {
      // Match backend: child invites may only set child_scope (not child_id).
      const res = await supabase
        .from('invites')
        .select('child_id, child_scope, email, accepted_at, created_at, updated_at, expires_at')
        .eq('family_id', familyId)
        .eq('role', 'child');
      invRows = res.data;
      invErr = res.error;
    }

    const want = new Set(ids);
    if (!invErr && invRows) {
      for (const inv of invRows) {
        const targets = new Set();
        if (inv.child_id != null && String(inv.child_id).trim() !== '') {
          targets.add(String(inv.child_id).trim());
        }
        let scope = inv.child_scope;
        if (typeof scope === 'string') {
          try {
            scope = JSON.parse(scope);
          } catch (_) {
            scope = [];
          }
        }
        if (Array.isArray(scope)) {
          for (const cid of scope) {
            if (cid == null || cid === '') continue;
            targets.add(String(cid).trim());
          }
        }
        const keys = [...targets].filter((k) => want.has(k));
        if (!keys.length) continue;

        if (inv.accepted_at) {
          const em = inv.email || null;
          const t = inv.accepted_at ? new Date(inv.accepted_at).getTime() : 0;
          for (const key of keys) {
            const prev = acceptedInviteByChild.get(key);
            const prevT = prev?.t ?? 0;
            if (!prev || t >= prevT) {
              acceptedInviteByChild.set(key, { email: em, t });
            }
          }
          continue;
        }
        if (inv.expires_at) {
          const exp = new Date(inv.expires_at).getTime();
          if (!Number.isNaN(exp) && exp < now) continue;
        }
        const sentAt = inv.updated_at || inv.created_at;
        const t = sentAt ? new Date(sentAt).getTime() : 0;
        for (const key of keys) {
          const prev = pendingByChild.get(key);
          if (!prev || t > prev.t) {
            pendingByChild.set(key, {
              email: inv.email || null,
              sentAt: sentAt || null,
              t,
            });
          }
        }
      }
    }

    for (const id of ids) {
      if (linked.has(id)) {
        const u = linked.get(id).user_id;
        out[id] = {
          invite_status: 'accepted',
          invite_email: u ? emailByUserId[u] ?? null : null,
          invite_sent_at: null,
        };
      } else if (acceptedInviteByChild.has(id)) {
        out[id] = {
          invite_status: 'accepted',
          invite_email: acceptedInviteByChild.get(id).email,
          invite_sent_at: null,
        };
      } else if (pendingByChild.has(id)) {
        const p = pendingByChild.get(id);
        out[id] = {
          invite_status: 'pending',
          invite_email: p.email,
          invite_sent_at: p.sentAt,
        };
      }
    }
  } catch (_) {
    /* keep defaults */
  }

  return out;
}

/**
 * Linked logins from GET /api/family/members (service role / server).
 * Supabase client RLS often hides other users' family_members rows; this does not.
 */
export function linkedSummariesFromFamilyApiMembers(members, childIds) {
  const want = new Set((childIds || []).map((id) => String(id)));
  const out = {};
  for (const m of members || []) {
    const role = m.member_role || m.role;
    if (role !== 'child' && role !== 'student') continue;
    // Do not require user_id: API historically omitted it from MemberOut, so the client always skipped these rows.
    const email =
      m.email ??
      m.user_email ??
      m.profile_email ??
      (m.user && typeof m.user === 'object' ? m.user.email : null) ??
      null;
    const apply = (cid) => {
      if (cid == null || cid === '') return;
      const s = String(cid);
      if (!want.has(s)) return;
      out[s] = {
        invite_status: 'accepted',
        invite_email: email,
        invite_sent_at: null,
      };
    };
    if (m.child_id != null && m.child_id !== '') apply(m.child_id);
    let scope = m.child_scope;
    if (typeof scope === 'string') {
      try {
        scope = JSON.parse(scope);
      } catch (_) {
        scope = [];
      }
    }
    if (Array.isArray(scope)) {
      for (const cid of scope) apply(cid);
    }
  }
  return out;
}

/** API-linked children override Supabase-derived rows (fixes RLS gaps). */
export function mergeChildInviteSummaryMaps(supabaseMap, apiLinkedMap) {
  const out = { ...(supabaseMap || {}) };
  for (const [cid, row] of Object.entries(apiLinkedMap || {})) {
    if (row && row.invite_status === 'accepted') {
      const prev = out[cid];
      const email = row.invite_email || prev?.invite_email || null;
      out[cid] = { ...row, invite_email: email };
    }
  }
  return out;
}

/**
 * Overlay GET /api/family/members `child_invite_summaries` (service role).
 * Pending invites are often invisible to the Supabase anon client (RLS), so the list showed "Not invited".
 */
export function mergeServerChildInviteSummaries(baseMap, serverSummaries, childIds) {
  const out = { ...(baseMap || {}) };
  if (!serverSummaries || typeof serverSummaries !== 'object') return out;
  if (!Object.keys(serverSummaries).length) return out;
  for (const id of childIds || []) {
    const sid = String(id);
    const row = serverSummaries[sid] ?? serverSummaries[id];
    if (!row || row.invite_status == null) continue;
    out[sid] = {
      invite_status: row.invite_status,
      invite_email: row.invite_email != null ? row.invite_email : null,
      invite_sent_at: row.invite_sent_at != null ? row.invite_sent_at : null,
    };
  }
  return out;
}

export function mergeChildInviteSummary(child, summary) {
  const s = summary || {
    invite_status: 'none',
    invite_email: null,
    invite_sent_at: null,
  };
  return {
    ...child,
    invite_status: s.invite_status,
    invite_email: s.invite_email,
    invite_sent_at: s.invite_sent_at,
  };
}
