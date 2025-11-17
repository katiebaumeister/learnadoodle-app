# Priority Implementation List

## Current Codebase Context
- React Native/Expo (web via react-native-web)
- Express.js API routes in `lib/`
- Supabase backend
- Components in `components/`
- Existing: BacklogDrawer, UnscheduledTasksCard, SyllabusViewer (partial)

---

## Priority Order (Dependencies First)

### 🔴 PRIORITY 1: Foundation & API Layer
**Goal**: Establish unified API patterns and ensure all backend functions exist

**Chunk 1.1: API Client Consolidation**
- [ ] Create `lib/apiClient.js` (unified API helper)
- [ ] Move common patterns from route files
- [ ] Add date helpers (UTC conversion, weekStart calculation)
- [ ] Add error handling/toast patterns

**Chunk 1.2: Missing RPC Functions**
- [ ] `getCapacity({ familyId, weekStart })` - for capacity meter
- [ ] Verify all existing RPCs are accessible
- [ ] Add TypeScript/JSDoc types for API responses

**Estimated Time**: 2-3 hours

---

### 🟠 PRIORITY 2: Event Modal (Syllabus-aware)
**Goal**: Click any event → see details + syllabus link

**Chunk 2.1: Basic Event Modal**
- [ ] Create `components/events/EventModal.js`
- [ ] Create `components/events/EventDetails.js`
- [ ] Wire up click handler in `components/planner/PlannerWeek.js`
- [ ] Display: title, child, subject, time, status
- [ ] Actions: Edit, Delete (basic)

**Chunk 2.2: Syllabus Tab**
- [ ] Create `components/events/EventSyllabusTab.js`
- [ ] Show syllabus section if `source_syllabus_id` exists
- [ ] "Attach syllabus section" CTA if no link
- [ ] Relink dropdown functionality
- [ ] Deep link to Syllabus Viewer

**Chunk 2.3: API Functions**
- [ ] `getEvent(id)` - fetch single event with relations
- [ ] `linkEventSyllabus(eventId, sectionId)` - update event
- [ ] `getSyllabusById(id)` - fetch syllabus details

**Estimated Time**: 4-5 hours

---

### 🟡 PRIORITY 3: Backlog Drawer Enhancements
**Goal**: Flexible tasks + Suggestions with drag-drop

**Chunk 3.1: Flexible Tasks List**
- [ ] Enhance `components/planner/BacklogDrawer.js` (already exists)
- [ ] Create `components/backlog/FlexibleList.js`
- [ ] Display: "Flexible • 60m • Due Fri" format
- [ ] Wire up `getFlexibleBacklog` RPC (already exists)

**Chunk 3.2: Suggestions List**
- [ ] Create `components/backlog/SuggestionList.js`
- [ ] Display: "Lesson 2 • 45m • Suggest Nov 6" format
- [ ] Wire up `getPlanSuggestions` (check if exists)

**Chunk 3.3: Drag & Drop**
- [ ] Add DnD targets to week grid
- [ ] Drop handler: `scheduleFlexible({ source, id, targetDate })`
- [ ] Remove event → return to backlog
- [ ] Drag suggestion → create event + mark accepted

**Chunk 3.4: Auto-Place**
- [ ] "Auto-place" button handler
- [ ] Call `find_slot_for_flexible` RPC (already exists)
- [ ] Create event at suggested slot

**Estimated Time**: 5-6 hours

---

### 🟢 PRIORITY 4: Deep Links & Navigation
**Goal**: Click insight → navigate to filtered view

**Chunk 4.1: Filter Context**
- [ ] Create `contexts/FiltersContext.js`
- [ ] Store: childId, subjectId, date, view type
- [ ] Provide setter/getter functions

**Chunk 4.2: URL Query Helpers**
- [ ] Create `lib/url.js`
- [ ] `parseQueryParams()` - extract from URL
- [ ] `buildQueryParams()` - create URL string
- [ ] Handle web vs mobile differences

