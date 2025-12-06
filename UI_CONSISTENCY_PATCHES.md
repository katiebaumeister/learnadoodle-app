# UI Consistency Patches
## Example Updates for Representative Pages

This document shows how to update pages to use the new unified design system components.

---

## Patch 1: IntelligenceHub.js

### Changes:
1. Replace custom header with `PageHeader`
2. Replace custom tabs with unified `TabBar`
3. Use `AppContainer` for content
4. Use `SectionHeader` for section titles
5. Use `Card` component for analytics cards
6. Use `EmptyState` for empty states

### Code Changes:

```javascript
// Add imports at top
import PageHeader from '../ui/PageHeader';
import TabBar from '../ui/TabBar';
import AppContainer from '../ui/AppContainer';
import SectionHeader from '../ui/SectionHeader';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';

// Replace header section (lines 344-353)
<PageHeader
  title="Intelligence Hub"
  subtitle="AI-powered planning, analytics, and insights"
  icon={Brain}
  iconColor={colors.indigo}
/>

// Replace tabs section (lines 443-526)
<TabBar
  tabs={[
    { id: 'planner', label: 'Planner AI', icon: Calendar },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'insights', label: 'Insights', icon: Lightbulb },
    { id: 'forecasting', label: 'Forecasting', icon: TrendingUp },
    { id: 'coach', label: 'Coach', icon: UserCircle },
    { id: 'advanced-insights', label: 'Advanced Insights', icon: Layers },
    { id: 'templates', label: 'Templates', icon: BookOpen },
    { id: 'workload', label: 'Workload', icon: BarChart3 },
    { id: 'reviews', label: 'Reviews', icon: RotateCcw },
  ]}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>

// Wrap content in AppContainer (line 529)
<AppContainer paddingVertical={20}>
  <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
    {/* existing content */}
  </ScrollView>
</AppContainer>

// Update section titles (line 687, 1084, etc.)
<SectionHeader
  title="Planner AI"
  icon={Sparkles}
/>

// Update analytics cards (lines 890-1000)
<Card variant="elevated" padding="base">
  <SectionHeader
    title="Curriculum Heatmap"
    icon={BarChart3}
    iconColor={colors.indigo}
  />
  <View style={styles.cardContent}>
    {/* content */}
  </View>
</Card>

// Update empty states (lines 1086-1103)
<EmptyState
  icon={Lightbulb}
  title="No insights yet"
  description="Insights will appear here as you use the platform"
  size="default"
/>
```

### Style Updates:

Remove these styles (now handled by components):
- `header`, `headerContent`, `headerTitle`, `headerSubtitle`
- `tabs`, `tab`, `tabActive`, `tabLabel`, `tabLabelActive`
- `sectionTitle` (use SectionHeader instead)
- `analyticsCard` (use Card component)
- `emptyState`, `emptyText`, `emptySubtext` (use EmptyState component)

---

## Patch 2: WebRecordsScreen.js

### Changes:
1. Add `PageHeader` (if needed, or keep UnifiedRecordsTopBar)
2. Use `AppContainer` for content sections
3. Use `Card` for child summary cards
4. Use `EmptyState` for loading/error states

### Code Changes:

```javascript
// Add imports
import AppContainer from '../ui/AppContainer';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';

// Update content wrapper (line 415)
<AppContainer fullWidth noPadding>
  <View style={styles.content}>
    {/* existing two-column layout */}
  </View>
</AppContainer>

// Update loading container (lines 346-350)
<EmptyState
  icon={ActivityIndicator}
  title="Loading records..."
  size="small"
/>

// Update child summary cards to use Card component
// (in ChildSummaryCard component or wherever cards are rendered)
<Card variant="default" padding="base">
  {/* card content */}
</Card>
```

---

## Patch 3: UnifiedRecordsTopBar.js

### Changes:
1. Replace custom tab implementation with `TabBar` component
2. Standardize chip styles
3. Use consistent spacing

### Code Changes:

```javascript
// Add import
import TabBar from '../ui/TabBar';

// Replace tabs section (lines 213-236)
<TabBar
  tabs={TABS.map(tab => ({
    id: tab.id,
    label: tab.label,
    icon: tab.icon,
  }))}
  activeTab={activeTab}
  onTabChange={onTabChange}
  containerStyle={styles.tabBarContainer}
/>

// Update styles - remove tab-related styles, keep container styles
const styles = StyleSheet.create({
  // ... existing styles ...
  tabBarContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  // Remove: tab, tabActive, tabLabel, tabLabelActive
});
```

