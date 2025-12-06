# Materials Library Implementation

## Overview

The Materials Library feature allows parents to track purchased educational resources (books, courses, kits, subscriptions) and log how each child responds to them. This creates a valuable dataset for reuse intelligence, cost savings tracking, and personalized recommendations.

## What Was Implemented

### 1. Database Schema (`2025-01-20_materials_library.sql`)

**Tables Created:**
- `materials` - Main table for tracking resources
- `material_children` - Bridge table linking materials to children
- `material_reviews` - Per-child reception logs with ratings, emotions, pacing, and difficulty

**Features:**
- RLS policies for family-scoped access
- Indexes for performance
- `material_usage_stats` view for aggregated statistics
- `material_id` column added to `events` table for linking events to materials

### 2. API Client (`lib/services/materialsClient.js`)

Functions provided:
- `getMaterials(familyId, filters)` - Get all materials with optional filters
- `getMaterial(materialId)` - Get single material with full details
- `createMaterial(materialData)` - Create new material
- `updateMaterial(materialId, updates)` - Update material
- `archiveMaterial(materialId)` - Archive material
- `linkMaterialToChild(materialId, childId, familyId, status)` - Link material to child
- `updateMaterialChildStatus(...)` - Update child's status with material
- `createMaterialReview(reviewData)` - Create review/reaction log
- `getMaterialReviews(materialId)` - Get reviews for a material
- `getMaterialStats(materialId)` - Get aggregated stats
- `getMaterialsByChild(childId)` - Get all materials used by a child

### 3. UI Components

#### `components/materials/MaterialsLibrary.js`
Main page component featuring:
- Grid view of materials with cards
- Search functionality
- Filters: Type, Child, Reuse candidates
- Empty states
- Integration with detail drawer and review modal

#### `components/materials/MaterialCard.js`
Card component displaying:
- Cover image/placeholder
- Title and type badge
- Subject and grade range
- Children who've used it
- Average rating
- Reuse indicator badge

#### `components/materials/MaterialDetailDrawer.js`
Slide-over drawer with tabs:
- **Overview**: Basic info, purchase details, stats, notes, provider link
- **By Child**: List of children who've used it with status and last reaction
- **Reviews**: Timeline of all reviews with ratings, emotions, pacing, difficulty

#### `components/materials/QuickReviewModal.js`
Modal for logging child reactions:
- Rating (1-5 stars)
- Emotional response (loved, liked, neutral, bored, overwhelmed, frustrated)
- Pacing fit (too fast, just right, too slow)
- Difficulty level (too easy, appropriate, too hard)
- Optional notes

### 4. Integration

**Routing:** Added to `WebContent.js` as a subtab under Records:
- Access via: Records → Materials subtab
- Route: `activeSubtab === 'materials'`

## Setup Instructions

### Step 1: Run Database Migration

Run the SQL migration file in Supabase SQL Editor:

```sql
-- Copy and paste contents of: 2025-01-20_materials_library.sql
-- Run in Supabase SQL Editor
```

This will create:
- All tables with proper constraints
- RLS policies
- Indexes
- Views
- `material_id` column on `events` table

### Step 2: Verify Tables Exist

```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('materials', 'material_children', 'material_reviews');

-- Check material_id column on events
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'events' AND column_name = 'material_id';
```

### Step 3: Access the Feature

1. Navigate to Records tab
2. Click on "Materials" subtab (or navigate to `/records?subtab=materials`)
3. Start adding materials and logging reactions

## Usage Flow

### Adding a Material

1. Click "Add Material" button (currently shows placeholder - TODO: implement add form)
2. Fill in details:
   - Title (required)
   - Type (textbook, workbook, kit, course, subscription, video, other)
   - Subject
   - Grade range
   - Purchase date and price
   - Provider info
   - Location hint
   - Notes

### Linking to Children

1. Open material detail drawer
2. Go to "By Child" tab
3. Click "Log Reaction" for a child
4. Fill out the review form
5. Save - this automatically creates the material-child link

### Logging Reactions

**From Material Detail:**
1. Open material
2. Go to "By Child" tab
3. Click "Log Reaction" or "Update Reaction"
4. Fill out QuickReviewModal
5. Save

**From Event Completion (Future):**
- When marking an event complete, if it has a `material_id`, prompt for review
- This will be integrated into the event completion flow

### Viewing Reviews

1. Open material detail drawer
2. Go to "Reviews" tab
3. See timeline of all reviews with ratings, emotions, pacing, difficulty, and notes

## Features

### Reuse Intelligence

- Materials with average rating ≥ 4 automatically show "Good for siblings" badge
- Filter by "Reuse candidates only" to see materials suitable for reuse
- Status tracking: planned, in_use, completed, abandoned

### Cost Savings Analytics (Future)

The data structure supports:
- Calculating total inventory value
- Tracking reuse savings
- Showing which materials can be reused for which children

### AI Recommendations (Future)

The review data can feed into:
- Suggesting materials based on child's learning style
- Warning when a material likely won't work for another child
- Matching materials to children based on prior reactions

## Integration Points

### Events Table

The `events` table now has a `material_id` column. When creating events:
- Link events to materials used during sessions
- After event completion, prompt for material review if `material_id` is set

### Planner Integration (Future)

- Show material badge on event cards
- Filter events by material
- Suggest materials when planning lessons

### Portfolio Integration (Future)

- Link materials to portfolio uploads
- Show which materials contributed to projects

## Next Steps / TODOs

1. **Add Material Form**: Implement the "Add Material" modal/form
   - Manual entry form
   - "Add from link" functionality (parse URLs, auto-tag subjects)
   - Photo upload for cover images

2. **Event Integration**: 
   - Add material selector to event creation/edit
   - Prompt for review on event completion if material_id present

3. **Cost Dashboard**:
   - Calculate total inventory value
   - Show reuse savings
   - Display cost analytics

4. **AI Recommendations**:
   - Suggest materials based on child profile
   - Warn about materials that didn't work for siblings
   - Match materials to learning styles

5. **Export/Sharing**:
   - Export materials list
   - Share materials with tutors
   - Template sharing

## File Structure

```
hi-world-app/
├── 2025-01-20_materials_library.sql          # Database migration
├── lib/
│   └── services/
│       └── materialsClient.js                # API client
└── components/
    └── materials/
        ├── MaterialsLibrary.js               # Main page
        ├── MaterialCard.js                    # Card component
        ├── MaterialDetailDrawer.js            # Detail drawer
        └── QuickReviewModal.js                # Review modal
```

## Testing Checklist

- [ ] Run SQL migration successfully
- [ ] Verify tables and RLS policies created
- [ ] Access Materials page via Records → Materials
- [ ] View empty state
- [ ] Add a material (when form implemented)
- [ ] View material in grid
- [ ] Open material detail drawer
- [ ] Navigate between Overview, By Child, Reviews tabs
- [ ] Log a reaction for a child
- [ ] Verify review appears in Reviews tab
- [ ] Test filters (type, child, search)
- [ ] Test reuse candidates filter
- [ ] Verify material-child link created
- [ ] Check material_id column on events table

## Notes

- The "Add Material" button currently shows a placeholder modal - this needs to be implemented
- Material cover images can be stored in Supabase Storage (URL stored in `cover_image_url`)
- The system uses the existing `is_family_member()` RLS helper function
- All timestamps use `timestamptz` for timezone-aware dates
- The `slug` column is auto-generated from title for URL-friendly identifiers

