# Documents Screen Enhancements

## ✅ Implemented Features

### 1. **SQL Enhancements** (`upgrade-uploads-system.sql`)

#### `mime_kind()` Helper Function
- Fast MIME type to category mapping
- Categories: `image`, `pdf`, `doc`, `video`, `audio`, `other`
- Immutable function for optimal performance

#### Enhanced `get_uploads()` RPC
**New Parameters:**
- `_types`: Filter by file kind (image, pdf, etc.)
- `_subject_ids`: Filter by subject assignments
- `_include_unassigned_child`: Show files with no child assigned
- `_include_unassigned_subject`: Show files with no subject assigned
- `_sort_unassigned_first`: Bubble unassigned files to top

**Performance Indexes:**
- `uploads_family_subject_created_idx`: Fast subject filtering
- `uploads_family_child_null_created_idx`: Fast unassigned child queries
- `uploads_family_subject_null_created_idx`: Fast unassigned subject queries

#### `update_upload_meta()` RPC
- Quick metadata editing after upload
- Update child, subject, title, tags, notes
- Supports bulk updates

### 2. **UI Features** (`UploadsEnhanced.js`)

#### Type Filter Chips
- **Images** | **PDFs** | **Docs** | **Videos** | **Audio**
- Visual categorization based on MIME type
- Instant filtering via `mime_kind()` function

#### Child & Subject Filters
- **Active chips** (green/blue) show selected filters
- **"Unassigned" chip** (amber) shows items needing assignment
- **Combination filtering**: Can show "Max + Unassigned" together
- **"All children/subjects"** resets filters

#### Smart Upload Defaults
- When chips are active, new uploads auto-assign to first selected child/subject
- Example: Max + Math chips active → uploaded file automatically assigned to Max/Math
- Appears immediately under active filters (no filter/reload needed)

#### Bulk Assignment
- **Select multiple files**: Checkboxes on each card
- **"Assign {count}"** button opens assignment sheet
- **"→ Last used"** button: One-click assign to previous child/subject
- **Batch operations**: Assign 10 files to same child in one action

#### Assignment Sheet
- **Single or bulk mode**: "Assign 5 files" vs "Assign file"
- **Quick dropdowns**: Child and Subject selection
- **Tags**: Comma-separated (e.g., "syllabus, worksheet")
- **Notes**: Free-form text
- **Title edit**: For single files only

#### Sort Options
- **"Show unassigned first"** checkbox
- Bubbles unassigned files to top of list
- Helps with triage workflow

#### Visual Cards
- **Preview**: Images show thumbnail, others show kind badge
- **Color-coded kinds**: Different pastels per type
- **Assignment indicators**: Green chip (child), blue chip (subject)
- **Selection state**: Blue border when selected
- **Date stamp**: When file was uploaded

### 3. **User Workflows**

#### Workflow 1: Quick Upload & Auto-Assign
1. Click "Max" chip + "Math" chip
2. Click "Upload" → select file
3. File appears immediately under Max + Math filters
4. Already assigned to Max/Math (no extra steps)

#### Workflow 2: Bulk Triage
1. Click "Unassigned (child)" chip
2. See all files needing assignment
3. Select 10 files
4. Click "Assign 10" → pick child → Save
5. Unassigned list shrinks automatically

#### Workflow 3: Last-Used Assignment
1. Assign 1 file to "Emma + Science"
2. Select 5 more files
3. Click "→ Last used"
4. All 5 files instantly assigned to Emma + Science

#### Workflow 4: Type Filtering
1. Click "Images" chip
2. Grid shows only photos/screenshots
3. Click "PDFs" chip too
4. Grid shows images + PDFs together
5. Click "All types" to reset

### 4. **Database Setup**

Run this SQL in Supabase SQL Editor:

```bash
# Copy and run in Supabase:
cat hi-world-app/upgrade-uploads-system.sql
```

