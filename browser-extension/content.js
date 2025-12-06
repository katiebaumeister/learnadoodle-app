// Content script for Hi World extension
// Detects if current page is a learning resource and can pre-fill information

// Detect YouTube videos
function detectYouTubeVideo() {
  const url = window.location.href;
  const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = url.match(youtubeRegex);
  
  if (match) {
    return {
      type: 'youtube',
      videoId: match[1],
      url: url
    };
  }
  
  return null;
}

// Detect educational platforms
function detectEducationalPlatform() {
  const hostname = window.location.hostname;
  const title = document.title;
  
  const platforms = [
    { domain: 'khanacademy.org', name: 'Khan Academy' },
    { domain: 'coursera.org', name: 'Coursera' },
    { domain: 'edx.org', name: 'edX' },
    { domain: 'udemy.com', name: 'Udemy' },
    { domain: 'codecademy.com', name: 'Codecademy' },
    { domain: 'duolingo.com', name: 'Duolingo' }
  ];
  
  for (const platform of platforms) {
    if (hostname.includes(platform.domain)) {
      return {
        type: 'educational',
        platform: platform.name,
        url: window.location.href,
        title: title
      };
    }
  }
  
  return null;
}

// Send detected resource info to popup (if needed)
// This is a placeholder - actual implementation would use message passing
if (typeof chrome !== 'undefined' && chrome.runtime) {
  // Could send message to background script with detected resource info
  // For now, the popup will handle URL detection directly
}

