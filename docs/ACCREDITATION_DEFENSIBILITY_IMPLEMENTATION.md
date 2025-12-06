# Accreditation & Defensibility Features Implementation Guide

## Overview
Build comprehensive accreditation and defensibility features that prove learning is happening and meets standards. This is the "we're not ruining our child" guarantee.

## Current Foundation
You already have:
- ✅ Attendance tracking
- ✅ Transcripts
- ✅ Portfolio (uploads, artifacts)
- ✅ Learning story (weekly narratives)
- ✅ Compliance panel

## New Features to Add

### 1. Accreditation Packet Generator
Automatically generate comprehensive accreditation packets with all evidence.

### 2. Academic Coverage Map
Visual map showing subjects → evidence → credits earned.

### 3. Simple Mastery Charts
Clear visualizations of skill mastery over time.

### 4. College Readiness Dashboard
Track and display college readiness metrics.

---

## 1. Accreditation Packet Generator

### Database Schema

```sql
-- Accreditation packets table
CREATE TABLE IF NOT EXISTS accreditation_packets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  academic_year text NOT NULL, -- e.g., "2024-2025"
  
  -- Packet contents (JSONB for flexibility)
  packet_data jsonb NOT NULL DEFAULT '{}',
  -- Contains:
  -- - Summary statistics
  -- - Subject coverage
  -- - Evidence links
  -- - Attendance records
  -- - Transcript summary
  -- - Compliance status
  
  -- Generation metadata
  generated_at timestamptz DEFAULT now() NOT NULL,
  generated_by uuid REFERENCES profiles(id),
  pdf_url text, -- Link to generated PDF
  pdf_generated_at timestamptz,
  
  -- Status
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'final', 'submitted')),
  notes text,
  
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS accreditation_packets_child_idx ON accreditation_packets(child_id);
CREATE INDEX IF NOT EXISTS accreditation_packets_year_idx ON accreditation_packets(academic_year);

-- RLS policies
ALTER TABLE accreditation_packets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family can manage accreditation packets"
ON accreditation_packets FOR ALL
TO authenticated
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));
```

### Backend Implementation

```python
# backend/routers/accreditation_routes.py

@router.post("/accreditation/packets/generate")
async def generate_accreditation_packet(
    child_id: str,
    academic_year: str,
    include_sections: List[str] = ["all"],  # all, attendance, transcripts, portfolio, compliance
    user: dict = Depends(get_current_user),
):
    """Generate comprehensive accreditation packet"""
    # 1. Gather all data:
    #    - Attendance records
    #    - Transcript summary
    #    - Portfolio artifacts
    #    - Learning story highlights
    #    - Compliance checklist
    #    - Subject coverage
    #    - Evidence links
    
    # 2. Structure into packet_data JSONB
    
    # 3. Generate PDF (using reportlab or similar)
    
    # 4. Store packet record
    
    # 5. Return packet with PDF URL

@router.get("/accreditation/packets/{packet_id}")
async def get_accreditation_packet(
    packet_id: str,
    user: dict = Depends(get_current_user),
):
    """Get accreditation packet details"""

@router.post("/accreditation/packets/{packet_id}/pdf")
async def regenerate_pdf(
    packet_id: str,
    user: dict = Depends(get_current_user),
):
    """Regenerate PDF for packet"""
```

### Frontend Components

```jsx
// components/accreditation/AccreditationPacketGenerator.js
// Features:
// - Select child and academic year
// - Choose sections to include
// - Preview packet contents
// - Generate PDF button
// - Download/share PDF

// components/accreditation/PacketPreview.js
// Shows:
// - Summary statistics
// - Subject coverage table
// - Evidence gallery
// - Attendance summary
// - Transcript preview
// - Compliance status
```

### Packet Contents Structure

