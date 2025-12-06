# Records Screen Data Wiring - Implementation Summary

## ✅ Completed

### 1. API Functions Added (`lib/services/recordsClient.js`)
- ✅ `getComplianceStatus(familyId, childIds, dateRange)` - Returns checklist, readiness, gaps, documents, state rules
- ✅ `getRecordsSummary(familyId, childIds, dateRange)` - Returns per-child and global summary
- ✅ `getCreditsSummary(familyId, childIds, dateRange)` - Returns credits by child and subject, GPA calculation
- ✅ `getEvidence(familyId, childIds, filters, dateRange)` - Returns portfolio/evidence items
- ✅ `uploadEvidence(formData)` - Upload evidence file
- ✅ `updateEvidenceMetadata(evidenceId, payload)` - Update evidence tags/metadata
- ✅ `getAttendanceLogs(familyId, childIds, dateRange)` - Returns attendance records
- ✅ `updateAttendanceLog(logId, payload)` - Update attendance log
- ✅ `createAttendanceLog(payload)` - Create new attendance log
- ✅ `getNotes(familyId, childIds, dateRange, filters)` - Returns notes (with fallback to events)
- ✅ `createNote(payload)` - Create note (with fallback to events)
- ✅ `updateNote(noteId, payload)` - Update note
- ✅ `deleteNote(noteId)` - Delete note
- ✅ `getCoursesAndSyllabi()` - Stub (returns empty array, TODO: implement when courses table available)
- ✅ `getCourseDetails()` - Stub (returns null, TODO: implement)

### 2. WebRecordsScreen Updates
- ✅ Added shared data hooks:
  - `recordsSummary` state - Per-child and global summary data
  - `complianceStatus` state - Compliance checklist, gaps, documents, state rules
  - `summaryLoading` and `summaryError` states
- ✅ Added `useEffect` to fetch summary data when filters change
- ✅ Added `getChildSummary()` helper to extract child-specific data
- ✅ Updated `renderLeftColumn()` to use real data from `recordsSummary`
- ✅ Updated `renderTabContent()` to pass shared data props to all tabs
- ✅ Updated `CompliancePanel` to receive `complianceStatus` prop

### 3. ComplianceTab.js
- ✅ Wired to `complianceStatus` prop from parent
- ✅ Calculates combined readiness score for multi-child view
- ✅ Displays real checklist items
- ✅ Displays real evidence gaps
- ✅ Implemented transcript export (single child only)
- ✅ Export buttons call real API functions

### 4. CompliancePanel.js
- ✅ Wired to `complianceStatus` prop from parent
- ✅ Displays real checklist, documents, gaps, state rules
- ✅ Added error handling and loading states
- ✅ Export buttons wired (compliance packet export needs backend endpoint)

### 5. TranscriptsTab.js
- ✅ Wired to `getCreditsSummary()` API
- ✅ Displays real credits data aggregated by subject
- ✅ Calculates and displays GPA
- ✅ Implemented "Generate Transcript" button with download
- ✅ Shows message when multiple children selected (transcript requires single child)

## 🔄 Partially Complete / Needs Backend

### 6. PortfolioEvidenceTab.js
- ⚠️ Structure ready, needs:
  - Wire `getEvidence()` API call
  - Implement filter chips (child, subject, type, tag, syllabus unit)
  - Implement upload modal
  - Implement evidence drawer with metadata editing
  - Link evidence to syllabus units/planner events

### 7. AttendanceLogsTab.js
- ⚠️ Structure ready, needs:
  - Wire `getAttendanceLogs()` API call
  - Calculate weekly summaries from logs
  - Implement log editor modal
  - Wire `updateAttendanceLog()` and `createAttendanceLog()`
  - Add "Open in Planner" navigation

### 8. CoursesSyllabiTab.js
- ⚠️ Structure ready, needs:
  - Backend: Courses/syllabi tables and endpoints
  - Wire `getCoursesAndSyllabi()` when available
  - Wire `getCourseDetails()` when available
  - Link to planner and explore screens

