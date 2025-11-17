# Year Planning - Quick Start Guide

## ✅ What's Done

1. **Database migrations** - All SQL files created and run
2. **Backend API** - FastAPI routes ready at `/api/year/*`
3. **UI Wizard** - Multi-step wizard component created
4. **Integration** - Wizard added to PlannerWeek component

## 🚀 How to Test

### Step 1: Enable Feature Flag

Add to your `.env` file or environment:
```bash
REACT_APP_YEAR_PLANS_V1=true
```

### Step 2: Start Backend Server

Make sure your FastAPI backend is running:
```bash
cd backend
python -m uvicorn main:app --reload
```

### Step 3: Access the Wizard

The wizard is integrated into PlannerWeek. To test it:

**Option A: Add a test button (temporary)**
Add this to PlannerWeek's render (around line 623, before the grid):

```javascript
{/* Temporary test button - remove after testing */}
<TouchableOpacity
  onPress={() => setShowYearWizard(true)}
  style={{
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1000,
    backgroundColor: colors.accent,
    padding: 12,
    borderRadius: 8,
  }}
>
  <Text style={{ color: 'white', fontWeight: '600' }}>Plan Year</Text>
</TouchableOpacity>
```

**Option B: Use AIActions menu**
If AIActions is rendered somewhere in your Planner, it will show "Plan the Year" option when the feature flag is enabled.

### Step 4: Test the Wizard

1. Click the button/menu item to open the wizard
2. **Step 1**: Select students and scope (current/next/custom)
3. **Step 2**: Set dates and add breaks
4. **Step 3**: Add subjects and set weekly targets per child
5. **Step 4**: Review auto-generated milestones
6. **Step 5**: Review and create

## 🔍 Verify It Works

After creating a plan, check the database:

```sql
SELECT * FROM year_plans ORDER BY created_at DESC LIMIT 1;
SELECT * FROM year_plan_children WHERE year_plan_id = '<id from above>';
SELECT * FROM term_milestones WHERE year_plan_id = '<id from above>' LIMIT 5;
```

## 🐛 Troubleshooting

### Wizard doesn't appear
- Check feature flag: `REACT_APP_YEAR_PLANS_V1=true`
- Check browser console for errors
- Verify backend is running on correct port

### "Feature Disabled" alert
- Feature flag not set or set to false
- Check environment variables are loaded

### API errors
- Verify backend server is running
- Check network tab for API calls to `/api/year/*`
- Verify Supabase connection in backend

### Database errors
- Verify all migrations ran successfully
- Check RLS policies allow your user to access data
- Verify family_id matches your user's family

## 📝 Next Steps

1. **Add proper entry points** - Integrate into PlannerWeek header/toolbar
2. **Test end-to-end** - Create a plan and verify data
3. **Add error handling** - Test error cases
4. **Implement remaining chunks** - Heatmap, Rebalance, Blackout sync

## 📚 Files Created

- `2025-11-13_*.sql` - Database migrations
- `backend/routers/year_routes.py` - API routes
- `lib/types/year.js` - Type definitions
- `lib/services/yearClient.js` - API client
- `components/year/PlanYearWizard.js` - UI wizard
- Updated `components/planner/AIActions.js` - Added Plan Year option
- Updated `components/planner/PlannerWeek.js` - Integrated wizard

## 🎯 What's Next

See `YEAR-PLANNING-IMPLEMENTATION.md` for:
- Chunk E: Heatmap Visualization
- Chunk F: Rebalance functionality
- Chunk G: Blackout sync

