# Evidence Drawer Implementation - Complete ✅

## Summary

Added a full Evidence Drawer editor to the PortfolioEvidenceTab, allowing parents to click evidence items, view details, and edit metadata.

## Files Created/Modified

### ✅ Created Files

1. **`components/records/EvidenceDrawer.js`** (NEW)
   - Right-side drawer component (web) / Modal (mobile)
   - Full metadata editing form
   - Preview section with file icon
   - Subject, type, tags, and child selection
   - Save and "Add note" actions
   - Loading and error states

### ✅ Modified Files

1. **`lib/services/recordsClient.js`**
   - Added `getEvidenceById(familyId, evidenceId)` - Fetches single evidence record with full metadata
   - Updated `updateEvidenceMetadata()` - Added Supabase fallback for updates
   - Added `updateEvidence()` - Alias for consistency
   - Added helper `getEvidenceTypeFromMime()` - Maps MIME types to evidence types

2. **`components/records/tabs/PortfolioEvidenceTab.js`**
   - Changed `selectedEvidence` state to `selectedEvidenceId` and `isDrawerOpen`
   - Updated artifact cards to open drawer on click
   - Replaced basic drawer with new `EvidenceDrawer` component
   - Added `onAddNote` prop support
   - Wired `loadEvidence()` refresh on update

3. **`components/records/WebRecordsScreen.js`**
   - Updated `handleAddNote()` to accept `evidenceId` parameter
   - Added URL parameter handling for evidenceId when navigating to Notes tab

## Features Implemented

### ✅ Core Functionality

- **Clickable Evidence Items** - Artifact cards open drawer on click
- **Right-Side Drawer (Web)** - Slides in from right, overlay backdrop
- **Modal (Mobile)** - Full-screen modal for mobile devices
- **Evidence Loading** - Fetches full evidence record by ID
- **Metadata Editing**:
  - Title (text input)
  - Description (textarea)
  - Subject (chip selector from available subjects)
  - Type (chip selector: photo, pdf, video, audio, file, project, writing, test)
  - Tags (comma-separated text input)
  - Linked Children (checkbox list)
- **Save Changes** - Updates evidence metadata via API/Supabase
- **Add Note** - Button that navigates to Notes tab with evidenceId context
- **Error Handling** - Graceful error display and fallback to Supabase

### ✅ UI/UX Features

- **Preview Section** - Shows file icon, filename, MIME type, date, file size
- **Loading State** - Spinner while fetching evidence
- **Error State** - Error message display
- **Form Validation** - Handles empty/null values gracefully
- **Responsive Design** - Drawer on web, modal on mobile
- **Close on Backdrop** - Click outside to close
- **Auto-refresh** - Evidence list reloads after save

## API Functions

### `getEvidenceById(familyId, evidenceId)`
- Tries API endpoint first (`/api/records/evidence/:id`)
- Falls back to Supabase `uploads` table query
- Maps upload record to evidence format with all metadata
- Returns `{ data, error }` format

### `updateEvidence(evidenceId, payload)`
- Tries API endpoint first (`PATCH /api/records/evidence/:id`)
- Falls back to Supabase `uploads` table update
- Maps payload fields to upload table columns
- Handles single child_id (uploads table limitation)
- Returns `{ data, error }` format

## Data Flow

1. User clicks evidence item → `setSelectedEvidenceId(item.id)` + `setIsDrawerOpen(true)`
2. Drawer opens → `useEffect` triggers `getEvidenceById()`
3. Evidence loads → Form fields populate with current values
4. User edits fields → Local state updates
5. User clicks "Save changes" → `updateEvidence()` called
6. On success → `onUpdated()` callback → `loadEvidence()` refreshes list
7. Drawer closes → State cleared

## TODOs / Future Enhancements

### 🔲 Notes Integration
- **Current**: "Add note" button navigates to Notes tab with evidenceId in URL
- **Future**: Could open note editor modal directly with `linkedEvidenceId` pre-filled
- **Location**: `EvidenceDrawer.js` line ~290

### 🔲 Advanced UI Components
- **Current**: Simple checkbox list for children, comma-separated tags
- **Future**: 
  - Multi-select chip component for children
  - Tag input with autocomplete
  - Syllabus unit selector dropdown
  - Planner event selector/linking

### 🔲 Delete Evidence
- **Current**: Not implemented (no delete API yet)
- **Future**: Add delete button in "Danger" zone when API available
- **Location**: Could add below save button in footer

### 🔲 Image Preview
- **Current**: Generic icon based on file type
- **Future**: Actual image thumbnail for image files
- **Location**: Preview section in `EvidenceDrawer.js`

### 🔲 File Download/View
- **Current**: Shows filename and metadata
- **Future**: "View" or "Download" button using `evidence.url` or `storage_path`
- **Location**: Preview section

## Testing Checklist

- [x] Drawer opens when clicking evidence item
- [x] Evidence data loads correctly
- [x] Form fields populate with current values
- [x] Subject selection works
- [x] Type selection works
- [x] Tags input works
- [x] Child selection works
- [x] Save updates evidence successfully
- [x] Evidence list refreshes after save
- [x] Drawer closes on backdrop click
- [x] Drawer closes on X button
- [x] Error handling works for missing evidence
- [x] Loading state displays correctly
- [x] Works on web (drawer) and mobile (modal)
- [x] "Add note" navigates to Notes tab

## Notes

- The drawer uses React Native components but adapts styling for web vs mobile
- Evidence metadata is stored in `uploads` table (Supabase fallback)
- API endpoints are optional - Supabase fallback ensures functionality
- Tags are stored as comma-separated string in UI, converted to array on save
- Children selection supports multiple children (though uploads table has single child_id)
- Subject and type use chip selectors for better UX

## Integration Points

- **PortfolioEvidenceTab**: Passes `familyId`, `children`, `subjects` to drawer
- **WebRecordsScreen**: Provides `onAddNote` handler
- **recordsClient**: Provides data fetching and update functions
- **NotesTab**: Can read `evidenceId` from URL params (future enhancement)

