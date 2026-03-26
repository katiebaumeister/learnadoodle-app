/**
 * API client for Materials Library
 */
import { supabase } from '../supabase';
import { getAccessibleChildIds, canAccessChild } from '../queryFilters';

/**
 * Get all materials for a family
 * @param {string} familyId - Family ID
 * @param {Object} filters - Filter options (type, subject_key, search, child_id)
 * @param {Object|null} session - Session context for role-based filtering
 */
export async function getMaterials(familyId, filters = {}, session = null) {
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
      )
    `)
    .eq('family_id', familyId)
    .is('deleted_at', null)
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
  
  // Filter by session (role) first, then optional UI child chip (filters.child_id).
  let filtered = data || [];

  if (session) {
    const accessibleChildIds = getAccessibleChildIds(session);
    if (accessibleChildIds.length > 0) {
      filtered = filtered.filter((m) =>
        m.material_children?.some((mc) => accessibleChildIds.includes(mc.child_id))
      );
    } else if (session.role_flags?.isChild || session.role_flags?.isTutor) {
      return [];
    }
  }

  if (filters.child_id) {
    if (session && !canAccessChild(session, filters.child_id)) {
      return [];
    }
    const cid = String(filters.child_id);
    filtered = filtered.filter((m) =>
      m.material_children?.some((mc) => String(mc.child_id) === cid)
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
 * Create a file-based material (unified upload)
 * This replaces the old uploads table insert
 * 
 * NOTE: child_id should now be handled via material_children table, not materials.child_id
 */
export async function createFileMaterial({
  familyId,
  storagePath,
  title,
  mime = 'application/octet-stream',
  bytes = 0,
  caption = null,
  childId = null, // DEPRECATED: Use linkMaterialToChild after creation instead
  subjectId = null,
  /** When subject row does not exist yet (e.g. onboarding / add-subject draft) */
  subjectKey = null,
  eventId = null,
  tags = [],
  notes = null,
  url = null,
}) {
  // Get current user for created_by
  const { data: { user } } = await supabase.auth.getUser();
  
  const materialData = {
    family_id: familyId,
    title: title || 'Untitled File',
    type: 'other', // File-based materials are type 'other'
    storage_path: storagePath,
    mime: mime,
    bytes: bytes,
    caption: caption,
    // child_id: childId, // DEPRECATED - use material_children instead
    subject_id: subjectId,
    subject_key: subjectKey || null,
    event_id: eventId,
    tags: tags,
    notes: notes,
    url: url,
    provider_url: url || storagePath, // Use url or storage_path as provider_url
    created_by: user?.id || null,
  };

  const material = await createMaterial(materialData);
  
  // If childId provided, create material_children entry (new way)
  if (childId && material?.id) {
    await linkMaterialToChild(material.id, childId, familyId, 'in_use');
  }
  
  return material;
}

/**
 * Update a material
 */
export async function updateMaterial(materialId, updates) {
  const { data, error } = await supabase
    .from('materials')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', materialId)
    .select('*') // Explicitly select all columns including review_* fields
    .maybeSingle(); // Use maybeSingle to handle cases where no rows are returned

  if (error) {
    console.error('[updateMaterial] Error updating material:', error);
    throw error;
  }
  if (!data) {
    throw new Error('Material not found or could not be updated');
  }
  
  // Log review fields for debugging
  if (updates.review_child_id || updates.review_rating) {
    console.log('[updateMaterial] Review fields updated:', {
      review_child_id: data.review_child_id,
      review_rating: data.review_rating,
      review_emotion: data.review_emotion,
      review_pacing_fit: data.review_pacing_fit,
      review_difficulty: data.review_difficulty,
      review_notes: data.review_notes,
      review_updated_at: data.review_updated_at,
    });
  }
  
  return data;
}

/**
 * Archive a material (soft delete)
 * Note: Requires family_id for RLS. If you have the material record, pass familyId.
 * Otherwise, this will try to fetch it first.
 */
export async function archiveMaterial(materialId, familyId = null) {
  // If familyId not provided, fetch the material first to get family_id
  if (!familyId) {
    const { data: material, error: fetchError } = await supabase
      .from('materials')
      .select('family_id')
      .eq('id', materialId)
      .maybeSingle();
    
    if (fetchError) throw fetchError;
    if (!material) throw new Error('Material not found');
    familyId = material.family_id;
  }

  // Try using the RPC function first (better RLS handling, uses SECURITY DEFINER)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('delete_material', {
      _material_id: materialId,
      _family_id: familyId,
    });

    if (!rpcError && rpcData?.success) {
      // RPC succeeded - material is soft deleted
      return {
        id: materialId,
        deleted_at: new Date().toISOString(),
        family_id: familyId,
      };
    }

    // If RPC returned an error or didn't succeed, try direct update
    if (rpcError) {
      console.warn('[archiveMaterial] RPC delete_material error, trying direct update:', rpcError);
    } else if (rpcData && !rpcData.success) {
      console.warn('[archiveMaterial] RPC delete_material returned success=false, trying direct update:', rpcData);
    }
  } catch (rpcErr) {
    console.warn('[archiveMaterial] RPC delete_material exception, trying direct update:', rpcErr);
  }

  // Fallback: Use direct update (RLS policies will handle permissions)
  const { data, error } = await supabase
    .from('materials')
    .update({ 
      deleted_at: new Date().toISOString(), 
      updated_at: new Date().toISOString() 
    })
    .eq('id', materialId)
    .eq('family_id', familyId) // Required for RLS
    .is('deleted_at', null) // Only update if not already deleted
    .select()
    .maybeSingle(); // Use maybeSingle to handle 0 rows gracefully

  if (error) {
    // Handle 403 (permission denied) errors specifically
    if (error.code === '42501' || error.statusCode === 403 || error.message?.includes('permission') || error.message?.includes('row-level security')) {
      console.error('[archiveMaterial] RLS permission denied:', { materialId, familyId, error });
      throw new Error('Permission denied: You do not have permission to delete this material. Please ensure you are a member of the family that owns this material.');
    }
    
    // If it's a "no rows" error, check if material exists or is already deleted
    if (error.code === 'PGRST116') {
      // Try to check if material exists (might be already deleted or doesn't exist)
      const { data: checkData, error: checkError } = await supabase
        .from('materials')
        .select('id, deleted_at, family_id')
        .eq('id', materialId)
        .maybeSingle();
      
      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }
      
      if (checkData) {
        if (checkData.deleted_at) {
          // Already deleted, return it
          return checkData;
        }
        // Material exists but update failed - likely family_id mismatch or RLS issue
        if (checkData.family_id !== familyId) {
          throw new Error('Material belongs to a different family');
        }
        throw new Error('Material exists but could not be deleted. Check permissions.');
      } else {
        throw new Error('Material not found');
      }
    }
    throw error;
  }
  
  // If update returned no rows, check if it's already deleted or doesn't exist
  if (!data) {
    // Try to check if material exists (might be already deleted)
    const { data: checkData, error: checkError } = await supabase
      .from('materials')
      .select('id, deleted_at, family_id')
      .eq('id', materialId)
      .maybeSingle();
    
    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError;
    }
    
    if (checkData) {
      if (checkData.deleted_at) {
        // Already deleted, return it
        return checkData;
      }
      // Exists but update didn't work - check family_id
      if (checkData.family_id !== familyId) {
        throw new Error('Material belongs to a different family');
      }
      // Material exists but update didn't work (likely RLS or already deleted by another process)
      throw new Error('Material could not be deleted. It may have been deleted by another process.');
    } else {
      throw new Error('Material not found');
    }
  }
  
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
  // First check if the link exists
  const { data: existing, error: checkError } = await supabase
    .from('material_children')
    .select('id, family_id')
    .eq('material_id', materialId)
    .eq('child_id', childId)
    .maybeSingle();

  if (checkError) throw checkError;

  const updates = {
    status,
    updated_at: new Date().toISOString(),
  };
  
  if (dates.started_at) updates.started_at = dates.started_at;
  if (dates.finished_at) updates.finished_at = dates.finished_at;

  if (existing) {
    // Link exists, update it
    const { data, error } = await supabase
      .from('material_children')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  } else {
    // Link doesn't exist, create it (need familyId from material)
    const { data: material } = await supabase
      .from('materials')
      .select('family_id')
      .eq('id', materialId)
      .maybeSingle();
    
    if (!material) {
      throw new Error('Material not found');
    }

    const { data, error } = await supabase
      .from('material_children')
      .insert({
        material_id: materialId,
        child_id: childId,
        family_id: material.family_id,
        ...updates,
      })
      .select()
      .maybeSingle();

    if (error) throw error;
    return data;
  }
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
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;

  // Merge material_children data
  return (materials || []).map(material => ({
    ...material,
    material_children: materialChildren.filter(mc => mc.material_id === material.id),
  }));
}

/**
 * Get deleted materials for a family (recently deleted bin)
 */
export async function getDeletedMaterials(familyId) {
  // Try using the RPC function first (bypasses RLS)
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_deleted_materials', {
      _family_id: familyId,
    });

    if (!rpcError && rpcData !== null && rpcData !== undefined) {
      // RPC returns JSONB array, convert to regular array
      const materials = Array.isArray(rpcData) ? rpcData : (rpcData ? [rpcData] : []);
      return materials;
    }

    if (rpcError) {
      // If function doesn't exist, that's okay - we'll use direct query
      if (rpcError.message?.includes('function') || rpcError.message?.includes('does not exist') || rpcError.code === '42883') {
        // Fall through to direct query
      } else {
        console.warn('[getDeletedMaterials] RPC error, trying direct query:', rpcError);
      }
    }
  } catch (rpcErr) {
    console.warn('[getDeletedMaterials] RPC exception, using direct query:', rpcErr.message);
  }

  // Fallback: Direct query (may be blocked by RLS if policy filters deleted items)
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
      )
    `)
    .eq('family_id', familyId)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error) {
    console.error('[getDeletedMaterials] Query error:', error);
    throw error;
  }
  
  return data || [];
}

