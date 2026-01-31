/**
 * Materials Library Page
 * Main page for viewing and managing family materials
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
  Modal,
  Alert,
  Image,
} from 'react-native';
import { Plus, Search, DollarSign, FileText, X, ExternalLink, ArrowUpAZ, Calendar, Trash2, RotateCcw, Trash, MoreVertical, ChevronDown, Check, ArrowUp, ArrowDown, BookOpen, Edit2, Sparkles } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getMaterials, archiveMaterial, getDeletedMaterials, restoreMaterial, permanentlyDeleteMaterial } from '../../lib/services/materialsClient';
import MaterialCard from './MaterialCard';
import MaterialDetailDrawer from './MaterialDetailDrawer';
import QuickReviewModal from './QuickReviewModal';
import AddMaterialModal from './AddMaterialModal';
import MaterialDetailsModal from './MaterialDetailsModal';
import { calculateReusePotential } from '../../lib/utils/materialReuseLogic';
import { supabase } from '../../lib/supabase';
import { shouldSuppressError } from '../../lib/apiClient';
import { DOCUMENT_ROLE_CHIPS, normalizeMaterial, normalizeUpload, matchesRole, roleLabel, mediaTypeLabel } from '../../lib/docs/roles';
import { useToast } from '../Toast';
import { getChildColorFromAvatar } from '../../utils/avatarColors';
import { parseChildIds } from '../../lib/services/subjectsClient';
import BuildCurriculumModal from '../planner/modals/BuildCurriculumModal';

// Helper function to check if a URL is from Supabase storage
const isSupabaseStorageUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  // Check if URL contains Supabase storage path patterns
  return url.includes('/storage/v1/object/') || url.includes('supabase.co/storage/');
};

// Single visible chip row everywhere: role-first
const ROLE_CHIPS = DOCUMENT_ROLE_CHIPS;


// Helper function to check if a string is just a UUID (not a valid URL)
const isUUID = (str) => {
  if (!str || typeof str !== 'string') return false;
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidPattern.test(str.trim());
};

// Helper function to check if a URL is valid for use as an iframe source
const isValidUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  // Reject if it's just a UUID (not a valid URL)
  if (isUUID(url)) return false;
  // Must start with http:// or https://
  return url.startsWith('http://') || url.startsWith('https://');
};

// Web-only PDF iframe component
const PDFIframe = ({ src, title }) => {
  if (Platform.OS !== 'web') return null;
  
  // Use a ref to inject iframe after mount
  const containerRef = useRef(null);
  
  useEffect(() => {
    if (containerRef.current && src && typeof document !== 'undefined') {
      // Validate URL before using it
      if (!isValidUrl(src)) {
        console.warn('[PDFIframe] Invalid URL provided, skipping iframe creation:', src);
        return;
      }

      // In React Native Web, ref.current is the DOM element
      const domElement = containerRef.current;
      
      // Clear any existing content
      if (domElement.innerHTML !== undefined) {
        domElement.innerHTML = '';
      } else if (domElement.removeChild) {
        while (domElement.firstChild) {
          domElement.removeChild(domElement.firstChild);
        }
      }
      
      // Create and inject iframe
      const iframe = document.createElement('iframe');
      iframe.src = src;
      iframe.title = title || 'PDF Viewer';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.setAttribute('allow', 'fullscreen');
      
      // Add error handler to prevent console errors
      iframe.onerror = (e) => {
        console.warn('[PDFIframe] Error loading PDF:', src);
        e.preventDefault();
        e.stopPropagation();
      };
      
      domElement.appendChild(iframe);
    }
  }, [src, title]);
  
  return (
    <View
      ref={containerRef}
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
      }}
    />
  );
};

export default function MaterialsLibrary({ familyId, children = [], preloadedSubjects = null, preloadedMaterials = null, onMaterialsUpdate = null }) {
  const toast = useToast();
  
  // Get child colors for dots
  const getChildDotColor = (childId) => {
    const effectiveChildren = localChildren.length > 0 ? localChildren : children;
    const child = effectiveChildren.find(c => c.id === childId);
    if (!child || !child.avatar) {
      return '#9CA3AF'; // Default gray
    }
    return getChildColorFromAvatar(child.avatar);
  };
  
  // 
  const [materials, setMaterials] = useState([]);
  const [allMaterials, setAllMaterials] = useState([]); // Store all materials for stats
  const [loadingMaterials, setLoadingMaterials] = useState(true);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [error, setError] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState(null);
  const [viewingMaterial, setViewingMaterial] = useState(null);
  const [showPdfViewer, setShowPdfViewer] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [showDeletedBin, setShowDeletedBin] = useState(false);
  const [deletedMaterials, setDeletedMaterials] = useState([]);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [showBuildFromMaterialModal, setShowBuildFromMaterialModal] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all'); // all | syllabus | lesson_plan | assignment | resource | assessment | book
  const [selectedChildId, setSelectedChildId] = useState(''); // '' = all
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [subjects, setSubjects] = useState(preloadedSubjects || []); // Deduplicated for filter display
  const [allSubjectsForModal, setAllSubjectsForModal] = useState([]); // Full list with child_id for AddMaterialModal
  const [loadingSubjects, setLoadingSubjects] = useState(!(preloadedSubjects && preloadedSubjects.length > 0));
  const [showSubjectsLoading, setShowSubjectsLoading] = useState(false);
  const [sortBy, setSortBy] = useState('date'); // 'date' | 'alphabetical'
  const [sortDirection, setSortDirection] = useState('desc'); // 'asc' | 'desc'
  const [hoveredItemId, setHoveredItemId] = useState(null);
  const [isButtonHovered, setIsButtonHovered] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewMaterial, setReviewMaterial] = useState(null);
  const [reviewChildId, setReviewChildId] = useState(null);
  const [showFiltersDropdown, setShowFiltersDropdown] = useState(false);
  const filtersDropdownRef = useRef(null);
  const [filtersDropdownPosition, setFiltersDropdownPosition] = useState({ top: 0, left: 0 });

  // Use preloaded materials if available and no filters are applied
  useEffect(() => {
    if (preloadedMaterials && searchQuery === '' && selectedChildId === '' && selectedSubjectId === null) {
      setMaterials(preloadedMaterials);
      setLoadingMaterials(false);
      setInitialLoadComplete(true);
      setError(null);
      return;
    }
  }, [preloadedMaterials, searchQuery, selectedChildId, selectedSubjectId]);

  useEffect(() => {
    if (!familyId) {
      setLoadingMaterials(false);
      setError('No family ID provided');
      return;
    }
    
    // Skip loading if we have preloaded materials and no filters
    if (preloadedMaterials && searchQuery === '' && selectedChildId === '' && selectedSubjectId === null) {
      return;
    }
    
    loadMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, searchQuery, selectedChildId, selectedSubjectId, subjects]);

  // Load children if not provided
  const [localChildren, setLocalChildren] = useState(children);
  useEffect(() => {
    if (children && children.length > 0) {
      setLocalChildren(children);
      return;
    }
    if (!familyId) {
      console.log('[MaterialsLibrary] No familyId, cannot load children');
      return;
    }
    
    const loadChildren = async () => {
      try {
        const { data, error } = await supabase
          .from('children')
          .select('*')
          .eq('family_id', familyId)
          .eq('archived', false)
          .order('first_name');
        
        if (error) {
          // Try without archived filter as fallback
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('children')
            .select('*')
            .eq('family_id', familyId)
            .order('first_name');
          
          if (!fallbackError && fallbackData) {
            setLocalChildren(fallbackData);
          }
        } else if (data) {
          setLocalChildren(data);
        }
      } catch (err) {
        console.warn('[MaterialsLibrary] Error loading children:', err);
      }
    };
    
    loadChildren();
  }, [familyId, children]);

  // Use localChildren instead of children prop
  const effectiveChildren = localChildren.length > 0 ? localChildren : children;

  // Load subjects
  useEffect(() => {
    if (!familyId) return;
    loadSubjects();
  }, [familyId]);

  // Avoid "Loading..." flash for subjects chips: only show after a short delay
  useEffect(() => {
    if (!loadingSubjects) {
      setShowSubjectsLoading(false);
      return;
    }
    const t = setTimeout(() => setShowSubjectsLoading(true), 250);
    return () => clearTimeout(t);
  }, [loadingSubjects]);

  // Load all materials (without filters) for determining if user has any materials at all
  useEffect(() => {
    if (!familyId || allMaterials.length > 0) return; // Only load once if empty
    
    const loadAllMaterials = async () => {
      try {
        const data = await getMaterials(familyId, {}); // No filters
        setAllMaterials(data);
      } catch (err) {
        console.warn('[MaterialsLibrary] Error loading all materials:', err);
      }
    };
    
    loadAllMaterials();
  }, [familyId, allMaterials.length]);

  // Set allMaterials for stats when materials are loaded (only when no filters are applied)
  useEffect(() => {
    if (!searchQuery && !selectedChildId && !selectedSubjectId && !loadingMaterials) {
      setAllMaterials(materials);
    }
  }, [materials, loadingMaterials, searchQuery, selectedChildId, selectedSubjectId]);

  const loadSubjects = async () => {
    setLoadingSubjects(true);
    try {
      const { data, error } = await supabase
        .from('subject')
        .select('id, name, child_id')
        .eq('family_id', familyId)
        .order('name');
      
      if (!error && data) {
        // Store full list for AddMaterialModal
        setAllSubjectsForModal(data);
        
        // Deduplicate by name for filter display (prefer family-wide, then first occurrence)
        const subjectMap = new Map();
        data.forEach(subject => {
          const existing = subjectMap.get(subject.name);
          if (!existing) {
            subjectMap.set(subject.name, subject);
          } else if (existing.child_id !== null && subject.child_id === null) {
            // Prefer family-wide over child-specific
            subjectMap.set(subject.name, subject);
          }
        });
        const uniqueSubjects = Array.from(subjectMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        setSubjects(uniqueSubjects);
      }
    } catch (error) {
      console.warn('[MaterialsLibrary] Error loading subjects:', error);
      setSubjects([]);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const loadMaterials = async () => {
    if (!familyId) {
      setError('No family ID provided');
      setLoadingMaterials(false);
      return;
    }

    setLoadingMaterials(true);
    setError(null);
    try {
      const filters = {};
      if (searchQuery) filters.search = searchQuery;
      if (selectedChildId) filters.child_id = selectedChildId;
      if (selectedSubjectId) {
        // Try to find in deduplicated subjects first, then fall back to allSubjectsForModal
        const subject = subjects.find(s => s.id === selectedSubjectId) || 
                       allSubjectsForModal.find(s => s.id === selectedSubjectId);
        if (subject) {
          filters.subject_key = subject.name;
        }
      }

      const data = await getMaterials(familyId, filters);
      
      setMaterials(data);
      
      // Update cache if no filters are applied (base materials list)
      if (onMaterialsUpdate && searchQuery === '' && selectedChildId === '' && selectedSubjectId === null) {
        onMaterialsUpdate(data);
      }
      
      // Reload subjects to ensure we have the latest (in case new subjects were added)
      if (subjects.length === 0) {
        loadSubjects();
      }
      // allMaterials will be set by useEffect for stats
      setInitialLoadComplete(true);
    } catch (err) {
      setError(err.message || 'Failed to load materials');
      setInitialLoadComplete(true);
    } finally {
      setLoadingMaterials(false);
    }
  };

  const loadDeletedMaterials = async () => {
    if (!familyId) return;
    
    setLoadingDeleted(true);
    try {
      const data = await getDeletedMaterials(familyId);
      setDeletedMaterials(data);
    } catch (err) {
      console.error('[MaterialsLibrary] Error loading deleted materials:', err);
    } finally {
      setLoadingDeleted(false);
    }
  };

  useEffect(() => {
    if (showDeletedBin) {
      loadDeletedMaterials();
    }
  }, [showDeletedBin, familyId]);

  // Close filter dropdown when clicking outside
  useEffect(() => {
    if (!showFiltersDropdown) return;

    const handleClickOutside = (e) => {
      if (Platform.OS === 'web') {
        const target = e.target;
        const dropdownNode = filtersDropdownRef.current?._nativeNode || filtersDropdownRef.current;
        
        if (
          dropdownNode &&
          !dropdownNode.contains(target)
        ) {
          setShowFiltersDropdown(false);
        }
      }
    };

    if (Platform.OS === 'web') {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showFiltersDropdown]);

  const handleMaterialClick = (material) => {
    setSelectedMaterial(material);
    setShowDetailDrawer(true);
  };

  const handleItemClick = async (item) => {
    // Open PDF viewer for file-based materials
    try {
      const { getMaterial } = await import('../../lib/services/materialsClient');
      const material = await getMaterial(item.data.id);
      
      // Check if it's a file-based material with storage_path
      if (material.storage_path) {
        // Check if it's a PDF
        const isPdf = material.mime?.includes('pdf') || 
                     material.filename?.toLowerCase().endsWith('.pdf') ||
                     (material.title && material.title.toLowerCase().endsWith('.pdf'));
        
        if (isPdf) {
          try {
            // Get signed URL from storage
            const { data: signedUrlData, error: signedError } = await supabase.storage
              .from('evidence')
              .createSignedUrl(material.storage_path, 3600); // 1 hour expiry
            
            if (signedError) {
              console.error('[MaterialsLibrary] Error getting signed URL:', signedError);
              toast.push('Unable to access the file. Please try again later.', 'error');
              return;
            }
            
            if (signedUrlData?.signedUrl) {
              setPdfUrl(signedUrlData.signedUrl);
              setPdfTitle(material.title || 'Attachment');
              setShowPdfViewer(true);
            } else {
              toast.push('Unable to generate a URL for this file. Please try again later.', 'error');
            }
          } catch (err) {
            console.error('[MaterialsLibrary] Error getting PDF URL:', err);
            toast.push(`Unable to open file: ${err.message || 'Unknown error'}`, 'error');
          }
        } else {
          // File-based but not PDF - could open in new tab or show message
          toast.push('This file type cannot be viewed in the PDF viewer.', 'info');
        }
      } else if (material.provider_url && isValidUrl(material.provider_url)) {
        // If it's a link-based material with a valid URL, open in PDF viewer
        setPdfUrl(material.provider_url);
        setPdfTitle(material.title || 'Attachment');
        setShowPdfViewer(true);
      } else {
        // No file or valid URL to view
        toast.push('This material does not have a viewable file.', 'info');
      }
    } catch (error) {
      console.error('[MaterialsLibrary] Error loading material for PDF view:', error);
      toast.push('Failed to load material. Please try again.', 'error');
    }
  };

  const handleReviewSaved = () => {
    loadMaterials();
    if (selectedMaterial) {
      // Reload selected material
      getMaterials(familyId, {})
        .then(data => {
          const updated = data.find(m => m.id === selectedMaterial.id);
          if (updated) {
            setSelectedMaterial(updated);
          }
        })
        .catch(() => {});
    }
  };

  const handleDeleteItem = async (item) => {
    const { kind, data, normalized } = item;
    const itemName = normalized.title || 'this item';
    
    // Show warning dialog before deleting
    // On web, Alert.alert might not work, so use window.confirm as fallback
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(
        `"${itemName}" will be moved to Recently Deleted. You can restore it from there.\n\nDo you want to continue?`
      );
      if (confirmed) {
        performDelete(item, itemName);
      }
    } else {
      Alert.alert(
        'Move to Recently Deleted',
        `"${itemName}" will be moved to Recently Deleted. You can restore it from there.`,
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Move to Deleted',
            style: 'destructive',
            onPress: () => performDelete(item, itemName)
          }
        ],
        { cancelable: true }
      );
    }
  };

  const performDelete = async (item, itemName) => {
    const { kind, data, normalized } = item;

    try {
      // Verify we have the required data
      if (!data?.id) {
        console.error('[MaterialsLibrary] Missing material ID:', data);
        Alert.alert('Error', 'Material ID is missing. Please try again.');
        return;
      }
      if (!familyId) {
        console.error('[MaterialsLibrary] Missing family ID');
        Alert.alert('Error', 'Family ID is missing. Please refresh the page.');
        return;
      }

      // All items are now materials - use soft delete with family_id for RLS
      // Note: We keep storage files until permanent deletion to allow restore
      await archiveMaterial(data.id, familyId);
      
      // Dispatch event for other components to refresh
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('materialDeleted', { 
          detail: { materialId: data.id, familyId } 
        }));
        window.dispatchEvent(new CustomEvent('refreshMaterials'));
      }
      
      // Reload materials
      await loadMaterials();
      // Reload deleted materials if bin is open
      if (showDeletedBin) {
        await loadDeletedMaterials();
      }
      
      toast.push(`${itemName} moved to Recently Deleted`, 'success');
    } catch (error) {
      console.error('[MaterialsLibrary] Error deleting item:', error);
      console.error('[MaterialsLibrary] Error details:', { 
        materialId: data?.id, 
        familyId, 
        errorCode: error.code,
        errorMessage: error.message,
        errorStack: error.stack
      });
      
      const errorMessage = error.message || 'Unknown error occurred';
      console.error('[MaterialsLibrary] Showing error alert:', errorMessage);
      
      if (Platform.OS === 'web') {
        // On web, Alert.alert might not work, so use window.alert as fallback
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Failed to delete ${itemName}: ${errorMessage}`);
        } else {
          Alert.alert('Error', `Failed to delete ${itemName}: ${errorMessage}`);
        }
        toast.push(`Failed to delete ${itemName}`, 'error');
      } else {
        Alert.alert('Error', `Failed to delete ${itemName}: ${errorMessage}`);
      }
    }
  };

  const handleEditDetails = async (item) => {
    // Reload material to ensure we have latest data including reviews
    try {
      const { getMaterial } = await import('../../lib/services/materialsClient');
      const freshMaterial = await getMaterial(item.data.id);
      setViewingMaterial(freshMaterial);
    } catch (error) {
      console.error('[MaterialsLibrary] Error loading material for view:', error);
      // Fallback to using the data we have
      setViewingMaterial(item.data);
    }
  };

  const handleEditFromDetails = async (material) => {
    // Close the details modal first
    setViewingMaterial(null);
    // Reload material to ensure we have latest data including reviews
    try {
      const { getMaterial } = await import('../../lib/services/materialsClient');
      const freshMaterial = await getMaterial(material.id);
      setEditingMaterial(freshMaterial);
    } catch (error) {
      console.error('[MaterialsLibrary] Error loading material for edit:', error);
      // Fallback to using the data we have
      setEditingMaterial(material);
    }
  };

  const handleEditAttachment = async (item) => {
    // Reload material to ensure we have latest data including reviews
    try {
      const { getMaterial } = await import('../../lib/services/materialsClient');
      const freshMaterial = await getMaterial(item.data.id);
      setEditingMaterial(freshMaterial);
    } catch (error) {
      console.error('[MaterialsLibrary] Error loading material for edit:', error);
      // Fallback to using the data we have
      setEditingMaterial(item.data);
    }
  };

  const handleDeleteFromDetails = async (material) => {
    // Use the same delete handler
    const item = { data: material };
    handleDeleteItem(item);
  };

  const handleRateAndReview = (item) => {
    // If material has children associated, use the first one
    // Otherwise, use the first child from the children array if available
    const materialChildren = item.data.material_children || [];
    let childId = null;
    
    if (materialChildren.length > 0) {
      childId = materialChildren[0].child_id;
    } else if (effectiveChildren.length > 0) {
      childId = effectiveChildren[0].id;
    }
    
    if (childId) {
      setReviewMaterial(item.data);
      setReviewChildId(childId);
      setShowReviewModal(true);
    } else {
      // If no children available, just open the detail drawer
      setSelectedMaterial(item.data);
      setShowDetailDrawer(true);
    }
  };

  const handleOpenInNewTab = async (item) => {
    try {
      const { getMaterial } = await import('../../lib/services/materialsClient');
      const material = await getMaterial(item.data.id);
      
      // Check if it's a file-based material with storage_path
      if (material.storage_path) {
        try {
          // Get signed URL from storage
          const { data: signedUrlData, error: signedError } = await supabase.storage
            .from('evidence')
            .createSignedUrl(material.storage_path, 3600); // 1 hour expiry
          
          if (signedError) {
            console.error('[MaterialsLibrary] Error getting signed URL:', signedError);
            toast.push('Unable to access the file. Please try again later.', 'error');
            return;
          }
          
          if (signedUrlData?.signedUrl) {
            window.open(signedUrlData.signedUrl, '_blank');
          } else {
            toast.push('Unable to generate a URL for this file. Please try again later.', 'error');
          }
        } catch (err) {
          console.error('[MaterialsLibrary] Error getting file URL:', err);
          toast.push(`Unable to open file: ${err.message || 'Unknown error'}`, 'error');
        }
      } else if (material.provider_url) {
        // Link-based material - open provider_url in new tab
        window.open(material.provider_url, '_blank');
      } else {
        toast.push('This material does not have a URL to open.', 'info');
      }
    } catch (error) {
      console.error('[MaterialsLibrary] Error opening in new tab:', error);
      toast.push('Unable to open material. Please try again.', 'error');
    }
  };

  const handleMagicExtract = async (item) => {
    toast.push('Magic Extract: Analyzing document...', 'info');
    // TODO: Implement AI-powered extraction from material
    // This could extract key information, create summaries, generate lesson plans, etc.
  };

  const showContextMenu = (item, clientX, clientY) => {
    if (typeof window === 'undefined') return;
    
    // Remove any existing context menu
    const existingMenu = document.getElementById('context-menu');
    if (existingMenu) {
      existingMenu.remove();
    }
    
     const menuItems = [
       { text: 'Attachment details', action: () => handleEditDetails(item), icon: FileText },
       { text: 'Edit attachment details', action: () => handleEditAttachment(item), icon: Edit2 },
       { text: 'Magic Extract', action: () => handleMagicExtract(item), icon: Sparkles },
       { text: 'Open in new tab', action: () => handleOpenInNewTab(item), icon: ExternalLink },
       { text: 'Delete', action: () => handleDeleteItem(item), isDelete: true, icon: Trash2 }
     ];
    
    // Calculate menu height
    const estimatedMenuHeight = menuItems.length * 48 + 16;
    const windowHeight = window.innerHeight;
    
    // Check if menu would go off bottom of screen
    let menuTop = clientY;
    if (clientY + estimatedMenuHeight > windowHeight) {
      menuTop = clientY - estimatedMenuHeight;
      if (menuTop < 0) {
        menuTop = 8;
      }
    }
    
    // Check if menu would go off right side of screen
    let menuLeft = clientX;
    const estimatedMenuWidth = 200;
    const windowWidth = window.innerWidth;
    if (clientX + estimatedMenuWidth > windowWidth) {
      menuLeft = clientX - estimatedMenuWidth;
      if (menuLeft < 0) {
        menuLeft = 8;
      }
    }
    
    const menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.style.cssText = `
      position: fixed;
      top: ${menuTop}px;
      left: ${menuLeft}px;
      background-color: #ffffff;
      border-radius: 12px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05);
      z-index: 999999;
      min-width: 200px;
      padding: 8px 0;
      font-family: "League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    `;
    
    menuItems.forEach((menuItem, index) => {
      const div = document.createElement('div');
      div.style.cssText = `
        padding: 16px 24px;
        color: ${menuItem.isDelete ? '#dc2626' : '#374151'};
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        border-bottom: ${index < menuItems.length - 1 ? '1px solid #f3f4f6' : 'none'};
        display: flex;
        align-items: center;
        gap: 12px;
      `;
      
      div.addEventListener('mouseenter', () => {
        div.style.backgroundColor = menuItem.isDelete ? '#fef2f2' : '#f8fafc';
      });
      
      div.addEventListener('mouseleave', () => {
        div.style.backgroundColor = 'transparent';
      });
      
      // Add icon if available
      if (menuItem.icon) {
        const iconContainer = document.createElement('div');
        iconContainer.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          width: 16px;
          height: 16px;
        `;
        
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '16');
        svg.setAttribute('height', '16');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', menuItem.isDelete ? '#dc2626' : '#374151');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        
        // Add path based on icon type (lucide-react icon paths)
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        if (menuItem.icon === FileText) {
          path.setAttribute('d', 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8');
        } else if (menuItem.icon === Edit2) {
          path.setAttribute('d', 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z');
        } else if (menuItem.icon === Sparkles) {
          path.setAttribute('d', 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z M20 3v4 M22 5h-4');
        } else if (menuItem.icon === ExternalLink) {
          path.setAttribute('d', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6 M15 3h6v6 M10 14L21 3');
        } else if (menuItem.icon === Trash2) {
          path.setAttribute('d', 'M3 6h18 M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6 M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2');
        }
        svg.appendChild(path);
        iconContainer.appendChild(svg);
        div.appendChild(iconContainer);
      }
      
      const textSpan = document.createElement('span');
      textSpan.textContent = menuItem.text;
      div.appendChild(textSpan);
      
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        menu.remove();
        // Remove close menu listeners before executing action
        document.removeEventListener('click', closeMenu);
        document.removeEventListener('mousedown', closeMenu, true);
        document.removeEventListener('contextmenu', closeMenu, true);
        // Execute action after a small delay to ensure menu is removed
        setTimeout(() => {
          menuItem.action();
        }, 10);
      });
      menu.appendChild(div);
    });
    
    document.body.appendChild(menu);
    
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
        document.removeEventListener('mousedown', closeMenu, true);
        document.removeEventListener('contextmenu', closeMenu, true);
      }
    };
    // Use bubble phase for click (so menu item handlers fire first)
    // Use capture phase for mousedown/contextmenu to catch right-clicks
    document.addEventListener('click', closeMenu);
    document.addEventListener('mousedown', closeMenu, true);
    document.addEventListener('contextmenu', closeMenu, true);
  };

  const handleItemRightClick = (item, nativeEvent) => {
    if (typeof window !== 'undefined' && nativeEvent) {
      // Prevent default context menu
      if (nativeEvent.preventDefault) {
        nativeEvent.preventDefault();
      }
      
      // Get position from event - handle both React Native Web and native DOM events
      const clientX = nativeEvent.clientX || (nativeEvent.nativeEvent && nativeEvent.nativeEvent.clientX) || (typeof window !== 'undefined' && window.event && window.event.clientX) || 0;
      const clientY = nativeEvent.clientY || (nativeEvent.nativeEvent && nativeEvent.nativeEvent.clientY) || (typeof window !== 'undefined' && window.event && window.event.clientY) || 0;
      
      showContextMenu(item, clientX, clientY);
    }
  };

  const handleMenuButtonClick = (item, event) => {
    if (typeof window === 'undefined') return;
    
    if (event && event.stopPropagation) {
      event.stopPropagation();
    }
    if (event && event.preventDefault) {
      event.preventDefault();
    }
    
    // Get button position - try multiple methods
    let clientX, clientY;
    
    // Method 1: Try to get from the button element via data attribute
    if (typeof document !== 'undefined') {
      const button = document.querySelector(`[data-menu-button-id="${item.data.id}"]`);
      if (button) {
        const rect = button.getBoundingClientRect();
        clientX = rect.right;
        clientY = rect.top + rect.height / 2;
      }
    }
    
    // Method 2: Use event coordinates if available
    if (!clientX && event) {
      if (event.nativeEvent) {
        clientX = event.nativeEvent.clientX || event.nativeEvent.pageX;
        clientY = event.nativeEvent.clientY || event.nativeEvent.pageY;
      } else if (event.clientX !== undefined) {
        clientX = event.clientX;
        clientY = event.clientY;
      }
    }
    
    // Method 3: Fallback position
    if (!clientX) {
      clientX = (typeof window !== 'undefined' ? window.innerWidth : 800) - 220;
      clientY = 100;
    }
    
    showContextMenu(item, clientX, clientY);
  };

  // All items are now materials, but we still need to normalize them correctly
  // Materials with storage_path should use normalizeUpload logic, others use normalizeMaterial
  const visibleMaterials = roleFilter === 'all'
    ? materials
    : materials.filter((m) => {
        const normalized = m.storage_path ? normalizeUpload(m) : normalizeMaterial(m);
        return matchesRole(roleFilter, normalized);
      });

  const hasNoMaterials = allMaterials.length === 0;
  const nothingVisible = visibleMaterials.length === 0;

  const handleRestoreItem = async (item) => {
    const { data, normalized } = item;
    const itemName = normalized.title || 'this item';
    
    try {
      await restoreMaterial(data.id, familyId);
      
      // Dispatch event for other components to refresh
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('materialUpdated', { 
          detail: { materialId: data.id, familyId, action: 'restored' } 
        }));
        window.dispatchEvent(new CustomEvent('refreshMaterials'));
      }
      
      await loadMaterials();
      await loadDeletedMaterials();
      toast.push(`${itemName} restored`, 'success');
    } catch (error) {
      console.error('[MaterialsLibrary] Error restoring item:', error);
      const errorMessage = error.message || 'Unknown error';
      
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(`Failed to restore ${itemName}: ${errorMessage}`);
      } else {
        Alert.alert('Error', `Failed to restore ${itemName}: ${errorMessage}`);
      }
      toast.push(`Failed to restore ${itemName}`, 'error');
    }
  };

  const handlePermanentlyDeleteItem = async (item) => {
    const { data, normalized } = item;
    const itemName = normalized.title || 'this item';
    
    // On web, use window.confirm; on native, use Alert.alert
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const confirmed = window.confirm(
        `Are you sure you want to permanently delete "${itemName}"? This action cannot be undone and will remove the item forever.`
      );
      if (!confirmed) return;
    } else {
      Alert.alert(
        'Permanently Delete',
        `Are you sure you want to permanently delete "${itemName}"? This action cannot be undone and will remove the item forever.`,
        [
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Delete Forever',
            style: 'destructive',
            onPress: () => performPermanentDelete(item, itemName)
          }
        ],
        { cancelable: true }
      );
      return;
    }
    
    // For web, execute directly after confirmation
    await performPermanentDelete(item, itemName);
  };

  const performPermanentDelete = async (item, itemName) => {
    const { data } = item;
    
    try {
      // Delete from database first (RPC will return storage_path if it exists)
      const result = await permanentlyDeleteMaterial(data.id, familyId);
      
      // Dispatch event for other components to refresh
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('materialDeleted', { 
          detail: { materialId: data.id, familyId, permanent: true } 
        }));
        window.dispatchEvent(new CustomEvent('refreshMaterials'));
      }
      
      // Delete storage file if it exists (use storage_path from RPC result or from item data)
      const storagePath = result.storage_path || data.storage_path;
      if (storagePath) {
        try {
          const { error: storageError } = await supabase.storage
            .from('evidence')
            .remove([storagePath]);
          
          if (storageError && !storageError.message?.includes('Bucket not found') && storageError.statusCode !== 404) {
            console.warn('[MaterialsLibrary] Error deleting file from storage:', storageError);
            // Non-fatal - DB record is already deleted
          }
        } catch (storageErr) {
          console.warn('[MaterialsLibrary] Storage deletion error (non-fatal):', storageErr);
          // Non-fatal - DB record is already deleted
        }
      }
      
      // Reload deleted materials to update the list
      await loadDeletedMaterials();
      toast.push(`${itemName} permanently deleted`, 'success');
    } catch (error) {
      console.error('[MaterialsLibrary] Error permanently deleting item:', error);
      const errorMessage = error.message || 'Unknown error';
      
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert(`Failed to permanently delete ${itemName}: ${errorMessage}`);
      } else {
        Alert.alert('Error', `Failed to permanently delete ${itemName}: ${errorMessage}`);
      }
      toast.push(`Failed to permanently delete ${itemName}`, 'error');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.mainContent}>
        {/* Filters */}
        {!showDeletedBin && (
        <View style={styles.filters}>
        {/* Search, Add Material Button, and Trash */}
        <View style={styles.searchRow}>
          <Text style={styles.totalFilesText}>
            TOTAL MATERIALS ({allMaterials.length})
          </Text>
          <View style={styles.searchAndButtonContainer}>
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search library..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#9ca3af"
              />
              {searchQuery.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setSearchQuery('')}
                  style={styles.clearButton}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <X size={18} color={colors.muted} />
                </TouchableOpacity>
              ) : (
                <View style={styles.searchIconContainer}>
                  <Search size={18} color={colors.muted} />
                </View>
              )}
            </View>
            <TouchableOpacity
              style={styles.newButton}
              onPress={() => setShowAddModal(true)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' && {
                cursor: 'pointer',
              })}
            >
              <Text style={styles.newButtonText}>+ NEW</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.divider} />
      </View>
      )}

      {/* Recently Deleted Bin */}
      {showDeletedBin && (
        <View style={styles.deletedBinContainer}>
          <View style={styles.deletedBinHeader}>
            <View style={styles.deletedBinHeaderLeft}>
              <Trash2 size={20} color={colors.muted} />
              <Text style={styles.deletedBinTitle}>Recently Deleted</Text>
              <Text style={styles.deletedBinSubtitle}>
                {deletedMaterials.length} {deletedMaterials.length === 1 ? 'item' : 'items'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setShowDeletedBin(false)}
              style={styles.closeBinButton}
            >
              <X size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {loadingDeleted ? (
            <View style={styles.deletedBinLoading}>
              <ActivityIndicator size="small" color={colors.accent} />
              <Text style={styles.deletedBinLoadingText}>Loading deleted items...</Text>
            </View>
          ) : deletedMaterials.length === 0 ? (
            <View style={styles.deletedBinEmpty}>
              <Text style={styles.deletedBinEmptyText}>No deleted items</Text>
            </View>
          ) : (
            <ScrollView style={styles.deletedBinList} contentContainerStyle={styles.deletedBinListContent}>
              {deletedMaterials.map((m) => {
                const isFileBased = m.storage_path;
                const normalized = isFileBased ? normalizeUpload(m) : normalizeMaterial(m);
                const deletedDate = m.deleted_at ? new Date(m.deleted_at) : null;
                const daysAgo = deletedDate ? Math.floor((Date.now() - deletedDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
                
                return (
                  <View key={m.id} style={styles.deletedItem}>
                    <View style={styles.deletedItemContent}>
                      <Text style={styles.deletedItemTitle} numberOfLines={1}>
                        {normalized.title}
                      </Text>
                      {normalized.subtitle && (
                        <Text style={styles.deletedItemSubtitle} numberOfLines={1}>
                          {normalized.subtitle}
                        </Text>
                      )}
                      {deletedDate && (
                        <Text style={styles.deletedItemDate}>
                          Deleted {daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`}
                        </Text>
                      )}
                    </View>
                    <View style={styles.deletedItemActions}>
                      <TouchableOpacity
                        style={styles.restoreButton}
                        onPress={() => handleRestoreItem({ data: m, normalized })}
                      >
                        <RotateCcw size={14} color={colors.accent} />
                        <Text style={styles.restoreButtonText}>Restore</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.permanentDeleteButton}
                        onPress={() => handlePermanentlyDeleteItem({ data: m, normalized })}
                      >
                        <Trash size={14} color="#dc2626" />
                        <Text style={styles.permanentDeleteButtonText}>Delete Forever</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      )}

      {/* Materials Grid */}
      {showDeletedBin ? null : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadMaterials}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (!initialLoadComplete && loadingMaterials) ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading materials...</Text>
        </View>
      ) : hasNoMaterials ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconContainer}>
            <BookOpen size={64} color={colors.muted || '#9ca3af'} strokeWidth={1.5} />
          </View>
          <Text style={styles.emptyTitle}>
            Your family library starts here
          </Text>
          <Text style={styles.emptyText}>
            Add syllabi, lesson plans, assignments, and resources, and track how each child responds over time.
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => setShowAddModal(true)}
          >
            <Plus size={18} color={colors.accent} />
            <Text style={styles.emptyButtonText}>Add your first material</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Filters Dropdown Modal */}
          {showFiltersDropdown && Platform.OS === 'web' && (
            <>
              <TouchableOpacity
                style={styles.dropdownOverlay}
                activeOpacity={1}
                onPress={() => setShowFiltersDropdown(false)}
              />
              <View
                ref={filtersDropdownRef}
                style={[
                  styles.filtersDropdown,
                  {
                    position: 'fixed',
                    top: filtersDropdownPosition.top,
                    left: filtersDropdownPosition.left,
                  }
                ]}
              >
                {/* Children Filter Section */}
                {effectiveChildren.length > 0 && (
                  <View style={styles.dropdownSection}>
                    <Text style={styles.dropdownSectionTitle}>CHILDREN</Text>
                    <TouchableOpacity
                      style={styles.dropdownOption}
                      onPress={() => setSelectedChildId('')}
                    >
                      <View style={[styles.dropdownCheckbox, !selectedChildId && styles.dropdownCheckboxActive]}>
                        {!selectedChildId && <Check size={10} color="#FFFFFF" />}
                      </View>
                      <Text style={styles.dropdownOptionText}>All Children</Text>
                    </TouchableOpacity>
                    {effectiveChildren.map((child) => {
                      const isSelected = selectedChildId === child.id;
                      return (
                        <TouchableOpacity
                          key={child.id}
                          style={styles.dropdownOption}
                          onPress={() => setSelectedChildId(isSelected ? '' : child.id)}
                        >
                          <View style={[styles.dropdownCheckbox, isSelected && styles.dropdownCheckboxActive]}>
                            {isSelected && <Check size={10} color="#FFFFFF" />}
                          </View>
                          <Text style={styles.dropdownOptionText}>
                            {child.first_name || child.name || 'Child'}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* Types Filter Section */}
                {effectiveChildren.length > 0 && <View style={styles.dropdownDivider} />}
                <View style={styles.dropdownSection}>
                  <Text style={styles.dropdownSectionTitle}>TYPES</Text>
                  {ROLE_CHIPS.map((opt) => {
                    const isSelected = roleFilter === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        style={styles.dropdownOption}
                        onPress={() => {
                          setRoleFilter(opt.value);
                        }}
                      >
                        <View style={[styles.dropdownCheckbox, isSelected && styles.dropdownCheckboxActive]}>
                          {isSelected && <Check size={10} color="#FFFFFF" />}
                        </View>
                        <Text style={styles.dropdownOptionText}>
                          {opt.value === 'all' ? 'All Types' : opt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Subjects Filter Section */}
                {subjects.length > 0 && (
                  <>
                    <View style={styles.dropdownDivider} />
                    <View style={styles.dropdownSection}>
                      <Text style={styles.dropdownSectionTitle}>SUBJECTS</Text>
                      <TouchableOpacity
                        style={styles.dropdownOption}
                        onPress={() => setSelectedSubjectId(null)}
                      >
                        <View style={[styles.dropdownCheckbox, !selectedSubjectId && styles.dropdownCheckboxActive]}>
                          {!selectedSubjectId && <Check size={10} color="#FFFFFF" />}
                        </View>
                        <Text style={styles.dropdownOptionText}>All Subjects</Text>
                      </TouchableOpacity>
                      {subjects.map((subject) => {
                        const isSelected = selectedSubjectId === subject.id;
                        return (
                          <TouchableOpacity
                            key={subject.id}
                            style={styles.dropdownOption}
                            onPress={() => setSelectedSubjectId(isSelected ? null : subject.id)}
                          >
                            <View style={[styles.dropdownCheckbox, isSelected && styles.dropdownCheckboxActive]}>
                              {isSelected && <Check size={10} color="#FFFFFF" />}
                            </View>
                            <Text style={styles.dropdownOptionText}>{subject.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}
              </View>
            </>
          )}

          <>
            {/* Children Filter Chips Row */}
            <View style={styles.childrenFilterRow}>
              <Text style={styles.childrenLabelText}>Children</Text>
              {effectiveChildren.length > 0 ? (
                <View style={{ flex: 1, minWidth: 0 }}>
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    style={styles.childrenFilterScroll}
                    contentContainerStyle={styles.childrenFilterScrollContent}
                  >
                    <TouchableOpacity
                      style={[styles.childrenFilterChip, !selectedChildId && styles.childrenFilterChipActive]}
                      onPress={() => {
                        setSelectedChildId('');
                        setSelectedSubjectId(null);
                        setRoleFilter('all');
                      }}
                    >
                      <Text style={[styles.childrenFilterChipText, !selectedChildId && styles.childrenFilterChipTextActive]}>
                        All Children
                      </Text>
                    </TouchableOpacity>
                    {effectiveChildren.map((child) => {
                      const isActive = selectedChildId === child.id;
                      const label = child.first_name || child.name || 'Child';
                      const childColor = getChildDotColor(child.id);
                      return (
                        <TouchableOpacity
                          key={child.id}
                          style={[styles.childrenFilterChip, isActive && styles.childrenFilterChipActive]}
                          onPress={() => {
                            setSelectedChildId(isActive ? '' : child.id);
                            setSelectedSubjectId(null);
                            setRoleFilter('all');
                          }}
                        >
                          <View
                            style={[
                              styles.childDot,
                              { backgroundColor: childColor, marginRight: 6 }
                            ]}
                          />
                          <Text style={[styles.childrenFilterChipText, isActive && styles.childrenFilterChipTextActive]} numberOfLines={1}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : (
                <Text style={{ fontSize: 12, color: colors.muted, marginLeft: 12 }}>
                  Loading children...
                </Text>
              )}
            </View>

            {/* Subjects Filter Chips Row */}
            <View style={styles.subjectsFilterRow}>
              <Text style={styles.subjectsLabelText}>Subjects</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.subjectsFilterScroll}
                contentContainerStyle={styles.subjectsFilterScrollContent}
              >
                <TouchableOpacity
                  style={[styles.childrenFilterChip, !selectedSubjectId && styles.childrenFilterChipActive]}
                  onPress={() => {
                    setSelectedSubjectId(null);
                    setRoleFilter('all');
                  }}
                >
                  <Text style={[styles.childrenFilterChipText, !selectedSubjectId && styles.childrenFilterChipTextActive]}>
                    All Subjects
                  </Text>
                </TouchableOpacity>
                {subjects
                  .filter(s => {
                    // `subject.child_id` is a semicolon-separated list (text) or empty for family-wide
                    // All Children: show all subjects
                    if (!selectedChildId) return true;
                    // Specific child: show family-wide or subjects assigned to that child
                    const subjectChildIds = parseChildIds(s.child_id || '');
                    return subjectChildIds.length === 0 || subjectChildIds.includes(selectedChildId);
                  })
                  .map((subject) => {
                    const isActive = selectedSubjectId === subject.id;
                    return (
                      <TouchableOpacity
                        key={subject.id}
                        style={[styles.childrenFilterChip, isActive && styles.childrenFilterChipActive]}
                        onPress={() => {
                          setSelectedSubjectId(isActive ? null : subject.id);
                          setRoleFilter('all');
                        }}
                      >
                        <Text style={[styles.childrenFilterChipText, isActive && styles.childrenFilterChipTextActive]} numberOfLines={1}>
                          {subject.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                {subjects.length === 0 && showSubjectsLoading && (
                  <Text style={{ fontSize: 12, color: colors.muted, paddingVertical: 5 }}>
                    Loading…
                  </Text>
                )}
              </ScrollView>
            </View>

            {/* Types Filter Chips Row */}
            <View style={styles.typesFilterRow}>
              <Text style={styles.typesLabelText}>Types</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.typesFilterScroll}
                contentContainerStyle={styles.typesFilterScrollContent}
              >
                {ROLE_CHIPS.map((roleOption) => {
                  const isActive = roleFilter === roleOption.value;
                  return (
                    <TouchableOpacity
                      key={roleOption.value}
                      style={[styles.childrenFilterChip, isActive && styles.childrenFilterChipActive]}
                      onPress={() => setRoleFilter(roleOption.value)}
                    >
                      <Text style={[styles.childrenFilterChipText, isActive && styles.childrenFilterChipTextActive]}>
                        {roleOption.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Recently Deleted Row */}
            <View style={styles.recentlyDeletedFilterRow}>
              <Text style={styles.recentlyDeletedLabelText}>Recently Deleted</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.recentlyDeletedFilterScroll}
                contentContainerStyle={styles.recentlyDeletedFilterScrollContent}
              >
                <TouchableOpacity
                  style={[styles.childrenFilterChip, showDeletedBin && styles.childrenFilterChipActive]}
                  onPress={() => setShowDeletedBin(true)}
                >
                  <Text style={[styles.childrenFilterChipText, showDeletedBin && styles.childrenFilterChipTextActive]}>
                    Recently Deleted
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

              {/* Column Headers */}
              <View style={styles.allFilesContainer}>
                <Text style={styles.allFilesText}>ALL FILES</Text>
              </View>
              <View style={styles.listHeaderDivider} />
              <View style={styles.listHeader}>
                <TouchableOpacity
                  style={styles.listHeaderTitle}
                  onPress={() => {
                    if (sortBy === 'alphabetical') {
                      // Toggle direction if already sorting by alphabetical
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                    } else {
                      // Switch to alphabetical sort, default to ascending
                      setSortBy('alphabetical');
                      setSortDirection('asc');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.listHeaderText, sortBy === 'alphabetical' && styles.listHeaderTextActive]}>
                    Title
                  </Text>
                  {sortBy === 'alphabetical' && (
                    sortDirection === 'asc' ? (
                      <ArrowUp size={14} color={colors.accent} />
                    ) : (
                      <ArrowDown size={14} color={colors.accent} />
                    )
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.listHeaderDate}
                  onPress={() => {
                    if (sortBy === 'date') {
                      // Toggle direction if already sorting by date
                      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
                    } else {
                      // Switch to date sort, default to descending (newest first)
                      setSortBy('date');
                      setSortDirection('desc');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.listHeaderText, sortBy === 'date' && styles.listHeaderTextActive]}>
                    Date
                  </Text>
                  {sortBy === 'date' && (
                    sortDirection === 'desc' ? (
                      <ArrowDown size={14} color={colors.accent} />
                    ) : (
                      <ArrowUp size={14} color={colors.accent} />
                    )
                  )}
                </TouchableOpacity>
              </View>
              <View style={styles.listHeaderDivider} />

              {nothingVisible ? (
                <View style={styles.emptyFilteredState}>
                  <Text style={styles.emptyFilteredTitle}>
                    {searchQuery ? 'No items found' : 'No materials match your filters'}
                  </Text>
                  <Text style={styles.emptyFilteredText}>
                    {searchQuery
                      ? 'Try adjusting your search or filters'
                      : 'Try adjusting your filters to see more materials'}
                  </Text>
                </View>
              ) : (
                <ScrollView style={styles.listContainer} contentContainerStyle={styles.listContent}>
                {/* Unified materials list (includes both purchased materials and uploaded files) */}
                {visibleMaterials
                .map(m => {
              // Determine kind based on whether it has storage_path (file-based) or not
              const isFileBased = m.storage_path;
                  const normalized = isFileBased ? normalizeUpload(m) : normalizeMaterial(m);
                  return { kind: isFileBased ? 'upload' : 'material', data: m, normalized };
                })
                .sort((a, b) => {
              if (sortBy === 'alphabetical') {
                const titleA = (a.normalized.title || '').toLowerCase();
                const titleB = (b.normalized.title || '').toLowerCase();
                const comparison = titleA.localeCompare(titleB);
                return sortDirection === 'asc' ? comparison : -comparison;
              } else {
                // Sort by date
                const dateA = new Date(a.data.created_at || 0);
                const dateB = new Date(b.data.created_at || 0);
                const comparison = dateB - dateA;
                return sortDirection === 'desc' ? comparison : -comparison;
              }
            })
              .map((item, index, arr) => {
              const { kind, data, normalized } = item;
              
              const isHovered = hoveredItemId === data.id;
              const isLast = index === arr.length - 1;
              
              return (
                <View key={`${kind}-${data.id}`}>
                  <View
                    style={[
                      styles.listItem,
                      Platform.OS === 'web' && { cursor: 'pointer' }
                    ]}
                    {...(Platform.OS === 'web' && typeof window !== 'undefined' && {
                      onMouseEnter: () => setHoveredItemId(data.id),
                      onMouseLeave: () => setHoveredItemId(null),
                      onMouseDown: (e) => {
                        if (e.button === 2) {
                          e.preventDefault();
                          e.stopPropagation();
                          const nativeEvent = e.nativeEvent || e;
                          handleItemRightClick(item, nativeEvent);
                        }
                      },
                      onContextMenu: (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const nativeEvent = e.nativeEvent || e;
                        handleItemRightClick(item, nativeEvent);
                      }
                    })}
                  >
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                      onPress={() => handleItemClick(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.listItemContent}>
                        <View style={styles.listItemTitleRow}>
                          <Text style={styles.listItemTitle} numberOfLines={1}>
                            {normalized.title}
                          </Text>
                          {(() => {
                            // Build type string like "Algebra Syllabus (PDF)" from subject, role and mediaType
                            const subjectName = data.subject_key;
                            const roleText = normalized.role ? roleLabel(normalized.role) : null;
                            const mediaTypeText = normalized.mediaType ? mediaTypeLabel(normalized.mediaType) : null;
                            
                            if (!roleText) return null;
                            
                            // Build subject prefix if subject exists
                            let subjectPrefix = '';
                            if (subjectName) {
                              // Check if subject_key contains multiple subjects (comma-separated or "and")
                              const subjects = subjectName.split(/[,\s]+and\s+|[,\s]+/i).filter(s => s.trim());
                              if (subjects.length === 2) {
                                subjectPrefix = `${subjects[0]} and ${subjects[1]} `;
                              } else if (subjects.length > 0) {
                                subjectPrefix = `${subjects[0]} `;
                              }
                            }
                            
                            const typeString = mediaTypeText 
                              ? `${subjectPrefix}${roleText} (${mediaTypeText})`
                              : `${subjectPrefix}${roleText}`;
                            
                            return (
                              <Text style={styles.listItemType} numberOfLines={1}>
                                {typeString}
                              </Text>
                            );
                          })()}
                        </View>
                        <View style={styles.listItemMeta}>
                          {(() => {
                            const materialChildren = data.material_children || [];
                            const childIds = materialChildren.map(mc => mc.child_id);
                            const childNames = materialChildren
                              .map(mc => {
                                const child = effectiveChildren.find(c => c.id === mc.child_id);
                                return child ? (child.first_name || child.name || 'Child') : null;
                              })
                              .filter(Boolean);
                            const hasChildren = childNames.length > 0;
                            
                            if (!hasChildren) return null;
                            
                            // Add child dots if there are children
                            if (hasChildren) {
                              return (
                                <View style={styles.listItemSubtitleRow}>
                                  {childIds.slice(0, 3).map((childId) => (
                                    <View
                                      key={childId}
                                      style={[
                                        styles.childDot,
                                        { backgroundColor: getChildDotColor(childId) }
                                      ]}
                                    />
                                  ))}
                                  {childIds.length > 3 && (
                                    <View style={[styles.childDot, { backgroundColor: 'rgba(156, 163, 175, 0.4)' }]} />
                                  )}
                                  <Text style={styles.listItemSubtitle} numberOfLines={1}>
                                    {childNames.join(', ')}
                                  </Text>
                                </View>
                              );
                            }
                            
                            return null;
                          })()}
                        </View>
                      </View>
                      {data.created_at && (
                        <Text style={styles.listItemDate}>
                          {new Date(data.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                      )}
                    </TouchableOpacity>
                    {Platform.OS === 'web' && (
                      <TouchableOpacity
                        style={[
                          styles.menuButton,
                          !isHovered && styles.menuButtonHidden
                        ]}
                        onPress={(e) => handleMenuButtonClick(item, e)}
                        data-menu-button-id={data.id}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MoreVertical size={18} color={colors.muted} />
                      </TouchableOpacity>
                    )}
                  </View>
                  {!isLast && <View style={styles.listItemDivider} />}
                </View>
                );
              })}
            </ScrollView>
              )}
          </>
        </>
      )}
      </View>


      {/* Build Curriculum Modal */}
      <BuildCurriculumModal
        visible={showBuildFromMaterialModal}
        onClose={() => setShowBuildFromMaterialModal(false)}
        familyId={familyId}
        children={children}
        selectedChildIds={null}
        onComplete={(result) => {
          console.log('Build curriculum completed:', result);
          setShowBuildFromMaterialModal(false);
          // Optionally refresh materials or calendar
        }}
      />

      {/* Detail Drawer */}
      <MaterialDetailDrawer
        open={showDetailDrawer}
        onClose={() => {
          setShowDetailDrawer(false);
          setSelectedMaterial(null);
        }}
        material={selectedMaterial}
        children={children}
        familyId={familyId}
        onReviewSaved={handleReviewSaved}
      />

      {/* Add Material Modal */}
      <AddMaterialModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSaved={() => {
          setShowAddModal(false);
          loadMaterials();
        }}
        familyId={familyId}
        children={children}
        allSubjects={allSubjectsForModal}
      />

      {/* Material Details Modal (View Mode) */}
      <MaterialDetailsModal
        visible={!!viewingMaterial}
        onClose={() => setViewingMaterial(null)}
        material={viewingMaterial}
        familyId={familyId}
        children={children}
        onEdit={handleEditFromDetails}
        onDelete={handleDeleteFromDetails}
      />

      {/* Edit Material Modal */}
      <AddMaterialModal
        visible={!!editingMaterial}
        onClose={() => setEditingMaterial(null)}
        onSaved={async () => {
          // Store the material ID before closing
          const materialId = editingMaterial?.id;
          
          // Reload materials to get updated data including reviews
          await loadMaterials();
          
          // Close the edit modal
          setEditingMaterial(null);
          
          // Show success toast
          toast.push('Attachment details saved', 'success');
          
          // Reload the material if it was being viewed
          if (viewingMaterial?.id && materialId && viewingMaterial.id === materialId) {
            try {
              const { getMaterial } = await import('../../lib/services/materialsClient');
              const updatedMaterial = await getMaterial(materialId);
              setViewingMaterial(updatedMaterial);
            } catch (error) {
              console.error('[MaterialsLibrary] Error reloading material:', error);
            }
          }
          
          // Also update selectedMaterial if it's the same one
          if (selectedMaterial && materialId && selectedMaterial.id === materialId) {
            try {
              const { getMaterial } = await import('../../lib/services/materialsClient');
              const updatedMaterial = await getMaterial(materialId);
              setSelectedMaterial(updatedMaterial);
            } catch (error) {
              console.error('[MaterialsLibrary] Error reloading material:', error);
              // Fallback: just reload from the list
              const updated = materials.find(m => m.id === materialId);
              if (updated) {
                setSelectedMaterial(updated);
              }
            }
          }
        }}
        familyId={familyId}
        children={children}
        material={editingMaterial}
        allSubjects={subjects}
      />

      {/* Review Modal */}
      {reviewMaterial && reviewChildId && (
        <QuickReviewModal
          visible={showReviewModal}
          onClose={() => {
            setShowReviewModal(false);
            setReviewMaterial(null);
            setReviewChildId(null);
          }}
          onSaved={() => {
            setShowReviewModal(false);
            setReviewMaterial(null);
            setReviewChildId(null);
            loadMaterials();
            if (selectedMaterial && selectedMaterial.id === reviewMaterial.id) {
              // Reload selected material if it's the one being reviewed
              getMaterials(familyId, {})
                .then(data => {
                  const updated = data.find(m => m.id === selectedMaterial.id);
                  if (updated) {
                    setSelectedMaterial(updated);
                  }
                })
                .catch(() => {});
            }
          }}
          materialId={reviewMaterial.id}
          childId={reviewChildId}
          familyId={familyId}
          materialTitle={reviewMaterial.title}
          childName={effectiveChildren.find(c => c.id === reviewChildId)?.first_name || effectiveChildren.find(c => c.id === reviewChildId)?.name || ''}
        />
      )}

      {/* PDF Viewer Modal */}
      {showPdfViewer && pdfUrl && (
        <Modal
          visible={showPdfViewer}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowPdfViewer(false)}
        >
          <View style={styles.pdfModalOverlay}>
            <TouchableOpacity
              style={styles.pdfModalOverlayTouchable}
              activeOpacity={1}
              onPress={() => setShowPdfViewer(false)}
            />
            <View
              style={styles.pdfModalContainer}
              onStartShouldSetResponder={() => true}
            >
              <View style={styles.pdfModalHeader}>
                <Text style={styles.pdfModalTitle} numberOfLines={1}>
                  {pdfTitle}
                </Text>
                <View style={styles.pdfModalActions}>
                  {Platform.OS === 'web' && (
                    <TouchableOpacity
                      style={styles.pdfModalButton}
                      onPress={() => {
                        window.open(pdfUrl, '_blank');
                      }}
                    >
                      <ExternalLink size={18} color={colors.accent} />
                      <Text style={styles.pdfModalButtonText}>Open in new tab</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.pdfModalCloseButton}
                    onPress={() => setShowPdfViewer(false)}
                  >
                    <X size={20} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.pdfViewerContainer}>
                {Platform.OS === 'web' ? (
                  <PDFIframe src={pdfUrl} title={pdfTitle} />
                ) : (
                  <View style={styles.pdfFallback}>
                    <Text style={styles.pdfFallbackText}>
                      PDF viewing is not available on this platform.
                    </Text>
                    <TouchableOpacity
                      style={styles.pdfModalButton}
                      onPress={() => {
                        // On native, you might open in a browser or PDF app
                        Alert.alert('Open PDF', 'Would you like to open this PDF in your browser?');
                      }}
                    >
                      <ExternalLink size={18} color={colors.accent} />
                      <Text style={styles.pdfModalButtonText}>Open externally</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    // Avoid double horizontal padding (rows below already handle their own inset)
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 16,
    minHeight: '100%',
  },
  mainContent: {
    flex: 1,
    width: '100%',
    maxWidth: '100%',
  },
  actionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      },
    }),
  },
  actionCardActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentLight || '#f0f9ff',
  },
  // Primary/dominant card for Add New Material
  actionCardPrimary: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  actionCardIconContainerPrimary: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: colors.accentLight || '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionCardIconPrimary: {
    width: 36,
    height: 36,
    overflow: 'hidden',
    transform: [{ scale: 1.5 }],
  },
  actionCardTitlePrimary: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actionCardDescriptionPrimary: {
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
    opacity: 0.8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  // Muted card for Recently Deleted
  actionCardMuted: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
      },
    }),
  },
  actionCardIconContainerMuted: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionCardIconMuted: {
    width: 24,
    height: 24,
    overflow: 'hidden',
    transform: [{ scale: 1.5 }],
    opacity: 0.6,
  },
  actionCardTitleMuted: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.muted,
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actionCardDescriptionMuted: {
    fontSize: 11,
    color: colors.muted,
    lineHeight: 15,
    opacity: 0.7,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actionCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionCardIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.accentLight || '#f0f9ff',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionCardIcon: {
    width: 32,
    height: 32,
    overflow: 'hidden',
    transform: [{ scale: 1.5 }],
  },
  actionCardTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  actionCardTitleActive: {
    color: colors.accent,
  },
  actionCardDescription: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sidebarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sidebarCard: {
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 20,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  sidebarCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
    gap: 10,
  },
  sidebarCardTitleSection: {
    flex: 1,
    gap: 4,
    paddingTop: 20,
  },
  sidebarCardIconContainer: {
    width: 150,
    height: 150,
    borderRadius: 12,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarCardIcon: {
    width: 150,
    height: 150,
    borderRadius: 12,
  },
  sidebarCardTitleContainer: {
    // No background - removed yellow fill
  },
  sidebarCardTitle: {
    fontSize: 16,
    fontWeight: '700', // extra bold
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sidebarCardDescription: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 2,
    letterSpacing: 0.3,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sidebarCardButton: {
    backgroundColor: '#FEFCE8', // light yellow
    borderRadius: 24, // rounded pill
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '100%', // full-width
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#B8860B', // darker yellow
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  sidebarCardButtonHover: {
    backgroundColor: '#F5E6A3', // slightly darker yellow on hover
    borderBottomColor: '#8B6914', // darker border on hover
  },
  sidebarCardButtonText: {
    fontSize: 16,
    fontWeight: '800', // extra bold
    color: '#B8860B', // darker yellow for contrast on light yellow
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sidebarCardButtonTextHover: {
    color: '#8B6914', // even darker yellow on hover for more contrast
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },
  insightsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  insightsButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  insightsButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  insightsButtonTextActive: {
    color: '#ffffff',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 0,
    // Match Subjects/Intelligence Hub header row height
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.background,
  },
  totalFilesText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  searchAndButtonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    // Match Planner spacing + non-stretch behavior
    gap: 12,
    flexShrink: 0,
    justifyContent: 'flex-end',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  attachIcon: {
    width: 32,
    height: 32,
    overflow: 'hidden',
    transform: [{ scale: 1.5 }],
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filters: {
    // Match Planner: avoid extra vertical slack under the header row
    marginBottom: 0,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border || '#e5e7eb',
    // Match Planner: divider sits directly under the header row
    marginTop: 0,
    marginBottom: 0,
    // Match Intelligence: inset divider line
    marginHorizontal: 24,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 250,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    height: 40, // Fixed height to prevent expansion when icon size increases
    ...Platform.select({
      web: {
        cursor: 'text',
      },
    }),
  },
  roleChipRow: {
    flex: 1,
  },
  roleChipRowContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  roleChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
  },
  roleChipActive: {
    borderColor: '#4285f4',
    backgroundColor: '#e8f0fe',
  },
  roleChipText: {
    fontSize: 12,
    color: '#3c4043',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  roleChipTextActive: {
    color: '#4285f4',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  roleHelperText: {
    fontSize: 12,
    color: colors.muted,
    marginTop: -6,
    marginBottom: 10,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childChipRow: {
    flex: 1,
  },
  childChipRowContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  subjectChipRow: {
    flex: 1,
  },
  subjectChipRowContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  subjectChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  subjectChipActive: {
    borderColor: '#4285f4',
    backgroundColor: '#e8f0fe',
  },
  subjectChipText: {
    fontSize: 12,
    color: '#3c4043',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectChipTextActive: {
    color: '#4285f4',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sortChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    flex: 1,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  sortChipActive: {
    borderColor: '#4285f4',
    backgroundColor: '#e8f0fe',
  },
  sortChipText: {
    fontSize: 12,
    color: '#3c4043',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  sortChipTextActive: {
    color: '#4285f4',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    maxWidth: 220,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  childChipActive: {
    borderColor: '#4285f4',
    backgroundColor: '#e8f0fe',
  },
  childAvatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childAvatarActive: {
    borderColor: '#4285f4',
  },
  childChipText: {
    fontSize: 12,
    color: '#3c4043',
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childChipTextActive: {
    color: '#4285f4',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  clearButton: {
    padding: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  searchIconContainer: {
    padding: 4,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#111827',
    backgroundColor: '#111827',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  newButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterRow: {
    marginBottom: 12,
  },
  filterRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  filterLabel: {
    fontSize: 14,
    color: '#3c4043',
    fontWeight: '500',
    minWidth: 80,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    marginRight: 8,
  },
  filterChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  filterChipText: {
    fontSize: 14,
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filterChipTextActive: {
    color: colors.accent,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  // (removed "Reuse candidates only" UI)
  materialsHeader: {
    marginBottom: 20,
  },
  materialsTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  filtersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  deletedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    marginLeft: 'auto',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  deletedButtonActive: {
    backgroundColor: colors.accent,
  },
  smartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  smartIcon: {
    width: 32,
    height: 32,
    overflow: 'hidden',
    transform: [{ scale: 1.5 }],
  },
  trashIcon: {
    width: 32,
    height: 32,
    overflow: 'hidden',
    transform: [{ scale: 1.5 }],
  },
  dropdownOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
    backgroundColor: 'transparent',
  },
  filtersDropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.08)',
    padding: 4,
    minWidth: 200,
    maxWidth: 300,
    maxHeight: 400,
    zIndex: 1000,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        overflowY: 'auto',
      },
    }),
  },
  dropdownSection: {
    paddingVertical: 4,
  },
  dropdownSectionTitle: {
    fontSize: 11,
    color: 'rgba(107, 114, 128, 0.7)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(15,23,42,0.06)',
    marginBottom: 4,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: 'rgba(15,23,42,0.06)',
    marginVertical: 4,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  dropdownCheckbox: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownCheckboxActive: {
    borderColor: '#8B5CF6',
    backgroundColor: '#8B5CF6',
  },
  dropdownOptionText: {
    fontSize: 13,
    color: 'rgba(15,23,42,0.9)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childrenLabelContainer: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 4,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  childrenLabelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childrenFilterRow: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    // Add breathing room below the divider above the chips (match requested spacing)
    marginTop: 24,
    marginBottom: 16,
    // Align with Intelligence Hub chips (filtersContainer paddingHorizontal: 24)
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  childrenFilterScroll: {
    flex: 1,
  },
  childrenFilterScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  subjectsLabelContainer: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 24,
    paddingBottom: 8,
    paddingTop: 4,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  subjectsLabelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectsFilterRow: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    marginBottom: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  subjectsFilterScroll: {
    flexGrow: 0,
  },
  subjectsFilterScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  typesLabelContainer: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 24,
    paddingBottom: 8,
    paddingTop: 4,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  typesLabelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  typesFilterRow: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    marginBottom: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  typesFilterScroll: {
    flexGrow: 0,
  },
  typesFilterScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  recentlyDeletedLabelContainer: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    paddingHorizontal: 24,
    paddingBottom: 8,
    paddingTop: 10,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  recentlyDeletedLabelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  recentlyDeletedFilterRow: {
    maxWidth: 1400,
    width: '100%',
    marginHorizontal: 'auto',
    marginBottom: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...(Platform.OS === 'web' && {
      boxSizing: 'border-box',
    }),
  },
  recentlyDeletedFilterScroll: {
    flexGrow: 0,
  },
  recentlyDeletedFilterScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  childrenFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
    backgroundColor: 'transparent',
    marginRight: 8,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  childrenFilterChipActive: {
    borderColor: '#4285f4',
    backgroundColor: '#e8f0fe',
  },
  childrenFilterChipText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  childrenFilterChipTextActive: {
    color: '#4285f4',
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  allFilesContainer: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  allFilesText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  listHeaderDivider: {
    height: 1,
    backgroundColor: colors.border || '#e5e7eb',
    marginBottom: 0,
    marginHorizontal: 24,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  listHeaderTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        userSelect: 'none',
      },
    }),
  },
  listHeaderDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 100,
    paddingVertical: 4,
    paddingHorizontal: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        userSelect: 'none',
      },
    }),
  },
  listHeaderText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  listHeaderTextActive: {
    color: colors.accent,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 24,
    backgroundColor: '#ffffff',
    width: '100%',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        ':hover': {
          backgroundColor: '#f9fafb',
        },
      },
    }),
  },
  listItemDivider: {
    height: 1,
    backgroundColor: colors.border || '#e5e7eb',
    marginHorizontal: 24,
  },
  listItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  listItemContent: {
    flex: 1,
    minWidth: 0,
  },
  listItemTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  listItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  listItemType: {
    fontSize: 14,
    color: colors.muted,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  listItemSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  childDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  childrenFilterChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  listItemSubtitle: {
    fontSize: 15,
    color: colors.muted,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  listItemMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  listItemDetails: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '400',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  listItemDate: {
    fontSize: 14,
    color: colors.muted,
    marginLeft: 12,
    whiteSpace: 'nowrap',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  menuButton: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'opacity 0.15s ease',
      },
    }),
  },
  menuButtonHidden: {
    opacity: 0,
    ...Platform.select({
      web: {
        pointerEvents: 'none',
      },
    }),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.muted,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIconContainer: {
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyFilteredState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyFilteredTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyFilteredText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 24,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  emptyButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    marginBottom: 16,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  retryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  uploadCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 280,
    ...Platform.select({
      web: {
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  uploadCardContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  uploadCardText: {
    flex: 1,
    gap: 4,
  },
  uploadCardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  uploadCardMeta: {
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  uploadCardDate: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pdfModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...Platform.select({
      web: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 10000,
      },
    }),
  },
  pdfModalOverlayTouchable: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  pdfModalContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: Platform.OS === 'web' ? '90%' : '100%',
    maxWidth: 1200,
    maxHeight: '85%',
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
    ...Platform.select({
      web: {
        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
      },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  pdfModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#ffffff',
  },
  pdfModalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginRight: 16,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pdfModalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pdfModalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  pdfModalButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pdfModalCloseButton: {
    padding: 4,
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  pdfViewerContainer: {
    height: Platform.OS === 'web' ? 'calc(85vh - 80px)' : '100%',
    minHeight: 400,
    backgroundColor: '#f9fafb',
    ...Platform.select({
      web: {
        maxHeight: 'calc(85vh - 80px)',
      },
    }),
  },
  pdfIframeContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    ...Platform.select({
      web: {
        position: 'relative',
        overflow: 'hidden',
      },
    }),
  },
  pdfFallback: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  pdfFallbackText: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: 20,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  deletedBinContainer: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#fecaca',
    maxHeight: 600,
  },
  deletedBinHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  deletedBinHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  deletedBinTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  deletedBinSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginLeft: 8,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  closeBinButton: {
    padding: 4,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  deletedBinLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  deletedBinLoadingText: {
    fontSize: 14,
    color: colors.muted,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  deletedBinEmpty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  deletedBinEmptyText: {
    fontSize: 14,
    color: colors.muted,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  deletedBinList: {
    maxHeight: 500,
  },
  deletedBinListContent: {
    gap: 8,
  },
  deletedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 12,
  },
  deletedItemContent: {
    flex: 1,
    minWidth: 0,
  },
  deletedItemTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  deletedItemSubtitle: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: 4,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  deletedItemDate: {
    fontSize: 11,
    color: colors.muted,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  deletedItemActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  restoreButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.accent,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  permanentDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dc2626',
    backgroundColor: '#ffffff',
    ...Platform.select({
      web: { cursor: 'pointer' },
    }),
  },
  permanentDeleteButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#dc2626',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});

