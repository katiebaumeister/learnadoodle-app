/**
 * URL query parameter helpers
 * For building and parsing deep links
 */

/**
 * Build query string from params object
 * @param {Object} params - { child, subject, date, view, weekStart }
 * @returns {string} Query string (e.g., "?child=123&date=2025-11-04")
 */
export const buildQueryParams = (params) => {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== '') {
      // Map internal keys to URL keys
      const urlKey = key === 'childId' ? 'child' : 
                    key === 'subjectId' ? 'subject' : 
                    key;
      searchParams.set(urlKey, String(value));
    }
  });
  
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
};

/**
 * Parse query string into params object
 * @param {string} search - Query string (e.g., "?child=123&date=2025-11-04")
 * @returns {Object} Params object
 */
export const parseQueryParams = (search) => {
  const params = new URLSearchParams(search);
  const result = {};
  
  // Map URL keys to internal keys
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
 * Build planner deep link
 * @param {Object} options - { childId?, subjectId?, date?, view? }
 * @returns {string} Path with query params
 */
export const buildPlannerLink = (options = {}) => {
  const params = {
    ...(options.childId && { child: options.childId }),
    ...(options.subjectId && { subject: options.subjectId }),
    ...(options.date && { date: options.date }),
    ...(options.view && { view: options.view || 'week' }),
  };
  return `/planner${buildQueryParams(params)}`;
};

/**
 * Build documents deep link
 * @param {Object} options - { childId?, subjectId? }
 * @returns {string} Path with query params
 */
export const buildDocumentsLink = (options = {}) => {
  const params = {
    ...(options.childId && { child: options.childId }),
    ...(options.subjectId && { subject: options.subjectId }),
  };
  return `/documents${buildQueryParams(params)}`;
};

/**
 * Build child profile deep link
 * @param {Object} options - { childId, tab?, weekStart? }
 * @returns {string} Path with query params
 */
export const buildChildLink = (options) => {
  if (!options.childId) return '/children';
  
  const params = {
    ...(options.tab && { tab: options.tab }),
    ...(options.weekStart && { weekStart: options.weekStart }),
  };
  
  return `/children/${options.childId}${buildQueryParams(params)}`;
};

