# Event Outcomes and Attendance System

## Overview

This system enables parents to mark events as complete and record detailed outcome reports, including ratings, grades, notes, and learning observations (strengths/struggles). This data feeds into future AI recommendations, pacing analysis, and progress reports.

## Database Schema

### `attendance_records` Table

Tracks attendance for completed events.

**Columns:**
- `id` (uuid, primary key)
- `family_id` (uuid, references `family(id)`)
- `child_id` (uuid, references `children(id)`)
- `event_id` (uuid, references `events(id)`, unique)
- `day_date` (date) - Date of the event (extracted from `start_ts`)
- `minutes` (integer) - Duration in minutes (calculated from event or overridden)
- `status` (text) - `'present'`, `'partial'`, or `'absent'` (default: `'present'`)
- `note` (text, nullable) - Optional note about attendance
- `created_at` (timestamptz)
- `created_by` (uuid, references `auth.users(id)`)

**Constraints:**
- Unique constraint on `event_id` (one attendance record per event)
- RLS enabled with `is_family_member(family_id)` policies

### `event_outcomes` Table

Stores outcome reports and learning observations for completed events.

**Columns:**
- `id` (uuid, primary key)
- `family_id` (uuid, references `family(id)`)
- `child_id` (uuid, references `children(id)`)
- `subject_id` (uuid, nullable, references `subject(id)`)
- `event_id` (uuid, references `events(id)`, unique)
- `rating` (integer, nullable) - Rating 1-5
- `grade` (text, nullable) - Grade like `'A'`, `'B+'`, `'Pass'`, etc.
- `note` (text, nullable) - Freeform notes about the session
- `strengths` (text[]) - Array of strength tags (e.g., `["Strong problem-solving", "Worked independently"]`)
- `struggles` (text[]) - Array of struggle tags (e.g., `["Needed more support", "Concept confusion"]`)
- `created_at` (timestamptz)
- `created_by` (uuid, references `auth.users(id)`)

**Constraints:**
- Unique constraint on `event_id` (one outcome per event)
- RLS enabled with `is_family_member(family_id)` policies

## API Endpoints

### `POST /api/events/{event_id}/complete`

Marks an event as completed and creates/updates an attendance record.

**Request Body:**
```json
{
  "minutes_override": 60,  // Optional: override calculated minutes
  "note": "Completed successfully"  // Optional: attendance note
}
```

**Response:**
```json
{
  "event": { /* updated event object with status='done' */ },
  "attendance": { /* attendance record */ }
}
```

**Behavior:**
1. Loads event and verifies family access
2. Computes minutes from event duration (or uses `minutes_override`)
3. Sets `events.status = 'done'`
4. Upserts into `attendance_records` (one record per event)

### `POST /api/events/{event_id}/outcome`

Saves or updates an outcome report for a completed event.

**Request Body:**
```json
{
  "rating": 4,  // Optional: 1-5
  "grade": "A",  // Optional: text like "A", "B+", "Pass"
  "note": "Great progress on fractions",  // Optional: freeform note
  "strengths": ["Strong problem-solving", "Worked independently"],  // Optional: array of strings
  "struggles": ["Needed more support"]  // Optional: array of strings
}
```

**Response:**
```json
{
  "id": "uuid",
  "event_id": "uuid",
  "rating": 4,
  "grade": "A",
  "note": "Great progress on fractions",
  "strengths": ["Strong problem-solving", "Worked independently"],
  "struggles": ["Needed more support"],
  "created_at": "2025-11-18T10:00:00Z"
}
```

**Behavior:**
- Upserts outcome (unique constraint on `event_id`)
- All fields are optional except `event_id`

### `POST /api/ai/event_tags`

Generates AI suggestions for strengths/struggles tags based on event metadata.

**Request Body:**
```json
{
  "event_id": "uuid"
}
```

