import { supabase } from '../supabase';
import { serializeSubjectGradingSettings, validateGradingSettings } from '../subjectGradingSettings';

export async function saveSubjectGradingSettings(subjectId, familyId, settings) {
  if (!subjectId || !familyId) {
    throw new Error('Missing subject or family.');
  }
  const { ok, errors, settings: parsed } = validateGradingSettings(settings);
  if (!ok) {
    throw new Error(errors[0] || 'Invalid grading settings.');
  }
  const payload = serializeSubjectGradingSettings(parsed);
  const { data, error } = await supabase
    .from('subject')
    .update({
      grading_settings: payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subjectId)
    .eq('family_id', familyId)
    .select('id, grading_settings')
    .maybeSingle();
  if (error) throw error;
  return data;
}