```json
{
  "summary": {
    "total_days": 180,
    "total_hours": 1080,
    "subjects_covered": ["Math", "Science", "English"],
    "credits_earned": 6.0,
    "compliance_status": "compliant"
  },
  "attendance": {
    "total_days": 180,
    "attendance_rate": 0.95,
    "by_subject": {...}
  },
  "transcripts": {
    "courses": [...],
    "grades": {...},
    "credits": {...}
  },
  "portfolio": {
    "total_artifacts": 45,
    "by_subject": {...},
    "highlights": [...]
  },
  "compliance": {
    "requirements_met": 12,
    "requirements_total": 15,
    "status": "compliant"
  },
  "evidence_links": [
    {"type": "upload", "id": "...", "subject": "Math"},
    {"type": "event", "id": "...", "subject": "Science"}
  ]
}
```

---

## 2. Academic Coverage Map

### Database Schema

```sql
-- Academic coverage tracking
CREATE TABLE IF NOT EXISTS academic_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  academic_year text NOT NULL,
  
  -- Coverage data (JSONB)
  coverage_data jsonb NOT NULL DEFAULT '{}',
  -- Structure:
  -- {
  --   "subjects": {
  --     "Math": {
  --       "hours": 180,
  --       "credits": 1.0,
  --       "evidence_count": 25,
  --       "topics_covered": ["Algebra", "Geometry"],
  --       "standards_met": ["CCSS.MATH.8.1", ...]
  --     },
  --     ...
  --   }
  -- }
  
  -- Calculated metrics
  total_hours numeric(6,2),
  total_credits numeric(4,2),
  coverage_percentage numeric(5,2), -- % of required coverage
  
  calculated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(child_id, academic_year)
);

CREATE INDEX IF NOT EXISTS academic_coverage_child_idx ON academic_coverage(child_id);
CREATE INDEX IF NOT EXISTS academic_coverage_year_idx ON academic_coverage(academic_year);

-- RLS policies
ALTER TABLE academic_coverage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family can view academic coverage"
ON academic_coverage FOR SELECT
TO authenticated
USING (is_family_member(family_id));
```

### Backend Implementation

```python
# backend/routers/accreditation_routes.py

@router.get("/accreditation/coverage-map")
async def get_coverage_map(
    child_id: str,
    academic_year: str,
    user: dict = Depends(get_current_user),
):
    """Get academic coverage map"""
    # 1. Query all events for child/year
    # 2. Group by subject
    # 3. Calculate hours per subject
    # 4. Link to evidence (uploads, outcomes)
    # 5. Map to credits (if applicable)
    # 6. Return structured coverage data

@router.get("/accreditation/coverage-map/visual")
async def get_coverage_map_visual(
    child_id: str,
    academic_year: str,
    format: str = "json",  # json, svg, png
    user: dict = Depends(get_current_user),
):
    """Get visual representation of coverage map"""
    # Generate visual map showing:
    # - Subjects as nodes
    # - Evidence as connections
    # - Credits as weights
```

### Frontend Components

```jsx
// components/accreditation/AcademicCoverageMap.js
// Visual map showing:
// - Subjects (nodes)
// - Evidence links (connections)
// - Credits earned (node size/color)
// - Interactive: click subject → see evidence
// - Filter by academic year

// components/accreditation/CoverageTable.js
// Table view:
// - Subject | Hours | Credits | Evidence | Standards Met
// - Sortable columns
// - Expandable rows for details
```

### Visual Design

```
┌─────────────────────────────────────────┐
│ Academic Coverage Map                   │
│ 2024-2025 Academic Year                 │
├─────────────────────────────────────────┤
│                                         │
│     [Math] ──── 180h ──── 1.0 credit   │
│       │                                  │
│       ├── 25 evidence items             │
│       ├── Algebra, Geometry             │
│                                         │
│     [Science] ──── 150h ──── 0.8 credit│
│       │                                  │
│       ├── 18 evidence items             │
│       ├── Biology, Chemistry            │
│                                         │
│     [English] ──── 200h ──── 1.2 credits│
│       │                                  │
│       ├── 30 evidence items             │
│       ├── Literature, Writing          │
│                                         │
│ Total: 530 hours | 3.0 credits         │
└─────────────────────────────────────────┘
```

