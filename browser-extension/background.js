// Background service worker for Hi World extension

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Hi World extension installed');
    // Could open welcome page here
  } else if (details.reason === 'update') {
    console.log('Hi World extension updated');
  }
});

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'get_token') {
    // Get token from storage
    chrome.storage.local.get(['supabaseAccessToken'], (result) => {
      sendResponse({ token: result.supabaseAccessToken || null });
    });
    return true; // Indicates we will send a response asynchronously
  }
  
  if (message.type === 'set_token') {
    // Set token in storage
    chrome.storage.local.set({
      supabaseAccessToken: message.token,
      supabaseExpiresAt: message.expiresAt
    }, () => {
      sendResponse({ success: true });
    });
    return true;
  }
});

// Handle OAuth callback (if using OAuth flow)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Check if this is an OAuth callback
    if (tab.url.includes('extension=true') && tab.url.includes('access_token=')) {
      // Extract token from URL
      const url = new URL(tab.url);
      const params = new URLSearchParams(url.hash.substring(1)); // OAuth tokens are in hash
      const accessToken = params.get('access_token');
      const expiresIn = parseInt(params.get('expires_in') || '3600');
      
      if (accessToken) {
        // Store token
        chrome.storage.local.set({
          supabaseAccessToken: accessToken,
          supabaseExpiresAt: Date.now() + (expiresIn * 1000)
        }, () => {
          // Notify popup to refresh
          chrome.runtime.sendMessage({ type: 'auth_update' });
          
          // Close the OAuth tab
          chrome.tabs.remove(tabId);
        });
      }
    }
  }
});

