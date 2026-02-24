/**
 * Add Material Modal
 * Form for adding a new material to the library
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { X, Upload, FileText, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { createMaterial, linkMaterialToChild, updateMaterial, updateMaterialChildStatus } from '../../lib/services/materialsClient';
import { DOCUMENT_ROLE_CHIPS } from '../../lib/docs/roles';

const ROLE_OPTIONS = DOCUMENT_ROLE_CHIPS.filter((c) => c.value !== 'all');

const EMOTIONS = [
  { value: 'loved', label: 'Loved', emoji: '❤️' },
  { value: 'liked', label: 'Liked', emoji: '👍' },
  { value: 'neutral', label: 'Neutral', emoji: '😐' },
  { value: 'bored', label: 'Bored', emoji: '😴' },
  { value: 'overwhelmed', label: 'Overwhelmed', emoji: '😰' },
  { value: 'frustrated', label: 'Frustrated', emoji: '😤' },
];

const PACING_OPTIONS = [
  { value: 'too_fast', label: 'Too Fast' },
  { value: 'just_right', label: 'Just Right' },
  { value: 'too_slow', label: 'Too Slow' },
];

const DIFFICULTY_OPTIONS = [
  { value: 'too_easy', label: 'Too Easy' },
  { value: 'appropriate', label: 'Appropriate' },
  { value: 'too_hard', label: 'Too Hard' },
];

// Style constants matching TaskCreateModal
const BG = '#ffffff';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';
const MUTED = '#9ca3af';
const ACCENT = '#d4a256';
const CHIP_BG = '#f3f4f6';
const CHIP_BORDER = '#e5e7eb';

// Helper functions
function addDays(d, n) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + n);
  return nd;
}

function fmt(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AddMaterialModal({
  visible,
  onClose,
  onSaved,
  familyId,
  children = [],
  material = null, // If provided, edit mode
  allSubjects: propAllSubjects = [], // Pre-loaded subjects from parent
  defaultRole = null, // Default role to set when opening modal (e.g., 'syllabus')
  defaultSubjectId = null, // Default subject ID to set when opening modal
  defaultSubjectName = null, // Optional subject name for defaultSubjectId (used when subject not in filtered list)
  defaultChildId = null, // Default child ID to set when opening modal
  defaultChildIds = [], // Optional array of child IDs to default-select (for multi-child subjects)
}) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  // Form fields
  const [title, setTitle] = useState('');
  const [role, setRole] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [providerName, setProviderName] = useState('');
  const [providerUrl, setProviderUrl] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(null);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [isSubscription, setIsSubscription] = useState(false);
  const [subscriptionFrequency, setSubscriptionFrequency] = useState('monthly'); // 'monthly' or 'yearly'
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState('');
  
  // Subjects data
  const [allSubjects, setAllSubjects] = useState([]);
  const [filteredSubjects, setFilteredSubjects] = useState([]);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const loadingSubjectsRef = useRef(false);
  
  // Calendar picker state
  const [showCalendarPicker, setShowCalendarPicker] = useState(false);
  const [calendarViewMonth, setCalendarViewMonth] = useState(new Date());
  
  // Expandable sections state
  const [showProviderInfo, setShowProviderInfo] = useState(false);
  const [showPurchaseInfo, setShowPurchaseInfo] = useState(false);
  const [showReviewInfo, setShowReviewInfo] = useState(false);
  
  // Review fields
  const [reviewChildId, setReviewChildId] = useState(null);
  const [reviewRating, setReviewRating] = useState(null);
  const [reviewEmotion, setReviewEmotion] = useState(null);
  const [reviewPacingFit, setReviewPacingFit] = useState(null);
  const [reviewDifficulty, setReviewDifficulty] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // Use pre-loaded subjects if available, otherwise load from database
  useEffect(() => {
    if (!visible || !familyId) {
      // Reset when modal closes
      if (!visible) {
        setAllSubjects([]);
        setFilteredSubjects([]);
        loadingSubjectsRef.current = false;
        setLoadingSubjects(false);
      }
      return;
    }

    if (propAllSubjects.length > 0) {
      // Use pre-loaded subjects from parent
      setAllSubjects(propAllSubjects);
      filterSubjectsByChildren(propAllSubjects, selectedChildIds);
    } else {
      // Fallback: load from database if not provided
      loadSubjects(selectedChildIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, familyId, propAllSubjects.length]); // Use length instead of array to avoid re-renders

  // Filter subjects when children selection changes (if using pre-loaded subjects)
  useEffect(() => {
    if (visible && propAllSubjects.length > 0 && allSubjects.length > 0) {
      filterSubjectsByChildren(allSubjects, selectedChildIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildIds, visible, propAllSubjects.length, allSubjects.length]);

  // Reload subjects when selectedChildIds changes (when NOT using pre-loaded subjects)
  useEffect(() => {
    if (visible && familyId && propAllSubjects.length === 0 && !loadingSubjectsRef.current) {
      loadSubjects(selectedChildIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChildIds.join(',')]); // Use join to create stable dependency

  const loadSubjects = async (childIds = []) => {
    if (!familyId || loadingSubjectsRef.current) return; // Prevent concurrent loads
    
    loadingSubjectsRef.current = true;
    setLoadingSubjects(true);
    try {
      let query = supabase
        .from('subject')
        .select('id, name, child_id')
        .eq('family_id', familyId);

      // If children are selected, get family-wide subjects OR child-specific subjects for those children
      if (childIds.length > 0) {
        query = query.or(`child_id.is.null,child_id.in.(${childIds.join(',')})`);
      } else {
        // If no children selected, show only family-wide subjects
        query = query.is('child_id', null);
      }

      const { data, error } = await query.order('name');
      
      if (!error && data) {
        // Deduplicate by name, preferring child-specific over family-wide
        const subjectMap = new Map();
        
        data.forEach(subject => {
          const existing = subjectMap.get(subject.name);
          
          // If no existing entry, add this one
          if (!existing) {
            subjectMap.set(subject.name, subject);
          } 
          // If existing is family-wide and this is child-specific, replace it (prefer child-specific)
          else if (existing.child_id === null && subject.child_id !== null) {
            subjectMap.set(subject.name, subject);
          }
          // If both are child-specific, prefer the one matching first selected child
          else if (existing.child_id !== null && subject.child_id !== null && childIds.length > 0) {
            const firstChildId = childIds[0];
            if (subject.child_id === firstChildId && existing.child_id !== firstChildId) {
              subjectMap.set(subject.name, subject);
            }
          }
        });
        
        let uniqueSubjects = Array.from(subjectMap.values());

        // Ensure defaultSubjectId is present even if filters/dedup skipped it
        if (defaultSubjectId && !uniqueSubjects.some(s => s.id === defaultSubjectId)) {
          const fallbackName = defaultSubjectName || 'Selected subject';
          uniqueSubjects.push({
            id: defaultSubjectId,
            name: fallbackName,
            child_id: null,
          });
        }

        uniqueSubjects = uniqueSubjects.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setAllSubjects(uniqueSubjects);
        setFilteredSubjects(uniqueSubjects);
      } else if (error) {
        console.warn('[AddMaterialModal] Error loading subjects:', error);
        setAllSubjects([]);
        setFilteredSubjects([]);
      }
    } catch (error) {
      console.warn('[AddMaterialModal] Error loading subjects:', error);
      setAllSubjects([]);
      setFilteredSubjects([]);
    } finally {
      loadingSubjectsRef.current = false;
      setLoadingSubjects(false);
    }
  };

  const filterSubjectsByChildren = (subjectsToFilter, childIds) => {
    if (!childIds || childIds.length === 0) {
      // If no children selected, show only family-wide subjects
      const familyWide = subjectsToFilter.filter(s => s.child_id === null);
      setFilteredSubjects(familyWide);
      return;
    }

    // Filter subjects to show:
    // 1. Family-wide subjects (child_id is null) - show for all children
    // 2. Child-specific subjects (child_id matches selected child) - show only for that child
    // Deduplicate by name, preferring child-specific over family-wide
    const subjectMap = new Map();
    
    subjectsToFilter.forEach(subject => {
      const isFamilyWide = subject.child_id === null;
      const isForSelectedChild = subject.child_id !== null && childIds.includes(subject.child_id);
      const shouldInclude = isFamilyWide || isForSelectedChild;
      
      if (shouldInclude) {
        const existing = subjectMap.get(subject.name);
        
        // If no existing entry, add this one
        if (!existing) {
          subjectMap.set(subject.name, subject);
        } 
        // If existing is family-wide and this is child-specific, replace it (prefer child-specific)
        else if (existing.child_id === null && subject.child_id !== null) {
          subjectMap.set(subject.name, subject);
        }
        // If both are child-specific, prefer the one matching first selected child
        else if (existing.child_id !== null && subject.child_id !== null) {
          const firstChildId = childIds[0];
          if (subject.child_id === firstChildId && existing.child_id !== firstChildId) {
            subjectMap.set(subject.name, subject);
          }
        }
      }
    });
    
    const filtered = Array.from(subjectMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    setFilteredSubjects(filtered);
  };

  useEffect(() => {
    if (visible && material) {
      // Edit mode: populate form with existing material data
      setTitle(material.title || '');
      
      // Derive role from tags
      const tags = material.tags || [];
      const roleTag = tags.find(t => t.startsWith('role:'));
      const derivedRole = roleTag ? roleTag.replace('role:', '') : '';
      setRole(derivedRole);
      
      // Set subject ID - wait for subjects to load if needed
      if (material.subject_id) {
        setSelectedSubjectId(material.subject_id);
      } else if (material.subject_key && allSubjects.length > 0) {
        // Find subject by name
        const subject = allSubjects.find(s => s.name === material.subject_key);
        if (subject) {
          setSelectedSubjectId(subject.id);
        } else {
          setSelectedSubjectId(null);
        }
      } else {
        setSelectedSubjectId(null);
      }
        
        // Set children from material_children
        const childIds = (material.material_children || []).map(mc => mc.child_id);
        setSelectedChildIds(childIds);
        
        setProviderName(material.provider_name || '');
        setProviderUrl(material.provider_url || '');
        
        // Set purchase date
        if (material.purchase_date) {
          setPurchaseDate(new Date(material.purchase_date));
        } else {
          setPurchaseDate(null);
        }
        
        setPurchasePrice(material.purchase_price ? String(material.purchase_price) : '');
        
        // Check if subscription from tags or is_subscription
        const isSub = material.is_subscription || tags.some(t => t.startsWith('subscription:'));
        setIsSubscription(isSub);
        const subFreqTag = tags.find(t => t.startsWith('subscription:'));
        if (subFreqTag) {
          const freq = subFreqTag.replace('subscription:', '');
          setSubscriptionFrequency(freq === 'yearly' ? 'yearly' : 'monthly');
        } else {
          setSubscriptionFrequency('monthly');
        }
        
        // Set uploaded file info if it exists
        if (material.storage_path) {
          setUploadedFile({
            name: material.filename || material.title || 'Uploaded file',
            size: material.bytes || 0,
            type: material.mime || 'application/octet-stream',
            path: material.storage_path,
          });
          // Try to get URL if available
          if (material.provider_url && !material.provider_url.includes('/storage/')) {
            setUploadedFileUrl(material.provider_url);
          }
        } else {
          setUploadedFile(null);
          setUploadedFileUrl('');
        }
        
        // Show expanded sections if they have data
        setShowProviderInfo(!!(material.provider_name || material.provider_url));
        setShowPurchaseInfo(!!(material.purchase_date || material.purchase_price || isSub));
        
        // Populate review fields from material review fields (single review per material)
        if (material.review_child_id || material.review_rating || material.review_emotion || material.review_pacing_fit || material.review_difficulty || material.review_notes) {
          setReviewChildId(material.review_child_id || null);
          setReviewRating(material.review_rating || null);
          setReviewEmotion(material.review_emotion || null);
          setReviewPacingFit(material.review_pacing_fit || null);
          setReviewDifficulty(material.review_difficulty || null);
          setReviewNotes(material.review_notes || '');
          setShowReviewInfo(true); // Auto-expand if there's a review
        } else {
          setShowReviewInfo(false);
          // Reset review fields
          setReviewChildId(null);
          setReviewRating(null);
          setReviewEmotion(null);
          setReviewPacingFit(null);
          setReviewDifficulty(null);
          setReviewNotes('');
        }
      }
  }, [visible, material, allSubjects]);

  // Separate effect for resetting form in add mode
  useEffect(() => {
    if (visible && !material) {
      // Add mode: reset form
      setTitle('');
      setRole(defaultRole || '');
      setSelectedSubjectId(defaultSubjectId || null);
      const initialChildIds =
        Array.isArray(defaultChildIds) && defaultChildIds.length > 0
          ? defaultChildIds
          : (defaultChildId ? [defaultChildId] : []);
      setSelectedChildIds(initialChildIds);
      setProviderName('');
      setProviderUrl('');
      setPurchaseDate(null);
      setPurchasePrice('');
      setIsSubscription(false);
      setSubscriptionFrequency('monthly');
      setUploadedFile(null);
      setUploadedFileUrl('');
      setShowProviderInfo(false);
      setShowPurchaseInfo(false);
      setShowReviewInfo(false);
      
      // Reset review fields
      setReviewChildId(null);
      setReviewRating(null);
      setReviewEmotion(null);
      setReviewPacingFit(null);
      setReviewDifficulty(null);
      setReviewNotes('');
    }
  }, [visible, material, defaultRole, defaultSubjectId, defaultChildId, defaultChildIds]);

  const handleFileSelect = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      Alert.alert('File Upload', 'File upload is currently only supported on web.');
      return;
    }

    // Create input element dynamically (more reliable in React Native Web)
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp';
    
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) {
        console.log('[AddMaterialModal] File selected:', file.name, file.type, file.size);
        handleFileUpload(file);
      } else {
        console.warn('[AddMaterialModal] No file selected');
      }
      // Clean up the temporary input
      setTimeout(() => {
        try {
          if (input.parentNode) {
            input.parentNode.removeChild(input);
          }
        } catch (cleanupErr) {
          console.warn('[AddMaterialModal] Cleanup error:', cleanupErr);
        }
      }, 100);
    };
    
    input.onerror = (err) => {
      console.error('[AddMaterialModal] File input error:', err);
      Alert.alert('Error', 'File input error. Please try again.');
      // Clean up on error
      setTimeout(() => {
        try {
          if (input.parentNode) {
            input.parentNode.removeChild(input);
          }
        } catch (cleanupErr) {
          console.warn('[AddMaterialModal] Cleanup error:', cleanupErr);
        }
      }, 100);
    };
    
    // Add to DOM temporarily (some browsers require this)
    input.style.display = 'none';
    input.style.position = 'absolute';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    
    console.log('[AddMaterialModal] Triggering file input click, familyId:', familyId);
    
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      try {
        input.click();
        console.log('[AddMaterialModal] File input click triggered');
      } catch (clickErr) {
        console.error('[AddMaterialModal] Error clicking file input:', clickErr);
        Alert.alert('Error', 'Could not open file picker. Please try again.');
        // Clean up on error
        setTimeout(() => {
          try {
            if (input.parentNode) {
              input.parentNode.removeChild(input);
            }
          } catch (cleanupErr) {
            console.warn('[AddMaterialModal] Cleanup error:', cleanupErr);
          }
        }, 100);
      }
    }, 0);
    
    // Cleanup fallback after a delay (in case cleanup in onchange doesn't work)
    setTimeout(() => {
      try {
        if (input.parentNode) {
          input.parentNode.removeChild(input);
        }
      } catch (cleanupErr) {
        console.warn('[AddMaterialModal] Cleanup fallback error:', cleanupErr);
      }
    }, 5000);
  };

  const handleFileUpload = async (file) => {
    if (!file) {
      console.warn('[AddMaterialModal] handleFileUpload called with no file');
      return;
    }
    
    if (!familyId) {
      Alert.alert('Error', 'Family ID is missing');
      return;
    }

    console.log('[AddMaterialModal] Starting file upload:', {
      name: file.name,
      type: file.type,
      size: file.size,
      familyId
    });

    setUploading(true);
    try {
      // Generate unique filename
      // Extract extension from filename (handle cases where filename might contain URL-like patterns)
      const lastDotIndex = file.name.lastIndexOf('.');
      const fileExt = lastDotIndex > 0 ? file.name.substring(lastDotIndex + 1) : '';
      // Clean filename: replace problematic characters, but preserve original name structure
      const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      // Use same path format as other working uploads: familyId/uuid_filename
      const filePath = `${familyId}/${crypto.randomUUID()}_${safeFileName}`;

      // Determine if it's an image or document
      // Check mime type first (most reliable), then file extension
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || fileExt.toLowerCase() === 'pdf';
      const bucket = 'evidence'; // Use evidence bucket for materials

      console.log('[AddMaterialModal] Uploading to path:', filePath);

      // Upload to Supabase Storage
      // Include metadata for RLS policy (matches working examples)
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type,
          metadata: { family_id: familyId } // Required for RLS policy
        });

      if (uploadError) {
        console.error('[AddMaterialModal] Storage upload error:', uploadError);
        
        // Provide helpful error message for RLS violations
        let errorMessage = uploadError.message || 'Failed to upload file.';
        if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('policy')) {
          errorMessage = 'Storage access denied. Please ensure:\n1. The "evidence" bucket exists in Supabase Storage\n2. RLS policies are configured correctly\n3. You are authenticated';
        } else if (uploadError.message?.includes('Bucket not found')) {
          errorMessage = 'The "evidence" storage bucket does not exist. Please create it in your Supabase Dashboard under Storage.';
        }
        
        Alert.alert('Upload Error', errorMessage);
        setUploading(false);
        return;
      }

      console.log('[AddMaterialModal] File uploaded successfully:', uploadData);

      // Get URL using the path returned from upload (more reliable)
      // For private buckets, we can't use public URLs - we'll generate signed URLs when needed
      const storagePath = uploadData?.path || filePath;
      let fileUrl = null;
      
      // Try to get a signed URL for private buckets (valid for 1 year for materials)
      try {
        const { data: signedUrlData, error: signedError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(storagePath, 31536000); // 1 year expiry for materials
        
        if (!signedError && signedUrlData?.signedUrl) {
          fileUrl = signedUrlData.signedUrl;
          console.log('[AddMaterialModal] Generated signed URL for file');
        } else {
          // Fallback: try public URL (won't work for private buckets, but that's ok)
          const { data: urlData } = supabase.storage
            .from(bucket)
            .getPublicUrl(storagePath);
          fileUrl = urlData?.publicUrl || null;
        }
      } catch (urlError) {
        console.warn('[AddMaterialModal] Could not generate URL, but upload succeeded:', urlError);
        // Don't fail - we can generate URLs later when needed
      }

      // Store file info for later use when saving material
      // Use the path returned from upload (more reliable)
      const finalPath = uploadData?.path || filePath;
      setUploadedFile({
        name: file.name,
        size: file.size,
        type: file.type,
        path: finalPath,
      });
      
      // Store URL in appropriate field based on file type
      // Note: For private buckets, fileUrl might be null, but we have storage_path which is what matters
      // Don't overwrite providerUrl if it already has a value - uploaded files take precedence
      if (fileUrl) {
        setUploadedFileUrl(fileUrl);
        // Only set providerUrl if it's currently empty (don't overwrite existing provider URL)
        if (!providerUrl.trim()) {
          setProviderUrl(fileUrl);
        }
      } else {
        // URL will be generated when needed (e.g., when opening the file)
        // The storage_path is what we need to save in the material record
        setUploadedFileUrl('');
        // Don't clear providerUrl if it has a value
      }

      // Note: We don't create an upload record here anymore - that's handled when saving the material
      // The uploads table has been consolidated into materials table

      Alert.alert('Success', 'File uploaded successfully');
    } catch (error) {
      Alert.alert('Upload Error', error.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  // Check if form is valid (title and type are required, document required only for new materials)
  const isFormValid = title.trim() && role && (material ? true : (uploadedFile && uploadedFile.path));

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter a title');
      return;
    }
    if (!role) {
      alert('Please select a type');
      return;
    }
    if (!material && (!uploadedFile || !uploadedFile.path)) {
      alert('Please upload a document');
      return;
    }
    if (!familyId) {
      alert('Missing family ID');
      return;
    }

    setLoading(true);
    try {
      const tags = [];
      if (role) tags.push(`role:${role}`);
      if (isSubscription && subscriptionFrequency) {
        tags.push(`subscription:${subscriptionFrequency}`);
      }

      if (material) {
        // Edit mode: update existing material
        const subjectName = selectedSubjectId ? allSubjects.find(s => s.id === selectedSubjectId)?.name || null : null;
        
        const updates = {
          title: title.trim(),
          subject_key: subjectName,
          subject_id: selectedSubjectId || null,
          is_subscription: isSubscription,
          provider_name: providerName.trim() || null,
          provider_url: providerUrl.trim() || null,
          purchase_date: purchaseDate ? purchaseDate.toISOString().split('T')[0] : null,
          purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
          tags: tags,
        };

        // If new file uploaded, update storage_path and mime
        if (uploadedFile && uploadedFile.path && uploadedFile.path !== material.storage_path) {
          updates.storage_path = uploadedFile.path;
          updates.mime = uploadedFile.type || 'application/octet-stream';
          updates.bytes = uploadedFile.size || 0;
          if (uploadedFileUrl) {
            updates.provider_url = uploadedFileUrl;
          }
        }

        // Save/update review if provided (single review per material, stored directly on materials table)
        // IMPORTANT: Add review fields BEFORE calling updateMaterial
        if (reviewChildId && (reviewRating || reviewEmotion || reviewPacingFit || reviewDifficulty || reviewNotes.trim())) {
          // Update the material with review fields
          const reviewUpdates = {
            review_child_id: reviewChildId,
            review_rating: reviewRating || null,
            review_emotion: reviewEmotion || null,
            review_pacing_fit: reviewPacingFit || null,
            review_difficulty: reviewDifficulty || null,
            review_notes: reviewNotes.trim() || null,
            review_updated_at: new Date().toISOString(),
          };
          
          console.log('[AddMaterialModal] Saving review fields:', reviewUpdates);
          
          // Merge review updates with existing updates
          Object.assign(updates, reviewUpdates);
        } else if (material && (reviewChildId === null || (!reviewRating && !reviewEmotion && !reviewPacingFit && !reviewDifficulty && !reviewNotes.trim()))) {
          // Clear review if all fields are empty
          const reviewUpdates = {
            review_child_id: null,
            review_rating: null,
            review_emotion: null,
            review_pacing_fit: null,
            review_difficulty: null,
            review_notes: null,
            review_updated_at: null,
          };
          Object.assign(updates, reviewUpdates);
        }

        console.log('[AddMaterialModal] Updating material with all fields including reviews:', updates);
        try {
          const updated = await updateMaterial(material.id, updates);
        console.log('[AddMaterialModal] Material updated successfully. Review fields in response:', {
          review_child_id: updated?.review_child_id,
          review_rating: updated?.review_rating,
          review_emotion: updated?.review_emotion,
        });
        
        // Dispatch event for other components to refresh
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('materialUpdated', { 
            detail: { materialId: material.id, familyId } 
          }));
          window.dispatchEvent(new CustomEvent('refreshMaterials'));
          window.dispatchEvent(new CustomEvent('refreshSubjects'));
          const subId = selectedSubjectId || material?.subject_id;
          if (subId) {
            window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId: subId } }));
          }
        }
        } catch (updateError) {
          console.error('[AddMaterialModal] Error updating material:', updateError);
          console.error('[AddMaterialModal] Error details:', {
            message: updateError.message,
            code: updateError.code,
            details: updateError.details,
            hint: updateError.hint,
          });
          throw updateError; // Re-throw to be caught by outer try-catch
        }

        // Update material_children relationships
        const existingChildIds = (material.material_children || []).map(mc => mc.child_id);
        
        // Remove children that are no longer selected
        const toRemove = existingChildIds.filter(id => !selectedChildIds.includes(id));
        if (toRemove.length > 0) {
          await Promise.all(
            toRemove.map(childId => 
              supabase
                .from('material_children')
                .delete()
                .eq('material_id', material.id)
                .eq('child_id', childId)
            )
          );
        }
        
        // Add new children
        const toAdd = selectedChildIds.filter(id => !existingChildIds.includes(id));
        if (toAdd.length > 0) {
          await Promise.all(
            toAdd.map((childId) => linkMaterialToChild(material.id, childId, familyId, 'planned'))
          );
        }

        // Update material-child link status to 'completed' if rating is positive
        if (reviewChildId && reviewRating && reviewRating >= 4) {
          await updateMaterialChildStatus(material.id, reviewChildId, 'completed', {
            finished_at: new Date().toISOString().split('T')[0],
          });
        } else if (reviewChildId) {
          // Ensure link exists
          await linkMaterialToChild(material.id, reviewChildId, familyId, 'in_use');
        }
      } else {
        // Add mode: create new material
        // Get current user for created_by
        const { data: { user } } = await supabase.auth.getUser();

        let created;
        
        // If we have an uploaded file, use createFileMaterial (handles storage_path properly)
        if (uploadedFile && uploadedFile.path) {
          const { createFileMaterial } = await import('../../lib/services/materialsClient');
          
          created = await createFileMaterial({
            familyId,
            storagePath: uploadedFile.path,
            title: title.trim() || uploadedFile.name,
            mime: uploadedFile.type || 'application/octet-stream',
            bytes: uploadedFile.size || 0,
            tags: tags,
            notes: null,
            subjectId: selectedSubjectId || null,
            url: uploadedFileUrl || providerUrl.trim() || null,
          });
        } else {
          // For URL-based materials (no file upload), use createMaterial
          const finalProviderUrl = providerUrl.trim() || null;

          const materialData = {
            family_id: familyId,
            title: title.trim(),
            type: isSubscription ? 'subscription' : 'other',
            subject_id: selectedSubjectId || null,
            subject_key: selectedSubjectId ? allSubjects.find(s => s.id === selectedSubjectId)?.name || null : null,
            is_subscription: isSubscription,
            provider_name: providerName.trim() || null,
            provider_url: finalProviderUrl,
            cover_image_url: uploadedFile && uploadedFile.type?.startsWith('image/') ? finalProviderUrl : null,
            purchase_date: purchaseDate ? purchaseDate.toISOString().split('T')[0] : null,
            purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
            tags: tags,
            created_by: user?.id || null,
          };

          created = await createMaterial(materialData);
        }

        // Link to selected children (optional)
        if (created?.id && selectedChildIds.length > 0 && familyId) {
          await Promise.all(
            selectedChildIds.map((childId) => linkMaterialToChild(created.id, childId, familyId, 'planned'))
          );
        }

        // Save review if provided (single review per material, stored directly on materials table)
        if (created?.id && reviewChildId && (reviewRating || reviewEmotion || reviewPacingFit || reviewDifficulty || reviewNotes.trim())) {
          // Update the material with review fields
          const reviewUpdates = {
            review_child_id: reviewChildId,
            review_rating: reviewRating || null,
            review_emotion: reviewEmotion || null,
            review_pacing_fit: reviewPacingFit || null,
            review_difficulty: reviewDifficulty || null,
            review_notes: reviewNotes.trim() || null,
            review_updated_at: new Date().toISOString(),
          };
          
          await updateMaterial(created.id, reviewUpdates);

          // Update material-child link status to 'completed' if rating is positive
          if (reviewRating && reviewRating >= 4) {
            await updateMaterialChildStatus(created.id, reviewChildId, 'completed', {
              finished_at: new Date().toISOString().split('T')[0],
            });
          } else {
            // Ensure link exists
            await linkMaterialToChild(created.id, reviewChildId, familyId, 'in_use');
          }
        }
      }

      // Dispatch event for other components to refresh
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const materialId = material?.id || created?.id;
        if (materialId) {
          window.dispatchEvent(new CustomEvent('materialUpdated', { 
            detail: { materialId, familyId, action: material ? 'updated' : 'created' } 
          }));
          window.dispatchEvent(new CustomEvent('refreshMaterials'));
          window.dispatchEvent(new CustomEvent('refreshSubjects'));
          const subId = material ? (selectedSubjectId || material?.subject_id) : (selectedSubjectId || created?.subject_id);
          if (subId) {
            window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId: subId } }));
          }
        }
      }

      if (onSaved) {
        onSaved();
      }
      onClose();
    } catch (error) {
      alert(`Failed to ${material ? 'update' : 'save'} material: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <TouchableOpacity
          activeOpacity={1}
          onPress={(e) => e.stopPropagation()}
          style={styles.modal}
        >
          {/* Header */}
          <View style={[styles.header, material && styles.headerEdit]}>
            <View style={styles.headerTitleRow}>
              {material ? (
                <View style={styles.headerIconWrap}>
                  <FileText size={20} color={MUTED} />
                </View>
              ) : null}
              <Text style={styles.title}>{material ? 'Edit Material' : 'Add Material'}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={20} color={MUTED} />
            </TouchableOpacity>
          </View>
          {material ? <View style={styles.headerDivider} /> : null}

          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {/* Document Upload */}
            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  Document Upload {!material && <Text style={{ color: '#ef4444' }}>*</Text>}
                </Text>
              <TouchableOpacity
                style={[styles.uploadButton, uploading && styles.uploadButtonDisabled]}
                onPress={handleFileSelect}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <ActivityIndicator size="small" color={ACCENT} />
                    <Text style={styles.uploadButtonText}>Uploading...</Text>
                  </>
                ) : (
                  <>
                    <Upload size={16} color={ACCENT} />
                    <Text style={styles.uploadButtonText}>
                      {uploadedFile ? uploadedFile.name : 'Upload document or image'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              {uploadedFile && (
                <View style={styles.uploadedFileInfo}>
                  <FileText size={14} color={MUTED} />
                  <Text style={styles.uploadedFileText}>
                    {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(1)} KB)
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setUploadedFile(null);
                      setUploadedFileUrl('');
                      // Don't clear providerUrl when removing file - keep it if user entered it
                    }}
                    style={styles.removeFileButton}
                  >
                    <X size={14} color={MUTED} />
                  </TouchableOpacity>
                </View>
              )}
              </View>
            </View>

            {/* Title - Required */}
            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  Title <Text style={{ color: '#ef4444' }}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  value={title}
                  onChangeText={setTitle}
                  placeholder="e.g., Biology Textbook, Grade 4"
                  placeholderTextColor={MUTED}
                />
              </View>
            </View>

            {/* Type (Role) - Required */}
            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>
                  Type <Text style={{ color: '#ef4444' }}>*</Text>
                </Text>
                <View style={styles.dropdownContainer}>
                  <View style={styles.dropdownRow}>
                    {ROLE_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[
                          styles.dropdownOption,
                          role === opt.value && styles.dropdownOptionActive
                        ]}
                        onPress={() => setRole(opt.value)}
                      >
                        <Text style={[
                          styles.dropdownOptionText,
                          role === opt.value && styles.dropdownOptionTextActive
                        ]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </View>

            {/* Children */}
            {children.length > 0 && (
              <View style={styles.fieldRow}>
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Children (optional)</Text>
                  <View style={styles.dropdownContainer}>
                    <View style={styles.dropdownRow}>
                      {children.map((child) => {
                        const label = child.first_name || child.name || 'Child';
                        const active = selectedChildIds.includes(child.id);
                        return (
                          <TouchableOpacity
                            key={child.id}
                            style={[
                              styles.dropdownOption,
                              active && styles.dropdownOptionActive
                            ]}
                            onPress={() => {
                              setSelectedChildIds((prev) =>
                                prev.includes(child.id) ? prev.filter((id) => id !== child.id) : [...prev, child.id]
                              );
                            }}
                          >
                            <Text style={[
                              styles.dropdownOptionText,
                              active && styles.dropdownOptionTextActive
                            ]}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* Subject - Chip Selection */}
            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Subject (optional)</Text>
                {loadingSubjects ? (
                  <ActivityIndicator size="small" color={ACCENT} style={{ marginTop: 8 }} />
                ) : filteredSubjects.length > 0 ? (
                  <View style={styles.dropdownContainer}>
                    <View style={styles.dropdownRow}>
                      {filteredSubjects.map((subject) => {
                        const isSelected = selectedSubjectId === subject.id;
                        return (
                          <TouchableOpacity
                            key={subject.id}
                            style={[
                              styles.dropdownOption,
                              isSelected && styles.dropdownOptionActive
                            ]}
                            onPress={() => setSelectedSubjectId(isSelected ? null : subject.id)}
                          >
                            <Text style={[
                              styles.dropdownOptionText,
                              isSelected && styles.dropdownOptionTextActive
                            ]}>
                              {subject.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <Text style={styles.emptySubjectsText}>
                    {selectedChildIds.length > 0 
                      ? 'No subjects found for selected children. Select different children or add subjects first.'
                      : 'No subjects available. Add subjects first.'}
                  </Text>
                )}
              </View>
            </View>

            {/* Material Metadata Section */}
            <Text style={styles.metadataSectionTitle}>Material Metadata (optional)</Text>

            {/* Provider Info (optional) */}
            <View style={styles.blockSection}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => setShowProviderInfo(!showProviderInfo)}
              >
                <Text style={styles.sectionTitle}>Provider Information</Text>
                {showProviderInfo ? (
                  <ChevronUp size={20} color={SUB} />
                ) : (
                  <ChevronDown size={20} color={SUB} />
                )}
              </TouchableOpacity>
              {showProviderInfo && (
                <>
                  <View style={styles.fieldRow}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Provider (optional)</Text>
                      <TextInput
                        style={styles.input}
                        value={providerName}
                        onChangeText={setProviderName}
                        placeholder="e.g., OpenStax, Khan Academy"
                        placeholderTextColor={MUTED}
                      />
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Provider URL (optional)</Text>
                      <TextInput
                        style={styles.input}
                        value={providerUrl}
                        onChangeText={setProviderUrl}
                        placeholder="Link to provider website"
                        placeholderTextColor={MUTED}
                        keyboardType="url"
                        autoCapitalize="none"
                      />
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* Purchase Info */}
            <View style={styles.blockSection}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => setShowPurchaseInfo(!showPurchaseInfo)}
              >
                <Text style={styles.sectionTitle}>Purchase Information</Text>
                {showPurchaseInfo ? (
                  <ChevronUp size={20} color={SUB} />
                ) : (
                  <ChevronDown size={20} color={SUB} />
                )}
              </TouchableOpacity>
              {showPurchaseInfo && (
                <>
                  <View style={[styles.fieldRow, { marginTop: 8 }]}>
                    <View style={styles.field}>
                      <TouchableOpacity
                        style={styles.checkboxRow}
                        onPress={() => setIsSubscription(!isSubscription)}
                      >
                        <View style={[styles.checkbox, isSubscription && styles.checkboxChecked]}>
                          {isSubscription && <Text style={styles.checkmark}>✓</Text>}
                        </View>
                        <Text style={styles.checkboxLabel}>Subscription (optional)</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {isSubscription && (
                    <View style={styles.fieldRow}>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Frequency (optional)</Text>
                        <View style={styles.dropdownContainer}>
                          <View style={styles.dropdownRow}>
                            <TouchableOpacity
                              style={[
                                styles.dropdownOption,
                                subscriptionFrequency === 'monthly' && styles.dropdownOptionActive
                              ]}
                              onPress={() => setSubscriptionFrequency('monthly')}
                            >
                              <Text style={[
                                styles.dropdownOptionText,
                                subscriptionFrequency === 'monthly' && styles.dropdownOptionTextActive
                              ]}>
                                Monthly
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.dropdownOption,
                                subscriptionFrequency === 'yearly' && styles.dropdownOptionActive
                              ]}
                              onPress={() => setSubscriptionFrequency('yearly')}
                            >
                              <Text style={[
                                styles.dropdownOptionText,
                                subscriptionFrequency === 'yearly' && styles.dropdownOptionTextActive
                              ]}>
                                Yearly
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                  )}
                  <View style={styles.fieldRow}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Purchase Date (optional)</Text>
                      <TouchableOpacity
                        style={styles.dateInputButton}
                        onPress={() => {
                          setCalendarViewMonth(purchaseDate ? new Date(purchaseDate) : new Date());
                          setShowCalendarPicker(true);
                        }}
                      >
                        <Text style={[
                          styles.dateInputText,
                          !purchaseDate && styles.dateInputPlaceholder
                        ]}>
                          {purchaseDate ? fmt(purchaseDate) : 'Select purchase date'}
                        </Text>
                        {purchaseDate && (
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              setPurchaseDate(null);
                            }}
                            style={styles.clearDateButton}
                          >
                            <X size={14} color={MUTED} />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.fieldRow}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Price (optional)</Text>
                      <TextInput
                        style={styles.input}
                        value={purchasePrice}
                        onChangeText={setPurchasePrice}
                        placeholder="e.g., 29.99"
                        keyboardType="decimal-pad"
                        placeholderTextColor={MUTED}
                      />
                    </View>
                  </View>
                </>
              )}
            </View>

            {/* Rate and Review Material */}
            <View style={styles.blockSection}>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => setShowReviewInfo(!showReviewInfo)}
              >
                <Text style={styles.sectionTitle}>Rate and Review Material</Text>
                {showReviewInfo ? (
                  <ChevronUp size={20} color={SUB} />
                ) : (
                  <ChevronDown size={20} color={SUB} />
                )}
              </TouchableOpacity>
              {showReviewInfo && (
                <>
                  {/* Select Child for Review */}
                  {children.length > 0 && (
                    <View style={styles.fieldRow}>
                      <View style={styles.field}>
                        <Text style={styles.fieldLabel}>Child (optional)</Text>
                        <View style={styles.dropdownContainer}>
                          <View style={styles.dropdownRow}>
                            {children.map((child) => {
                              const label = child.first_name || child.name || 'Child';
                              const active = reviewChildId === child.id;
                              return (
                                <TouchableOpacity
                                  key={child.id}
                                  style={[
                                    styles.dropdownOption,
                                    active && styles.dropdownOptionActive
                                  ]}
                                  onPress={() => setReviewChildId(active ? null : child.id)}
                                >
                                  <Text style={[
                                    styles.dropdownOptionText,
                                    active && styles.dropdownOptionTextActive
                                  ]}>
                                    {label}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    </View>
                  )}

                  {/* Rating */}
                  <View style={styles.fieldRow}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Rating (1-5) (optional)</Text>
                      <View style={styles.ratingContainer}>
                        {[1, 2, 3, 4, 5].map(num => (
                          <TouchableOpacity
                            key={num}
                            style={[
                              styles.dropdownOption,
                              reviewRating === num && styles.dropdownOptionActive
                            ]}
                            onPress={() => setReviewRating(reviewRating === num ? null : num)}
                          >
                            <Text style={[
                              styles.dropdownOptionText,
                              reviewRating === num && styles.dropdownOptionTextActive
                            ]}>
                              {num}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  {/* Emotion */}
                  <View style={styles.fieldRow}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Emotional Response (optional)</Text>
                      <View style={styles.emotionContainer}>
                        {EMOTIONS.map(em => (
                          <TouchableOpacity
                            key={em.value}
                            style={[
                              styles.dropdownOption,
                              reviewEmotion === em.value && styles.dropdownOptionActive
                            ]}
                            onPress={() => setReviewEmotion(reviewEmotion === em.value ? null : em.value)}
                          >
                            <Text style={[
                              styles.dropdownOptionText,
                              reviewEmotion === em.value && styles.dropdownOptionTextActive
                            ]}>
                              {em.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  {/* Pacing */}
                  <View style={styles.fieldRow}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Pacing Fit (optional)</Text>
                      <View style={styles.pillsContainer}>
                        {PACING_OPTIONS.map(opt => (
                          <TouchableOpacity
                            key={opt.value}
                            style={[
                              styles.dropdownOption,
                              reviewPacingFit === opt.value && styles.dropdownOptionActive
                            ]}
                            onPress={() => setReviewPacingFit(reviewPacingFit === opt.value ? null : opt.value)}
                          >
                            <Text style={[
                              styles.dropdownOptionText,
                              reviewPacingFit === opt.value && styles.dropdownOptionTextActive
                            ]}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  {/* Difficulty */}
                  <View style={styles.fieldRow}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Difficulty Level (optional)</Text>
                      <View style={styles.pillsContainer}>
                        {DIFFICULTY_OPTIONS.map(opt => (
                          <TouchableOpacity
                            key={opt.value}
                            style={[
                              styles.dropdownOption,
                              reviewDifficulty === opt.value && styles.dropdownOptionActive
                            ]}
                            onPress={() => setReviewDifficulty(reviewDifficulty === opt.value ? null : opt.value)}
                          >
                            <Text style={[
                              styles.dropdownOptionText,
                              reviewDifficulty === opt.value && styles.dropdownOptionTextActive
                            ]}>
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  {/* Review Notes */}
                  <View style={styles.fieldRow}>
                    <View style={styles.field}>
                      <Text style={styles.fieldLabel}>Notes (optional)</Text>
                      <TextInput
                        style={[styles.input, styles.textArea]}
                        multiline
                        numberOfLines={3}
                        placeholder="Any additional thoughts..."
                        value={reviewNotes}
                        onChangeText={setReviewNotes}
                        placeholderTextColor={MUTED}
                      />
                    </View>
                  </View>
                </>
              )}
            </View>
          </ScrollView>

          {material ? <View style={styles.footerDivider} /> : null}
          {/* Actions - Fixed at bottom */}
          <View style={[styles.actions, material && styles.actionsEdit]}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.saveButton, 
                (loading || !isFormValid) && styles.saveButtonDisabled
              ]}
              onPress={handleSave}
              disabled={loading || !isFormValid}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>{material ? 'Save Changes' : 'Add Material'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </View>

      {/* Mini Calendar Picker Modal */}
      {showCalendarPicker && (
        <Modal
          animationType="fade"
          transparent={true}
          visible={showCalendarPicker}
          onRequestClose={() => setShowCalendarPicker(false)}
        >
          <TouchableOpacity
            style={{
              flex: 1,
              backgroundColor: 'rgba(0, 0, 0, 0.3)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
            activeOpacity={1}
            onPress={() => setShowCalendarPicker(false)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: 12,
                padding: 16,
                width: Platform.OS === 'web' ? 320 : '90%',
                maxWidth: 320,
                ...Platform.select({
                  web: {
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  },
                  default: {
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.15,
                    shadowRadius: 12,
                    elevation: 8,
                  },
                }),
              }}
            >
              {/* Month/Year Navigation */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(calendarViewMonth);
                    newMonth.setMonth(newMonth.getMonth() - 1);
                    setCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <ChevronLeft size={20} color={FG} />
                </TouchableOpacity>
                <Text style={{
                  fontSize: 16,
                  fontWeight: '600',
                  color: FG,
                  ...(Platform.OS === 'web' && {
                    fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                  }),
                }}>
                  {calendarViewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(calendarViewMonth);
                    newMonth.setMonth(newMonth.getMonth() + 1);
                    setCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <ChevronRight size={20} color={FG} />
                </TouchableOpacity>
              </View>

              {/* Year Navigation (for quick jumps) */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 12,
              }}>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(calendarViewMonth);
                    newMonth.setFullYear(newMonth.getFullYear() - 1);
                    setCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: SUB,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>← Year</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const today = new Date();
                    setPurchaseDate(today);
                    setCalendarViewMonth(today);
                    setShowCalendarPicker(false);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: SUB, 
                    textDecorationLine: 'underline',
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>Today</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    const newMonth = new Date(calendarViewMonth);
                    newMonth.setFullYear(newMonth.getFullYear() + 1);
                    setCalendarViewMonth(newMonth);
                  }}
                  style={{ padding: 4 }}
                >
                  <Text style={{ 
                    fontSize: 12, 
                    color: SUB,
                    ...(Platform.OS === 'web' && {
                      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                    }),
                  }}>Year →</Text>
                </TouchableOpacity>
              </View>

              {/* Calendar Grid */}
              <View>
                {/* Day Headers */}
                <View style={{
                  flexDirection: 'row',
                  marginBottom: 8,
                }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <View key={day} style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{
                        fontSize: 11,
                        color: SUB,
                        fontWeight: '500',
                        ...(Platform.OS === 'web' && {
                          fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                        }),
                      }}>{day}</Text>
                    </View>
                  ))}
                </View>

                {/* Calendar Days */}
                {(() => {
                  const year = calendarViewMonth.getFullYear();
                  const month = calendarViewMonth.getMonth();
                  const firstDay = new Date(year, month, 1);
                  const lastDay = new Date(year, month + 1, 0);
                  const startDate = new Date(firstDay);
                  startDate.setDate(startDate.getDate() - startDate.getDay()); // Start from Sunday
                  
                  const days = [];
                  const currentDate = new Date(startDate);
                  
                  // Generate 6 weeks of days
                  for (let i = 0; i < 42; i++) {
                    days.push(new Date(currentDate));
                    currentDate.setDate(currentDate.getDate() + 1);
                  }

                  return (
                    <View>
                      {[0, 1, 2, 3, 4, 5].map((week) => (
                        <View key={week} style={{ flexDirection: 'row', marginBottom: 4 }}>
                          {days.slice(week * 7, (week + 1) * 7).map((day, idx) => {
                            const isCurrentMonth = day.getMonth() === month;
                            const isSelected = purchaseDate && day.toDateString() === purchaseDate.toDateString();
                            const isToday = day.toDateString() === new Date().toDateString();
                            
                            return (
                              <TouchableOpacity
                                key={idx}
                                onPress={() => {
                                  setPurchaseDate(day);
                                  setShowCalendarPicker(false);
                                }}
                                style={{
                                  flex: 1,
                                  aspectRatio: 1,
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: 6,
                                  backgroundColor: isSelected ? ACCENT : 'transparent',
                                  borderWidth: isToday ? 2 : 0,
                                  borderColor: isToday ? ACCENT : 'transparent',
                                }}
                              >
                                <Text style={{
                                  fontSize: 13,
                                  color: isSelected 
                                    ? '#FFFFFF' 
                                    : (isCurrentMonth ? FG : MUTED),
                                  fontWeight: isSelected || isToday ? '600' : '400',
                                  ...(Platform.OS === 'web' && {
                                    fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                                  }),
                                }}>
                                  {day.getDate()}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ))}
                    </View>
                  );
                })()}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    overflow: 'hidden',
    width: 720,
    maxWidth: '100%',
    maxHeight: '90%',
    flexDirection: 'column',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerEdit: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  headerIconWrap: {
    marginRight: 2,
  },
  headerDivider: {
    height: 1,
    backgroundColor: colors.border || '#e5e7eb',
    marginHorizontal: 20,
    marginTop: 16,
  },
  footerDivider: {
    height: 1,
    backgroundColor: colors.border || '#e5e7eb',
    marginHorizontal: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 10,
  },
  section: {
    marginBottom: 24,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    overflow: 'visible',
  },
  field: {
    flex: 1,
    minWidth: 0,
    overflow: 'visible',
  },
  fieldLabel: {
    color: SUB,
    fontSize: 12,
    marginBottom: 4,
    fontWeight: '500',
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
  },
  required: {
    color: '#ef4444',
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 10,
    color: FG,
    marginBottom: 8,
    textAlign: 'left',
    backgroundColor: '#ffffff',
    fontSize: 14,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  inputMarginTop: {
    marginTop: 8,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  dropdownContainer: {
    flexDirection: 'row',
    width: '100%',
    flex: 1,
  },
  dropdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
  },
  dropdownOption: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CHIP_BORDER,
    backgroundColor: '#fff',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  dropdownOptionActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#bae6fd',
  },
  dropdownOptionText: {
    color: FG,
    fontSize: 12,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dropdownOptionTextActive: {
    fontWeight: '600',
    color: FG,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  checkmark: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dateInputButton: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  dateInputText: {
    color: FG,
    fontSize: 14,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  dateInputPlaceholder: {
    color: MUTED,
  },
  clearDateButton: {
    padding: 2,
    marginLeft: 8,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionsEdit: {
    borderTopWidth: 0,
    backgroundColor: '#ffffff',
  },
  cancelButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  saveButton: {
    backgroundColor: '#85C4F2',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    alignSelf: 'flex-end',
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 6px rgba(133,196,242,0.3)',
      cursor: 'pointer',
    }),
  },
  saveButtonDisabled: {
    backgroundColor: '#9CA3AF',
    opacity: 0.8,
    ...(Platform.OS === 'web' && { cursor: 'not-allowed' }),
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", sans-serif',
    }),
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  uploadButtonDisabled: {
    opacity: 0.5,
  },
  uploadButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  uploadedFileInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    padding: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  uploadedFileText: {
    flex: 1,
    fontSize: 13,
    color: colors.text,
  },
  removeFileButton: {
    padding: 4,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  emptySubjectsText: {
    fontSize: 13,
    color: MUTED,
    fontStyle: 'italic',
    marginTop: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  blockSection: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
    backgroundColor: '#f9fafb',
    overflow: 'visible',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: FG,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  metadataSectionTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: SUB,
    marginTop: 24,
    marginBottom: 4,
    textAlign: 'left',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  ratingContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  ratingButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: BORDER,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  ratingButtonActive: {
    borderColor: ACCENT,
    backgroundColor: '#fef3c7',
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '600',
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  ratingTextActive: {
    color: ACCENT,
  },
  emotionContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emotionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  emotionButtonActive: {
    borderColor: ACCENT,
    backgroundColor: '#fef3c7',
  },
  emotionEmoji: {
    fontSize: 20,
  },
  emotionLabel: {
    fontSize: 14,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emotionLabelActive: {
    color: ACCENT,
    fontWeight: '500',
  },
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  pillActive: {
    borderColor: ACCENT,
    backgroundColor: '#fef3c7',
  },
  pillText: {
    fontSize: 14,
    color: FG,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pillTextActive: {
    color: ACCENT,
    fontWeight: '500',
  },
});

