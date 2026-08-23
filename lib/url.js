/**
 * URL helpers — the logged-in shell always uses `/` with query params.
 * Legacy path deep links (/planner, /month, …) are normalized on read.
 */

/** Planner views that must never appear as URL path segments (e.g. /month). */
export const PLANNER_VIEW_PATH_SEGMENTS = new Set([
  'month',
  'week',
  'year',
  'tasks',
  'board',
  'list',
]);

const SHELL_DEEP_LINK_PATHS = [
  '/planner',
  '/planner/preferences',
  '/learning',
  '/subject-catalog',
  '/subjects',
  '/intelligence',
  '/messages',
  '/materials',
  '/library',
  '/records',
  '/family',
  '/profile',
  '/students',
  '/review',
];

export function normalizeAppPathname(pathnameRaw) {
  return String(pathnameRaw || '/').replace(/\/+$/, '') || '/';
}

export function isShellDeepLinkPath(pathnameRaw) {
  const pathname = normalizeAppPathname(pathnameRaw);
  if (pathname === '/' || pathname === '/home') return false;
  if (pathname.match(/^\/subjects\/[^/]+$/)) return true;
  if (PLANNER_VIEW_PATH_SEGMENTS.has(pathname.slice(1))) return true;
  return SHELL_DEEP_LINK_PATHS.includes(pathname);
}

/** Resolve shell tab/nav from a URL pathname for one-time legacy deep links. */
export function resolveShellRouteFromPathname(pathnameRaw) {
  const pathname = normalizeAppPathname(pathnameRaw);
  const plannerViewFromPath = pathname.slice(1);
  if (PLANNER_VIEW_PATH_SEGMENTS.has(plannerViewFromPath)) {
    return {
      activeTab: 'planner',
      activeTopNav: 'planner',
      activeSubtab: 'calendar',
      messagesPaneOpen: false,
      plannerView: plannerViewFromPath,
    };
  }
  if (pathname.match(/^\/subjects\/[^/]+$/)) {
    const subjectId = pathname.split('/')[2];
    return { activeTab: `subject-${subjectId}`, activeTopNav: 'subjects', activeSubtab: null, messagesPaneOpen: false };
  }
  if (pathname === '/learning' || pathname === '/subject-catalog') {
    return { activeTab: 'learning', activeTopNav: 'learning', activeSubtab: 'subjects', messagesPaneOpen: false };
  }
  if (pathname === '/subjects' || pathname === '/intelligence') {
    return { activeTab: 'subjects', activeTopNav: 'subjects', activeSubtab: 'subjects', messagesPaneOpen: false };
  }
  if (pathname === '/planner/preferences') {
    return { activeTab: 'settings', activeTopNav: 'planning-preferences', activeSubtab: 'planner-settings', messagesPaneOpen: false };
  }
  if (pathname === '/planner') {
    return { activeTab: 'planner', activeTopNav: 'planner', activeSubtab: 'calendar', messagesPaneOpen: false };
  }
  if (pathname === '/messages') {
    return { activeTab: 'home', activeTopNav: 'messages', activeSubtab: null, messagesPaneOpen: true };
  }
  if (pathname === '/materials' || pathname === '/library') {
    return { activeTab: 'materials', activeTopNav: 'materials', activeSubtab: null, messagesPaneOpen: false };
  }
  if (pathname === '/records') {
    return { activeTab: 'records', activeTopNav: 'records', activeSubtab: 'attendance', messagesPaneOpen: false };
  }
  if (pathname === '/family' || pathname === '/profile') {
    return { activeTab: 'family', activeTopNav: 'family', activeSubtab: null, messagesPaneOpen: false };
  }
  if (pathname === '/students') {
    return { activeTab: 'tutor-students', activeTopNav: 'tutor-students', activeSubtab: null, messagesPaneOpen: false };
  }
  if (pathname === '/review') {
    return { activeTab: 'review', activeTopNav: 'review', activeSubtab: null, messagesPaneOpen: false };
  }
  return { activeTab: 'home', activeTopNav: 'home', activeSubtab: null, messagesPaneOpen: false };
}

/**
 * Build query string from params object
 * @param {Object} params - { child, subject, date, view, weekStart }
 * @returns {string} Query string (e.g., "?child=123&date=2025-11-04")
 */
export const buildQueryParams = (params) => {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      const urlKey = key === 'childId' ? 'child'
        : key === 'subjectId' ? 'subject'
          : key;
      searchParams.set(urlKey, String(value));
    }
  });

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
};

/**
 * Root app URL with query params (never /planner or /month paths).
 */
export function buildAppLink(params = {}) {
  return `/${buildQueryParams(params)}`;
}

/**
 * Parse query string into params object
 * @param {string} search - Query string (e.g., "?child=123&date=2025-11-04")
 * @returns {Object} Params object
 */
export const parseQueryParams = (search) => {
  const params = new URLSearchParams(search);
  const result = {};

  if (params.has('child')) {
    result.childId = params.get('child');
  }
  if (params.has('subject')) {
    result.subjectId = params.get('subject');
  }
  if (params.has('date')) {
    result.date = params.get('date');
  }
  if (params.has('view')) {
    result.view = params.get('view');
  }
  if (params.has('weekStart')) {
    result.weekStart = params.get('weekStart');
  }

  return result;
};

/**
 * Planner deep link — always `/?view=…` (legacy `/planner?…` is normalized on read).
 */
export const buildPlannerLink = (options = {}) => {
  const params = {
    ...(options.childId && { child: options.childId }),
    ...(options.subjectId && { subject: options.subjectId }),
    ...(options.date && { date: options.date }),
    ...(options.view && { view: options.view || 'week' }),
    ...(options.event && { event: options.event }),
    ...(options.course && { course: options.course }),
    ...(options.unit && { unit: options.unit }),
  };
  return buildAppLink(params);
};

