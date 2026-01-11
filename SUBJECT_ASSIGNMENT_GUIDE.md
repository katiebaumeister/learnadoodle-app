# Subject Assignment Guide

## How Subjects Are Created and Assigned

### 1. **Family-Wide Subjects** (`child_id: null`)
Family-wide subjects are created when:
- **AddSubjectModal**: User selects "All Children" or leaves the child selection empty
- These subjects appear for ALL children in the family
- Currently, the UI does NOT show family-wide subjects (only child-specific ones)

**Code Location**: `AddSubjectModal.js` lines 150-153
```javascript
// Add child_id if a child is selected
if (selectedChildId) {
  subjectData.child_id = selectedChildId;
}
// If no child selected, child_id remains null (family-wide)
```

### 2. **Child-Specific Subjects** (`child_id: <child_id>`)
Child-specific subjects are created when:
- **AddSubjectModal**: User selects a specific child from the dropdown
- **SubjectSelectForm**: Always creates subjects for a specific child (used during onboarding)
- These subjects only appear for the assigned child

**Code Locations**:
- `AddSubjectModal.js` lines 150-153
- `SubjectSelectForm.js` lines 125-131

## Current Behavior

- **Family-wide subjects**: Created but NOT shown in the dropdown (filtered out)
- **Child-specific subjects**: Only shown for the assigned child

## Recommendations

### Option 1: Remove Family-Wide Subjects (Recommended)
- Delete all subjects with `child_id: null`
- Require all subjects to be assigned to a specific child
- Simpler, clearer data model

### Option 2: Show Family-Wide Subjects for All Children
- Update the filtering code to include `child_id: null` subjects
- Each child would see both their own subjects AND family-wide subjects

### Option 3: Convert Family-Wide to Child-Specific
- Run a migration to duplicate family-wide subjects for each child
- Then delete the family-wide ones

## SQL to Clean Up

See `2025_remove_duplicate_family_wide_subjects.sql` for removing duplicates.

To remove ALL family-wide subjects:
```sql
DELETE FROM subject WHERE child_id IS NULL;
```

To convert family-wide to child-specific (create copies for each child):
```sql
INSERT INTO subject (family_id, child_id, name, grade, notes, created_at, updated_at)
SELECT 
  s.family_id,
  c.id as child_id,
  s.name,
  s.grade,
  s.notes,
  NOW(),
  NOW()
FROM subject s
CROSS JOIN children c
WHERE s.child_id IS NULL
  AND c.family_id = s.family_id
  AND NOT EXISTS (
    SELECT 1 FROM subject s2
    WHERE s2.family_id = s.family_id
      AND s2.name = s.name
      AND s2.child_id = c.id
  );

-- Then delete family-wide subjects
DELETE FROM subject WHERE child_id IS NULL;
```

