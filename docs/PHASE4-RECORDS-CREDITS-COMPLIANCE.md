# Phase 4: Records, Credits & Compliance

## Overview

Phase 4 formalizes long-term records management for homeschooling families, including grades, transcripts, portfolio uploads, and state compliance tracking.

## Database Schema

### Tables

#### `grades`
Stores formal grade records for children.

**Columns:**
- `id` (uuid, primary key)
- `family_id` (uuid, references `family(id)`)
- `child_id` (uuid, references `children(id)`)
- `subject_id` (uuid, references `subject(id)`, nullable)
- `term_label` (text, nullable) - e.g. "2025–26 Semester 1"
- `score` (numeric, nullable) - Optional numeric score
- `grade` (text, nullable) - e.g. "A", "B+", "Pass"
- `rubric` (text, nullable) - Description of how graded
- `notes` (text, nullable)
- `created_at` (timestamptz)
- `created_by` (uuid, references `profiles(id)`)

**RLS Policies:**
- `family_read_own_grades` - SELECT using `is_family_member(family_id)`
- `family_insert_own_grades` - INSERT with CHECK `is_family_member(family_id)`
- `family_update_own_grades` - UPDATE using/with CHECK `is_family_member(family_id)`
- `family_delete_own_grades` - DELETE using `is_family_member(family_id)`

#### `transcripts`
Stores generated transcript records.

**Columns:**
- `id` (uuid, primary key)
- `family_id` (uuid, references `family(id)`)
- `child_id` (uuid, references `children(id)`)
- `export_url` (text) - URL to exported transcript file
- `created_at` (timestamptz)
- `created_by` (uuid, references `profiles(id)`)

**RLS Policies:**
- `family_read_own_transcripts` - SELECT using `is_family_member(family_id)`
- `family_insert_own_transcripts` - INSERT with CHECK `is_family_member(family_id)`
- `family_delete_own_transcripts` - DELETE using `is_family_member(family_id)`

#### `uploads`
Stores portfolio/evidence upload metadata. Note: This table may already exist from previous migrations; the Phase 4 migration adds a `caption` field if missing.

**Columns:**
- `id` (uuid, primary key)
- `family_id` (uuid, references `family(id)`)
- `child_id` (uuid, references `children(id)`, nullable)
- `subject_id` (uuid, references `subject(id)`, nullable)
- `event_id` (uuid, references `events(id)`, nullable)
- `storage_path` (text) - Supabase Storage object path
- `caption` (text, nullable) - Description/caption for the upload
- `created_at` (timestamptz)
- `created_by` (uuid, references `profiles(id)`)

**RLS Policies:**
- `family_read_own_uploads` - SELECT using `is_family_member(family_id)`
- `family_insert_own_uploads` - INSERT with CHECK `is_family_member(family_id)`
- `family_update_own_uploads` - UPDATE using/with CHECK `is_family_member(family_id)`
- `family_delete_own_uploads` - DELETE using `is_family_member(family_id)`

## API Endpoints

All endpoints are under `/api/records` and require authentication via `get_current_user` dependency.

### POST `/api/records/add_grade`

Add a grade record for a child.

**Request Body:**
```json
{
  "child_id": "uuid",
  "subject_id": "uuid (optional)",
  "term_label": "string (optional)",
  "score": 95.5 (optional),
  "grade": "A (optional)",
  "rubric": "string (optional)",
  "notes": "string (optional)"
}
```

**Response:**
```json
{
  "id": "uuid",
  "child_id": "uuid",
  "subject_id": "uuid | null",
  "term_label": "string | null",
  "score": 95.5 | null,
  "grade": "A | null",
  "rubric": "string | null",
  "notes": "string | null",
  "created_at": "2025-11-19T12:00:00Z"
}
```

### POST `/api/records/add_portfolio_upload`

Add a portfolio upload metadata record. Note: The file must be uploaded to Supabase Storage separately; this endpoint only records the metadata.

**Request Body:**
```json
{
  "child_id": "uuid",
  "subject_id": "uuid (optional)",
  "event_id": "uuid (optional)",
  "caption": "string (optional)",
  "file_path": "evidence/family_id/file.jpg"
}
```

**Response:**
```json
{
  "id": "uuid",
  "child_id": "uuid | null",
  "subject_id": "uuid | null",
  "event_id": "uuid | null",
  "storage_path": "evidence/family_id/file.jpg",
  "caption": "string | null",
  "created_at": "2025-11-19T12:00:00Z"
}
```

### GET `/api/records/state_requirements?state_code=XX`

Get state requirements for compliance.

**Query Parameters:**
- `state_code` (required) - State code (e.g. "CA", "NY", "TX")

**Response:**
```json
[
  {
    "id": "hours",
    "label": "Minimum hours per year",
    "detail": "900 hours",
    "type": "info"
  },
  {
    "id": "attendance",
    "label": "Attendance tracking",
    "type": "required"
  }
]
```

**State Requirements Data:**
Stored in `backend/data/state_requirements.json` with entries for CA, NY, TX (expandable).

### GET `/api/records/generate_transcript?child_id=...&range_start=...&range_end=...`

Generate a transcript CSV for a child.