/**
 * Normalize legacy shell hrefs to root query URLs.
 */
export function normalizeAppHref(hrefRaw) {
  const href = String(hrefRaw || '').trim();
  if (!href || href.startsWith('#')) return href;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://learnadoodle.local';
    const u = new URL(href, base);
    const pathname = normalizeAppPathname(u.pathname);
    const viewFromPath = pathname.slice(1);

    if (PLANNER_VIEW_PATH_SEGMENTS.has(viewFromPath) && !u.searchParams.has('view')) {
      u.searchParams.set('view', viewFromPath);
    }

    if (pathname === '/planner' || pathname.startsWith('/planner/')) {
      // Legacy /planner/backlog etc. — keep query, drop path segment.
      if (pathname !== '/planner' && !u.searchParams.has('view')) {
        const tail = pathname.replace(/^\/planner\/?/, '');
        if (tail && PLANNER_VIEW_PATH_SEGMENTS.has(tail)) {
          u.searchParams.set('view', tail);
        }
      }
    }

    u.pathname = '/';
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return href;
  }
}

export function isPlannerNavigationHref(hrefRaw) {
  const href = String(hrefRaw || '').trim();
  if (!href) return false;
  if (href.includes('/planner') || href.includes('tab=planner')) return true;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://learnadoodle.local';
    const u = new URL(href, base);
    const pathname = normalizeAppPathname(u.pathname);
    if (pathname === '/planner' || pathname.startsWith('/planner/')) return true;
    if (PLANNER_VIEW_PATH_SEGMENTS.has(pathname.slice(1))) return true;
    const view = u.searchParams.get('view');
    if (view && PLANNER_VIEW_PATH_SEGMENTS.has(view)) return true;
  } catch {
    return false;
  }
  return false;
}

export function parseNavigationHref(hrefRaw) {
  const href = String(hrefRaw || '').trim();
  if (!href) return { target: 'home' };
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://learnadoodle.local';
    const u = new URL(href, base);
    const pathname = normalizeAppPathname(u.pathname);
    const viewFromPath = pathname.slice(1);

    if (PLANNER_VIEW_PATH_SEGMENTS.has(viewFromPath)) {
      return { target: 'planner', view: viewFromPath, params: u.searchParams };
    }
    if (pathname === '/planner' || pathname.startsWith('/planner/')) {
      const view = u.searchParams.get('view')
        || (PLANNER_VIEW_PATH_SEGMENTS.has(pathname.replace(/^\/planner\/?/, ''))
          ? pathname.replace(/^\/planner\/?/, '')
          : null)
        || 'month';
      return { target: 'planner', view, params: u.searchParams };
    }

    const viewParam = u.searchParams.get('view');
    if (viewParam && PLANNER_VIEW_PATH_SEGMENTS.has(viewParam)) {
      return { target: 'planner', view: viewParam, params: u.searchParams };
    }

    if (pathname === '/learning' || pathname === '/subject-catalog' || href.includes('/learning') || href.includes('/subjects')) {
      return { target: 'learning', params: u.searchParams };
    }
    if (href.includes('materials') || pathname === '/materials' || pathname === '/library') {
      return { target: 'materials', params: u.searchParams };
    }
    if (pathname === '/records' || href.includes('/records')) {
      return { target: 'records', params: u.searchParams };
    }
    if (pathname === '/settings' || pathname === '/family' || href.includes('/settings') || href.includes('/family')) {
      return { target: 'settings', section: u.searchParams.get('section'), params: u.searchParams };
    }
    if (pathname === '/intelligence' || href.includes('intelligence')) {
      return { target: 'intelligence', params: u.searchParams };
    }
  } catch {
    return { target: 'home' };
  }
  return { target: 'home' };
}

/**
 * Write URL search params while forcing pathname to `/`.
 */
export function writeAppSearchParams(patch = {}, { push = false, baseHref } = {}) {
  if (typeof window === 'undefined') return '';
  const url = new URL(baseHref || window.location.href);
  url.pathname = '/';
  Object.entries(patch).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  });
  const target = `${url.pathname}${url.search}${url.hash}`;
  if (push) window.history.pushState({}, '', target);
  else window.history.replaceState({}, '', target);
  return target;
}

/**
 * Canonicalize legacy shell paths (/planner, /month, …) to `/` while preserving query params.
 */
export function canonicalizeShellUrlToRoot() {
  if (typeof window === 'undefined') return;
  const pathname = normalizeAppPathname(window.location.pathname);
  if (!isShellDeepLinkPath(pathname) && pathname === '/') return;
  if (!isShellDeepLinkPath(pathname)) return;

  const url = new URL(window.location.href);
  const viewFromPath = pathname.slice(1);
  if (PLANNER_VIEW_PATH_SEGMENTS.has(viewFromPath) && !url.searchParams.has('view')) {
    url.searchParams.set('view', viewFromPath);
  }
  url.pathname = '/';
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

/**
 * Build documents deep link
 */
export const buildDocumentsLink = (options = {}) => {
  const params = {
    ...(options.childId && { child: options.childId }),
    ...(options.subjectId && { subject: options.subjectId }),
  };
  return buildAppLink(params);
};

/**
 * Build child profile deep link
 */
export const buildChildLink = (options) => {
  if (!options.childId) return '/';

  const params = {
    ...(options.tab && { tab: options.tab }),
    ...(options.weekStart && { weekStart: options.weekStart }),
  };

  return buildAppLink({ child: options.childId, ...params });
};