---

## 3. Simple Mastery Charts

### Database Schema

```sql
-- Mastery tracking (uses existing skill_evidence table)
-- Add mastery snapshots for historical tracking

CREATE TABLE IF NOT EXISTS mastery_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  
  -- Mastery data (JSONB)
  mastery_data jsonb NOT NULL DEFAULT '{}',
  -- Structure:
  -- {
  --   "skills": {
  --     "skill_id": {
  --       "name": "Algebra Basics",
  --       "mastery_level": 4.2, // 1-5 scale
  --       "evidence_count": 12,
  --       "trend": "improving" // improving, stable, declining
  --     },
  --     ...
  --   },
  --   "subjects": {
  --     "Math": {
  --       "avg_mastery": 4.0,
  --       "skills_count": 15
  --     },
  --     ...
  --   }
  -- }
  
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(child_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS mastery_snapshots_child_idx ON mastery_snapshots(child_id);
CREATE INDEX IF NOT EXISTS mastery_snapshots_date_idx ON mastery_snapshots(snapshot_date);

-- RLS policies
ALTER TABLE mastery_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family can view mastery snapshots"
ON mastery_snapshots FOR SELECT
TO authenticated
USING (is_family_member(family_id));
```

### Backend Implementation

```python
# backend/routers/accreditation_routes.py

@router.get("/accreditation/mastery-charts")
async def get_mastery_charts(
    child_id: str,
    subject_id: Optional[str] = None,
    days_back: int = 365,
    user: dict = Depends(get_current_user),
):
    """Get mastery charts data"""
    # 1. Query skill_evidence for time range
    # 2. Calculate mastery levels over time
    # 3. Group by subject if specified
    # 4. Return chart-ready data

@router.post("/accreditation/mastery-snapshot")
async def create_mastery_snapshot(
    child_id: str,
    snapshot_date: Optional[str] = None,  # Defaults to today
    user: dict = Depends(get_current_user),
):
    """Create a mastery snapshot for historical tracking"""
```

### Frontend Components

```jsx
// components/accreditation/MasteryCharts.js
// Features:
// - Line chart showing mastery over time
// - Group by subject or skill
// - Filter by date range
// - Show trends (improving/declining)
// - Click to see evidence

// components/accreditation/MasteryHeatmap.js
// Heatmap showing:
// - Skills on Y-axis
// - Time on X-axis
// - Color intensity = mastery level
```

### Visual Design

```
┌─────────────────────────────────────────┐
│ Mastery Over Time                      │
├─────────────────────────────────────────┤
│                                         │
│  5.0 ┤                                  │
│  4.5 ┤     ╱───╲                        │
│  4.0 ┤   ╱       ╲───╲                  │
│  3.5 ┤ ╱               ╲               │
│  3.0 ┤─                   ────          │
│      └─────────────────────────────     │
│      Jan  Feb  Mar  Apr  May  Jun      │
│                                         │
│ Math: ⬆️ Improving (4.2 avg)           │
│ Science: ➡️ Stable (3.8 avg)           │
│ English: ⬆️ Improving (4.5 avg)         │
└─────────────────────────────────────────┘
```

---

## 4. College Readiness Dashboard

### Database Schema

```sql
-- College readiness tracking
CREATE TABLE IF NOT EXISTS college_readiness (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  
  -- Readiness metrics (JSONB)
  readiness_data jsonb NOT NULL DEFAULT '{}',
  -- Structure:
  -- {
  --   "academic": {
  --     "gpa": 3.8,
  --     "credits_earned": 24.0,
  --     "ap_courses": 3,
  --     "honors_courses": 5
  --   },
  --   "standardized_tests": {
  --     "sat_score": 1350,
  --     "act_score": 30,
  --     "test_dates": [...]
  --   },
  --   "extracurriculars": {
  --     "activities": [...],
  --     "leadership_roles": [...],
  --     "volunteer_hours": 120
  --   },
  --   "readiness_score": 85, // 0-100
  --   "recommendations": [...]
  -- }
  
  calculated_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(child_id)
);

CREATE INDEX IF NOT EXISTS college_readiness_child_idx ON college_readiness(child_id);

-- RLS policies
ALTER TABLE college_readiness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family can manage college readiness"
ON college_readiness FOR ALL
TO authenticated
USING (is_family_member(family_id))
WITH CHECK (is_family_member(family_id));
```

