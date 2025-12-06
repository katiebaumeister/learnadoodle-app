# Continue Learning Deep Linking - Visual Guide

## What It Looks Like

### 1. Course Card with Continue Button

```
┌─────────────────────────────────────────────────┐
│ 📚 Algebra Basics Course                        │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 60%   │
│                                                 │
│ ▶ Continue from Lesson 5                        │
│ 🕐 Last viewed 2 days ago                       │
│                                                 │
│ [Share] [Continue →]                            │
└─────────────────────────────────────────────────┘
```

**Features:**
- Progress bar showing completion percentage
- "Continue from Lesson X" text
- Last viewed timestamp
- Share button (opens modal)
- Continue button (opens course at resume point)

---

### 2. Share Modal (Deep Link Modal)

```
┌─────────────────────────────────────────────────┐
│ Share Course Link                          [×]  │
├─────────────────────────────────────────────────┤
│                                                 │
│ Algebra Basics Course                           │
│ for Emma                                        │
│                                                 │
│ ┌─────────────────────────────────────────┐   │
│ │        [QR CODE IMAGE]                  │   │
│ │                                         │   │
│ │      Scan to continue                   │   │
│ └─────────────────────────────────────────┘   │
│                                                 │
│ Share this link:                                │
│ ┌─────────────────────────────────────┐ [📋] │
│ │ learnadoodle.com/continue/abc123... │       │
│ └─────────────────────────────────────┘       │
│                                                 │
│ Share via:                                      │
│ [📋 Copy] [✉️ Email] [💬 Text]                 │
│                                                 │
│ [🔗 Open in App]                               │
└─────────────────────────────────────────────────┘
```

**Features:**
- QR code for easy mobile scanning
- Copyable deep link URL
- Share buttons (Email, Text, Copy)
- "Open in App" button

---

### 3. Student Dashboard - Continue Learning Strip

```
┌─────────────────────────────────────────────────┐
│ ▶ Continue Learning                             │
├─────────────────────────────────────────────────┤
│                                                 │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────┐│
│ │ 📚 Algebra   │ │ 🧪 Chemistry │ │ 📖 History││
│ │ ━━━━━━ 60%  │ │ ━━━━━━━ 30%  │ │ ━━━━━ 80% ││
│ │              │ │              │ │          ││
│ │ Continue L5  │ │ Continue L2  │ │ Continue ││
│ │ 2 days ago   │ │ 1 week ago   │ │ Today    ││
│ │ [▶]          │ │ [▶]          │ │ [▶]      ││
│ └──────────────┘ └──────────────┘ └──────────┘│
│                                                 │
└─────────────────────────────────────────────────┘
```

**Features:**
- Horizontal scrollable cards
- Progress indicators
- Quick continue buttons
- Last viewed timestamps

---

### 4. Deep Link URL Examples

#### Web URLs
```
https://app.learnadoodle.com/continue/abc-123-course-id?child=xyz-456-child-id
https://app.learnadoodle.com/course/abc-123/lesson/5?child=xyz-456
https://app.learnadoodle.com/course/abc-123/lesson/5?child=xyz-456&t=120
```

#### Mobile App Deep Links
```
learnadoodle://continue/abc-123-course-id?child=xyz-456-child-id
learnadoodle://course/abc-123/lesson/5?child=xyz-456
```

#### With Timestamp (for videos)
```
https://app.learnadoodle.com/continue/abc-123?child=xyz-456&t=754
```
(Opens YouTube video at 12:34 timestamp)

---

### 5. Integration with External Providers

#### YouTube Videos
```
Original: https://youtube.com/watch?v=abc123
With Resume: https://youtube.com/watch?v=abc123&t=754s
```
- Automatically adds `&t=754s` parameter
- Video starts at 12:34 (754 seconds)

#### Khan Academy
```
Original: https://khanacademy.org/math/algebra
With Resume: https://khanacademy.org/math/algebra/x2f8bb11595b61c86:foundation-algebra/x2f8bb11595b61c86:algebra-basics
```
- Opens specific unit/lesson page
- Student sees exact content they were on

#### Coursera
```
Original: https://coursera.org/learn/machine-learning
With Resume: https://coursera.org/learn/machine-learning/week/3
```
- Opens specific week/module
- Shows progress within that module

---

### 6. User Flows

#### Flow 1: Student Resumes Learning
```
1. Student opens app
   ↓
2. Sees "Continue Learning" section
   ↓
3. Clicks "Continue Algebra Course"
   ↓
4. App opens course at Lesson 5, timestamp 2:30
   ↓
5. Video/lesson auto-plays from that point
```

#### Flow 2: Parent Shares with Tutor
```
1. Parent views child's progress
   ↓
2. Clicks "Share" on Algebra course
   ↓
3. Modal opens with QR code and link
   ↓
4. Parent copies link or sends QR code
   ↓
5. Tutor clicks link → sees child's exact position
   ↓
6. Tutor can review and provide feedback
```

#### Flow 3: Cross-Device Sync
```
1. Student watches on tablet → stops at Lesson 3
   ↓
2. Progress syncs to cloud
   ↓
3. Later opens on phone → sees "Continue from Lesson 3"
   ↓
4. Clicks continue → resumes exactly where they left off
```

---

### 7. Technical Details

#### Database Tracking
- `course_resume_points` table stores:
  - Last lesson ID
  - Timestamp position (for videos)
  - Progress percentage
  - Last viewed date

#### API Endpoints
- `GET /api/external/courses/{id}/resume` - Get resume point
- `POST /api/external/courses/{id}/resume` - Update resume point
- `POST /api/external/courses/{id}/deep-link` - Generate shareable link

#### Frontend Components
- `ContinueLearningButton` - Shows progress and continue button
- `DeepLinkModal` - Share modal with QR code
- `ContinueLearningStrip` - Dashboard strip (already exists, enhanced)

---

## Benefits

✅ **Seamless Learning** - No need to remember where you left off  
✅ **Easy Sharing** - Tutors/parents can see exact progress  
✅ **Cross-Device** - Works on any device  
✅ **Progress Tracking** - Visual indicators of completion  
✅ **Time Saving** - Jump directly to relevant content  
✅ **QR Codes** - Easy mobile sharing without typing URLs

---

## Implementation Status

✅ **Documentation** - Complete  
✅ **Frontend Components** - Created (`ContinueLearningButton`, `DeepLinkModal`)  
⏳ **Backend API** - Needs implementation  
⏳ **Database Schema** - Needs migration  
⏳ **URL Routing** - Needs implementation  
⏳ **External Provider Integration** - Needs enhancement