/**
 * Restore a deleted material
 */
export async function restoreMaterial(materialId, familyId = null) {
  // FamilyId must be provided since we can't fetch deleted materials due to RLS
  if (!familyId) {
    throw new Error('Family ID is required to restore a material');
  }

  // Use the RPC function (bypasses RLS, uses SECURITY DEFINER)
  const { data: rpcData, error: rpcError } = await supabase.rpc('restore_material', {
    _material_id: materialId,
    _family_id: familyId,
  });

  if (rpcError) {
    console.error('[restoreMaterial] RPC error:', rpcError);
    throw new Error(rpcError.message || 'Failed to restore material');
  }

  if (!rpcData?.success) {
    throw new Error(rpcData?.error || 'Failed to restore material');
  }

  // RPC succeeded - material is restored
  return {
    id: materialId,
    deleted_at: null,
    family_id: familyId,
  };
}

/**
 * Permanently delete a material (hard delete)
 * WARNING: This permanently removes the material from the database
 */
export async function permanentlyDeleteMaterial(materialId, familyId = null) {
  // FamilyId must be provided since we can't fetch deleted materials due to RLS
  if (!familyId) {
    throw new Error('Family ID is required to permanently delete a material');
  }

  // Use the RPC function (bypasses RLS, uses SECURITY DEFINER)
  const { data: rpcData, error: rpcError } = await supabase.rpc('permanently_delete_material', {
    _material_id: materialId,
    _family_id: familyId,
  });

  if (rpcError) {
    console.error('[permanentlyDeleteMaterial] RPC error:', rpcError);
    throw new Error(rpcError.message || 'Failed to permanently delete material');
  }

  if (!rpcData?.success) {
    throw new Error(rpcData?.error || 'Failed to permanently delete material');
  }

  // RPC succeeded - material is permanently deleted
  return { 
    success: true, 
    materialId,
    storage_path: rpcData.storage_path 
  };
}

