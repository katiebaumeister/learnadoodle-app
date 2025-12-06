# Meta Features Integration Guide

This document outlines where all the new meta features have been integrated into the application.

## Integration Points

### 1. Print Functionality for Tutors ✅
**Location**: Already integrated via export system
- **Component**: `components/exports/CaregiverPacketExportModal.js`
- **Access**: Export Menu → "Caregiver/Tutor Packet"
- **Usage**: Available in `components/exports/ExportMenu.js`

### 2. Weekly Overview Email System ✅
**Location**: Settings or Toolbar
- **Component**: `components/email/WeeklyOverviewEmailModal.js`
- **Service**: `lib/services/emailClient.js`
- **Integration Needed**: Add to settings menu or toolbar
- **Suggested Access**: Settings → Email Preferences or Toolbar → Email

### 3. Parent Coaching Module ✅
**Location**: Home page or Parent section
- **Component**: `components/parent/ParentCoachingModule.js`
- **Integration Needed**: Add to home page or create parent section
- **Suggested Access**: Home → Coaching tab or Left Rail → Parent Resources

### 4. Visual Analytics Heatmaps ✅
**Location**: Analytics Dashboard
- **Component**: `components/analytics/ActivityHeatmap.js` (new)
- **Component**: `components/analytics/SkillHeatmap.js` (existing)
- **Integration**: Already added to `components/analytics/AnalyticsDashboard.js`
- **Access**: Analytics → Heatmaps tab

### 5. Trello-style Backlog Board ✅
**Location**: Backlog tool
- **Component**: `components/backlog/BacklogBoard.js`
- **Integration**: Added to `components/ToolContent.js`
- **Access**: Backlog tool → Click "Kanban" button to switch to board view
- **Toggle**: List view ↔ Board view

### 6. AI-Suggested Weekly Reshuffling ✅
**Location**: Planner Week view
- **Component**: `components/planner/WeeklyReshuffleModal.js`
- **Integration Needed**: Add button to PlannerWeek toolbar
- **Suggested Access**: Planner Week → AI Actions → "Weekly Reshuffle"

### 7. Multi-Year Planning Timeline ✅
**Location**: Year Planning menu
- **Component**: `components/year/MultiYearPlanningWizard.js`
- **Integration Needed**: Add option to year planning menu
- **Suggested Access**: Year Planning → "Multi-Year Plan" option

### 8. Enhanced Syllabus Scanner & Unit Builder ✅
**Location**: Syllabus upload flow
- **Component**: `components/syllabus/SyllabusScanner.js`
- **Integration Needed**: Add option to syllabus upload
- **Suggested Access**: Syllabus Upload → "Advanced Scanner" option

### 9. Course Overview Pages ✅
**Location**: Subject/Course pages
- **Component**: `components/course/CourseOverviewPage.js`
- **Integration Needed**: Add to subject detail pages
- **Suggested Access**: Subject page → "Overview" tab or Course detail page

## Integration Steps

### Step 1: Add Weekly Reshuffle to PlannerWeek
Add to `components/planner/PlannerWeek.js`:
```javascript
import WeeklyReshuffleModal from './WeeklyReshuffleModal';

// In component state:
const [showWeeklyReshuffle, setShowWeeklyReshuffle] = useState(false);

// Add button in toolbar:
<TouchableOpacity onPress={() => setShowWeeklyReshuffle(true)}>
  <Text>Weekly Reshuffle</Text>
</TouchableOpacity>

// Add modal:
<WeeklyReshuffleModal
  visible={showWeeklyReshuffle}
  onClose={() => setShowWeeklyReshuffle(false)}
  familyId={familyId}
  childIds={selectedChildIds}
  weekStart={weekStart}
  onApply={() => {
    refresh();
    setShowWeeklyReshuffle(false);
  }}
/>
```

### Step 2: Add Email System to Settings
Add to `components/ToolContent.js` in SETTINGS case:
```javascript
import WeeklyOverviewEmailModal from '../email/WeeklyOverviewEmailModal';

// In settings subtab:
case 'email':
  return (
    <WeeklyOverviewEmailModal
      visible={true}
      onClose={onClose}
      familyId={familyId}
      childIds={activeChildIds}
      weekStart={new Date().toISOString().split('T')[0]}
      children={effectiveChildren}
    />
  );
```

### Step 3: Add Parent Coaching to Home
Add to `components/WebContent.js` or home page:
```javascript
import ParentCoachingModule from './parent/ParentCoachingModule';

// In home tab or parent section:
<ParentCoachingModule
  familyId={familyId}
  childId={activeChildId}
/>
```

### Step 4: Add Course Overview to Subject Pages
Add to subject detail view:
```javascript
import CourseOverviewPage from './course/CourseOverviewPage';

// In subject detail:
<CourseOverviewPage
  childId={childId}
  subjectId={subjectId}
  familyId={familyId}
  onEdit={(subject) => {/* edit handler */}}
  onNavigate={(path) => {/* navigate handler */}}
/>
```

### Step 5: Add Syllabus Scanner to Upload Flow
Add to `components/planner/SyllabusUploadModal.js`:
```javascript
import SyllabusScanner from '../syllabus/SyllabusScanner';

// Add option:
<TouchableOpacity onPress={() => setShowScanner(true)}>
  <Text>Use Advanced Scanner</Text>
</TouchableOpacity>

<SyllabusScanner
  visible={showScanner}
  onClose={() => setShowScanner(false)}
  familyId={familyId}
  childId={selectedChildId}
  subjectId={selectedSubjectId}
  onComplete={(syllabus) => {
    // Handle completion
  }}
/>
```

### Step 6: Add Multi-Year Planning to Year Menu
Add to year planning options:
```javascript
import MultiYearPlanningWizard from './year/MultiYearPlanningWizard';

// In PlanYearWizard or year planning menu:
<TouchableOpacity onPress={() => setShowMultiYear(true)}>
  <Text>Plan Multiple Years</Text>
</TouchableOpacity>

<MultiYearPlanningWizard
  visible={showMultiYear}
  onClose={() => setShowMultiYear(false)}
  familyId={familyId}
  children={children}
  onComplete={({ plans }) => {
    // Handle completion
  }}
/>
```

## Backend Endpoints Needed

### Email System
- `POST /api/email/weekly-overview` - Send weekly overview email
- `GET /api/email/weekly-overview/preview` - Preview email HTML
- `GET /api/email/preferences` - Get email preferences
- `PUT /api/email/preferences` - Update email preferences

### Weekly Reshuffle
- `POST /api/ai/weekly-reshuffle` - Generate reshuffle suggestions
- `POST /api/ai/apply-reshuffle` - Apply reshuffle changes

## Database Tables Needed

### Email Preferences
```sql
CREATE TABLE IF NOT EXISTS email_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  recipient_emails text[] DEFAULT '{}',
  include_progress boolean DEFAULT true,
  include_schedule boolean DEFAULT true,
  include_recommendations boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(family_id)
);
```

## Testing Checklist

- [ ] Backlog board view toggles correctly
- [ ] Analytics heatmaps display correctly
- [ ] Weekly reshuffle generates suggestions
- [ ] Email preview and send work
- [ ] Parent coaching tips are interactive
- [ ] Course overview displays all tabs
- [ ] Syllabus scanner parses documents
- [ ] Multi-year planning creates multiple plans
- [ ] Print functionality accessible from export menu

