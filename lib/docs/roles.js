// Shared document roles + media type normalizers
// Used by Library (MaterialsLibrary) + Event Details → Documents (EventSyllabusTab)

export const DOCUMENT_ROLE_CHIPS = [
  { value: 'all', label: 'All' },
  { value: 'syllabus', label: 'Syllabus' },
  { value: 'lesson_plan', label: 'Lesson plan' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'resource', label: 'Resource' },
  { value: 'assessment', label: 'Assessment' },
  { value: 'photo_uploads', label: 'Photo upload' },
  { value: 'book', label: 'Book' },
];

export const DOCUMENT_ROLES = {
  ALL: 'all',
  SYLLABUS: 'syllabus',
  LESSON_PLAN: 'lesson_plan',
  ASSIGNMENT: 'assignment',
  RESOURCE: 'resource',
  ASSESSMENT: 'assessment',
  LOGS: 'logs',
  PHOTO_UPLOADS: 'photo_uploads',
  BOOK: 'book',
  LEARNADOODLE_GENERATED_SUMMARIES: 'learnadoodle_generated_summaries',
  UNKNOWN: 'unknown', // legacy; prefer null for "unknown"
};

export const MEDIA_TYPES = {
  PDF: 'pdf',
  DOC: 'doc',
  IMAGE: 'image',
  VIDEO: 'video',
  LINK: 'link',
  UNKNOWN: 'unknown',
};

export function roleLabel(role) {
  const r = (role || '').toLowerCase();
  if (r === DOCUMENT_ROLES.SYLLABUS) return 'Syllabus';
  if (r === DOCUMENT_ROLES.LESSON_PLAN) return 'Lesson plan';
  if (r === DOCUMENT_ROLES.ASSIGNMENT) return 'Assignment';
  if (r === DOCUMENT_ROLES.RESOURCE) return 'Resource';
  if (r === DOCUMENT_ROLES.ASSESSMENT) return 'Assessment';
  if (r === DOCUMENT_ROLES.LOGS) return 'Logs';
  if (r === DOCUMENT_ROLES.PHOTO_UPLOADS) return 'Photo upload';
  if (r === DOCUMENT_ROLES.BOOK) return 'Book';
  if (r === DOCUMENT_ROLES.LEARNADOODLE_GENERATED_SUMMARIES) return 'Learnadoodle generated summaries';
  if (r === DOCUMENT_ROLES.ALL) return 'All';
  return 'Document';
}

export function mediaTypeLabel(mediaType) {
  switch ((mediaType || '').toLowerCase()) {
    case MEDIA_TYPES.PDF:
      return 'PDF';
    case MEDIA_TYPES.DOC:
      return 'Doc';
    case MEDIA_TYPES.IMAGE:
      return 'Image';
    case MEDIA_TYPES.VIDEO:
      return 'Video';
    case MEDIA_TYPES.LINK:
      return 'Link';
    default:
      // Prefer blank rather than “Unknown” in UI subtitles
      return null;
  }
}

export function normalizeTags(tags) {
  return Array.isArray(tags) ? tags.map((t) => (t || '').toString().toLowerCase()) : [];
}

function normalizeRoleSlug(role) {
  const r = (role || '').toString().trim().toLowerCase();
  if (!r) return null;
  // allow role:lesson_plan
  const slug = r.startsWith('role:') ? r.slice('role:'.length) : r;
  if (
    [
      DOCUMENT_ROLES.SYLLABUS,
      DOCUMENT_ROLES.LESSON_PLAN,
      DOCUMENT_ROLES.ASSIGNMENT,
      DOCUMENT_ROLES.RESOURCE,
      DOCUMENT_ROLES.ASSESSMENT,
      DOCUMENT_ROLES.LOGS,
      DOCUMENT_ROLES.PHOTO_UPLOADS,
      DOCUMENT_ROLES.BOOK,
      DOCUMENT_ROLES.LEARNADOODLE_GENERATED_SUMMARIES,
    ].includes(slug)
  ) {
    return slug;
  }
  return null;
}

