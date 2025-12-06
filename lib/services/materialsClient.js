/**
 * API client for Materials Library
 */
import { supabase } from '../supabase';

/**
 * Get all materials for a family
 */
export async function getMaterials(familyId, filters = {}) {
  let query = supabase
    .from('materials')
    .select(`
      *,
      material_children (
        id,
        child_id,
        status,
        started_at,
        finished_at,
        reuse_candidate,
        child:child_id (id, first_name)
      ),
      material_reviews (
        id,
        child_id,
        rating,
        emotion,
        pacing_fit,
        difficulty,
        notes,
        created_at
      )
    `)
    .eq('family_id', familyId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (filters.type) {
    query = query.eq('type', filters.type);
  }
  if (filters.subject_key) {
    query = query.eq('subject_key', filters.subject_key);
  }
  if (filters.search) {
    query = query.or(`title.ilike.%${filters.search}%,provider_name.ilike.%${filters.search}%`);
  }

  const { data, error } = await query;
  if (error) throw error;
  
  // Filter by child_id in memory since Supabase doesn't support filtering nested relations easily
  let filtered = data || [];
  if (filters.child_id) {
    filtered = filtered.filter(m => 
      m.material_children?.some(mc => mc.child_id === filters.child_id)
    );
  }
  
  return filtered;
}

/**
 * Get a single material by ID
 */
export async function getMaterial(materialId) {
  const { data, error } = await supabase
    .from('materials')
    .select(`
      *,
      material_children (
        id,
        child_id,
        status,
        started_at,
        finished_at,
        reuse_candidate,
        child:child_id (id, first_name)
      ),
      material_reviews (
        id,
        child_id,
        event_id,
        rating,
        emotion,
        pacing_fit,
        difficulty,
        engagement_style,
        notes,
        created_at,
        created_by,
        child:child_id (id, first_name)
      )
    `)
    .eq('id', materialId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create a new material
 */
export async function createMaterial(materialData) {
  const { data, error } = await supabase
    .from('materials')
    .insert([materialData])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update a material
 */
export async function updateMaterial(materialId, updates) {
  const { data, error } = await supabase
    .from('materials')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', materialId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Archive a material
 */
export async function archiveMaterial(materialId) {
  const { data, error } = await supabase
    .from('materials')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', materialId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Link a material to a child
 */
export async function linkMaterialToChild(materialId, childId, familyId, status = 'planned') {
  const { data, error } = await supabase
    .from('material_children')
    .upsert({
      material_id: materialId,
      child_id: childId,
      family_id: familyId,
      status,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'material_id,child_id'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update material-child link status
 */
export async function updateMaterialChildStatus(materialId, childId, status, dates = {}) {
  const updates = {
    status,
    updated_at: new Date().toISOString(),
  };
  
  if (dates.started_at) updates.started_at = dates.started_at;
  if (dates.finished_at) updates.finished_at = dates.finished_at;

  const { data, error } = await supabase
    .from('material_children')
    .update(updates)
    .eq('material_id', materialId)
    .eq('child_id', childId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Create a material review
 */
export async function createMaterialReview(reviewData) {
  const { data, error } = await supabase
    .from('material_reviews')
    .insert([reviewData])
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get reviews for a material
 */
export async function getMaterialReviews(materialId) {
  const { data, error } = await supabase
    .from('material_reviews')
    .select(`
      *,
      child:child_id (id, first_name, last_name)
    `)
    .eq('material_id', materialId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get material usage stats
 */
export async function getMaterialStats(materialId) {
  const { data, error } = await supabase
    .from('material_usage_stats')
    .select('*')
    .eq('material_id', materialId)
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get materials by child
 */
export async function getMaterialsByChild(familyId, childId) {
  // Get all materials linked to this child
  const { data: materialChildren, error: mcError } = await supabase
    .from('material_children')
    .select('material_id, status, started_at, finished_at')
    .eq('child_id', childId)
    .eq('family_id', familyId);

  if (mcError) throw mcError;
  if (!materialChildren || materialChildren.length === 0) return [];

  const materialIds = materialChildren.map(mc => mc.material_id);

  // Get full material details with reviews
  const { data: materials, error } = await supabase
    .from('materials')
    .select(`
      *,
      material_reviews (
        id,
        child_id,
        rating,
        emotion,
        pacing_fit,
        difficulty,
        notes,
        created_at
      )
    `)
    .in('id', materialIds)
    .eq('family_id', familyId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Merge material_children data
  return (materials || []).map(material => ({
    ...material,
    material_children: materialChildren.filter(mc => mc.material_id === material.id),
  }));
}

