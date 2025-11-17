# Learnadoodle Feature Roadmap

## Architecture Notes

**Current Stack**: React Native/Expo (web via react-native-web), Express.js API, Supabase DB
**Roadmap Assumes**: Next.js App Router (needs adaptation to current structure)

### Mapping Next.js → Current Structure

| Next.js Roadmap | Current Structure | Adaptation |
|----------------|-------------------|------------|
| `app/` directory | `components/` | Create feature folders in `components/` |
| `features/*` | `components/[feature]/` | Use existing pattern (e.g., `components/home/`, `components/planner/`) |
| `services/apiclient.ts` | `lib/[feature]Routes.js` | Create unified `lib/apiClient.js` or extend existing |
| `context/` | `contexts/` | Already exists; add `FiltersContext.js` |
| FastAPI | Express.js | Use existing Express routes pattern |

---

## Phase 1: Core Features (Priority Order)

### 1. Event Context Panel (Syllabus-aware modal)

**Files to Create:**
- `components/events/EventModal.js`
- `components/events/EventDetails.js`
- `components/events/EventSyllabusTab.js`

**Files to Modify:**
- `components/planner/PlannerWeek.js` (add onClick handler)
- `lib/apiClient.js` (new file, or extend existing routes)
  - `getEvent(id)`
  - `linkEventSyllabus(eventId, sectionId)`
  - `getSyllabusById(id)`

**UX:**
- Tabs: Details | Syllabus
- Details: title, child, subject, time, status, actions (Edit, Delete)
- Syllabus: section title, notes/reading pages, "Open full syllabus", Relink dropdown

**Acceptance:**
- Clicking any event opens modal
- If `source_syllabus_id` present → Syllabus tab shows section content
- Otherwise shows "Attach syllabus section" CTA
- Relink saves and reflects instantly

---

### 2. Planner Backlog Drawer (Flexible + Suggestions)

**Files to Create:**
- `components/planner/BacklogDrawer.js` (already exists, enhance)
- `components/backlog/FlexibleList.js`
- `components/backlog/SuggestionList.js`

**Files to Modify:**
- `components/planner/PlannerWeek.js` (add Backlog button, DnD targets)
- `lib/apiClient.js`:
  - `getFlexibleBacklog(familyId)`
  - `scheduleFlexible({ source, id, targetDate })`
  - `getPlanSuggestions({ familyId, childId? })`
  - `acceptSuggestion({ id, startTs })`

**UX:**
- Drawer tabs: Flexible | Syllabus suggestions
- Each row chip: "Flexible • 60m • Due Fri" or "Lesson 2 • 45m • Suggest Nov 6"
- Actions: Drag to week, Auto-place

**Acceptance:**
- Drag flexible task → event appears at drop time
- Removing event returns to backlog
- Drag suggestion → creates event and marks accepted
- Auto-place finds earliest feasible slot before due date

---

### 3. Home Deep Links + Unscheduled Tasks Card

**Files to Create:**
- `components/home/UnscheduledTasksCard.js` (already exists, enhance)

**Files to Modify:**
- `components/WebContent.js` (right column cards)
- `components/home/DailyInsights.js` (turn insight chips into links)

**Deep Link Patterns:**
- Planner: `/planner?view=week&child={id}&subject={id}&date={yyyy-mm-dd}`
- Documents: `/documents?child={id}&subject={id}`
- Child: `/children/{id}?tab=progress&weekStart={yyyy-mm-dd}`

**Note**: React Native doesn't have native routing like Next.js. Use query params or state management.

**Acceptance:**
- Insight "History light on uploads" → opens Documents pre-filtered
- "Lilly −40m Reading" → opens Planner week filtered + shows backlog drawer

---

### 4. Child Dashboard: Pacing + Evidence Rings

**Files to Create:**
- `components/child/SubjectPacingChart.js`
- `components/child/EvidenceRings.js`

**Files to Modify:**
- `components/ChildProfile.js`

**API:**
- `getCompareToSyllabusWeek({ familyId, childId, weekStart })` (RPC exists)
- `getLightEvidenceSubjects({ familyId, childId })` (RPC exists)
- `getDocumentStats({ familyId, childId, range: 'month' })` (needs implementation)

**Acceptance:**
- Chart shows bars per subject with legend (Done, Scheduled, Expected line)
- Rings show targets; clicking ring opens Documents filtered

---

### 5. Syllabus Viewer + Plan Review Flow

**Files to Create:**
- `components/syllabus/SyllabusList.js` (list, filters by child/subject)
- `components/syllabus/SyllabusViewer.js` (already exists, enhance)
- `components/syllabus/SyllabusOutline.js`
- `components/syllabus/PlanReviewTable.js`
- `components/syllabus/SuggestPlanButton.js`

**Files to Modify:**
- `components/documents/DocumentsEnhanced.js` (add Syllabi subtab or link)

