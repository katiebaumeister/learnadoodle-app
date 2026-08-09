/**
 * Full subject delete (same steps as AddSubjectModal performDeleteSubject).
 * Keeps planner, events, materials, syllabi, and curriculum_units consistent.
 */

import { supabase } from '../supabase.js';
import { invalidatePlanHealthCache } from './academicYearClient';
import { dropAllPlanYearCachesForFamily } from '../planEditListCache';
import { prefetchPlanEditListForFamily } from './plannerPrefetch';
import { clearManualCurriculumEvents } from './curriculumClient';

function parseCurriculumMetadata(curriculumMetadata) {
  const raw = curriculumMetadata;
  if (!raw) return {};
  let parsed = raw;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch (_) {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed;
}

function extractSubjectIdsFromCurriculumMetadata(curriculumMetadata) {
  const parsed = parseCurriculumMetadata(curriculumMetadata);
  const ids = Array.isArray(parsed.subject_ids) ? parsed.subject_ids : [];
  return [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
}

function classDayTitleFromNames(names) {
  const clean = (names || []).map((n) => String(n || '').trim()).filter(Boolean);
  if (clean.length === 0) return 'Class day';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} & ${clean[1]}`;
  return clean.join(', ');
}

async function softDeleteEventIds(supabaseClient, eventIds, deletedAt) {
  const ids = [...new Set((eventIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { error } = await supabaseClient
      .from('events')
      .update({ deleted_at: deletedAt })
      .in('id', chunk)
      .is('deleted_at', null);
    if (error) throw error;
  }
}

/**
 * Soft-delete planner rows for a subject.
 * ClassDay / plan-year learning days often have subject_id null and only link via
 * curriculum_metadata.subject_ids (and/or title) — those must be cleaned too.
 */
export async function softDeleteSubjectLinkedEvents(
  supabaseClient,
  familyId,
  subjectId,
  subjectDisplayName,
) {
  const fid = String(familyId || '').trim();
  const sid = String(subjectId || '').trim();
  if (!fid || !sid) return;
  const deletedAt = new Date().toISOString();
  const deletedName = String(subjectDisplayName || '').trim();

  const { error: bySubjectIdErr } = await supabaseClient
    .from('events')
    .update({ deleted_at: deletedAt })
    .eq('subject_id', sid)
    .eq('family_id', fid)
    .is('deleted_at', null);
  if (bySubjectIdErr) throw bySubjectIdErr;

  try {
    const { data: metaLinked, error: metaErr } = await supabaseClient
      .from('events')
      .select('id, title, curriculum_metadata')
      .eq('family_id', fid)
      .is('deleted_at', null)
      .contains('curriculum_metadata', { subject_ids: [sid] });
    if (metaErr) {
      console.warn('[deleteSubjectCascade] metadata-linked events query:', metaErr.message || metaErr);
    } else {
      const toDelete = [];
      const toRewrite = [];
      for (const row of metaLinked || []) {
        const meta = parseCurriculumMetadata(row.curriculum_metadata);
        const remainingIds = extractSubjectIdsFromCurriculumMetadata(meta).filter((id) => id !== sid);
        if (remainingIds.length === 0) {
          toDelete.push(row.id);
        } else {
          toRewrite.push({ row, meta, remainingIds });
        }
      }
      if (toDelete.length > 0) {
        await softDeleteEventIds(supabaseClient, toDelete, deletedAt);
      }
      if (toRewrite.length > 0) {
        const allIds = [...new Set(toRewrite.flatMap((item) => item.remainingIds))];
        const { data: subjectRows } = await supabaseClient
          .from('subject')
          .select('id, name')
          .eq('family_id', fid)
          .in('id', allIds);
        const nameById = {};
        for (const row of subjectRows || []) {
          nameById[String(row.id)] = String(row.name || '').trim();
        }
        for (const item of toRewrite) {
          const names = item.remainingIds.map((id) => nameById[id]).filter(Boolean);
          const nextMeta = { ...item.meta, subject_ids: item.remainingIds };
          const { error: upErr } = await supabaseClient
            .from('events')
            .update({
              curriculum_metadata: nextMeta,
              title: classDayTitleFromNames(names),
            })
            .eq('id', item.row.id)
            .is('deleted_at', null);
          if (upErr) {
            console.warn('[deleteSubjectCascade] ClassDay rewrite:', upErr.message || upErr);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[deleteSubjectCascade] metadata-linked events cleanup:', err?.message || err);
  }

  // Title fallback for single-subject ClassDays / plan slots with null subject_id.
  if (deletedName) {
    try {
      const { error: titleErr } = await supabaseClient
        .from('events')
        .update({ deleted_at: deletedAt })
        .eq('family_id', fid)
        .is('deleted_at', null)
        .is('subject_id', null)
        .ilike('title', deletedName);
      if (titleErr) {
        console.warn('[deleteSubjectCascade] title-linked events cleanup:', titleErr.message || titleErr);
      }
    } catch (err) {
      console.warn('[deleteSubjectCascade] title-linked events cleanup exception:', err?.message || err);
    }
  }
}

/**
 * Soft-delete leftover plan/learning-day rows whose subject no longer exists
 * (e.g. ClassDays that only linked via metadata/title before cascade was fixed).
 */
export async function cleanupOrphanedSubjectPlanEvents(supabaseClient, familyId) {
  const fid = String(familyId || '').trim();
  if (!fid) return { softDeleted: 0 };
  const deletedAt = new Date().toISOString();

  const { data: subjects, error: subjectsErr } = await supabaseClient
    .from('subject')
    .select('id, name')
    .eq('family_id', fid);
  if (subjectsErr) {
    console.warn('[deleteSubjectCascade] orphan cleanup subjects:', subjectsErr.message || subjectsErr);
    return { softDeleted: 0 };
  }
  const liveIds = new Set((subjects || []).map((row) => String(row.id)));
  const liveNames = new Set(
    (subjects || [])
      .map((row) => String(row.name || '').trim().toLowerCase())
      .filter(Boolean),
  );

  let softDeleted = 0;

  try {
    const { data: withSubjectId } = await supabaseClient
      .from('events')
      .select('id, subject_id')
      .eq('family_id', fid)
      .is('deleted_at', null)
      .not('subject_id', 'is', null)
      .limit(3000);
    const orphanByFk = (withSubjectId || [])
      .filter((row) => row.subject_id && !liveIds.has(String(row.subject_id)))
      .map((row) => row.id);
    if (orphanByFk.length > 0) {
      await softDeleteEventIds(supabaseClient, orphanByFk, deletedAt);
      softDeleted += orphanByFk.length;
    }
  } catch (err) {
    console.warn('[deleteSubjectCascade] orphan subject_id cleanup:', err?.message || err);
  }

  try {
    const { data: nullSubjectEvents } = await supabaseClient
      .from('events')
      .select('id, title, event_type, generated_by, curriculum_metadata')
      .eq('family_id', fid)
      .is('deleted_at', null)
      .is('subject_id', null)
      .limit(4000);

    const toDelete = [];
    const toRewrite = [];
    for (const row of nullSubjectEvents || []) {
      const eventType = String(row.event_type || '').trim().toLowerCase();
      const generatedBy = String(row.generated_by || '').trim().toLowerCase();
      const isPlanLike = (
        eventType === 'classday'
        || generatedBy === 'plan_year'
        || generatedBy === 'fill_gap'
      );
      if (!isPlanLike) continue;

      const meta = parseCurriculumMetadata(row.curriculum_metadata);
      const linkedIds = extractSubjectIdsFromCurriculumMetadata(meta);
      if (linkedIds.length > 0) {
        const remainingIds = linkedIds.filter((id) => liveIds.has(id));
        if (remainingIds.length === 0) {
          toDelete.push(row.id);
        } else if (remainingIds.length < linkedIds.length) {
          toRewrite.push({ row, meta, remainingIds });
        }
        continue;
      }

      const title = String(row.title || '').trim();
      const titleKey = title.toLowerCase();
      if (!titleKey || titleKey.includes(',') || titleKey.includes(' & ')) continue;
      if (!liveNames.has(titleKey)) {
        toDelete.push(row.id);
      }
    }

    if (toDelete.length > 0) {
      await softDeleteEventIds(supabaseClient, toDelete, deletedAt);
      softDeleted += toDelete.length;
    }

    if (toRewrite.length > 0) {
      const allIds = [...new Set(toRewrite.flatMap((item) => item.remainingIds))];
      const { data: subjectRows } = await supabaseClient
        .from('subject')
        .select('id, name')
        .eq('family_id', fid)
        .in('id', allIds);
      const nameById = {};
      for (const row of subjectRows || []) {
        nameById[String(row.id)] = String(row.name || '').trim();
      }
      for (const item of toRewrite) {
        const names = item.remainingIds.map((id) => nameById[id]).filter(Boolean);
        const { error: upErr } = await supabaseClient
          .from('events')
          .update({
            curriculum_metadata: { ...item.meta, subject_ids: item.remainingIds },
            title: classDayTitleFromNames(names),
          })
          .eq('id', item.row.id)
          .is('deleted_at', null);
        if (upErr) {
          console.warn('[deleteSubjectCascade] orphan ClassDay rewrite:', upErr.message || upErr);
        }
      }
    }
  } catch (err) {
    console.warn('[deleteSubjectCascade] orphan ClassDay cleanup:', err?.message || err);
  }

  return { softDeleted };
}

/** Remove instructional blocks and per-subject targets that reference a deleted subject. */
export async function removeSubjectFromFamilyPlanRows(supabaseClient, familyId, subjectId) {
  const sid = String(subjectId);
  const { data: rows, error } = await supabaseClient
    .from('academic_year_plan')
    .select('id, blocks, subject_targets')
    .eq('family_id', familyId);
  if (error) {
    console.warn('[deleteSubjectCascade] academic_year_plan cleanup:', error.message || error);
    return;
  }
  if (!Array.isArray(rows) || rows.length === 0) return;
  const nowIso = new Date().toISOString();
  for (const row of rows) {
    const blocks = Array.isArray(row.blocks) ? row.blocks : [];
    const newBlocks = blocks.filter((b) => String(b?.subject_id || '') !== sid);
    const st =
      row.subject_targets && typeof row.subject_targets === 'object' ? { ...row.subject_targets } : null;
    const hadTarget = st && Object.prototype.hasOwnProperty.call(st, sid);
    if (hadTarget) delete st[sid];
    const blocksChanged = newBlocks.length !== blocks.length;
    const targetsChanged = Boolean(hadTarget);
    if (!blocksChanged && !targetsChanged) continue;
    const patch = { updated_at: nowIso };
    if (blocksChanged) patch.blocks = newBlocks;
    if (targetsChanged) patch.subject_targets = st && Object.keys(st).length > 0 ? st : {};
    const { error: upErr } = await supabaseClient.from('academic_year_plan').update(patch).eq('id', row.id);
    if (upErr) {
      console.warn('[deleteSubjectCascade] academic_year_plan row update:', upErr.message || upErr);
    }
  }
}

/** Best-effort: remove imported curriculum rows tagged with this subject name. */
export async function deleteCurriculumUnitsForSubjectTag(supabaseClient, familyId, subjectId, subjectName) {
  // On web, use backend route for curriculum cleanup to avoid browser-side RLS/CORS noise.
  if (typeof window !== 'undefined' && subjectId) {
    try {
      await clearManualCurriculumEvents(familyId, subjectId);
      return;
    } catch (_) {
      // Fall through to best-effort direct cleanup.
    }
  }
  const name = (subjectName || '').trim();
  if (!name) return;
  try {
    const { data: units, error } = await supabaseClient
      .from('curriculum_units')
      .select('id')
      .eq('family_id', familyId)
      .contains('subject_tags', [name]);
    if (error || !units?.length) return;
    const unitIds = units.map((u) => u.id).filter(Boolean);
    if (unitIds.length === 0) return;
    await supabaseClient.from('curriculum_lessons').delete().in('unit_id', unitIds);
    try {
      await supabaseClient.from('curriculum_pacing').delete().in('unit_id', unitIds);
    } catch (_) {
      /* optional */
    }
    await supabaseClient.from('curriculum_units').delete().in('id', unitIds);
  } catch (e) {
    console.warn('[deleteSubjectCascade] curriculum cleanup:', e?.message || e);
  }
}

export async function deleteSubjectAuxiliaryRows(supabaseClient, subjectId) {
  const sid = String(subjectId);
  for (const tbl of ['subject_track', 'subject_goals']) {
    try {
      await supabaseClient.from(tbl).delete().eq('subject_id', sid);
    } catch (_) {
      /* optional tables */
    }
  }
}

/** Clear rows that still reference subject_id without ON DELETE SET NULL. */
export async function clearSubjectForeignKeyReferences(supabaseClient, subjectId) {
  const sid = String(subjectId || '').trim();
  if (!sid) return;
  for (const { table, mode } of [
    { table: 'grades', mode: 'null' },
    { table: 'notes', mode: 'null' },
    { table: 'subject_coverage_tracking', mode: 'delete' },
  ]) {
    try {
      if (mode === 'delete') {
        await supabaseClient.from(table).delete().eq('subject_id', sid);
      } else {
        const { error } = await supabaseClient.from(table).update({ subject_id: null }).eq('subject_id', sid);
        if (error) {
          console.warn(`[deleteSubjectCascade] ${table} subject_id cleanup:`, error.message || error);
        }
      }
    } catch (err) {
      console.warn(`[deleteSubjectCascade] ${table} subject_id cleanup exception:`, err?.message || err);
    }
  }
}

/** Prevent FK violations when deleting a subject referenced by outcomes. */
export async function clearEventOutcomeSubjectReferences(supabaseClient, subjectId) {
  const sid = String(subjectId || '').trim();
  if (!sid) return;
  try {
    const { error } = await supabaseClient
      .from('event_outcomes')
      .update({ subject_id: null })
      .eq('subject_id', sid);
    if (error) {
      console.warn('[deleteSubjectCascade] event_outcomes subject_id cleanup:', error.message || error);
    }
  } catch (err) {
    console.warn('[deleteSubjectCascade] event_outcomes subject_id cleanup exception:', err?.message || err);
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
 * @returns {Promise<{ ok: true, deletedName: string } | { ok: false, error: string }>}
 */
export async function deleteSubjectCascade(supabaseClient, familyId, subjectId, subjectDisplayName) {
  const deletedName = (subjectDisplayName || 'Subject').trim();
  try {
    await removeSubjectFromFamilyPlanRows(supabaseClient, familyId, subjectId);
    await deleteSubjectAuxiliaryRows(supabaseClient, subjectId);
    await clearSubjectForeignKeyReferences(supabaseClient, subjectId);
    await clearEventOutcomeSubjectReferences(supabaseClient, subjectId);
    await softDeleteSubjectLinkedEvents(supabaseClient, familyId, subjectId, deletedName);
    await supabaseClient.from('materials').delete().eq('subject_id', subjectId);
    const { data: syllabi } = await supabaseClient.from('syllabi').select('id').eq('subject_id', subjectId);
    if (syllabi && syllabi.length > 0) {
      const syllabusIds = syllabi.map((s) => s.id);
      await supabaseClient.from('syllabus_sections').delete().in('syllabus_id', syllabusIds);
      await supabaseClient.from('syllabi').delete().eq('subject_id', subjectId);
    }
    await deleteCurriculumUnitsForSubjectTag(supabaseClient, familyId, subjectId, deletedName);
    const { data: deletedRows, error } = await supabaseClient
      .from('subject')
      .delete()
      .eq('id', subjectId)
      .eq('family_id', familyId)
      .select('id');
    if (error) throw error;
    if (!Array.isArray(deletedRows) || deletedRows.length === 0) {
      throw new Error('Could not delete subject. You may not have permission.');
    }
    // Sweep any ClassDays that only linked via metadata/title after the subject row is gone.
    await cleanupOrphanedSubjectPlanEvents(supabaseClient, familyId);
    return { ok: true, deletedName };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/** Plan cache + web refresh events (call after successful delete). */
export function dispatchSubjectDeletedSideEffects(familyId) {
  invalidatePlanHealthCache();
  dropAllPlanYearCachesForFamily(familyId);
  prefetchPlanEditListForFamily(familyId).catch(() => {});
  if (familyId) {
    cleanupOrphanedSubjectPlanEvents(supabase, familyId)
      .then((result) => {
        if (result?.softDeleted > 0 && typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('refreshCalendar', {
              detail: { forceInvalidate: true, skipHomeRefresh: false },
            })
          );
        }
      })
      .catch(() => {});
  }
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('refreshSubjects'));
  window.dispatchEvent(
    new CustomEvent('refreshCalendar', {
      detail: { forceInvalidate: true, skipHomeRefresh: false },
    })
  );
  window.dispatchEvent(new CustomEvent('refreshEvents'));
  if (familyId) {
    window.dispatchEvent(new CustomEvent('refreshMaterials', { detail: { familyId } }));
  }
  window.dispatchEvent(new CustomEvent('refreshPlanDefaults'));
  window.dispatchEvent(new CustomEvent('refreshPlanHealth'));
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('planAppliedToCalendar'));
  }, 200);
}

/** Default client convenience for chat / scripts. */
export async function deleteSubjectCascadeForFamily(familyId, subjectId, subjectDisplayName) {
  return deleteSubjectCascade(supabase, familyId, subjectId, subjectDisplayName);
}
