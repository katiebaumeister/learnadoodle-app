/**
 * Simple reuse potential badge logic
 * Deterministic heuristic based on ratings and boredom rate
 */

/**
 * Calculate reuse potential for a material
 * @param {Object} material - Material object with reviews
 * @returns {Object} { score: 'high' | 'low' | null, label: string }
 */
export function calculateReusePotential(material) {
  const reviews = material.material_reviews || [];
  const materialChildren = material.material_children || [];
  
  // Need at least 1 child to have used it
  if (materialChildren.length === 0) {
    return { score: null, label: null };
  }
  
  if (reviews.length === 0) {
    return { score: null, label: null };
  }
  
  // Calculate average rating
  const avgRating = reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length;
  
  // Calculate boredom rate
  const boredomCount = reviews.filter(r => r.emotion === 'bored').length;
  const boredomRate = boredomCount / reviews.length;
  
  // Good for siblings: avg_rating >= 4 AND boredom_rate < 0.3 AND used by at least 1 child
  if (avgRating >= 4 && boredomRate < 0.3 && materialChildren.length >= 1) {
    return { score: 'high', label: 'Good for siblings' };
  }
  
  // Low fit: avg_rating <= 2.5 OR boredom_rate > 0.5
  if (avgRating <= 2.5 || boredomRate > 0.5) {
    return { score: 'low', label: "Didn't click for this family" };
  }
  
  return { score: null, label: null };
}

