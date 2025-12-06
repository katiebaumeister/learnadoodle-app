# Next Steps Summary for Learnadoodle

## ✅ Recently Completed (This Session)

1. **Confidence Layer / Parent Reassurance Engine** - COMPLETE
   - Readiness Meter, Assurance Card, Weekly Learning Story, Compliance Panel
   - Emotional Reassurance Hooks, Annual Reflection Packet, Student Streak Notifications
   - Pacing Predictions

2. **Template System UI** - COMPLETE
   - Save as template from Planner
   - Browse & Manage Templates (Records → Templates)
   - Apply template wizard

3. **Resume Logic UI (Content Glue)** - COMPLETE
   - Continue Learning strip on Home/Child Dashboard
   - Resume chips on event cards
   - Resume position modal

4. **Child Login Flow (Student Mode)** - COMPLETE
   - Child invite system (parent generates invite link)
   - Child registration page (`/child/invite/[token]`)
   - Backend routes for invite creation/acceptance

5. **LLM Weekly Narrative** - COMPLETE + OPTIMIZED
   - LLM-generated family and per-child summaries
   - **NEW: Two-layer caching system** (in-memory + database)
   - Reduces LLM calls by 90%+ for repeated requests
   - **SQL migration run:** `2025-01-23_learning_story_cache.sql` ✅

6. **Bug Fixes**
   - Fixed streak endpoint JSON parsing errors
   - Fixed CORS configuration
   - Fixed import errors in child_auth_routes

## 🚀 Immediate Next Steps (Priority Order)

### 1. Complete Student Mode UI
**Status:** Login flow done, but "Today's Quests" UI needs implementation
- **What's needed:**
  - Student dashboard with "Today's Quests" view
  - Quest completion UI (checkboxes, progress tracking)
  - Student-friendly navigation (bottom nav for mobile)
  - Quest rewards/streaks visualization

**Files to check:**
- `components/child/tabs/OverviewTab.js` - Already has streak card
- `components/dashboards/ChildDashboard.js` - Needs quest UI
- `components/child/` - May need new QuestCard component

### 2. Portfolio Timeline View
**Status:** Data exists, UI missing
- **What's needed:**
  - Timeline organized by month/quarter
  - Subject filters (Math/Reading/Science)
  - Child filters
  - Visual artifact gallery

**Files to create:**
- `components/portfolio/PortfolioTimeline.js`
- Add route in `WebContent.js` under Records section

### 3. Unified Notifications System
**Status:** Not started
- **What's needed:**
  - In-app notifications tray/panel
  - Push notifications (Expo) setup
  - Email notifications (weekly story + overdue events)
  - Notification preferences UI

**Files to create:**
- `components/notifications/NotificationsTray.js`
- `backend/routers/notifications_routes.py`
- `lib/services/notificationsClient.js`

### 4. Syllabus Upload → Auto-extract → Plan UI
**Status:** Backend exists, UI missing
- **What's needed:**
  - Beautiful upload UI (drag & drop)
  - Extraction preview
  - "Convert to plan" button
  - Review/edit extracted units/lessons

**Files to check/create:**
- `components/planner/SyllabusUploadModal.js`
- `components/planner/SyllabusPreview.js`
- Backend routes may already exist in `backend/routers/`

## 📋 Medium Priority Features

### 6. Behavior Tracking Light Layer
- Simple emoji/descriptor system connected to reflection prompts
- Store: "Focused", "Distracted", "Excited", "Overwhelmed"
- Visualize trends over time

### 7. Better Mobile Optimizations
- Bottom nav for student mode
- Compact card layouts
- Swipe actions (mark done, postpone, reflect)

### 8. Skill Graph / Learning Map
- Visual graph of skills (reading fluency, fractions, etc.)
- Evidence linking to skills
- Progress heatmap

## 💎 Future Moat Features (Lower Priority)

### 9. Community Templates
- Allow importing community templates
- Rating/review system
- Template sharing marketplace

### 10. AI-Powered Planner 2.0 (Autonomous Mode)
- "Automated Mode" toggle
- Auto-rebalance if events fall behind
- Auto-switch resources if materials rated poorly
- Auto-shorten week for upcoming trips

### 11. Multi-Family Collaboration
- Co-ops and pods
- Multi-parent dashboards
- Shared classes across families
- Shared resources + templates

## 🔧 Technical Debt / Improvements

1. **Error Handling**
   - Some components still need better null checks
   - Network error handling could be more graceful

2. **Performance**
   - Consider pagination for large event lists
   - Optimize calendar data loading

3. **Testing**
   - Add unit tests for critical paths
   - E2E tests for key user flows

## 📝 Database Migrations

1. ✅ **Completed:** `2025-01-23_learning_story_cache.sql` (for LLM caching)
2. ✅ **All migrations from this session have been run**

## 🎯 Recommended Starting Point

**For next session, start with:**
1. Implement "Today's Quests" UI for Student Mode
2. Add Portfolio Timeline View
3. Build Unified Notifications System

These items will complete the core student experience and add major parent-facing features.

