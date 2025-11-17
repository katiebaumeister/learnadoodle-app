# Documents Screen UX Improvements

## ✅ Implemented Features

### 1. **Unified Add Button (Split Button)**
- **Component**: `components/ui/SplitButton.js`
- **Features**:
  - Primary action: "Add" (opens syllabus wizard)
  - Dropdown menu: "Import from file" | "Copy from template"
  - Reduces choice overload by consolidating 3 CTAs into one
  - Matches Notion's design pattern

### 2. **Tab-Based Navigation**
- **Tabs**: Syllabi | Files
- **Benefits**:
  - Keeps content scannable and above the fold
  - Replaces stacked sections with cleaner navigation
  - Easy switching between document types

### 3. **Syllabus Wizard (3-Step Flow)**
- **Component**: `components/documents/SyllabusWizard.js`
- **Steps**:
  1. **Details**: Course title, provider, subject, starting unit
  2. **Paste/Upload**: Paste raw syllabus text
  3. **Review & Map**: Preview parsed units, enable auto-pacing

- **Features**:
  - Live preview panel (right side) shows parsed outline
  - Estimated minutes per unit (default 30min)
  - Auto-pace to calendar option
  - Saves raw text to `evidence` bucket
  - Creates lesson plan with steps
  - Optionally instantiates events for selected child/week

### 4. **Sticky Filters & Search**
- **Search bar**: Full-text search across documents
- **Filter pills**:
  - Child filters (green highlight when active)
  - Subject filters (blue highlight when active)
  - "Clear all" button when filters are active
- **Persistent**: Filters stay visible while scrolling

### 5. **Keyboard Shortcuts**
- **Cmd/Ctrl+Shift+U**: Opens syllabus wizard
- **Esc**: Closes wizard
- **Accessibility**: All inputs labeled, ARIA-compliant stepper

### 6. **Visual Polish**
- Softer card shadows (`shadows.sm`, `shadows.md`)
- Consistent 12/16px spacing
- Reduced border noise
- Helper text below inputs
- Two-pane modal layout (form left, preview right)
- Rounded corners (`radiusMd`, `radiusLg`)
- Notion-like color palette

### 7. **Empty States**
- Dashed border cards with helpful hints
- "Add Syllabus" CTA button
- Example text: "Add a syllabus to see it here"

## 📁 Files Created/Modified

### New Files:
1. `components/ui/SplitButton.js` - Unified add button component
2. `components/documents/SyllabusWizard.js` - 3-step syllabus upload wizard
3. `components/documents/DocumentsEnhanced.js` - Main documents screen with tabs and filters

### Modified Files:
1. `components/WebContent.js` - Integrated `DocumentsEnhanced` component

## 🔌 Integration Points

### Supabase RPCs Used:
- `create_upload_record` - Saves file metadata to `uploads` table
- `create_lesson_plan` - Creates lesson plan from parsed steps
- `instantiate_plan_to_week` - Auto-paces lesson plan to calendar
- `get_lesson_plans` - Fetches syllabi (filtered by tag)
- `get_uploads` - Fetches uploaded files

### Storage:
- **Bucket**: `evidence` (private)
- **Path format**: `{familyId}/{uuid}_{filename}.txt`
- **Metadata**: `family_id` for RLS

## 🎯 User Flow

### Adding a Syllabus:
1. Click "Add" button (or Cmd+Shift+U)
2. **Step 1**: Enter course title, provider, subject, starting unit
3. **Step 2**: Paste raw syllabus text
4. **Step 3**: Review parsed units in preview panel
   - Optionally enable "Auto-pace & calendar"
   - Select child and week start date
5. Click "Save"
   - Raw text uploaded to storage
   - Lesson plan created with steps
   - Events optionally created in calendar

### Browsing Documents:
1. Switch between "Syllabi" and "Files" tabs
2. Use search bar to filter by text
3. Click child/subject pills to filter
4. Click "Clear all" to reset filters

## 🚀 Next Steps (Optional Enhancements)

### Drag & Drop Upload:
- Add drop overlay to entire page
- Detect file drops and route to `evidence` bucket
- Show upload progress indicator

### Grid/List Toggle:
- Add toggle button to switch between grid and list views
- Persist preference in localStorage

### Templates Library:
- Pre-built syllabus templates
- "Copy from template" functionality
- Sample syllabi for common subjects

### Advanced Parsing:
- Detect more patterns (Lesson X, Chapter Y, etc.)
- Extract resource URLs from text
- Estimate minutes based on content length

## 📊 Performance Notes

- Filters are applied client-side for instant feedback
- Search debounced to reduce RPC calls
- Lazy loading for large document lists
- Optimistic UI updates for better UX

## ♿ Accessibility

- All buttons have `activeOpacity` for touch feedback
- Keyboard navigation supported
- ARIA labels on stepper steps
- Focus management in modal
- Screen reader friendly

## 🎨 Design System

- **Colors**: Uses centralized `colors` from `theme/colors.js`
- **Shadows**: Consistent `shadows.sm` and `shadows.md`
- **Spacing**: 12px/16px/24px rhythm
- **Radii**: `radiusMd` (10px), `radiusLg` (14px)
- **Typography**: 12px (meta), 14px (body), 16px (titles), 20px+ (headers)

---

**Status**: ✅ All features implemented and ready to use!