export function deriveRoleFromTags(tags) {
  const t = normalizeTags(tags);

  // Prefer future-proof role:<slug>
  const roleTag = t.find((tag) => tag.startsWith('role:'));
  const fromRoleTag = normalizeRoleSlug(roleTag);
  if (fromRoleTag) return fromRoleTag;

  // Back-compat: previous raw slugs
  if (t.includes(DOCUMENT_ROLES.SYLLABUS)) return DOCUMENT_ROLES.SYLLABUS;
  if (t.includes(DOCUMENT_ROLES.LESSON_PLAN) || t.includes('lesson plan')) return DOCUMENT_ROLES.LESSON_PLAN;
  if (t.includes(DOCUMENT_ROLES.ASSIGNMENT)) return DOCUMENT_ROLES.ASSIGNMENT;
  if (t.includes(DOCUMENT_ROLES.RESOURCE)) return DOCUMENT_ROLES.RESOURCE;
  if (t.includes(DOCUMENT_ROLES.ASSESSMENT)) return DOCUMENT_ROLES.ASSESSMENT;
  if (t.includes(DOCUMENT_ROLES.LOGS)) return DOCUMENT_ROLES.LOGS;
  if (t.includes(DOCUMENT_ROLES.PHOTO_UPLOADS) || t.includes('photo upload') || t.includes('photo_upload')) return DOCUMENT_ROLES.PHOTO_UPLOADS;
  if (t.includes(DOCUMENT_ROLES.BOOK)) return DOCUMENT_ROLES.BOOK;
  if (t.includes(DOCUMENT_ROLES.LEARNADOODLE_GENERATED_SUMMARIES) || t.includes('learnadoodle') || t.includes('generated summary')) return DOCUMENT_ROLES.LEARNADOODLE_GENERATED_SUMMARIES;

  return null;
}