### Backend Implementation

```python
# backend/routers/accreditation_routes.py

@router.get("/accreditation/college-readiness")
async def get_college_readiness(
    child_id: str,
    user: dict = Depends(get_current_user),
):
    """Get college readiness dashboard data"""
    # 1. Calculate GPA from transcripts
    # 2. Sum credits earned
    # 3. Count AP/Honors courses
    # 4. Get standardized test scores (if stored)
    # 5. Calculate readiness score
    # 6. Generate recommendations

@router.post("/accreditation/college-readiness/update")
async def update_college_readiness(
    child_id: str,
    test_scores: Optional[dict] = None,
    extracurriculars: Optional[dict] = None,
    user: dict = Depends(get_current_user),
):
    """Update college readiness data"""
```

### Frontend Components

```jsx
// components/accreditation/CollegeReadinessDashboard.js
// Sections:
// - Overall readiness score (0-100)
// - Academic metrics (GPA, credits, courses)
// - Standardized tests
// - Extracurriculars
// - Recommendations
// - Comparison to benchmarks

// components/accreditation/ReadinessScore.js
// Large visual score display:
// - Circular progress indicator
// - Breakdown by category
// - Trend over time
```

### Visual Design

```
┌─────────────────────────────────────────┐
│ College Readiness Dashboard             │
├─────────────────────────────────────────┤
│                                         │
│     Overall Readiness                   │
│     ┌─────────────┐                    │
│     │     85%     │                    │
│     │   ╱─────╲   │                    │
│     └─────────────┘                    │
│                                         │
│ Academic                                │
│ ├─ GPA: 3.8 ⭐⭐⭐⭐                    │
│ ├─ Credits: 24.0 / 24.0 ✅            │
│ ├─ AP Courses: 3                       │
│ └─ Honors: 5                           │
│                                         │
│ Standardized Tests                      │
│ ├─ SAT: 1350 (Target: 1300+) ✅        │
│ └─ ACT: 30 (Target: 28+) ✅            │
│                                         │
│ Extracurriculars                        │
│ ├─ Activities: 8                       │
│ ├─ Leadership: 2                       │
│ └─ Volunteer Hours: 120                │
│                                         │
│ Recommendations                         │
│ • Consider adding AP Science            │
│ • Increase volunteer hours to 150+     │
│ • Take SAT again for 1400+              │
└─────────────────────────────────────────┘
```

---

## Implementation Steps

### Phase 1: Accreditation Packet Generator
1. Create `accreditation_packets` table
2. Build data aggregation service
3. Create PDF generation service
4. Build frontend generator UI
5. Add download/share functionality

### Phase 2: Academic Coverage Map
1. Create `academic_coverage` table
2. Build coverage calculation service
3. Create visual map component
4. Add evidence linking
5. Add credits mapping

### Phase 3: Simple Mastery Charts
1. Create `mastery_snapshots` table
2. Build mastery calculation service
3. Create chart components
4. Add trend analysis
5. Add historical tracking

### Phase 4: College Readiness Dashboard
1. Create `college_readiness` table
2. Build readiness calculation service
3. Create dashboard UI
4. Add recommendations engine
5. Add benchmark comparisons

## Benefits

✅ **Defensibility** - Comprehensive proof of learning
✅ **Accreditation Ready** - Generate packets instantly
✅ **Transparency** - Clear coverage and mastery visualization
✅ **College Prep** - Track readiness metrics
✅ **Peace of Mind** - "We're not ruining our child" guarantee

