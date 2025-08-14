-- Doodle RPC Functions
-- These functions support the Doodle AI assistant's tool capabilities

-- Function to add an activity
CREATE OR REPLACE FUNCTION add_activity(
    p_family_id UUID,
    p_name TEXT,
    p_subject_track_id UUID DEFAULT NULL,
    p_activity_type TEXT DEFAULT 'homework',
    p_schedule_data JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
    v_activity_id UUID;
    v_subject_id UUID;
BEGIN
    -- If subject_track_id is provided, get the subject_id
    IF p_subject_track_id IS NOT NULL THEN
        SELECT subject_id INTO v_subject_id 
        FROM subject_track 
        WHERE id = p_subject_track_id;
    END IF;
    
    -- Insert the activity
    INSERT INTO activities (
        family_id,
        name,
        subject_id,
        activity_type,
        schedule_data,
        created_at,
        updated_at
    ) VALUES (
        p_family_id,
        p_name,
        v_subject_id,
        p_activity_type,
        p_schedule_data,
        NOW(),
        NOW()
    ) RETURNING id INTO v_activity_id;
    
    RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get progress summary for a child
CREATE OR REPLACE FUNCTION progress_summary(
    p_child_id UUID,
    p_days_back INTEGER DEFAULT 14
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_start_date DATE;
    v_total_lessons INTEGER;
    v_completed_lessons INTEGER;
    v_total_activities INTEGER;
    v_completed_activities INTEGER;
    v_attendance_rate NUMERIC;
BEGIN
    -- Calculate start date
    v_start_date := CURRENT_DATE - p_days_back;
    
    -- Get total lessons in the period
    SELECT COUNT(*) INTO v_total_lessons
    FROM lessons l
    JOIN subject_track st ON l.subject_track_id = st.id
    JOIN subject s ON st.subject_id = s.id
    WHERE s.student_id = p_child_id
    AND l.lesson_date >= v_start_date;
    
    -- Get completed lessons (assuming there's a completion status)
    SELECT COUNT(*) INTO v_completed_lessons
    FROM lessons l
    JOIN subject_track st ON l.subject_track_id = st.id
    JOIN subject s ON st.subject_id = s.id
    WHERE s.student_id = p_child_id
    AND l.lesson_date >= v_start_date
    AND l.progress->>'status' = 'completed';
    
    -- Get total activities
    SELECT COUNT(*) INTO v_total_activities
    FROM activities a
    JOIN subject s ON a.subject_id = s.id
    WHERE s.student_id = p_child_id
    AND a.created_at >= v_start_date;
    
    -- Get completed activities
    SELECT COUNT(*) INTO v_completed_activities
    FROM activities a
    JOIN subject s ON a.subject_id = s.id
    WHERE s.student_id = p_child_id
    AND a.created_at >= v_start_date
    AND a.ai_analysis->>'status' = 'completed';
    
    -- Calculate attendance rate
    SELECT 
        CASE 
            WHEN COUNT(*) > 0 THEN 
                ROUND((COUNT(*) FILTER (WHERE attended = true)::NUMERIC / COUNT(*)::NUMERIC) * 100, 2)
            ELSE 0 
        END INTO v_attendance_rate
    FROM attendance
    WHERE child_id = p_child_id
    AND attendance_date >= v_start_date;
    
    -- Build result
    v_result := jsonb_build_object(
        'child_id', p_child_id,
        'period_days', p_days_back,
        'start_date', v_start_date,
        'end_date', CURRENT_DATE,
        'lessons', jsonb_build_object(
            'total', v_total_lessons,
            'completed', v_completed_lessons,
            'completion_rate', CASE WHEN v_total_lessons > 0 THEN ROUND((v_completed_lessons::NUMERIC / v_total_lessons::NUMERIC) * 100, 2) ELSE 0 END
        ),
        'activities', jsonb_build_object(
            'total', v_total_activities,
            'completed', v_completed_activities,
            'completion_rate', CASE WHEN v_total_activities > 0 THEN ROUND((v_completed_activities::NUMERIC / v_total_activities::NUMERIC) * 100, 2) ELSE 0 END
        ),
        'attendance_rate', v_attendance_rate,
        'summary', CASE 
            WHEN v_completed_lessons >= v_total_lessons * 0.8 AND v_attendance_rate >= 80 THEN 'Excellent progress!'
            WHEN v_completed_lessons >= v_total_lessons * 0.6 AND v_attendance_rate >= 60 THEN 'Good progress'
            WHEN v_completed_lessons >= v_total_lessons * 0.4 AND v_attendance_rate >= 40 THEN 'Fair progress'
            ELSE 'Needs attention'
        END
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to queue a reschedule request
CREATE OR REPLACE FUNCTION queue_reschedule(
    p_family_id UUID,
    p_calendar_date DATE,
    p_note TEXT DEFAULT ''
) RETURNS UUID AS $$
DECLARE
    v_reschedule_id UUID;
BEGIN
    -- Insert into planning_comments table (or create a new reschedule_requests table)
    INSERT INTO planning_comments (
        family_id,
        comment_type,
        comment_text,
        target_date,
        created_at,
        updated_at
    ) VALUES (
        p_family_id,
        'reschedule_request',
        p_note,
        p_calendar_date,
        NOW(),
        NOW()
    ) RETURNING id INTO v_reschedule_id;
    
    RETURN v_reschedule_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get family context for Doodle
CREATE OR REPLACE FUNCTION get_family_context(
    p_family_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_result JSONB;
    v_children JSONB;
    v_subjects JSONB;
    v_subject_tracks JSONB;
    v_activities JSONB;
    v_academic_year JSONB;
BEGIN
    -- Get children
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', c.id,
            'name', c.name,
            'age', c.age,
            'grade', c.grade,
            'interests', c.interests,
            'learning_style', c.learning_style,
            'college_bound', c.college_bound,
            'avatar', c.avatar
        )
    ) INTO v_children
    FROM children c
    WHERE c.family_id = p_family_id;
    
    -- Get subjects
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', s.id,
            'subject_name', s.subject_name,
            'student_id', s.student_id,
            'grade', s.grade,
            'notes', s.notes
        )
    ) INTO v_subjects
    FROM subject s
    WHERE s.family_id = p_family_id;
    
    -- Get subject tracks
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', st.id,
            'subject_id', st.subject_id,
            'track_type', st.track_type,
            'provider_name', st.provider_name,
            'course_title', st.course_title,
            'unit_start', st.unit_start
        )
    ) INTO v_subject_tracks
    FROM subject_track st
    WHERE st.family_id = p_family_id;
    
    -- Get activities
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', a.id,
            'name', a.name,
            'subject_id', a.subject_id,
            'activity_type', a.activity_type,
            'schedule_data', a.schedule_data,
            'created_at', a.created_at
        )
    ) INTO v_activities
    FROM activities a
    WHERE a.family_id = p_family_id;
    
    -- Get current academic year
    SELECT jsonb_build_object(
        'id', ay.id,
        'year_name', ay.year_name,
        'start_date', ay.start_date,
        'end_date', ay.end_date,
        'total_days', ay.total_days,
        'total_hours', ay.total_hours,
        'hours_per_day', ay.hours_per_day
    ) INTO v_academic_year
    FROM academic_years ay
    WHERE ay.family_id = p_family_id
    AND ay.is_current = true;
    
    -- Build final result
    v_result := jsonb_build_object(
        'family_id', p_family_id,
        'children', COALESCE(v_children, '[]'::jsonb),
        'subjects', COALESCE(v_subjects, '[]'::jsonb),
        'subject_tracks', COALESCE(v_subject_tracks, '[]'::jsonb),
        'activities', COALESCE(v_activities, '[]'::jsonb),
        'academic_year', v_academic_year
    );
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
