/**
 * Family bulletin board — posts, attachments, and comments.
 */

import { supabase } from '../supabase';
import { createFileMaterial } from './materialsClient';

const POST_SELECT = `
  id,
  family_id,
  author_user_id,
  body,
  subject_id,
  visibility,
  audience_user_ids,
  audience_child_ids,
  source,
  system_kind,
  created_at,
  updated_at,
  materials:family_bulletin_post_materials(
    id,
    sort_order,
    material_id,
    material:materials(
      id,
      title,
      mime,
      url,
      provider_url,
      storage_path
    )
  ),
  comments:family_bulletin_post_comments(
    id,
    body,
    author_user_id,
    created_at
  )
`;

function normalizePost(row) {
  if (!row) return null;
  const materials = (row.materials || [])
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
    .map((entry) => ({
      id: entry.id,
      materialId: entry.material_id,
      sortOrder: entry.sort_order,
      material: entry.material || null,
    }));
  const comments = (row.comments || [])
    .slice()
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((c) => ({
      id: c.id,
      body: c.body,
      authorUserId: c.author_user_id,
      createdAt: c.created_at,
    }));
  return {
    id: row.id,
    familyId: row.family_id,
    authorUserId: row.author_user_id,
    body: row.body,
    subjectId: row.subject_id,
    visibility: row.visibility,
    audienceUserIds: row.audience_user_ids || [],
    audienceChildIds: row.audience_child_ids || [],
    source: row.source || 'user',
    systemKind: row.system_kind || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    materials,
    comments,
  };
}

export async function fetchAuthorProfiles(userIds = []) {
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, first_name, name, email')
    .in('id', ids);
  if (error) {
    console.warn('[bulletinClient] fetchAuthorProfiles:', error.message);
    return new Map();
  }
  return new Map(
    (data || []).map((row) => [
      String(row.id),
      {
        id: row.id,
        firstName: row.first_name || null,
        name: row.name || row.first_name || row.email || 'Family member',
      },
    ])
  );
}

export function displayNameForUser(profileMap, userId) {
  const profile = profileMap?.get?.(String(userId));
  if (!profile) return 'Family member';
  if (profile.firstName) return profile.firstName;
  if (profile.name) return String(profile.name).trim().split(/\s+/)[0];
  return 'Family member';
}

export async function fetchBulletinPosts(familyId) {
  if (!familyId) return { data: [], error: new Error('Missing family id') };
  const { data, error } = await supabase
    .from('family_bulletin_posts')
    .select(POST_SELECT)
    .eq('family_id', familyId)
    .order('created_at', { ascending: false });
  if (error) return { data: [], error };
  return { data: (data || []).map(normalizePost), error: null };
}

export async function subjectSystemBulletinPostExists(familyId, subjectId, systemKind) {
  if (!familyId || !subjectId || !systemKind) return false;
  const { data, error } = await supabase
    .from('family_bulletin_posts')
    .select('id')
    .eq('family_id', familyId)
    .eq('subject_id', subjectId)
    .eq('system_kind', systemKind)
    .maybeSingle();
  if (error) {
    console.warn('[bulletinClient] subjectSystemBulletinPostExists:', error.message);
    return false;
  }
  return Boolean(data?.id);
}

