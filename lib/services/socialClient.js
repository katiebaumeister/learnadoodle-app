/**
 * Social & Community Features Client
 * Handles family connections, groups, sharing, marketplace
 */
import { apiRequest } from '../apiClient';
import { supabase } from '../supabase';

// Get API base URL
const getAPIBase = () => {
  if (typeof window !== 'undefined') {
    return process.env.REACT_APP_API_URL || window.location.origin;
  }
  return process.env.REACT_APP_API_URL || '';
};

/**
 * Groups API
 */
export async function createGroup(groupData) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/social/groups`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(groupData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function listGroups(filters = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const params = new URLSearchParams();
    if (filters.group_type) params.append('group_type', filters.group_type);
    if (filters.is_public !== undefined) params.append('is_public', filters.is_public);
    if (filters.q) params.append('q', filters.q);

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/social/groups?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function getGroupDetails(groupId) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/social/groups/${groupId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function joinGroup(groupId, inviteCode = null) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/social/groups/${groupId}/join`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ invite_code: inviteCode }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Resource Sharing API
 */
export async function shareResource(resourceData) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/social/resources/share`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resourceData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function listSharedResources(filters = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const params = new URLSearchParams();
    if (filters.resource_type) params.append('resource_type', filters.resource_type);
    if (filters.shared_with_type) params.append('shared_with_type', filters.shared_with_type);
    if (filters.shared_with_id) params.append('shared_with_id', filters.shared_with_id);
    if (filters.q) params.append('q', filters.q);

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/social/resources?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Shared Classes API
 */
export async function createSharedClass(classData) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/social/classes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(classData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function enrollInClass(classId, childId) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/social/classes/${classId}/enroll`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ child_id: childId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Family Connections API
 */
export async function createConnection(familyId) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/social/connections`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ family_id: familyId }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function acceptConnection(connectionId) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/social/connections/${connectionId}/accept`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Marketplace API
 */
export async function createMarketplaceListing(listingData) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/social/marketplace/listings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(listingData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function listMarketplaceListings(filters = {}) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const params = new URLSearchParams();
    if (filters.resource_type) params.append('resource_type', filters.resource_type);
    if (filters.category) params.append('category', filters.category);
    if (filters.q) params.append('q', filters.q);
    if (filters.min_price) params.append('min_price', filters.min_price);
    if (filters.max_price) params.append('max_price', filters.max_price);

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/social/marketplace/listings?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function purchaseListing(listingId) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/social/marketplace/listings/${listingId}/purchase`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function createReview(listingId, reviewData) {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const apiBase = getAPIBase();
    const response = await fetch(`${apiBase}/api/social/marketplace/listings/${listingId}/reviews`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reviewData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
}