**Chunk 4.3: Home Deep Links**
- [ ] Modify `components/home/DailyInsights.js`
- [ ] Make insight chips clickable
- [ ] Navigate to Planner/Documents/Child with filters
- [ ] Test: "History light on uploads" → Documents filtered

**Chunk 4.4: Unscheduled Tasks Card Links**
- [ ] Enhance `components/home/UnscheduledTasksCard.js`
- [ ] "View backlog" → open BacklogDrawer
- [ ] Task links → Planner with date filter

**Estimated Time**: 4-5 hours

---

### 🔵 PRIORITY 5: Child Dashboard Charts
**Goal**: Visual progress indicators

**Chunk 5.1: Subject Pacing Chart**
- [ ] Create `components/child/SubjectPacingChart.js`
- [ ] Fetch: `compare_to_syllabus_week` RPC (exists)
- [ ] Display: Done vs Scheduled vs Expected bars
- [ ] Legend and tooltips

**Chunk 5.2: Evidence Rings**
- [ ] Create `components/child/EvidenceRings.js`
- [ ] Fetch: `getLightEvidenceSubjects` RPC (exists)
- [ ] Display: uploads vs monthly target per subject
- [ ] Click ring → open Documents filtered

**Chunk 5.3: Integrate into ChildProfile**
- [ ] Modify `components/ChildProfile.js`
- [ ] Replace empty chart with pacing chart
- [ ] Add evidence rings section
- [ ] Wire up deep links

**Estimated Time**: 5-6 hours

---

### 🟣 PRIORITY 6: Syllabus Viewer Enhancements
**Goal**: Complete syllabus → plan → events flow

**Chunk 6.1: Plan Review Table**
- [ ] Create `components/syllabus/PlanReviewTable.js`
- [ ] Display: section, minutes, target day, flexible toggle
- [ ] Editable rows (minutes, day)
- [ ] "Accept plan" button

**Chunk 6.2: Suggest Plan Flow**
- [ ] Enhance `components/syllabus/SuggestPlanButton.js` (if exists)
- [ ] Call `suggestPlan` API
- [ ] Show loading state
- [ ] Populate PlanReviewTable

**Chunk 6.3: Accept Plan**
- [ ] `acceptPlan({ syllabusId, items })` API call
- [ ] Create events from accepted items
- [ ] Link events to syllabus sections
- [ ] Update backlog if flexible items

**Chunk 6.4: Syllabus List & Navigation**
- [ ] Create `components/syllabus/SyllabusList.js`
- [ ] Filter by child/subject
- [ ] Link from DocumentsEnhanced
- [ ] Deep link to viewer

**Estimated Time**: 6-7 hours

---

### ⚪ PRIORITY 7: Reports KPIs
**Goal**: Second-row metrics with drill-downs

**Chunk 7.1: KPI Row Component**
- [ ] Create `components/reports/KpiRow.js`
- [ ] Three KPIs: Syllabus Pace, Evidence Coverage, Capacity Meter
- [ ] Fetch data from existing RPCs
- [ ] Display cards with values

**Chunk 7.2: Capacity Meter**
- [ ] Create `getCapacity` RPC (if missing)
- [ ] Calculate: scheduled / available minutes
- [ ] Display progress bar

**Chunk 7.3: Drill-Downs**
- [ ] Click Syllabus Pace → Planner filtered
- [ ] Click Evidence Coverage → Documents filtered
- [ ] Click Capacity → Planner week view

**Chunk 7.4: Integrate into Reports**
- [ ] Modify `components/records/Reports.js`
- [ ] Add KpiRow below header
- [ ] Wire up navigation

**Estimated Time**: 4-5 hours

---

## Summary

**Total Estimated Time**: 30-37 hours

**Recommended Order**:
1. Foundation (API layer) - enables everything
2. Event Modal - high user value, medium complexity
3. Backlog enhancements - completes existing work
4. Deep Links - improves UX flow
5. Child Dashboard - visual value
6. Syllabus Viewer - completes feature
7. Reports KPIs - data insights

**Next Steps**:
- Start with Priority 1 (Foundation)
- Work through each chunk sequentially
- Test after each chunk
- Adjust priorities based on user feedback

