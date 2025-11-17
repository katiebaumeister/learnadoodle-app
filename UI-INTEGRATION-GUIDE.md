# 🎨 UI Component Integration Guide

## 🚀 **Step 3: Test UI Components in Your App**

### **1. Integration Checklist**

All UI components are ready to use! Here's how to integrate them:

#### **✅ Already Integrated:**
- **ScheduleRulesButton** - Added to `WebContent.js`
- **PlannerButton** - Added to `WebContent.js`

#### **🔄 Components Ready for Integration:**

### **2. Component Integration Examples**

#### **A. Add RescheduleBanner to Event Views**
```javascript
// In your event detail view or calendar component
import RescheduleBanner from '../components/RescheduleBanner';

const EventDetailView = ({ event }) => {
  const [showReschedule, setShowReschedule] = useState(false);

  // Show banner if event is skipped
  if (event.status === 'skipped') {
    return (
      <View>
        <RescheduleBanner
          skippedEvent={event}
          onRescheduled={(rescheduledEvent) => {
            // Update UI with rescheduled event
            setShowReschedule(false);
          }}
          onDismiss={() => setShowReschedule(false)}
        />
        {/* Your existing event detail content */}
      </View>
    );
  }

  return (
    <View>
      {/* Your existing event detail content */}
    </View>
  );
};
```

#### **B. Add UndoToast to Event Management**
```javascript
// In your event creation/editing component
import UndoToast from '../components/UndoToast';

const EventManager = () => {
  const [undoToast, setUndoToast] = useState({
    visible: false,
    message: '',
    eventId: null,
    userId: null
  });

  const handleEventChange = async (eventData) => {
    try {
      // Save event
      const result = await saveEvent(eventData);
      
      // Show undo toast
      setUndoToast({
        visible: true,
        message: 'Event saved successfully',
        eventId: result.id,
        userId: currentUser.id
      });
    } catch (error) {
      console.error('Error saving event:', error);
    }
  };

  return (
    <View>
      {/* Your existing event form */}
      
      <UndoToast
        visible={undoToast.visible}
        message={undoToast.message}
        eventId={undoToast.eventId}
        userId={undoToast.userId}
        onUndo={(restoredEvent) => {
          // Update UI with restored event
          setUndoToast({ visible: false, message: '', eventId: null, userId: null });
        }}
        onDismiss={() => setUndoToast({ visible: false, message: '', eventId: null, userId: null })}
      />
    </View>
  );
};
```

#### **C. Add ConflictBubble to Planner**
```javascript
// In your planner or event creation component
import ConflictBubble from '../components/ConflictBubble';

const PlannerView = () => {
  const [conflicts, setConflicts] = useState([]);

  const checkForConflicts = async (proposedEvent) => {
    // Call your conflict detection API
    const conflicts = await detectConflicts(proposedEvent);
    setConflicts(conflicts);
  };

  const resolveConflict = (conflict) => {
    setConflicts(prev => prev.filter(c => c.id !== conflict.id));
  };

  return (
    <View>
      {/* Your existing planner content */}
      
      {conflicts.map(conflict => (
        <ConflictBubble
          key={conflict.id}
          conflict={conflict}
          onResolve={resolveConflict}
          onDismiss={resolveConflict}
        />
      ))}
    </View>
  );
};
```

#### **D. Add SubjectGoalsManager to Settings**
```javascript
// In your settings or profile component
import SubjectGoalsManager from '../components/SubjectGoalsManager';

const SettingsView = () => {
  const [showGoalsManager, setShowGoalsManager] = useState(false);

  return (
    <View>
      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => setShowGoalsManager(true)}
      >
        <Text>Manage Learning Goals</Text>
      </TouchableOpacity>

      <SubjectGoalsManager
        visible={showGoalsManager}
        onClose={() => setShowGoalsManager(false)}
        childId={selectedChild?.id}
        familyId={familyId}
      />
    </View>
  );
};
```

#### **E. Add AttendanceDashboard to Progress View**
```javascript
// In your progress or reports section
import AttendanceDashboard from '../components/AttendanceDashboard';

const ProgressView = () => {
  const [showAttendance, setShowAttendance] = useState(false);

  return (
    <View>
      <TouchableOpacity
        style={styles.progressButton}
        onPress={() => setShowAttendance(true)}
      >
        <Text>View Attendance Report</Text>
      </TouchableOpacity>

      <AttendanceDashboard
        visible={showAttendance}
        onClose={() => setShowAttendance(false)}
        childId={selectedChild?.id}
        familyId={familyId}
      />
    </View>
  );
};
```

