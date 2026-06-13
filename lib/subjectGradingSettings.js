export const GRADING_CALC_METHOD = {
  NONE: 'none',
  TOTAL_POINTS: 'total_points',
  WEIGHTED_CATEGORY: 'weighted_category',
};

export const GRADING_CALC_METHOD_OPTIONS = [
  { value: GRADING_CALC_METHOD.NONE, label: 'No overall grade' },
  { value: GRADING_CALC_METHOD.TOTAL_POINTS, label: 'Total points' },
  { value: GRADING_CALC_METHOD.WEIGHTED_CATEGORY, label: 'Weighted by category' },
];

export const DEFAULT_GRADING_SETTINGS = {
  auto_draft_missing: false,
  missing_default_grade_percent: 0,
  calculation_method: GRADING_CALC_METHOD.NONE,
  show_overall_to_students: false,
  categories: [],
};

function clampPercent(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function normalizeCategory(raw, index) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || '').trim();
  const weightPercent = clampPercent(raw.weight_percent ?? raw.weight ?? 0, 0);
  const id = String(raw.id || `cat-${index}-${name || 'category'}`).trim();
  if (!name) return null;
  return { id, name, weight_percent: weightPercent };
}

export function parseSubjectGradingSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_GRADING_SETTINGS, categories: [] };
  }
  const method = String(raw.calculation_method || GRADING_CALC_METHOD.NONE).trim();
  const validMethod = GRADING_CALC_METHOD_OPTIONS.some((o) => o.value === method)
    ? method
    : GRADING_CALC_METHOD.NONE;
  const categories = (Array.isArray(raw.categories) ? raw.categories : [])
    .map(normalizeCategory)
    .filter(Boolean);
  return {
    auto_draft_missing: Boolean(raw.auto_draft_missing),
    missing_default_grade_percent: clampPercent(raw.missing_default_grade_percent, 0),
    calculation_method: validMethod,
    show_overall_to_students: Boolean(raw.show_overall_to_students),
    categories,
  };
}

export function serializeSubjectGradingSettings(settings) {
  const parsed = parseSubjectGradingSettings(settings);
  return {
    auto_draft_missing: parsed.auto_draft_missing,
    missing_default_grade_percent: parsed.missing_default_grade_percent,
    calculation_method: parsed.calculation_method,
    show_overall_to_students: parsed.show_overall_to_students,
    categories: parsed.categories.map((c) => ({
      id: c.id,
      name: c.name,
      weight_percent: c.weight_percent,
    })),
  };
}

export function getGradingMethodLabel(method) {
  const match = GRADING_CALC_METHOD_OPTIONS.find((o) => o.value === method);
  return match?.label || 'No overall grade';
}

export function getCategoryWeightRemaining(categories = []) {
  const used = (categories || []).reduce((sum, c) => sum + clampPercent(c.weight_percent, 0), 0);
  return Math.max(0, 100 - used);
}

export function validateGradingSettings(settings) {
  const parsed = parseSubjectGradingSettings(settings);
  const errors = [];

  if (parsed.auto_draft_missing) {
    if (parsed.missing_default_grade_percent < 0 || parsed.missing_default_grade_percent > 100) {
      errors.push('Default grade must be between 0 and 100%.');
    }
  }

  if (parsed.calculation_method === GRADING_CALC_METHOD.WEIGHTED_CATEGORY) {
    if (!parsed.categories.length) {
      errors.push('Add at least one grade category.');
    }
    parsed.categories.forEach((cat, index) => {
      if (!cat.name.trim()) {
        errors.push(`Category ${index + 1} needs a name.`);
      }
    });
    const remaining = getCategoryWeightRemaining(parsed.categories);
    if (parsed.categories.length > 0 && remaining !== 0) {
      errors.push(`Grade categories must add up to 100% (${remaining}% remaining).`);
    }
  }

  return { ok: errors.length === 0, errors, settings: parsed };
}

export function createEmptyCategory() {
  return {
    id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    weight_percent: 0,
  };
}