export async function createBulletinPost({
  familyId,
  body,
  subjectId = null,
  visibility = 'all',
  audienceUserIds = [],
  audienceChildIds = [],
  materialIds = [],
  source = 'user',
  systemKind = null,
}) {
  const trimmed = String(body || '').trim();
  if (!familyId || !trimmed) {
    return { data: null, error: new Error('Post body is required') };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { data: null, error: new Error('Not signed in') };

  const { data: postRow, error: postError } = await supabase
    .from('family_bulletin_posts')
    .insert({
      family_id: familyId,
      author_user_id: user.id,
      body: trimmed,
      subject_id: subjectId || null,
      visibility,
      audience_user_ids: audienceUserIds || [],
      audience_child_ids: audienceChildIds || [],
      source: source === 'learnadoodle' ? 'learnadoodle' : 'user',
      system_kind: systemKind || null,
    })
    .select('id')
    .single();

  if (postError || !postRow?.id) {
    return { data: null, error: postError || new Error('Failed to create post') };
  }

  const uniqueMaterialIds = [...new Set((materialIds || []).map(String).filter(Boolean))];
  if (uniqueMaterialIds.length > 0) {
    const { error: matError } = await supabase
      .from('family_bulletin_post_materials')
      .insert(
        uniqueMaterialIds.map((materialId, index) => ({
          post_id: postRow.id,
          material_id: materialId,
          sort_order: index,
        }))
      );
    if (matError) {
      await supabase.from('family_bulletin_posts').delete().eq('id', postRow.id);
      return { data: null, error: matError };
    }
  }

  const { data: fullPost, error: fetchError } = await supabase
    .from('family_bulletin_posts')
    .select(POST_SELECT)
    .eq('id', postRow.id)
    .maybeSingle();

  if (fetchError) return { data: null, error: fetchError };
  return { data: normalizePost(fullPost), error: null };
}

export async function updateBulletinPost({
  postId,
  body,
  subjectId = null,
  visibility = 'all',
  audienceUserIds = [],
  audienceChildIds = [],
  materialIds = [],
}) {
  const trimmed = String(body || '').trim();
  if (!postId || !trimmed) {
    return { data: null, error: new Error('Post body is required') };
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { data: null, error: new Error('Not signed in') };

  const { error: updateError } = await supabase
    .from('family_bulletin_posts')
    .update({
      body: trimmed,
      subject_id: subjectId || null,
      visibility,
      audience_user_ids: audienceUserIds || [],
      audience_child_ids: audienceChildIds || [],
    })
    .eq('id', postId)
    .eq('author_user_id', user.id);

  if (updateError) return { data: null, error: updateError };

  const { error: clearMaterialsError } = await supabase
    .from('family_bulletin_post_materials')
    .delete()
    .eq('post_id', postId);
  if (clearMaterialsError) return { data: null, error: clearMaterialsError };

  const uniqueMaterialIds = [...new Set((materialIds || []).map(String).filter(Boolean))];
  if (uniqueMaterialIds.length > 0) {
    const { error: matError } = await supabase
      .from('family_bulletin_post_materials')
      .insert(
        uniqueMaterialIds.map((materialId, index) => ({
          post_id: postId,
          material_id: materialId,
          sort_order: index,
        }))
      );
    if (matError) return { data: null, error: matError };
  }

  const { data: fullPost, error: fetchError } = await supabase
    .from('family_bulletin_posts')
    .select(POST_SELECT)
    .eq('id', postId)
    .maybeSingle();

  if (fetchError) return { data: null, error: fetchError };
  return { data: normalizePost(fullPost), error: null };
}

export async function deleteBulletinPost(postId) {
  if (!postId) return { error: new Error('Missing post id') };
  const { error } = await supabase
    .from('family_bulletin_posts')
    .delete()
    .eq('id', postId);
  return { error };
}

export async function addBulletinComment({ postId, familyId, body }) {
  const trimmed = String(body || '').trim();
  if (!postId || !familyId || !trimmed) {
    return { data: null, error: new Error('Comment body is required') };
  }
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return { data: null, error: new Error('Not signed in') };

  const { data, error } = await supabase
    .from('family_bulletin_post_comments')
    .insert({
      post_id: postId,
      family_id: familyId,
      author_user_id: user.id,
      body: trimmed,
    })
    .select('id, body, author_user_id, created_at')
    .single();

  if (error) return { data: null, error };
  return {
    data: {
      id: data.id,
      body: data.body,
      authorUserId: data.author_user_id,
      createdAt: data.created_at,
    },
    error: null,
  };
}

export async function deleteBulletinComment(commentId) {
  if (!commentId) return { error: new Error('Missing comment id') };
  const { error } = await supabase
    .from('family_bulletin_post_comments')
    .delete()
    .eq('id', commentId);
  return { error };
}

export async function uploadBulletinMaterial({ familyId, file, subjectId = null }) {
  if (!familyId || !file) return { data: null, error: new Error('Missing file') };
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${familyId}/${crypto.randomUUID()}_${safeFileName}`;
  const { error: uploadError } = await supabase.storage
    .from('evidence')
    .upload(filePath, file, {
      upsert: false,
      contentType: file.type,
      metadata: { family_id: familyId },
    });
  if (uploadError) return { data: null, error: uploadError };

  const { data: { publicUrl } } = supabase.storage.from('evidence').getPublicUrl(filePath);
  const material = await createFileMaterial({
    familyId,
    storagePath: filePath,
    title: file.name || 'Attachment',
    mime: file.type || 'application/octet-stream',
    bytes: file.size || 0,
    subjectId: subjectId || null,
    url: publicUrl,
  });
  if (!material?.id) return { data: null, error: new Error('Failed to create material') };
  return {
    data: {
      id: material.id,
      title: material.title || file.name || 'Attachment',
      mime: material.mime,
      url: material.url || publicUrl,
    },
    error: null,
  };
}

export async function resolveMaterialUrl(material) {
  if (!material) return null;
  const direct = material.url || material.provider_url;
  if (direct) return direct;
  if (!material.id) return null;
  const { data } = await supabase
    .from('materials')
    .select('url, provider_url')
    .eq('id', material.id)
    .maybeSingle();
  return data?.url || data?.provider_url || null;
}

export function formatBulletinTimestamp(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatStreamTimestamp(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
