// Get current tab URL and metadata
async function getCurrentTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return {
    url: tab?.url || '',
    title: tab?.title || '',
    favIconUrl: tab?.favIconUrl || ''
  };
}

// Get API base URL from storage or use default
async function getAPIBase() {
  const result = await chrome.storage.sync.get(['apiBase']);
  return result.apiBase || 'https://app.hiworld.com'; // Default to production
}

// Get Supabase access token from storage
async function getAccessToken() {
  const result = await chrome.storage.local.get(['supabaseAccessToken', 'supabaseExpiresAt']);
  
  if (!result.supabaseAccessToken) {
    return null;
  }
  
  // Check if token is expired
  if (result.supabaseExpiresAt && Date.now() > result.supabaseExpiresAt) {
    // Token expired, clear it
    await chrome.storage.local.remove(['supabaseAccessToken', 'supabaseExpiresAt']);
    return null;
  }
  
  return result.supabaseAccessToken;
}

// Set Supabase access token
async function setAccessToken(token, expiresIn = 3600) {
  const expiresAt = Date.now() + (expiresIn * 1000);
  await chrome.storage.local.set({
    supabaseAccessToken: token,
    supabaseExpiresAt: expiresAt
  });
}

// Load children list
async function loadChildren() {
  const token = await getAccessToken();
  if (!token) {
    return [];
  }
  
  try {
    const apiBase = await getAPIBase();
    const response = await fetch(`${apiBase}/api/family/members`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.children || [];
  } catch (error) {
    console.error('Error loading children:', error);
    return [];
  }
}

// Add resource to planner
async function addToPlanner(url, childId, markCompleted) {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  const apiBase = await getAPIBase();
  const response = await fetch(`${apiBase}/api/extension/add`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      url,
      child_id: childId || null,
      mark_completed: markCompleted || false
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP ${response.status}`);
  }
  
  return await response.json();
}

// Show status message
function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.className = `status status-${type}`;
  statusDiv.textContent = message;
  statusDiv.style.display = 'block';
  
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, 3000);
  }
}

// Initialize popup
async function init() {
  const urlDisplay = document.getElementById('urlDisplay');
  const childSelect = document.getElementById('childSelect');
  const addButton = document.getElementById('addButton');
  const loginButton = document.getElementById('loginButton');
  
  // Get current URL and show preview
  const tabInfo = await getCurrentTabUrl();
  const currentUrl = tabInfo.url;
  urlDisplay.textContent = currentUrl || 'Unable to get URL';
  
  // Show preview if available
  if (tabInfo.favIconUrl) {
    const previewImg = document.createElement('img');
    previewImg.src = tabInfo.favIconUrl;
    previewImg.style.width = '16px';
    previewImg.style.height = '16px';
    previewImg.style.marginRight = '8px';
    previewImg.style.verticalAlign = 'middle';
    urlDisplay.insertBefore(previewImg, urlDisplay.firstChild);
  }
  
  // Detect if it's a playlist
  const isPlaylist = currentUrl.includes('list=');
  if (isPlaylist) {
    const playlistNote = document.createElement('div');
    playlistNote.style.cssText = 'background: #fef3c7; color: #92400e; padding: 8px; border-radius: 4px; margin-bottom: 12px; font-size: 12px;';
    playlistNote.textContent = '📋 Playlist detected - all videos will be added';
    document.getElementById('mainContent').insertBefore(playlistNote, urlDisplay.nextSibling);
  }
  
  // Check authentication
  const token = await getAccessToken();
  
  if (!token) {
    // Not authenticated - show login button
    childSelect.style.display = 'none';
    addButton.style.display = 'none';
    loginButton.style.display = 'block';
    
    loginButton.addEventListener('click', () => {
      // Open Hi World login page
      chrome.tabs.create({
        url: `${await getAPIBase()}/login?extension=true`
      });
    });
    
    return;
  }
  
  // Authenticated - load children
  loginButton.style.display = 'none';
  childSelect.innerHTML = '<option value="">Loading...</option>';
  
  const children = await loadChildren();
  
  if (children.length === 0) {
    childSelect.innerHTML = '<option value="">No children found</option>';
    addButton.disabled = true;
    showStatus('No children found in your account', 'error');
    return;
  }
  
  // Populate child select
  childSelect.innerHTML = '<option value="">Select a student...</option>';
  children.forEach(child => {
    const option = document.createElement('option');
    option.value = child.id;
    option.textContent = child.first_name + (child.last_name ? ` ${child.last_name}` : '');
    childSelect.appendChild(option);
  });
  
  // Enable add button when child is selected
  childSelect.addEventListener('change', () => {
    addButton.disabled = !childSelect.value;
  });
  
  // Handle add button click
  addButton.addEventListener('click', async () => {
    const childId = childSelect.value;
    const markCompleted = document.getElementById('markCompleted').checked;
    
    if (!childId) {
      showStatus('Please select a student', 'error');
      return;
    }
    
    addButton.disabled = true;
    addButton.innerHTML = '<span class="loading"></span> Adding...';
    
    try {
      const result = await addToPlanner(currentUrl, childId, markCompleted);
      
      showStatus(
        markCompleted 
          ? 'Resource added and marked as completed!' 
          : 'Resource added to planner!',
        'success'
      );
      
      // Reset form
      childSelect.value = '';
      document.getElementById('markCompleted').checked = false;
      addButton.disabled = true;
      addButton.textContent = 'Add to Planner';
      
      // Close popup after 2 seconds
      setTimeout(() => {
        window.close();
      }, 2000);
    } catch (error) {
      console.error('Error adding resource:', error);
      showStatus(`Error: ${error.message}`, 'error');
      addButton.disabled = false;
      addButton.textContent = 'Add to Planner';
    }
  });
}

// Listen for messages from background script (e.g., auth updates)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'auth_update') {
    // Reload the popup
    init();
  }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', init);