**API Routes** (already exist in `lib/syllabusRoutes.js`):
- `createSyllabus({ uploadId, familyId, childId, subjectId })`
- `parseSyllabus({ syllabusId })` (async)
- `getSyllabus(id)`
- `suggestPlan({ syllabusId })`
- `acceptPlan({ syllabusId, items: [...] })`

**Acceptance:**
- Upload PDF → mark as Syllabus → parse → sections appear
- Click Suggest plan → Plan Review populates
- Editing a row adjusts minutes/day
- Accept plan creates events and populates Backlog "Suggestions" tab if flexible

---

### 6. Reports: Second-Row KPIs

**Files to Create:**
- `components/reports/KpiRow.js`

**Files to Modify:**
- `components/records/Reports.js`

**API:**
- `getCapacity({ familyId, weekStart })` (needs RPC)
- Reuse `compare_to_syllabus_week` (exists)
- Reuse document stats (exists)

**Acceptance:**
- KPIs render (Syllabus Pace, Evidence Coverage, Capacity Meter)
- Clicking KPI drills into filtered view

---

### 7. Routing & State Wiring

**Files to Create:**
- `contexts/FiltersContext.js`
- `lib/url.js` (helpers to build/parse query params)

**Files to Modify:**
- All components that need filter state

**Acceptance:**
- All deep links hydrate filters on target screens
- Navigating back preserves selection

---

### 8. Services / API Layer

**Files to Create:**
- `lib/apiClient.js` (unified API client, or extend existing pattern)

**Files to Modify:**
- `lib/flexibleTasksRoutes.js`
- `lib/syllabusRoutes.js`
- `lib/documentStatsRoutes.js`
- `lib/yearPlannerRoutes.js`

**Acceptance:**
- Type-safe calls (TypeScript or JSDoc)
- Errors surface via toasts
- Date helpers (UTC in/out, weekStart)

---

### 9. Supabase Migrations

**Status**: Most migrations already exist in:
- `flexible_tasks_and_syllabus_system.sql`
- `flexible_tasks_and_syllabus_rpcs.sql`

**Still Needed:**
- `v_upload_stats` view (exists)
- `compare_to_syllabus_week` RPC (exists)
- `get_flexible_backlog` RPC (exists)
- `find_slot_for_flexible` RPC (exists)
- `getCapacity` RPC (needs creation)

---

### 10. QA Checklist

- [ ] Event modal shows Syllabus tab and opens viewer
- [ ] Backlog drawer drag/drop + auto-place works
- [ ] Suggestions create events
- [ ] Home insights deep-link correctly
- [ ] Child page shows pacing bars + evidence rings
- [ ] Rings link to Documents filtered
- [ ] Syllabus viewer → suggest → accept turns into events
- [ ] Reports KPIs reflect real data and drill down
- [ ] All new routes responsive
- [ ] Match existing pastel/rounded aesthetic

---

## Phase 2: Tier-2 Roadmap

### 1. Confidence Layer

**Parent Confidence Dashboard:**
- `components/reports/ConfidenceDashboard.js`
- RPC: `get_confidence_summary(family_id)`
- View: `v_parent_effort`

**Smart Compliance Drawer:**
- `components/records/ComplianceDrawer.js`
- Table: `compliance_templates`
- RPC: `generate_compliance_report(family_id, state)`
- FastAPI route: `/compliance/report`, `/compliance/export/pdf`

---

### 2. Intelligence Layer

**Energy-Aware Scheduler:**
- Table: `family_energy_log`
- RPC: `generate_ai_schedule` (uses calendar_days_cache)
- UI: Energy bar in Planner Week

**AI Lesson Builder:**
- Table: `custom_lessons`
- FastAPI route: `/ai/lesson-from-link`
- UI: "Create Lesson from Link" button

**Longitudinal Map:**
- `/records/progression` page
- RPC: `get_longitudinal_summary(family_id)`

---

### 3. Community Layer

**Parent Reflection Feed:**
- Table: `parent_reflections`
- UI: Home → "My Reflection" card

**Family Compare (Anonymized):**
- View: `v_family_benchmarks`
- UI: "How You Compare" card

**Parent Mentorship:**
- Optional "Parent Hub" chat
- AI summarizes discussions → "3 Takeaways" card

---

## Implementation Priority

1. **Event Modal** (high impact, moderate complexity)
2. **Backlog Drawer enhancements** (already started, needs completion)
3. **Deep Links** (enables better UX flow)
4. **Child Dashboard charts** (visual value)
5. **Syllabus Viewer enhancements** (completes existing work)
6. **Reports KPIs** (data insights)
7. **Routing/State** (foundation for deep links)
8. **API layer consolidation** (maintenance)

---

## Notes

- All new components should use React Native components (works for web via react-native-web)
- API routes use Express.js (not FastAPI) to match existing codebase
- RLS policies follow existing family-based patterns
- Date handling should use `family.timezone` consistently
- UI should match existing pastel/rounded aesthetic