---

## Patch 4: RecordsTabBar.js

### Complete Replacement:

This file can be deleted and replaced with `TabBar` usage:

```javascript
// In parent component (e.g., WebRecordsScreen.js)
import TabBar from '../ui/TabBar';

// Replace RecordsTabBar usage with:
<TabBar
  tabs={[
    { id: 'compliance', label: 'Compliance', icon: Shield },
    { id: 'transcripts', label: 'Transcripts & Credits', icon: GraduationCap },
    { id: 'gradebook', label: 'Gradebook & Mastery', icon: Calculator },
    { id: 'portfolio', label: 'Portfolio & Evidence', icon: FileText },
    { id: 'attendance', label: 'Attendance & Logs', icon: Clock },
    { id: 'courses', label: 'Courses & Syllabi', icon: BookOpen },
    { id: 'notes', label: 'Notes', icon: StickyNote },
  ]}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

---

## Patch 5: Dropdown Updates

### Example: AIActions.js

Replace custom dropdown with `Dropdown` component:

```javascript
// Add imports
import Dropdown, { DropdownItem } from '../ui/Dropdown';

// Replace menu implementation (lines 27-298)
const [showMenu, setShowMenu] = useState(false);
const buttonRef = useRef(null);

// In render:
<TouchableOpacity
  ref={buttonRef}
  style={styles.button}
  onPress={() => setShowMenu(!showMenu)}
>
  {/* button content */}
</TouchableOpacity>

<Dropdown
  visible={showMenu}
  triggerRef={buttonRef}
  onClose={() => setShowMenu(false)}
  placement="bottom-start"
>
  <DropdownItem
    icon={Calendar}
    label="Plan My Week"
    onPress={() => {
      onPackThisWeek();
      setShowMenu(false);
    }}
  />
  <DropdownItem
    icon={Package}
    label="Pack Week"
    onPress={() => {
      onPackThisWeek();
      setShowMenu(false);
    }}
  />
  {/* more items */}
</Dropdown>
```

---

## Patch 6: HomePage.js (if applicable)

### Changes:
1. Use `AppContainer` for main content
2. Use `Card` for all card components
3. Use `SectionHeader` for section titles
4. Standardize spacing

### Code Changes:

```javascript
// Add imports
import AppContainer from '../ui/AppContainer';
import Card from '../ui/Card';
import SectionHeader from '../ui/SectionHeader';

// Wrap main content
<AppContainer>
  <View style={styles.homeContentContainer}>
    {/* existing content */}
  </View>
</AppContainer>

// Update section headers
<SectionHeader
  title="Today's Learning"
  icon={Clock}
/>

// Update cards to use Card component
<Card variant="default" padding="base">
  {/* card content */}
</Card>
```

---

## Migration Checklist

For each page/component:

- [ ] Replace custom header with `PageHeader`
- [ ] Replace custom section headers with `SectionHeader`
- [ ] Replace custom tabs with `TabBar`
- [ ] Wrap content in `AppContainer`
- [ ] Replace custom cards with `Card` component
- [ ] Replace custom empty states with `EmptyState`
- [ ] Replace custom dropdowns with `Dropdown`
- [ ] Remove duplicate styles now handled by components
- [ ] Test on mobile and desktop
- [ ] Verify spacing is consistent
- [ ] Check dropdown boundary detection works

---

## Testing Notes

1. **Visual Regression**: Compare before/after screenshots
2. **Responsive**: Test on mobile (375px), tablet (768px), desktop (1280px+)
3. **Dropdowns**: Test near viewport edges
4. **Tabs**: Test horizontal scrolling on mobile
5. **Empty States**: Verify all empty states look consistent
6. **Cards**: Verify all cards have same radius, padding, shadows

---

## Rollout Strategy

1. **Phase 1**: Update shared components (DONE)
2. **Phase 2**: Update IntelligenceHub (highest visibility)
3. **Phase 3**: Update Records screens
4. **Phase 4**: Update Home and other major pages
5. **Phase 5**: Update remaining pages incrementally
6. **Phase 6**: Remove old duplicate components