#### **F. Add NotificationSettings to User Profile**
```javascript
// In your user profile or settings component
import NotificationSettings from '../components/NotificationSettings';

const ProfileView = () => {
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);

  return (
    <View>
      <TouchableOpacity
        style={styles.notificationButton}
        onPress={() => setShowNotificationSettings(true)}
      >
        <Text>Notification Settings</Text>
      </TouchableOpacity>

      <NotificationSettings
        visible={showNotificationSettings}
        onClose={() => setShowNotificationSettings(false)}
        userId={currentUser.id}
        familyId={familyId}
      />
    </View>
  );
};
```

### **3. Testing Each Component**

#### **Test RescheduleBanner:**
1. Create an event with status 'skipped'
2. Verify banner appears
3. Click "Reschedule" button
4. Verify event moves to next available slot

#### **Test UndoToast:**
1. Make any event change (create, edit, delete)
2. Verify undo toast appears for 5 seconds
3. Click "Undo" within 5 seconds
4. Verify change is reverted

#### **Test ConflictBubble:**
1. Try to schedule an event during off hours
2. Verify conflict bubble appears
3. Try "Quick Fix" and "Move to Valid Slot" buttons
4. Verify conflicts are resolved

#### **Test SubjectGoalsManager:**
1. Open the goals manager
2. Add a new weekly goal
3. Add backlog items
4. Verify goals appear in planner

#### **Test AttendanceDashboard:**
1. Complete some events
2. Open attendance dashboard
3. Verify progress tracking works
4. Test export functionality

#### **Test NotificationSettings:**
1. Open notification settings
2. Toggle different notification types
3. Set quiet hours
4. Save settings

### **4. Component Styling Integration**

All components use consistent styling that matches your app's theme:

```javascript
// Example: Customize component styles
const customStyles = StyleSheet.create({
  customButton: {
    backgroundColor: '#your-brand-color',
    borderRadius: 8,
    padding: 12,
  },
  customText: {
    color: '#your-text-color',
    fontSize: 16,
  },
});

// Pass custom styles to components
<RescheduleBanner 
  style={customStyles.customButton}
  // ... other props
/>
```

### **5. State Management Integration**

Components are designed to work with your existing state management:

```javascript
// Example: Integration with Redux/Context
const EventManager = () => {
  const { events, updateEvent, deleteEvent } = useEventContext();
  
  const handleEventChange = (eventData) => {
    updateEvent(eventData);
    
    // Show undo toast
    setUndoToast({
      visible: true,
      message: 'Event updated',
      eventId: eventData.id,
      userId: currentUser.id
    });
  };

  return (
    <View>
      {/* Your existing event management UI */}
      <UndoToast {...undoToast} />
    </View>
  );
};
```

### **6. API Integration**

Components automatically use your Supabase configuration:

```javascript
// Components will use your existing Supabase setup
import { supabase } from '../lib/supabase';

// No additional configuration needed - components use the same instance
```

### **7. Error Handling**

All components include built-in error handling:

```javascript
// Components handle errors gracefully
const handleComponentError = (error) => {
  console.error('Component error:', error);
  // Show user-friendly error message
  Alert.alert('Error', 'Something went wrong. Please try again.');
};
```

## ✅ **Testing Checklist:**

- [ ] All components load without errors
- [ ] RescheduleBanner appears for skipped events
- [ ] UndoToast shows after event changes
- [ ] ConflictBubble detects rule violations
- [ ] SubjectGoalsManager saves goals correctly
- [ ] AttendanceDashboard shows progress data
- [ ] NotificationSettings saves preferences
- [ ] All components respect user permissions
- [ ] Error states are handled gracefully
- [ ] Components work on both web and mobile

## 🚀 **Next Steps:**

1. **Test each component** individually
2. **Integrate with your existing UI** 
3. **Customize styling** to match your brand
4. **Add error boundaries** for production
5. **Test on different devices** and screen sizes

Your UI components are ready for production! 🎉