**Response:**
```json
{
  "suggested_strengths": [
    "Strong problem-solving",
    "Worked independently",
    "Quick grasp of concepts"
  ],
  "suggested_struggles": [
    "Needed more support",
    "Concept confusion",
    "Time management"
  ]
}
```

**Behavior:**
- Loads event details (title, subject, description)
- Calls LLM (`llm_event_tags`) to generate contextual tag suggestions
- Returns arrays of suggested tags (3-5 strengths, 2-4 struggles)

## Frontend Components

### `EventChip`

Displays event chips with optional checkmark for completion.

**Props:**
- `ev` - Event object
- `onComplete` - Callback when checkmark is clicked
- `showCheckmark` - Boolean to show/hide checkmark (default: `true`)

**Behavior:**
- Shows `Circle` icon when event is not done
- Shows `CheckCircle2` icon (green) when event is done
- Completed events have reduced opacity and strikethrough text
- Clicking checkmark calls `onComplete(ev)` handler

### `EventOutcomeModal`

Modal for adding outcome reports to completed events.

**Props:**
- `visible` - Boolean to show/hide modal
- `event` - Event object
- `onClose` - Callback when modal closes
- `onSaved` - Callback after successful save

**Features:**
- Rating selector (1-5 buttons)
- Grade selector (A+ to F, Pass/Fail buttons)
- Note textarea
- Strengths chips (add/remove with + button)
- Struggles chips (add/remove with + button)
- "Suggest chips" button (calls `/api/ai/event_tags` and merges suggestions)
- Save button (calls both `completeEvent` and `saveOutcome`)

**Usage:**
- Opened from context menu: Right-click completed event → "Add reflection..."
- Can also be triggered programmatically after event completion

## Data Flow

1. **User clicks checkmark on event:**
   - `EventChip` calls `onComplete(ev)`
   - `handleEventComplete` in `WebContent` calls `completeEvent(eventId)`
   - Backend marks event as `done` and creates `attendance_record`
   - Calendar refreshes to show updated status

2. **User adds reflection:**
   - Right-click completed event → "Add reflection..."
   - `EventOutcomeModal` opens
   - User fills in rating, grade, note, strengths, struggles
   - Optional: Click "Suggest chips" to get AI suggestions
   - Click "Save" → calls `saveOutcome(eventId, outcome)`
   - Backend upserts `event_outcomes` record
   - Modal closes, calendar refreshes

## Future Use Cases

### AI Recommendations

- **Pacing Analysis:** Use `rating` and `struggles` to identify subjects/topics where child needs more time
- **Next Session Planning:** Use `strengths` to build on what worked, use `struggles` to address gaps
- **Adaptive Scheduling:** Adjust future event durations based on `minutes` vs. planned duration

### Progress Reports

- **Weekly Summaries:** Aggregate `rating`, `grade`, and `strengths`/`struggles` by subject
- **Trend Analysis:** Track `rating` trends over time to identify improvement areas
- **Attendance Tracking:** Use `attendance_records` to calculate attendance rates and identify patterns

### Analytics

- **Subject Performance:** Average `rating` and `grade` by `subject_id`
- **Time Efficiency:** Compare `minutes` (actual) vs. planned duration
- **Learning Patterns:** Analyze `strengths`/`struggles` tags to identify common themes

## Migration

Run the SQL migration file:
```sql
-- See: 2025-11-18_event_attendance_and_outcomes.sql
```

This creates both tables, enables RLS, and grants necessary permissions to `service_role`.

## Security

- All endpoints require authentication (`require_parent`)
- RLS policies ensure users can only access their own family's data
- Backend validates `family_id` matches authenticated user's family
- `service_role` has explicit grants for backend operations

## Notes

- One attendance record per event (enforced by unique constraint on `event_id`)
- One outcome record per event (enforced by unique constraint on `event_id`)
- Attendance is automatically created when event is marked as done
- Outcome is optional and can be added later via context menu
- AI tag suggestions are merged with existing tags (no duplicates)
- All timestamps are stored in UTC

