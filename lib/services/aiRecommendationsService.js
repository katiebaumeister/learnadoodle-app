/**
 * AI Recommendations Service
 * Generates personalized recommendations based on learner profile
 */
import { apiRequest } from '../apiClient';
import { getComprehensiveProfile } from './recordsClient';
import { supabase } from '../supabase';

/**
 * Generate personalized recommendations for a child based on their learner profile
 */
export async function generatePersonalizedRecommendations(childId, familyId = null) {
  try {
    // Get comprehensive learner profile
    const profile = await getComprehensiveProfile(childId);
    const supportProfile = profile?.support_profile || {};
    const learnerProfile = profile?.learner_profile || {};

    // Get recent learning data
    const { data: recentEvents } = await supabase
      .from('events')
      .select('id, title, subject_id, start_ts, status')
      .eq('child_id', childId)
      .order('start_ts', { ascending: false })
      .limit(20);

    const { data: recentOutcomes } = await supabase
      .from('event_outcomes')
      .select('id, event_id, strengths, struggles, rating')
      .eq('child_id', childId)
      .order('created_at', { ascending: false })
      .limit(20);

    const { data: assignments } = await supabase
      .from('assignments')
      .select('id, title, status, due_date, related_subject')
      .eq('child_id', childId)
      .order('created_at', { ascending: false })
      .limit(20);

    // Get child info
    const { data: child } = await supabase
      .from('children')
      .select('id, first_name, age, grade_label, interests, family_id')
      .eq('id', childId)
      .single();
    
    // Ensure we have familyId
    if (!familyId && child?.family_id) {
      familyId = child.family_id;
    }
    
    if (!familyId) {
      throw new Error('Family ID is required');
    }
    
    // Build context for AI
    const context = {
      family_id: familyId,
      child_id: childId,
      child_name: child?.first_name || 'the student',
      age: child?.age,
      grade: child?.grade_label,
      // Support profile
      diagnoses: supportProfile.diagnoses || [],
      learning_modalities: supportProfile.learning_modalities || [],
      support_needs: supportProfile.support_needs || [],
      executive_function: supportProfile.executive_function || [],
      color_mode: supportProfile.color_mode,
      // Learner profile
      strengths: learnerProfile.strengths || [],
      interests: learnerProfile.interests || child?.interests || [],
      academic_strengths: learnerProfile.academic_strengths || [],
      academic_challenges: learnerProfile.academic_challenges || [],
      preferred_subjects: learnerProfile.preferred_subjects || [],
      motivation_factors: learnerProfile.motivation_factors || [],
      // Learning data
      recent_events: recentEvents || [],
      recent_outcomes: recentOutcomes || [],
      assignments: assignments || [],
    };

    // Call AI endpoint to generate recommendations
    const { data, error } = await apiRequest('/api/ai/generate_learner_recommendations', {
      method: 'POST',
      body: JSON.stringify(context),
    });

    if (error) {
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error generating personalized recommendations:', error);
    throw error;
  }
}

/**
 * Save recommendations to the database
 */
export async function saveRecommendations(recommendations, childId, familyId) {
  try {
    const { createRecommendation } = await import('./recordsClient');
    const saved = [];

    for (const rec of recommendations) {
      try {
        const savedRec = await createRecommendation(childId, {
          recommendation_type: rec.recommendation_type || 'learning_strategy',
          title: rec.title,
          description: rec.description || rec.reason || '',
          rationale: rec.rationale || rec.reason || '',
          linked_content_type: rec.linked_content_type || null,
          linked_content_id: rec.linked_content_id || null,
          priority: rec.priority || 3,
          confidence_score: rec.confidence_score || 0.5,
          estimated_benefit: rec.estimated_benefit || '',
          estimated_time_minutes: rec.estimated_time_minutes || null,
          cognitive_load: rec.cognitive_load || 'medium',
          influenced_by: rec.influenced_by || {},
        });
        saved.push(savedRec);
      } catch (err) {
        console.error('Error saving recommendation:', err);
      }
    }

    return saved;
  } catch (error) {
    console.error('Error saving recommendations:', error);
    throw error;
  }
}

