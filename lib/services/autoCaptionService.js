/**
 * Auto-Captioning Service
 * Triggers AI caption generation for uploaded files
 */
import { apiRequest } from '../apiClient';

/**
 * Generate auto-caption and tags for an upload
 * @param {string} uploadId - Upload ID
 * @param {string} imageUrl - Optional image URL for image analysis
 * @param {string} textContent - Optional text content for text analysis
 * @returns {Promise<{success: boolean, caption?: string, tags?: string[], metadata?: object, error?: string}>}
 */
export async function generateAutoCaption(uploadId, imageUrl = null, textContent = null) {
  try {
    const { data, error } = await apiRequest('/api/content/auto-caption', {
      method: 'POST',
      body: JSON.stringify({
        upload_id: uploadId,
        image_url: imageUrl,
        text_content: textContent,
      }),
    });

    if (error) {
      return { success: false, error: error.message || 'Failed to generate caption' };
    }

    return {
      success: data.success,
      caption: data.caption,
      tags: data.tags || [],
      metadata: data.metadata || {},
      error: data.error,
    };
  } catch (error) {
    console.error('Error generating auto-caption:', error);
    return { success: false, error: error.message || 'Failed to generate caption' };
  }
}

/**
 * Auto-caption on file upload
 * Call this after a file is uploaded to trigger automatic captioning
 * @param {string} uploadId - Upload ID
 * @param {string} mimeType - MIME type of the file
 * @param {string} fileUrl - URL of the uploaded file
 * @param {string} title - File title/name
 */
export async function autoCaptionOnUpload(uploadId, mimeType, fileUrl, title) {
  // Only auto-caption images and PDFs for now
  const isImage = mimeType.startsWith('image/');
  const isPdf = mimeType === 'application/pdf';

  if (!isImage && !isPdf) {
    return { success: false, skipped: true };
  }

  try {
    // For images, pass the URL
    // For PDFs, we'd need to extract text first (handled by backend)
    const imageUrl = isImage ? fileUrl : null;
    
    const result = await generateAutoCaption(uploadId, imageUrl);
    
    if (result.success) {
      console.log('Auto-caption generated:', {
        uploadId,
        caption: result.caption,
        tags: result.tags,
      });
    }

    return result;
  } catch (error) {
    console.error('Error in auto-caption on upload:', error);
    return { success: false, error: error.message };
  }
}

