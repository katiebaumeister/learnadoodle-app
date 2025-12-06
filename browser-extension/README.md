# Hi World Browser Extension

Browser extension for capturing learning resources from the web to your Hi World planner.

## Features

- Capture YouTube videos and other learning resources
- Add resources directly to student planners
- Option to mark resources as completed immediately
- Simple, intuitive interface

## Installation

### Development

1. Open Chrome/Edge and navigate to `chrome://extensions/` (or `edge://extensions/`)
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `browser-extension` directory

### Production

The extension can be packaged and submitted to:
- Chrome Web Store
- Microsoft Edge Add-ons
- Firefox Add-ons (may require manifest v2 version)

## Setup

1. **Configure API Base URL** (optional):
   - Right-click extension icon → Options
   - Set your Hi World API base URL (defaults to production)

2. **Authenticate**:
   - Click extension icon
   - Click "Sign In to Hi World"
   - Complete authentication in the opened tab
   - Token will be stored securely

## Usage

1. Navigate to a learning resource (YouTube video, educational site, etc.)
2. Click the Hi World extension icon
3. Select a student from the dropdown
4. Optionally check "Mark as completed immediately"
5. Click "Add to Planner"

## Development

### File Structure

- `manifest.json` - Extension configuration
- `popup.html` - Extension popup UI
- `popup.js` - Popup logic and API calls
- `background.js` - Background service worker
- `content.js` - Content script (detects learning resources)
- `icons/` - Extension icons (16x16, 48x48, 128x128)

### API Integration

The extension uses the `/api/extension/add` endpoint which:
- Accepts YouTube video URLs
- Creates courses/lessons automatically
- Creates backlog tasks
- Optionally creates completed events

### Authentication

The extension stores Supabase access tokens in `chrome.storage.local`. Tokens are:
- Retrieved from the main Hi World app (via OAuth or manual entry)
- Stored securely in extension storage
- Automatically refreshed when expired

## Building

To package for distribution:

```bash
cd browser-extension
zip -r hi-world-extension.zip . -x "*.git*" "*.DS_Store" "README.md"
```

## Notes

- Currently supports YouTube videos only
- Playlist support coming soon
- Requires active Hi World account
- Works best with single-student families (multi-student requires selection)