### 9. NotesTab.js
- ⚠️ Structure ready, needs:
  - Wire `getNotes()` API call
  - Implement filter chips
  - Wire `createNote()`, `updateNote()`, `deleteNote()`
  - Implement export (PDF/CSV)
  - Link notes to evidence/planner events

### 10. ChildSummaryCard.js
- ✅ Already receives real data via props from `getChildSummary()`
- ✅ Buttons navigate correctly
- ✅ All metrics display from `recordsSummary`

### 11. RecordsTopBar Quick Actions
- ⚠️ Needs:
  - "Upload evidence" → Open upload modal (reuse from PortfolioEvidenceTab)
  - "Add note" → Switch to Notes tab or open note editor
  - "Export transcript" → Generate transcript if single child selected

## 📋 Backend Endpoints Needed

### High Priority
1. **`GET /api/records/compliance_status`**
   - Query params: `family_id`, `child_ids[]`, `start`, `end`
   - Returns: `{ checklist: [], readiness: {}, gaps: [], documents: [], stateRules: {} }`

2. **`GET /api/records/summary`**
   - Query params: `family_id`, `child_ids[]`, `start`, `end`
   - Returns: `{ perChild: { [childId]: { readinessScore, attendanceDays, attendanceMinutes, creditsEarned, creditsPlanned, portfolioCount } }, global: {} }`

3. **`POST /api/records/upload_evidence`**
   - FormData with file + metadata
   - Returns: `{ id, storage_path, ... }`

4. **`PATCH /api/records/evidence/:id`**
   - Body: `{ caption?, subject_id?, tags?, ... }`
   - Returns: updated evidence object

5. **`GET /api/records/compliance_packet`**
   - Query params: `family_id`, `child_ids[]`
   - Returns: ZIP file download

### Medium Priority
6. **`GET /api/records/notes/export`**
   - Query params: `family_id`, `child_ids[]`, `format` (pdf|csv)
   - Returns: File download

7. **Courses/Syllabi endpoints** (when tables available)
   - `GET /api/courses` - List courses
   - `GET /api/courses/:id` - Course details

## 🎯 Next Steps

1. **Complete PortfolioEvidenceTab wiring:**
   - Add `useEffect` to call `getEvidence()` when filters change
   - Implement filter state management
   - Create upload modal component
   - Wire evidence drawer editing

2. **Complete AttendanceLogsTab wiring:**
   - Add `useEffect` to call `getAttendanceLogs()`
   - Calculate weekly summaries
   - Implement log editor modal
   - Wire save/create functions

3. **Complete NotesTab wiring:**
   - Add `useEffect` to call `getNotes()`
   - Implement filter state
   - Wire create/update/delete
   - Implement export

4. **Implement Quick Actions:**
   - Upload evidence modal
   - Note editor integration
   - Transcript export logic

5. **Backend Implementation:**
   - Create `/api/records/compliance_status` endpoint
   - Create `/api/records/summary` endpoint
   - Create `/api/records/upload_evidence` endpoint
   - Create `/api/records/compliance_packet` endpoint

## 📝 Notes

- All API functions follow the pattern: `{ data, error }` return or throw
- Error handling is implemented at component level with try/catch
- Loading states are managed via `summaryLoading` prop from parent
- Navigation helpers use `handleNavigate()` pattern
- Child filter logic matches IntelligenceHub pattern
- Date range calculations are centralized in `calculatedDateRange` useMemo

## ✅ Testing Checklist

- [ ] Child filter chips update all tabs correctly
- [ ] Timeframe selector updates date range across tabs
- [ ] CompliancePanel shows correct data for selected children
- [ ] ChildSummaryCard shows real metrics when "All" selected
- [ ] Transcript generation downloads CSV file
- [ ] Export buttons show appropriate messages/errors
- [ ] Navigation buttons route correctly to Planner/Intelligence/Explore
- [ ] Loading states display during data fetches
- [ ] Error states display when API calls fail

