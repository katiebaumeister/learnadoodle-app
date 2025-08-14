# Max and Lilly Demo Data Setup

This document explains how to set up and use the demo data for Max and Lilly to showcase your app's calendar, progress tracking, and analytics features.

## What's Included

The demo data creates a complete family setup with:

### Family Structure
- **Baumeister Family** - A complete family unit
- **Max** - 4th Grade student (born 2015-03-15)
- **Lilly** - 2nd Grade student (born 2017-08-22)

### Academic Year
- **2024-2025 School Year** (August 26, 2024 - June 6, 2025)
- 180 total school days
- 6 hours per day
- Monday-Friday schedule

### Subjects and Curriculum
**Max (4th Grade):**
- Mathematics - Fractions, decimals, problem solving
- Science - Earth science and experiments
- Language Arts - Reading comprehension and writing

**Lilly (2nd Grade):**
- Mathematics - Addition, subtraction, place value
- Reading - Phonics and early reading skills
- Art - Creative expression and basic techniques

### Sample Data
- **Lessons** - 8 sample lessons across the first week
- **Attendance** - Complete first week attendance records
- **Holidays** - Major US holidays throughout the year
- **Class Day Mappings** - Calendar structure for the first few weeks

## How to Set Up

### Option 1: Simple Setup (Recommended)
1. Go to your Supabase dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `run-demo-seed-simple.sql`
4. Run the script

### Option 2: Full Setup with Progress Tracking
1. Run `run-demo-seed-simple.sql` first
2. Then run the additional progress tracking sections from `run-demo-seed.sql`

## Demo Scenarios

### 1. Calendar Updates and Schedule Management
**Show how to:**
- View the current academic calendar
- Add new lessons or activities
- Modify existing schedules
- Handle holidays and vacation days
- Update class day mappings

**Key Tables:**
- `calendar_days`
- `class_day_mappings`
- `lessons`
- `holidays`

### 2. Progress Tracking
**Show how to:**
- Track daily attendance
- Monitor subject progress
- Record learning activities
- Assess student performance
- Set and track learning goals

**Key Tables:**
- `attendance`
- `learning_progress`
- `learning_activities`
- `learning_assessments`
- `learning_goals`

### 3. Analytics and Reporting
**Show how to:**
- Generate attendance reports
- Analyze progress trends
- Compare performance across subjects
- Track time spent on activities
- Monitor goal completion

**Sample Queries:**
```sql
-- Attendance summary by child
SELECT 
    c.first_name,
    COUNT(*) as total_days,
    SUM(CASE WHEN a.attended THEN 1 ELSE 0 END) as days_attended,
    ROUND((SUM(CASE WHEN a.attended THEN 1 ELSE 0 END)::DECIMAL / COUNT(*)) * 100, 2) as attendance_rate
FROM children c
JOIN attendance a ON c.id = a.child_id
GROUP BY c.id, c.first_name;

-- Progress by subject for Max
SELECT 
    subject_name,
    AVG(progress_percentage) as avg_progress,
    COUNT(*) as assessments_count
FROM learning_progress
WHERE child_id = '550e8400-e29b-41d4-a716-446655440002'
GROUP BY subject_name;
```

## Demo Tips

### Calendar Demo
1. **Start with the current view** - Show the August 26-30 week
2. **Add a new lesson** - Demonstrate adding a lesson for next week
3. **Handle a holiday** - Show how Labor Day affects the schedule
4. **Modify existing lessons** - Update lesson content or dates

### Progress Demo
1. **Show attendance tracking** - Display the first week's attendance
2. **Demonstrate progress updates** - Add new progress records
3. **Goal tracking** - Show how goals are progressing
4. **Activity logging** - Add new learning activities

### Analytics Demo
1. **Attendance reports** - Generate weekly/monthly summaries
2. **Progress trends** - Show improvement over time
3. **Subject comparisons** - Compare performance across subjects
4. **Goal progress** - Track completion percentages

## Data Structure

The demo data uses consistent UUIDs for easy reference:
- Family: `550e8400-e29b-41d4-a716-446655440001`
- Max: `550e8400-e29b-41d4-a716-446655440002`
- Lilly: `550e8400-e29b-41d4-a716-446655440003`
- Academic Year: `550e8400-e29b-41d4-a716-446655440004`

## Customization

You can easily modify the demo data by:
- Changing dates to match current school year
- Adding more subjects or lessons
- Modifying progress percentages
- Adding new learning goals
- Expanding the calendar coverage

## Troubleshooting

If you encounter issues:
1. **Check table existence** - Ensure all required tables are created
2. **Verify permissions** - Make sure RLS policies allow access
3. **Check foreign keys** - Ensure all references are valid
4. **Review constraints** - Check for unique constraints and data types

## Next Steps

After setting up the demo data:
1. Test all features in your app
2. Customize the data for your specific needs
3. Add more comprehensive progress tracking
4. Create additional analytics queries
5. Prepare demo scripts for presentations

This demo data provides a solid foundation for showcasing your app's capabilities in managing homeschool schedules, tracking student progress, and generating meaningful reports.
