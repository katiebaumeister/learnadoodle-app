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
    const { data: fmRows, error: fmErr } = await supabase
      .from('family_members')
      .select('child_id, child_scope, user_id')
      .eq('family_id', familyId)
      .eq('member_role', 'child');

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
    let invRows = null;
    let invErr = null;
    if (ids.length > 0) {
      const res = await supabase
        .from('invites')
        .select('child_id, email, accepted_at, created_at, updated_at, expires_at')
        .eq('family_id', familyId)
        .eq('role', 'child')
        .in('child_id', ids);
      invRows = res.data;
      invErr = res.error;
    }

    if (!invErr && invRows) {
      for (const inv of invRows) {
        if (!inv.child_id) continue;
        if (inv.accepted_at) continue;
        if (inv.expires_at) {
          const exp = new Date(inv.expires_at).getTime();
          if (!Number.isNaN(exp) && exp < now) continue;
        }
        const key = String(inv.child_id);
        const sentAt = inv.updated_at || inv.created_at;
        const t = sentAt ? new Date(sentAt).getTime() : 0;
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

    for (const id of ids) {
      if (linked.has(id)) {
        const u = linked.get(id).user_id;
        out[id] = {
          invite_status: 'accepted',
          invite_email: u ? emailByUserId[u] ?? null : null,
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