**What it creates:**
- ✅ `mime_kind()` helper function
- ✅ 3 performance indexes
- ✅ Enhanced `get_uploads()` with 8 filter parameters
- ✅ `update_upload_meta()` for quick edits

### 5. **Integration**

In `WebContent.js`:
```javascript
const renderDocumentsContent = () => {
  return (
    <UploadsEnhanced familyId={familyId} initialChildren={children} />
  )
}
```

**Component accepts:**
- `familyId`: Required
- `initialChildren`: Optional (will fetch if not provided)
- `searchQuery`: Optional (for URL-driven search)
- `childFilter`: Optional (for URL-driven filtering)

### 6. **Performance**

#### Query Optimization
- **Partial indexes** on NULL child/subject for fast unassigned queries
- **Composite index** on (family_id, subject_id, created_at) for subject filtering
- **IMMUTABLE** mime_kind() for inline evaluation

#### UI Optimization
- Filters applied via SQL (not client-side)
- Signed URLs generated only for visible images
- Lazy loading ready (cursor-based pagination in RPC)

### 7. **Comparison: Before vs. After**

| Feature | Before | After |
|---------|--------|-------|
| **Type filtering** | ❌ None | ✅ 5 categories (image/pdf/doc/video/audio) |
| **Unassigned filter** | ❌ None | ✅ Child + Subject unassigned toggles |
| **Auto-assignment** | ❌ Manual only | ✅ Default to active chips |
| **Bulk edit** | ❌ One at a time | ✅ Select multiple + bulk assign |
| **Last-used assign** | ❌ None | ✅ One-click repeat assignment |
| **Sort unassigned** | ❌ None | ✅ Bubble to top option |
| **Subject filter** | ❌ None | ✅ Subject chips + unassigned |
| **Assignment UI** | ❌ Basic | ✅ Modal sheet with tags/notes |

### 8. **Future Enhancements** (Optional)

#### Drag & Drop Upload
- Drop files anywhere on page
- Show overlay with current chip selections
- Auto-assign based on active filters

#### Grid/List Toggle
- Switch between card grid and table list
- Persist preference in localStorage

#### Inline Metadata Edit
- Click child/subject chips on card to change
- No modal needed for quick edits

#### Advanced Search
- Search in tags and notes
- Date range filtering
- File size filtering

### 9. **Acceptance Checklist**

After running SQL and refreshing app:

- [ ] Type chips filter correctly (Images, PDFs, Docs, etc.)
- [ ] Child chips filter correctly (Max, Emma, etc.)
- [ ] Subject chips filter correctly (Math, Science, etc.)
- [ ] "Unassigned" chips show items with NULL child/subject
- [ ] Upload with chips active → auto-assigns to first selected
- [ ] "Show unassigned first" checkbox works
- [ ] Select multiple files → "Assign {count}" button appears
- [ ] Bulk assign works (all selected files get same assignment)
- [ ] "→ Last used" button applies previous assignment
- [ ] Assignment sheet saves metadata correctly
- [ ] Cards show assignment indicators (green/blue chips)
- [ ] Image thumbnails load correctly
- [ ] No console errors

### 10. **Files Modified**

- ✅ `upgrade-uploads-system.sql` - SQL enhancements
- ✅ `components/documents/UploadsEnhanced.js` - Enhanced UI
- ✅ `components/WebContent.js` - Integration

### 11. **Migration Path**

**Current state:**
- `Uploads.js` - Basic upload/view (still works)
- `UploadsEnhanced.js` - New enhanced version

**To enable:**
1. Run `upgrade-uploads-system.sql` in Supabase
2. Refresh app (already integrated in WebContent)
3. Test filters and assignment features

**To rollback:**
```javascript
// In WebContent.js, change:
return <UploadsEnhanced ... />
// Back to:
return <Uploads ... />
```

---

**Status**: ✅ Ready to use! Run the SQL and refresh your app.