export function inferMediaTypeFromMimeOrPath(mime, storagePathOrUrl) {
  const m = (mime || '').toLowerCase();
  const s = (storagePathOrUrl || '').toLowerCase();

  if (m === 'application/pdf' || s.endsWith('.pdf')) return MEDIA_TYPES.PDF;

  if (
    m.includes('msword') ||
    m.includes('officedocument.wordprocessingml') ||
    s.endsWith('.doc') ||
    s.endsWith('.docx')
  ) {
    return MEDIA_TYPES.DOC;
  }

  if (m.startsWith('image/') || s.match(/\.(png|jpg|jpeg|gif|webp)$/)) return MEDIA_TYPES.IMAGE;

  if (m.startsWith('video/') || s.includes('youtube.com') || s.includes('youtu.be') || s.includes('vimeo.com')) {
    return MEDIA_TYPES.VIDEO;
  }

  // URL heuristics for link
  if (s.startsWith('http://') || s.startsWith('https://')) {
    // If it looks like a bare URL without a clear file extension, treat as link
    if (!s.match(/\.(pdf|doc|docx|png|jpg|jpeg|gif|webp|mp4|mov|m4v)(\?|#|$)/)) return MEDIA_TYPES.LINK;
  }

  return MEDIA_TYPES.UNKNOWN;
}

function buildSubtitle(role, mediaType) {
  const r = normalizeRoleSlug(role);
  const roleText = roleLabel(r);
  const fmt = mediaTypeLabel(mediaType);
  return fmt ? `${roleText} • ${fmt}` : roleText;
}

// uploads row from get_uploads RPC (id/title/storage_path/mime/kind/tags/notes)
export function normalizeUpload(upload) {
  const role = deriveRoleFromTags(upload?.tags);
  const mediaType = inferMediaTypeFromMimeOrPath(upload?.mime, upload?.storage_path || upload?.title);

  const title = (upload?.title || '').trim() || (upload?.storage_path ? upload.storage_path.split('/').pop() : 'Untitled');
  const subtitle = buildSubtitle(role, mediaType);

  return {
    kind: 'upload',
    id: upload?.id,
    createdAt: upload?.created_at,
    title,
    subtitle,
    role,
    mediaType,
    materialType: null,
    raw: upload,
  };
}

// materials row (title/type/provider_url/etc)
export function normalizeMaterial(material) {
  const mt = (material?.type || '').toLowerCase();

  // Conservative role mapping:
  // If we can’t confidently map a material to a role, keep role=null (matches All only).
  let role = deriveRoleFromTags(material?.tags);
  if (!role && ['textbook', 'workbook', 'kit', 'course', 'subscription', 'video'].includes(mt)) {
    role = DOCUMENT_ROLES.RESOURCE;
  }

  // Media type for materials
  let mediaType = MEDIA_TYPES.UNKNOWN;
  if (mt === 'video') mediaType = MEDIA_TYPES.VIDEO;
  else if ((material?.provider_url || '').toString().trim()) mediaType = MEDIA_TYPES.LINK;

  const title = (material?.title || '').trim() || 'Untitled';
  const subtitle = role ? buildSubtitle(role, mediaType) : null;

  return {
    kind: 'material',
    id: material?.id,
    createdAt: material?.created_at,
    title,
    subtitle,
    role,
    mediaType,
    materialType: mt || null,
    raw: material,
  };
}

// syllabus_sections row (section_type: unit|lesson|assignment) + notes may include Doc kind tags
const DOC_KIND_RE = /doc\s*kind\s*:\s*(assignment|resource|assessment)\b/i;
export function deriveRoleFromSection(section) {
  const st = (section?.section_type || '').toLowerCase();
  if (st === 'unit') return DOCUMENT_ROLES.SYLLABUS;
  if (st === 'lesson' || !st) return DOCUMENT_ROLES.LESSON_PLAN;
  if (st === 'assignment') {
    const m = (section?.notes || '').match(DOC_KIND_RE);
    const kind = m?.[1]?.toLowerCase();
    if (kind === 'resource') return DOCUMENT_ROLES.RESOURCE;
    if (kind === 'assessment') return DOCUMENT_ROLES.ASSESSMENT;
    return DOCUMENT_ROLES.ASSIGNMENT;
  }
  return null;
}

export function normalizeSyllabusSection(section) {
  const role = deriveRoleFromSection(section);
  const mediaType = inferMediaTypeFromMimeOrPath(null, section?.notes || section?.heading);
  const title = (section?.heading || '').trim() || 'Untitled';
  const subtitle = buildSubtitle(role, mediaType);
  return {
    kind: 'section',
    id: section?.id,
    createdAt: section?.created_at,
    title,
    subtitle,
    role,
    mediaType,
    materialType: null,
    raw: section,
  };
}

export function matchesRole(roleFilter, normalizedItem) {
  const rf = (roleFilter || DOCUMENT_ROLES.ALL).toLowerCase();
  if (rf === DOCUMENT_ROLES.ALL) return true;
  const role = normalizeRoleSlug(normalizedItem?.role);
  // null/unknown roles match only All
  if (!role) return false;
  return role === rf;
}

/** Syllabus first, lesson plan second — used to pin subject attachment materials. */
export function subjectPinnedMaterialSortRank(role) {
  const r = normalizeRoleSlug(role);
  if (r === DOCUMENT_ROLES.SYLLABUS) return 0;
  if (r === DOCUMENT_ROLES.LESSON_PLAN) return 1;
  return 2;
}

export function compareLibraryMaterialItems(
  a,
  b,
  { sortBy = 'date', sortDirection = 'desc', pinSubjectRoles = false } = {},
) {
  if (pinSubjectRoles) {
    const pinDiff =
      subjectPinnedMaterialSortRank(a?.normalized?.role ?? a?.role)
      - subjectPinnedMaterialSortRank(b?.normalized?.role ?? b?.role);
    if (pinDiff !== 0) return pinDiff;
  }

  if (sortBy === 'alphabetical') {
    const titleA = (a?.normalized?.title || a?.data?.title || '').toLowerCase();
    const titleB = (b?.normalized?.title || b?.data?.title || '').toLowerCase();
    const comparison = titleA.localeCompare(titleB);
    return sortDirection === 'asc' ? comparison : -comparison;
  }

  const dateA = new Date(a?.data?.created_at || 0);
  const dateB = new Date(b?.data?.created_at || 0);
  const comparison = dateB - dateA;
  return sortDirection === 'desc' ? comparison : -comparison;
}

// Convenience: normalize an item from either list.
// - If it looks like an upload (has storage_path/mime), normalize as upload
// - Otherwise, assume material
export function normalizeLibraryItem(item) {
  if (item?.storage_path || item?.mime) return normalizeUpload(item);
  return normalizeMaterial(item);
}

// Event Documents: map UI role to syllabus_sections.section_type
export function roleToSectionType(role) {
  const r = (role || '').toLowerCase();
  if (r === DOCUMENT_ROLES.SYLLABUS) return 'unit';
  if (r === DOCUMENT_ROLES.LESSON_PLAN) return 'lesson';
  if (r === DOCUMENT_ROLES.ASSIGNMENT) return 'assignment';
  if (r === DOCUMENT_ROLES.RESOURCE) return 'assignment';
  if (r === DOCUMENT_ROLES.ASSESSMENT) return 'assignment';
  return 'lesson';
}

export function roleToUploadTags(role) {
  const r = normalizeRoleSlug(role);
  if (r) return ['document', `role:${r}`];
  return ['document'];
}

export function withDocKindTag(notes, role) {
  const r = (role || '').toLowerCase();
  const base = (notes || '').toString();

  // Keep idempotent
  if (DOC_KIND_RE.test(base)) return base || null;

  if (r === DOCUMENT_ROLES.RESOURCE) {
    return base.trim() ? `${base.trim()}\nDoc kind: Resource` : 'Doc kind: Resource';
  }
  if (r === DOCUMENT_ROLES.ASSESSMENT) {
    return base.trim() ? `${base.trim()}\nDoc kind: Assessment` : 'Doc kind: Assessment';
  }
  return base.trim() ? base.trim() : null;
}





