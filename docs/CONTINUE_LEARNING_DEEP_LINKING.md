# Continue Learning Deep Linking Feature

## Overview
Deep linking enables users to create shareable URLs that take students directly to their current position in a course, making it easy to resume learning and share progress with tutors/parents.

## User Experience

### 1. **"Continue Learning" Button**
- Appears on course cards and in the student dashboard
- Shows: "Continue from Lesson 5" or "Resume: Algebra Basics"
- Clicking opens the course at the exact lesson where they left off

### 2. **Shareable Deep Links**
- Format: `https://app.learnadoodle.com/continue/{courseId}?child={childId}`
- Or: `https://app.learnadoodle.com/course/{courseId}/lesson/{lessonId}?child={childId}`
- Can be copied, shared via email/text, or bookmarked
- Works across devices (web, mobile app)

### 3. **Smart Resume Logic**
- Tracks last viewed lesson per child per course
- For YouTube videos: Remembers timestamp position
- For Khan Academy: Remembers unit/lesson
- For Coursera: Remembers module/week
- Shows progress indicator: "You're 60% through this course"

### 4. **Visual Indicators**
- Progress bar on course cards
- "Last viewed: 2 days ago" timestamp
- "Continue" badge on incomplete courses
- Quick access from home screen

## Technical Implementation

### Database Schema
```sql
-- Add to external_lesson_progress or create new table
CREATE TABLE course_resume_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES family(id),
  child_id uuid NOT NULL REFERENCES children(id),
  course_id uuid NOT NULL, -- external_course_id or family_youtube_item_id
  course_type text NOT NULL, -- 'youtube', 'khan_academy', 'coursera', 'general'
  last_lesson_id uuid, -- external_lesson_id or family_youtube_lesson_id
  last_position_seconds integer, -- For video timestamps
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  progress_percentage numeric(5,2), -- 0-100
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(child_id, course_id)
);
```

### API Endpoints

#### 1. Get Resume Point
```
GET /api/external/courses/{courseId}/resume?child_id={childId}
Returns: {
  lesson_id: "uuid",
  position_seconds: 120,
  progress_percentage: 45.5,
  last_viewed_at: "2025-01-24T10:30:00Z"
}
```

#### 2. Update Resume Point
```
POST /api/external/courses/{courseId}/resume
Body: {
  child_id: "uuid",
  lesson_id: "uuid",
  position_seconds: 180,
  progress_percentage: 50.0
}
```

#### 3. Generate Deep Link
```
POST /api/external/courses/{courseId}/deep-link
Body: {
  child_id: "uuid",
  lesson_id: "uuid" (optional)
}
Returns: {
  deep_link: "https://app.learnadoodle.com/continue/{courseId}?child={childId}",
  qr_code_url: "https://api.qrserver.com/v1/create-qr-code/?data={url}",
  share_text: "Continue learning Algebra: https://..."
}
```

### Frontend Components

#### 1. ContinueLearningButton Component
```jsx
<ContinueLearningButton 
  courseId={course.id}
  childId={childId}
  courseType="youtube"
  onContinue={(link) => window.open(link)}
/>
```

Features:
- Shows "Continue from Lesson X" or "Start Course"
- Progress indicator
- "Share" button to copy deep link
- QR code for mobile sharing

#### 2. DeepLinkModal Component
```jsx
<DeepLinkModal
  visible={showModal}
  courseId={course.id}
  childId={childId}
  onClose={() => setShowModal(false)}
/>
```

Features:
- Copyable deep link URL
- QR code display
- Share buttons (email, text, copy)
- "Open in app" button

#### 3. Enhanced ContinueLearningStrip
- Shows multiple courses with resume points
- Quick "Continue" buttons
- Progress bars
- "Share" icons for each course

### URL Routing

#### Web Routes
- `/continue/{courseId}` - Auto-resumes at last position
- `/course/{courseId}` - Course overview
- `/course/{courseId}/lesson/{lessonId}` - Specific lesson
- `/course/{courseId}/lesson/{lessonId}?t=120` - Lesson at timestamp

#### Mobile App Deep Links
- `learnadoodle://continue/{courseId}?child={childId}`
- `learnadoodle://course/{courseId}/lesson/{lessonId}`

### Integration Points

1. **YouTube Videos**
   - Track: `?t=120` timestamp parameter
   - Resume: Opens video at exact second
   - Example: `https://youtube.com/watch?v=abc123&t=120`

2. **Khan Academy**
   - Track: Unit slug + lesson slug
   - Resume: Opens specific lesson page
   - Example: `https://khanacademy.org/math/algebra/x2f8bb11595b61c86:foundation-algebra/x2f8bb11595b61c86:algebra-basics`

3. **Coursera**
   - Track: Course slug + module/week
   - Resume: Opens specific module
   - Example: `https://coursera.org/learn/machine-learning/week/3`

4. **General Courses**
   - Track: Lesson ordinal position
   - Resume: Opens lesson by index
   - Uses internal lesson navigation

## User Flows

### Flow 1: Student Resumes Learning
1. Student opens app → sees "Continue Learning" section
2. Clicks "Continue Algebra Course"
3. App opens course at Lesson 5, timestamp 2:30
4. Video/lesson auto-plays from that point

### Flow 2: Parent Shares with Tutor
1. Parent views child's progress
2. Clicks "Share" on Algebra course
3. Copies deep link: `learnadoodle.com/continue/abc123?child=xyz`
4. Sends to tutor via email/text
5. Tutor clicks link → sees child's exact position
6. Can review progress and provide feedback

### Flow 3: Cross-Device Sync
1. Student watches on tablet → stops at Lesson 3
2. Later opens on phone → sees "Continue from Lesson 3"
3. Clicks continue → resumes exactly where they left off
4. Progress syncs across all devices

## Visual Design

### Course Card with Resume
```
┌─────────────────────────────────────┐
│ 📚 Algebra Basics                   │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 60% │
│ Continue from: Lesson 5             │
│ Last viewed: 2 days ago             │
│ [Continue] [Share]                  │
└─────────────────────────────────────┘
```

### Deep Link Share Modal
```
┌─────────────────────────────────────┐
│ Share Course Link                   │
│                                     │
│ [QR Code Image]                     │
│                                     │
│ learnadoodle.com/continue/abc123    │
│ [Copy Link]                         │
│                                     │
│ [Email] [Text] [Copy]               │
└─────────────────────────────────────┘
```

## Benefits

1. **Seamless Learning**: No need to remember where you left off
2. **Easy Sharing**: Tutors/parents can see exact progress
3. **Cross-Device**: Works on any device
4. **Progress Tracking**: Visual indicators of completion
5. **Time Saving**: Jump directly to relevant content

## Implementation Priority

1. ✅ Database schema for resume points
2. ✅ API endpoints for resume tracking
3. ✅ Frontend components (ContinueLearningButton, DeepLinkModal)
4. ✅ URL routing and deep link handling
5. ✅ Integration with external providers (YouTube, Khan Academy, etc.)
6. ✅ QR code generation for easy sharing
7. ✅ Mobile app deep link support

