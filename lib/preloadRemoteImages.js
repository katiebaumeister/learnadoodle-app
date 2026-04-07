/**
 * Warm browser cache for remote avatar / profile images (https) after the app shell is up.
 */

export function collectAvatarUrlsFromFamilyState(profile, children, family) {
  const urls = [];
  const push = (u) => {
    if (typeof u === 'string' && /^https?:\/\//i.test(u.trim())) urls.push(u.trim());
  };
  push(profile?.avatar_url);
  if (Array.isArray(children)) {
    children.forEach((c) => {
      push(c?.avatar_url);
      push(c?.avatar);
    });
  }
  const members = family?.members;
  if (Array.isArray(members)) {
    members.forEach((m) => push(m?.avatar_url));
  }
  return [...new Set(urls)];
}

export function preloadRemoteImageUrls(urls) {
  if (typeof window === 'undefined' || !urls?.length) return Promise.resolve();
  const unique = [...new Set(urls.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u.trim())))];
  if (unique.length === 0) return Promise.resolve();
  return Promise.all(
    unique.map(
      (url) =>
        new Promise((resolve) => {
          const img = new window.Image();
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = url;
        })
    )
  );
}
