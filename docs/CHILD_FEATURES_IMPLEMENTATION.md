# Child Features Implementation

## ✅ Completed Components

### 1. One-Tap Submit Button (`components/child/OneTapSubmitButton.js`)
**Purpose**: Simplified submit button for assignment cards in child view

**Features**:
- Shows "Submit" button for assignments not yet submitted
- Shows status badge (Approved/Needs Revision/Submitted) for completed assignments
- Opens `QuickSubmitModal` for photo/video upload
- One-tap submission flow

**Usage**:
```javascript
<OneTapSubmitButton
  assignment={assignment}
  childId={childId}
  familyId={familyId}
  onSubmitted={(assignmentId, evidenceId) => {
    // Handle submission success
  }}
/>
```

### 2. Ask for Help Modal (`components/child/AskForHelpModal.js`)
**Purpose**: Child can request help on assignments, subjects, or general questions

**Features**:
- Quick chips for common issues:
  - Too easy
  - Too hard
  - Confusing
  - Bored
  - Need example
  - Stuck
- Optional note field
- Optional photo upload
- Stores in `assignment_comments` table (if assignment provided)
- Creates help request event (if no assignment)

**Usage**:
```javascript
<AskForHelpModal
  visible={showHelpModal}
  onClose={() => setShowHelpModal(false)}
  assignment={assignment} // Optional
  subject={subject} // Optional
  childId={childId}
  familyId={familyId}
  onHelpRequested={(data) => {
    // Handle help request
  }}
/>
```

**Storage**:
- If assignment: Toggles `need_help` flag + creates `assignment_comments` entry
- If no assignment: Creates event with `source='help_request'`

### 3. Reflection Prompts (`components/child/ReflectionPrompts.js`)
**Purpose**: Prompts child to reflect after assignment submission

**Features**:
- "How did it feel?" - Emoji scale (5 options: Great → Very hard)
- "What did you learn?" - One-line text input
- "What would you do differently?" - Optional text input
- Stores in `assignment_comments` with `comment_type='reflection'`

**Usage**:
```javascript
<ReflectionPrompts
  assignment={assignment}
  childId={childId}
  familyId={familyId}
  onComplete={(reflection) => {
    // reflection = { feeling, learned, different } or null if skipped
  }}
/>
```

**Integration**:
- `QuickSubmitModal` can show reflection prompts after successful submission
- Pass `showReflection={true}` prop to enable

### 4. Enhanced QuickSubmitModal
**Updates**:
- Added `showReflection` prop
- Shows `ReflectionPrompts` after successful submission (if enabled)
- Removed alert on web (let parent handle success)

## 📋 Integration Points

### Assignment Cards (Child View)
```javascript
import OneTapSubmitButton from '../child/OneTapSubmitButton';
import AskForHelpModal from '../child/AskForHelpModal';

// In assignment card:
<OneTapSubmitButton
  assignment={assignment}
  childId={session.child_id}
  familyId={session.family_id}
  onSubmitted={handleSubmission}
/>

<TouchableOpacity onPress={() => setShowHelp(true)}>
  <Text>Ask for Help</Text>
</TouchableOpacity>

<AskForHelpModal
  visible={showHelp}
  assignment={assignment}
  childId={session.child_id}
  familyId={session.family_id}
  onClose={() => setShowHelp(false)}
/>
```

### After Submission
```javascript
<QuickSubmitModal
  visible={showSubmit}
  assignment={assignment}
  childId={childId}
  familyId={familyId}
  showReflection={true} // Enable reflection prompts
  onSubmitted={(assignmentId, evidenceId, reflection) => {
    // Handle submission + reflection
  }}
/>
```

## 🗄️ Database Schema Used

### assignments table
- `status`: 'not_started' | 'in_progress' | 'submitted' | 'reviewed' | 'accepted'
- `review_status`: 'pending' | 'approved' | 'needs_revision' | 'rejected'
- `need_help`: boolean
- `submission_media`: jsonb array of {type, url, thumbnail}

### assignment_comments table
- `comment_type`: 'feedback' | 'question' | 'clarification' | 'praise' | 'reflection'
- `comment_text`: text
- `is_internal`: boolean

### events table
- `source`: 'help_request' (for general help requests)

### materials table
- Stores uploaded photos/videos via `createFileMaterial()`

## 🎯 Next Steps

1. **Create Child Home Screen** - Use these components
2. **Create Child Assignments Screen** - List with one-tap submit
3. **Integrate into existing assignment views** - Add buttons to assignment cards
4. **Parent Review Inbox** - Show submissions + help requests

## 🧪 Testing Checklist

- [ ] One-tap submit uploads photo/video
- [ ] One-tap submit creates material record
- [ ] One-tap submit updates assignment status
- [ ] Ask for Help toggles need_help flag
- [ ] Ask for Help creates assignment_comment
- [ ] Ask for Help creates event (if no assignment)
- [ ] Reflection prompts save to assignment_comments
- [ ] Reflection prompts show after submission (if enabled)
- [ ] All components work in child role context