**Query Parameters:**
- `child_id` (required) - Child ID
- `range_start` (required) - Start date (YYYY-MM-DD)
- `range_end` (required) - End date (YYYY-MM-DD)

**Response:**
- Content-Type: `text/csv`
- Content-Disposition: `attachment; filename="transcript_{child_name}_{start}_{end}.csv"`

**CSV Format:**
- Header: "Transcript for {child_name}", "Date Range {start} to {end}"
- Attendance Records section: Date, Minutes, Status, Note
- Grades section: Term, Subject, Grade, Score, Rubric, Notes, Date
- Outcomes Summary section: Subject, Average Rating, Strengths, Struggles

## Frontend Components

### RecordsPhase4 Component

Location: `components/records/RecordsPhase4.js`

**Features:**
1. **Child Selector** - Chip-based selector at the top
2. **Attendance Timeline** - Chronological list of attendance records with status badges
3. **Grades & Goals** - List of grades with "Add Grade" button and modal
4. **Portfolio Uploads** - List of uploads with "Add Upload" button and modal
5. **Compliance Sidebar** - State selector and requirements checklist
6. **Export Actions** - "Export Transcript" button that generates and downloads CSV

**Props:**
- `familyId` (required) - Family ID for data filtering

**State Management:**
- Loads children, subjects, attendance, grades, uploads, and state requirements
- Manages modals for adding grades and uploads
- Handles date range selection for attendance timeline

### API Client

Location: `lib/services/recordsClient.js`

**Functions:**
- `addGrade(gradeData)` - Add a grade record
- `addPortfolioUpload(uploadData)` - Add portfolio upload metadata
- `getStateRequirements(stateCode)` - Get state requirements
- `generateTranscript(childId, rangeStart, rangeEnd)` - Generate and download transcript CSV
- `getAttendanceTimeline(childId, rangeStart, rangeEnd)` - Get attendance records
- `getGrades(childId)` - Get grades for a child
- `getPortfolioUploads(childId)` - Get portfolio uploads for a child

## Integration

### WebContent Integration

The Records tab in `WebContent.js` now uses `RecordsPhase4` component by default. The old `Attendance` and `Reports` components are still available via subtabs for backward compatibility.

```javascript
const renderRecordsContent = () => {
  if (activeSubtab === 'attendance') {
    return <Attendance familyId={familyId} />;
  } else if (activeSubtab === 'reports') {
    return <Reports familyId={familyId} />;
  }
  return <RecordsPhase4 familyId={familyId} />;
};
```

## Data Flow

### Attendance Timeline
1. User selects child and date range
2. Frontend calls `getAttendanceTimeline(childId, start, end)`
3. Queries `attendance_records` table filtered by `child_id` and date range
4. Displays chronological timeline with status badges

### Grades
1. User clicks "Add Grade" → Opens modal
2. User fills form (term, subject, grade, score, notes)
3. Frontend calls `addGrade(gradeData)`
4. Backend validates and inserts into `grades` table
5. Frontend refreshes grades list via `getGrades(childId)`

### Portfolio Uploads
1. User uploads file to Supabase Storage (separate flow)
2. User clicks "Add Upload" → Opens modal
3. User enters file path and caption
4. Frontend calls `addPortfolioUpload(uploadData)`
5. Backend inserts metadata into `uploads` table
6. Frontend refreshes uploads list via `getPortfolioUploads(childId)`

### Transcript Generation
1. User clicks "Export Transcript"
2. Frontend calls `generateTranscript(childId, start, end)`
3. Backend queries:
   - `attendance_records` in range
   - `grades` for child
   - `event_outcomes` summary
4. Backend builds CSV in memory
5. Returns CSV as streaming response
6. Frontend triggers browser download

### State Requirements
1. User selects state code (CA, NY, TX)
2. Frontend calls `getStateRequirements(stateCode)`
3. Backend loads from `backend/data/state_requirements.json`
4. Returns requirements array
5. Frontend displays as checklist in sidebar

## Future Enhancements

- Upload transcript CSV to Supabase Storage and save URL in `transcripts` table
- Add PDF export option for transcripts
- Add ZIP export for portfolio uploads
- Add grade editing/deletion
- Add upload deletion
- Add date range picker for attendance timeline
- Add charts/visualizations for attendance trends
- Add grade averages and GPA calculation
- Add subject-specific grade summaries
- Expand state requirements database
- Add compliance progress tracking

## Migration Notes

Run `2025-11-19_phase4_records.sql` to create tables and RLS policies. The migration is idempotent and safe to run multiple times.

**Important:** The `uploads` table may already exist. The migration checks for existing columns and only adds `caption` if missing.

## Testing Checklist

- [ ] Run SQL migration successfully
- [ ] Add a grade via API and verify in database
- [ ] Add portfolio upload via API and verify in database
- [ ] Generate transcript CSV and verify format
- [ ] Load state requirements for CA, NY, TX
- [ ] View Records tab in frontend
- [ ] Select child and view attendance timeline
- [ ] Add grade via UI modal
- [ ] Add portfolio upload via UI modal
- [ ] Export transcript and verify CSV download
- [ ] Change state code and verify requirements update
- [ ] Verify RLS policies prevent cross-family access

