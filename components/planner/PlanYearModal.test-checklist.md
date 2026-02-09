# PlanYearModal Smoke Test Checklist

## Basic Functionality
- [ ] Modal opens when "Plan My Year" is clicked
- [ ] Modal closes when X button is clicked
- [ ] Modal closes when "Skip for now" is clicked

## Non-Homeschool Fast Path
- [ ] Detects non-homeschool families correctly
- [ ] Shows default year message (Aug 15 - Jun 15)
- [ ] "Follow public holidays" toggle works
- [ ] Country/region chip appears when toggle is ON
- [ ] Country/region chip is hidden when toggle is OFF
- [ ] Chip shows correct label: "United States · National" or "United States · CA"
- [ ] Tapping chip opens HolidayPicker modal
- [ ] "Resync holidays" button appears when year exists
- [ ] Save button works

## Homeschool Constraint Solver
- [ ] Detects homeschool families correctly
- [ ] Mode selection works (Fixed End / Target Days / Target Hours)
- [ ] Start date input works
- [ ] End date input appears in FIXED_END mode
- [ ] Target days input appears in TARGET_DAYS mode
- [ ] Target hours + hours per day inputs appear in TARGET_HOURS mode
- [ ] Weekday chips work (can toggle Mon-Sun)
- [ ] "Follow public holidays" toggle works
- [ ] Country/region chip appears when toggle is ON
- [ ] Custom holidays can be added
- [ ] Custom holidays can be removed
- [ ] Recalculation triggers on input change (debounced)
- [ ] Calculated results display correctly
- [ ] Save button works

## Holiday Picker
- [ ] Opens when country/region chip is tapped
- [ ] Search input filters countries
- [ ] Top countries section shows (US, CA, GB, AU, NZ)
- [ ] All countries section shows A-Z list
- [ ] Country selection works
- [ ] Region section appears for countries with subdivisions (US, CA, AU)
- [ ] Region section is collapsible
- [ ] Region search filters subdivisions
- [ ] "National (no region)" option works
- [ ] "Use these holidays" button applies selection
- [ ] "Cancel" button closes without applying
- [ ] Selection triggers recalculation (for homeschool path)

## Integration
- [ ] Country/region selection updates form state
- [ ] Recalculation includes selected country/region
- [ ] Save includes country/region in holiday_settings
- [ ] "Resync holidays" button syncs global holidays
- [ ] Sync only happens on Save (not on selection change)
- [ ] Explicit "Resync holidays" button works

## Edge Cases
- [ ] Works when no countries are loaded (fallback)
- [ ] Works when API is down (graceful degradation)
- [ ] Handles invalid date inputs gracefully
- [ ] Handles missing required fields gracefully
