import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator, Platform, Alert } from 'react-native';
import { Link, Plus, Search, X, Upload, FileText } from 'lucide-react';
import { colors } from '../../theme/colors';
import { supabase } from '../../lib/supabase';
import { linkEventSyllabus, apiRequest } from '../../lib/apiClient';
import { createFileMaterial } from '../../lib/services/materialsClient';
import {
  DOCUMENT_ROLE_CHIPS,
  matchesRole,
  normalizeUpload,
  normalizeSyllabusSection,
  roleLabel,
  roleToSectionType,
  roleToUploadTags,
  withDocKindTag,
} from '../../lib/docs/roles';

export default function EventDocumentsTab({ event, syllabus, onRelink, onOpenSyllabus, familyId }) {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [attachedSections, setAttachedSections] = useState([]);
  // UI-level document type (maps onto syllabus_sections.section_type constraints)
  const [syllabusType, setSyllabusType] = useState('all'); // all | syllabus | lesson_plan | assignment | resource | assessment
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionDescription, setNewSectionDescription] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showUploadError, setShowUploadError] = useState(false);
  const [sectionUrl, setSectionUrl] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [showSubjectSelector, setShowSubjectSelector] = useState(false);
  const [pendingUploadData, setPendingUploadData] = useState(null);
  const [pendingUploadRecord, setPendingUploadRecord] = useState(null);
  const [pendingAttachUploadId, setPendingAttachUploadId] = useState(null);
  const [showDuplicateAlert, setShowDuplicateAlert] = useState(false);
  const [duplicateFileName, setDuplicateFileName] = useState('');
  const [pendingFile, setPendingFile] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (syllabus?.sections) {
      setSections(syllabus.sections);
    } else if (syllabus?.id) {
      loadSections();
    }
    // Don't try to load all sections if we don't have a syllabus
    // RLS will block it anyway, and it's not necessary for the UI to work
    loadAttachedSections();
    
    // Load subjects for selector
    if (familyId) {
      loadSubjects();
    }
  }, [syllabus, event, familyId]);

  // Search for uploaded files when search query changes
  useEffect(() => {
    if (showSearch && searchQuery && searchQuery.length > 0 && familyId) {
      console.log('[EventSyllabusTab] useEffect triggered search with query:', searchQuery);
      // Reduced debounce for faster response
      const timeoutId = setTimeout(() => {
        searchUploadedFiles(searchQuery);
      }, 150);
      return () => clearTimeout(timeoutId);
    } else if (showSearch && (!searchQuery || searchQuery.length === 0)) {
      setSearchResults([]);
      setSearching(false);
    }
  }, [searchQuery, showSearch, familyId]);

  const loadSubjects = async () => {
    if (!familyId) return;
    try {
      const { data, error } = await supabase
        .from('subject')
        .select('id, name')
        .eq('family_id', familyId)
        .order('name');
      
      if (error) {
        console.warn('[EventSyllabusTab] Error loading subjects:', error);
        return;
      }
      setSubjects(data || []);
    } catch (err) {
      console.warn('[EventSyllabusTab] Exception loading subjects:', err);
    }
  };

  const loadSections = async () => {
    if (!syllabus?.id) return;
    
    try {
      const { data, error } = await supabase
        .from('syllabus_sections')
        .select('*, syllabi(*)')
        .eq('syllabus_id', syllabus.id)
        .order('position');

      if (error) {
        console.warn('[EventSyllabusTab] Error loading sections:', error);
        // If RLS error, try without the join
        if (error.code === 'PGRST301' || error.message?.includes('permission')) {
          const { data: simpleData, error: simpleError } = await supabase
        .from('syllabus_sections')
        .select('*')
        .eq('syllabus_id', syllabus.id)
        .order('position');

          if (!simpleError && simpleData) {
            setSections(simpleData || []);
            return;
          }
        }
        throw error;
      }
      setSections(data || []);
    } catch (err) {
      console.warn('[EventSyllabusTab] Failed to load sections:', err);
      setSections([]);
    }
  };

  // Removed loadAllSections - we don't need to load all sections if there's no syllabus
  // The UI works fine without pre-loading sections, and RLS often blocks these queries

  const loadAttachedSections = async () => {
    if (!event?.id) return;
    
    try {
      // Get all syllabus sections linked to this event
      const { data, error } = await supabase
        .from('events')
        .select('source_section_id')
        .eq('id', event.id)
        .single();

      if (error) throw error;
      
        if (data?.source_section_id) {
          // Use limit(1) to avoid 406s from .single() when 0/multi rows
          let sectionData = null;
          let sectionError = null;

          const result = await supabase
            .from('syllabus_sections')
            .select('*, syllabi(*)')
            .eq('id', data.source_section_id)
            .limit(1);

          sectionData = result.data?.[0] || null;
          sectionError = result.error;

          // If RLS error, try without join
          if (sectionError && (sectionError.code === 'PGRST301' || sectionError.message?.includes('permission'))) {
            const simpleResult = await supabase
              .from('syllabus_sections')
              .select('*')
              .eq('id', data.source_section_id)
              .limit(1);

            sectionData = simpleResult.data?.[0] || null;
            sectionError = simpleResult.error;
          }

          if (!sectionError && sectionData) {
            setAttachedSections([sectionData]);
          } else {
            console.warn('[EventSyllabusTab] Error loading attached section:', sectionError);
            setAttachedSections([]);
          }
        } else {
          setAttachedSections([]);
        }
    } catch (err) {
      setAttachedSections([]);
    }
  };

  const handleAttach = async (sectionId) => {
    if (!sectionId || !event?.id) return;
    
    setLoading(true);
    try {
      const { error } = await linkEventSyllabus(event.id, sectionId);
      
      if (error) {
        return;
      }
      
      onRelink?.();
      loadAttachedSections();
      setShowSearch(false);
      setSearchQuery('');
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async (sectionId) => {
    if (!event?.id) return;
    
    setLoading(true);
    try {
      const { error } = await supabase
        .from('events')
        .update({ source_section_id: null })
        .eq('id', event.id);

      if (error) throw error;
      
      onRelink?.();
      loadAttachedSections();
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  const UUID_PREFIX_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/gi;
  const stripStoragePrefix = (text) => (text || '').replace(UUID_PREFIX_RE, '');

  const getUploadDisplayName = (upload) => {
    const fromFields = (upload?.filename || upload?.title || '').trim();
    if (fromFields) return stripStoragePrefix(fromFields);
    const fromPath = upload?.storage_path ? upload.storage_path.split('/').pop() : '';
    return stripStoragePrefix(fromPath || '');
  };

  const dedupeUploadsByName = (uploads) => {
    const map = new Map();
    (uploads || []).forEach((u) => {
      const name = getUploadDisplayName(u);
      const key = (name || `id:${u.id}`).toLowerCase();
      const existing = map.get(key);
      if (!existing) {
        map.set(key, u);
        return;
      }
      const existingDate = existing.created_at ? new Date(existing.created_at) : new Date(0);
      const newDate = u.created_at ? new Date(u.created_at) : new Date(0);
      if (newDate > existingDate) map.set(key, u);
    });
    return Array.from(map.values()).sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
      const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
      return dateB - dateA;
    });
  };

  const searchUploadedFiles = async (query) => {
    if (!familyId || !query) {
      setSearchResults([]);
      return;
    }

    console.log('[EventSyllabusTab] Searching for files with query:', query);
    setSearching(true);
    try {
      // Query materials table for file-based materials
      const { data: directData, error: directError } = await supabase
        .from('materials')
        .select('id, title, filename, storage_path, created_at, mime, bytes, tags')
        .eq('family_id', familyId)
        .is('deleted_at', null)
        .not('storage_path', 'is', null) // Only file-based materials
        .or(`filename.ilike.%${query}%,title.ilike.%${query}%,storage_path.ilike.%${query}%`)
        .limit(20);

      if (directError) {
        console.warn('[EventSyllabusTab] Direct query error:', directError);
        setSearchResults([]);
      } else {
        console.log('[EventSyllabusTab] Direct query returned', directData?.length || 0, 'files');
        const filtered = (directData || []).filter((file) => matchesRole(syllabusType, normalizeUpload(file)));
        console.log('[EventSyllabusTab] Filtered to', filtered.length, 'matching files');
        setSearchResults(dedupeUploadsByName(filtered));
      }
    } catch (err) {
      console.warn('[EventSyllabusTab] Exception searching uploads:', err);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAttachUploadedFile = async (uploadId) => {
    if (!event?.id || !uploadId) return;

    setLoading(true);
    try {
      // Get the material record to find or create a syllabus section
      const { data: upload, error: uploadError } = await supabase
        .from('materials')
        .select(`
          *,
          syllabi(*),
          material_children(child_id, status)
        `)
        .eq('id', uploadId)
        .is('deleted_at', null)
        .single();

      if (uploadError) throw uploadError;

      // Get child_id from material_children if available, otherwise from event
      let materialChildId = null;
      if (upload.material_children && upload.material_children.length > 0) {
        materialChildId = upload.material_children[0].child_id;
      }
      const childIdForSyllabus = event?.child_id || materialChildId || null;
      const subjectIdForSyllabus = event?.subject_id || upload.subject_id || null;

      // Ensure the material is attributed to the event's child/subject (for Library child filters).
      // Use material_children table instead of materials.child_id
      if (event?.child_id && !materialChildId) {
        try {
          const { linkMaterialToChild } = await import('../../lib/services/materialsClient');
          await linkMaterialToChild(uploadId, event.child_id, familyId, 'in_use');
        } catch (metaErr) {
          console.warn('[EventSyllabusTab] Failed to link material to child:', metaErr);
        }
      }
      
      // Update subject_id if needed
      if (event?.subject_id && !upload.subject_id) {
        try {
          await supabase
            .from('materials')
            .update({ subject_id: event.subject_id })
            .eq('id', uploadId);
        } catch (metaErr) {
          console.warn('[EventSyllabusTab] Failed to update material subject:', metaErr);
        }
      }

      // Find or create a syllabus for this upload
      let targetSyllabusId = upload.syllabi?.[0]?.id;
      
      if (!targetSyllabusId && upload.syllabi_id) {
        targetSyllabusId = upload.syllabi_id;
      }

      // If no syllabus exists, create one
      if (!targetSyllabusId) {
        // If we don't have a subject, prompt (don’t hard-fail)
        if (!subjectIdForSyllabus) {
          // Load subjects if needed
          if (subjects.length === 0 && familyId) {
            await loadSubjects();
          }
          if (subjects.length > 0) {
            setPendingAttachUploadId(uploadId);
            setShowSubjectSelector(true);
            return;
          }
          throw new Error('Cannot attach: this event needs a subject first.');
        }

        const syllabusTitle = upload.title || upload.filename || 'Syllabus';
        const { data: newSyllabus, error: syllabusError } = await supabase
          .from('syllabi')
          .insert({
            family_id: familyId,
            child_id: childIdForSyllabus,
            subject_id: subjectIdForSyllabus,
            upload_id: uploadId,
            title: syllabusTitle,
          })
          .select()
          .single();

        if (syllabusError) {
          // If creation fails, try API endpoint
          if (childIdForSyllabus && subjectIdForSyllabus) {
            try {
              const apiResult = await apiRequest('/api/syllabus/upload', {
                method: 'POST',
                body: JSON.stringify({
                  upload_id: uploadId,
                  family_id: familyId,
                  child_id: childIdForSyllabus,
                  subject_id: subjectIdForSyllabus,
                  title: syllabusTitle,
                }),
              });
              
              if (!apiResult.error && apiResult.syllabus?.id) {
                targetSyllabusId = apiResult.syllabus.id;
              } else {
                throw new Error('Failed to create syllabus');
              }
            } catch (apiErr) {
              console.error('[EventSyllabusTab] API endpoint failed:', apiErr);
              throw new Error('Failed to create syllabus for uploaded file');
            }
          } else {
            // If we’re missing subject, allow user to pick it.
            if (!subjectIdForSyllabus) {
              if (subjects.length === 0 && familyId) {
                await loadSubjects();
              }
              if (subjects.length > 0) {
                setPendingAttachUploadId(uploadId);
                setShowSubjectSelector(true);
                return;
              }
            }
            throw new Error('Cannot create syllabus for this document.');
          }
        } else {
          targetSyllabusId = newSyllabus.id;
        }
      }

      // Create a section for this upload if one doesn't exist
      const filename = getUploadDisplayName(upload) || 'Document';
      const sectionTitle = filename.replace(/\.[^/.]+$/, ''); // Remove extension

      // Check if section already exists
      const { data: existingSections, error: existingSectionError } = await supabase
        .from('syllabus_sections')
        .select('id, created_at')
        .eq('syllabus_id', targetSyllabusId)
        .eq('heading', sectionTitle)
        .order('created_at', { ascending: false })
        .limit(1);

      if (existingSectionError) {
        console.warn('[EventSyllabusTab] Existing section lookup error:', existingSectionError);
      }

      let sectionId = existingSections?.[0]?.id;

      if (!sectionId) {
        // Create new section - requires a role
        const derivedRole = normalizeUpload(upload).role;
        const roleForAttach = syllabusType === 'all' ? derivedRole : syllabusType;
        if (!roleForAttach || roleForAttach === 'all' || roleForAttach === 'unknown') {
          Alert.alert('Choose a document role', 'Select Syllabus, Lesson plan, Assignment, Resource, or Assessment to attach this document.');
          return;
        }

        const sectionType = roleToSectionType(roleForAttach);
        const { data: newSection, error: sectionError } = await supabase
          .from('syllabus_sections')
          .insert({
            syllabus_id: targetSyllabusId,
            position: 1,
            section_type: sectionType,
            heading: sectionTitle,
            notes: withDocKindTag(upload.storage_path || '', roleForAttach),
          })
          .select()
          .single();

        if (sectionError) throw sectionError;
        sectionId = newSection.id;
      }

      // Attach section to event
      await handleAttach(sectionId);
      
      // Close search and clear query
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
    } catch (err) {
      console.error('[EventSyllabusTab] Error attaching uploaded file:', err);
      Alert.alert('Error', `Failed to attach file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadPDF = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      Alert.alert('File Upload', 'File upload is currently only supported on web.');
      return;
    }

    console.log('[EventSyllabusTab] handleUploadPDF called');
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx';
    input.onchange = async (e) => {
      console.log('[EventSyllabusTab] File input onChange triggered', e);
      const file = e.target.files?.[0];
      if (!file) {
        console.log('[EventSyllabusTab] No file selected');
        return;
      }

      console.log('[EventSyllabusTab] File selected:', file.name, file.size, file.type);
      
      // Check if a file with this name already exists
      try {
        const fileName = file.name;
        console.log('[EventSyllabusTab] Checking for existing file with name:', fileName);
        
        // Check both filename and title columns using case-insensitive matching
        // Also check if the filename appears in the storage_path - query materials table
        const [filenameResult, titleResult, allFilesResult] = await Promise.all([
          supabase
            .from('materials')
            .select('id, title, filename, storage_path, created_at')
            .eq('family_id', familyId)
            .is('deleted_at', null)
            .not('storage_path', 'is', null)
            .ilike('filename', fileName)
            .limit(10),
          supabase
            .from('materials')
            .select('id, title, filename, storage_path, created_at')
            .eq('family_id', familyId)
            .is('deleted_at', null)
            .not('storage_path', 'is', null)
            .ilike('title', fileName)
            .limit(10),
          supabase
            .from('materials')
            .select('id, title, filename, storage_path, created_at')
            .eq('family_id', familyId)
            .is('deleted_at', null)
            .not('storage_path', 'is', null)
            .limit(50), // Get more files to check storage_path
        ]);
        
        console.log('[EventSyllabusTab] Query results:', {
          filenameMatches: filenameResult.data?.length || 0,
          titleMatches: titleResult.data?.length || 0,
          allFiles: allFilesResult.data?.length || 0,
          filenameError: filenameResult.error,
          titleError: titleResult.error,
        });
        
        // Combine results and also check storage_path for filename matches
        const existingFilesMap = new Map();
        (filenameResult.data || []).forEach(f => existingFilesMap.set(f.id, f));
        (titleResult.data || []).forEach(f => existingFilesMap.set(f.id, f));
        
        // Also check storage_path for files that contain the filename (after UUID prefix)
        if (allFilesResult.data) {
          const fileNameLower = fileName.toLowerCase();
          allFilesResult.data.forEach(f => {
            if (f.storage_path) {
              const pathParts = f.storage_path.split('/');
              const pathFilename = pathParts[pathParts.length - 1];
              // Check if the filename (with or without UUID prefix) matches
              const pathFilenameLower = pathFilename.toLowerCase();
              // Remove UUID prefix if present: "uuid_filename" -> "filename"
              const withoutUuid = pathFilenameLower.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i, '');
              if (pathFilenameLower === fileNameLower || withoutUuid === fileNameLower) {
                existingFilesMap.set(f.id, f);
              }
            }
          });
        }
        
        const existingFiles = Array.from(existingFilesMap.values())
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 5);
        
        console.log('[EventSyllabusTab] Found existing files:', existingFiles.length);
        
        const checkError = filenameResult.error || titleResult.error || allFilesResult.error;
        
        if (!checkError && existingFiles && existingFiles.length > 0) {
          console.log('[EventSyllabusTab] Showing duplicate alert for', existingFiles.length, 'existing files');
          // File with same name exists
          // Use custom modal instead of Alert.alert for web compatibility
          setDuplicateFileName(file.name);
          setPendingFile(file);
          setShowDuplicateAlert(true);
          return;
        } else {
          console.log('[EventSyllabusTab] No existing files found, proceeding with upload');
        }
      } catch (checkErr) {
        console.warn('[EventSyllabusTab] Error checking for existing file:', checkErr);
        // Continue with upload if check fails
      }
      
      // No duplicate found, proceed with upload
      proceedWithUpload(file);
    };
    
    // Add error handler for file input
    input.onerror = (err) => {
      console.error('[EventSyllabusTab] File input error:', err);
      setUploadingFile(false);
      Alert.alert('Error', 'File input error. Please try again.');
    };
    
    // Add to DOM temporarily (some browsers require this)
    input.style.display = 'none';
    input.style.position = 'absolute';
    input.style.left = '-9999px';
    document.body.appendChild(input);
    
    console.log('[EventSyllabusTab] Triggering file input click, familyId:', familyId);
    
    // Use setTimeout to ensure DOM is ready
    setTimeout(() => {
      try {
        input.click();
        console.log('[EventSyllabusTab] File input click triggered');
      } catch (clickErr) {
        console.error('[EventSyllabusTab] Error clicking file input:', clickErr);
        Alert.alert('Error', 'Could not open file picker. Please try again.');
        setUploadingFile(false);
      }
    }, 0);
    
    // Clean up after a delay
    setTimeout(() => {
      try {
        if (input.parentNode) {
          input.parentNode.removeChild(input);
        }
      } catch (cleanupErr) {
        console.warn('[EventSyllabusTab] Cleanup error:', cleanupErr);
      }
    }, 5000);
  };

  // Function to proceed with file upload after duplicate check
  const proceedWithUpload = async (file) => {
      setUploadingFile(true);
      
      // Track if we should skip section creation (e.g., if showing subject selector)
      let shouldSkipSectionCreation = false;
      
      try {
        if (syllabusType === 'all') {
          Alert.alert('Choose a document role', 'Select Syllabus, Lesson plan, Assignment, Resource, or Assessment before uploading.');
          setUploadingFile(false);
          return;
        }
        // Upload to evidence bucket (standard bucket used throughout the app)
        // Use same pattern as EvidenceUploadModal which works
        const path = `${familyId}/${crypto.randomUUID()}_${file.name}`;
        
        console.log('[EventSyllabusTab] Uploading file to evidence bucket...');
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('evidence')
          .upload(path, file, {
            upsert: false,
            contentType: file.type,
            metadata: { family_id: familyId } // Include metadata for RLS policy
          });

        if (uploadError) {
          console.error('[EventSyllabusTab] Storage upload error:', uploadError);
          // If RLS blocks, offer alternative: create section with URL or link to existing upload
          if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('permission')) {
            setShowUploadError(true);
            setUploadingFile(false);
            // Don't return - allow user to enter URL or link to existing upload
            return;
          }
          throw uploadError;
        }

        console.log('[EventSyllabusTab] File uploaded to storage:', uploadData);

        const uploadTags = roleToUploadTags(syllabusType);

        // Create file material (replaces uploads table insert)
        const uploadRecord = await createFileMaterial({
          familyId,
          storagePath: uploadData.path,
          title: file.name,
          mime: file.type || 'application/pdf',
          bytes: file.size,
          childId: event?.child_id || null,
          subjectId: event?.subject_id || null,
          eventId: event?.id || null,
          tags: uploadTags,
          notes: 'Uploaded from event documents tab',
        });

        if (!uploadRecord || !uploadRecord.id) {
          throw new Error('Upload succeeded but no material record ID returned');
        }

        console.log('[EventSyllabusTab] Upload record created:', uploadRecord);

        // Determine which syllabus to use
        let targetSyllabusId = syllabus?.id;
        
        // If no syllabus exists, create one automatically
        if (!targetSyllabusId) {
          console.log('[EventSyllabusTab] No syllabus found, creating one...');
          const syllabusTitle = event?.title 
            ? `${event.title} - Syllabus`
            : `Syllabus - ${file.name.replace(/\.[^/.]+$/, '')}`;
          
          // Try to create syllabus
          const { data: newSyllabus, error: syllabusError } = await supabase
            .from('syllabi')
            .insert({
              family_id: familyId,
              child_id: event?.child_id || null,
              subject_id: event?.subject_id || null,
              upload_id: uploadRecord.id,
              title: syllabusTitle,
            })
            .select()
            .single();

          if (syllabusError) {
            console.error('[EventSyllabusTab] Error creating syllabus:', syllabusError);
            
            // Handle constraint violation (missing required field like subject_id)
            if (syllabusError.code === '23502' || syllabusError.message?.includes('null value') || syllabusError.message?.includes('violates not-null constraint')) {
              console.log('[EventSyllabusTab] Constraint violation - missing required field');
              
              // If missing subject_id, try API endpoint if we have child_id and subject_id
              if (event?.child_id && event?.subject_id) {
                try {
                  const apiResult = await apiRequest('/api/syllabus/upload', {
                    method: 'POST',
                    body: JSON.stringify({
                      upload_id: uploadRecord.id,
                      family_id: familyId,
                      child_id: event.child_id,
                      subject_id: event.subject_id,
                      title: syllabusTitle,
                    }),
                  });
                  
                  if (apiResult.error) throw apiResult.error;
                  if (apiResult.syllabus?.id) {
                    targetSyllabusId = apiResult.syllabus.id;
                    console.log('[EventSyllabusTab] Created syllabus via API:', targetSyllabusId);
                    onRelink?.();
                  } else {
                    throw new Error('API returned no syllabus ID');
                  }
                } catch (apiErr) {
                  console.error('[EventSyllabusTab] API endpoint also failed:', apiErr);
                  // Fall through to error handling below
                }
              }
              
              // If we still don't have a syllabus ID, check what's missing
              if (!targetSyllabusId) {
                const missingField = syllabusError.message?.includes('subject_id') ? 'subject' : 
                                    syllabusError.message?.includes('child_id') ? 'child' : 'required information';
                
                // If missing subject_id, try to load subjects and show selector
                if (missingField === 'subject') {
                  // Load subjects if not already loaded
                  let subjectsToUse = subjects;
                  if (subjectsToUse.length === 0) {
                    console.log('[EventSyllabusTab] Loading subjects for selector...');
                    const { data: subjectsData, error: subjectsError } = await supabase
                      .from('subject')
                      .select('id, name')
                      .eq('family_id', familyId)
                      .order('name');
                    
                    if (!subjectsError && subjectsData && subjectsData.length > 0) {
                      subjectsToUse = subjectsData;
                      setSubjects(subjectsData); // Update state for future use
                    }
                  }
                  
                  // If we have subjects available, show selector
                  if (subjectsToUse.length > 0) {
                    console.log('[EventSyllabusTab] Showing subject selector with', subjectsToUse.length, 'subjects');
                    // Store upload data for retry after subject selection
                    setPendingUploadData(uploadData);
                    setPendingUploadRecord(uploadRecord);
                    setShowSubjectSelector(true);
                    setUploadingFile(false);
                    shouldSkipSectionCreation = true; // Mark that we're showing selector
                    console.log('[EventSyllabusTab] Returning early - subject selector will handle retry');
                    return; // Exit early, will retry after subject selection
                  } else {
                    console.log('[EventSyllabusTab] No subjects available for selector, falling through to error handling');
                  }
                }
                
                // Otherwise, show error and allow manual creation
                console.log('[EventSyllabusTab] Showing error alert for missing', missingField);
                // Get public URL for the uploaded file
                const { data: urlData } = supabase.storage.from('evidence').getPublicUrl(uploadData.path);
                const publicUrl = urlData?.publicUrl;
                
                Alert.alert(
                  'Syllabus Creation Failed',
                  `Unable to create syllabus automatically because this event is missing ${missingField} information. The file was uploaded successfully.\n\nYou can:\n\n• Create a section manually below (the file URL has been pre-filled)\n• Link this event to a subject first, then try again\n• Upload files from the Documents section where you can specify the subject`,
                  [{ text: 'OK' }]
                );
                setShowUploadError(true);
                setUploadingFile(false);
                // Pre-fill the section URL with the uploaded file's public URL
                if (publicUrl) {
                  setSectionUrl(publicUrl);
                  setNewSectionDescription(publicUrl); // Also set in description field for visibility
                }
                setShowCreate(true); // Show the create interface so user can complete manually
                return; // Exit early, allow user to create section manually
              }
            }
            // If RLS blocks syllabus creation, try using API endpoint (requires child_id and subject_id)
            else if (syllabusError.code === '42501' || syllabusError.message?.includes('permission')) {
              console.log('[EventSyllabusTab] RLS blocked syllabus creation');
              
              // API endpoint requires child_id and subject_id, so only try if we have them
              if (event?.child_id && event?.subject_id) {
                try {
                  const apiResult = await apiRequest('/api/syllabus/upload', {
                    method: 'POST',
                    body: JSON.stringify({
                      upload_id: uploadRecord.id,
                      family_id: familyId,
                      child_id: event.child_id,
                      subject_id: event.subject_id,
                      title: syllabusTitle,
                    }),
                  });
                  
                  if (apiResult.error) throw apiResult.error;
                  if (apiResult.syllabus?.id) {
                    targetSyllabusId = apiResult.syllabus.id;
                    console.log('[EventSyllabusTab] Created syllabus via API:', targetSyllabusId);
                    onRelink?.();
                  } else {
                    throw new Error('API returned no syllabus ID');
                  }
                } catch (apiErr) {
                  console.error('[EventSyllabusTab] API endpoint also failed:', apiErr);
                  // Fall through to error handling below
                }
              }
              
              // If we still don't have a syllabus ID, show helpful error
              if (!targetSyllabusId) {
                Alert.alert(
                  'Syllabus Creation Failed',
                  'Unable to create syllabus automatically due to permissions. The file was uploaded successfully. You can:\n\n• Create a section manually below\n• Upload files from the Documents section first\n• Contact support to update database permissions',
                  [{ text: 'OK' }]
                );
                setShowUploadError(true);
                setUploadingFile(false);
                return; // Exit early, allow user to create section manually
              }
            } else {
              throw new Error(`Failed to create syllabus: ${syllabusError.message}`);
            }
          } else {
            targetSyllabusId = newSyllabus.id;
            console.log('[EventSyllabusTab] Created new syllabus:', targetSyllabusId);
            onRelink?.();
          }
        }

        // Create section and attach to event (only if we're not showing subject selector)
        if (!shouldSkipSectionCreation && targetSyllabusId) {
          console.log('[EventSyllabusTab] Proceeding to create section with syllabus_id:', targetSyllabusId);
          await createSectionForUpload(targetSyllabusId, uploadRecord.id, file.name);
        } else if (shouldSkipSectionCreation) {
          console.log('[EventSyllabusTab] Skipping section creation - subject selector is showing');
        } else {
          console.log('[EventSyllabusTab] No targetSyllabusId, skipping section creation');
        }
      } catch (err) {
        console.error('[EventSyllabusTab] Upload error:', err);
        const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
        console.error('[EventSyllabusTab] Full error:', err);
        Alert.alert('Upload Error', `Failed to upload PDF: ${errorMessage}`);
        setShowUploadError(true);
      } finally {
        setUploadingFile(false);
      }
  };

  // Retry syllabus creation after subject selection
  const retrySyllabusCreation = async (selectedSubjectId) => {
    // If we’re retrying an attach-from-search flow:
    if (pendingAttachUploadId) {
      setUploadingFile(true);
      try {
        const uploadId = pendingAttachUploadId;
        const { data: upload, error: uploadError } = await supabase
          .from('materials')
          .select(`
            *,
            material_children(child_id, status)
          `)
          .eq('id', uploadId)
          .is('deleted_at', null)
          .single();
        if (uploadError) throw uploadError;

        // Get child_id from material_children if available
        let materialChildId = null;
        if (upload.material_children && upload.material_children.length > 0) {
          materialChildId = upload.material_children[0].child_id;
        }
        
        const syllabusTitle = upload.title || upload.filename || 'Syllabus';
        const childIdForSyllabus = event?.child_id || materialChildId || null;

        const { data: newSyllabus, error: syllabusError } = await supabase
          .from('syllabi')
          .insert({
            family_id: familyId,
            child_id: childIdForSyllabus,
            subject_id: selectedSubjectId,
            upload_id: uploadId,
            title: syllabusTitle,
          })
          .select()
          .single();

        let targetSyllabusId = newSyllabus?.id || null;
        if (syllabusError || !targetSyllabusId) {
          // API endpoint requires child_id
          if (childIdForSyllabus) {
            const apiResult = await apiRequest('/api/syllabus/upload', {
              method: 'POST',
              body: JSON.stringify({
                upload_id: uploadId,
                family_id: familyId,
                child_id: childIdForSyllabus,
                subject_id: selectedSubjectId,
                title: syllabusTitle,
              }),
            });
            if (apiResult?.syllabus?.id) {
              targetSyllabusId = apiResult.syllabus.id;
            }
          }
        }

        if (!targetSyllabusId) {
          throw new Error(`Failed to create syllabus: ${syllabusError?.message || 'Unknown error'}`);
        }

        // Now finish the attach operation using the newly created syllabus
        const filename = getUploadDisplayName(upload) || 'Document';
        const sectionTitle = filename.replace(/\.[^/.]+$/, '');

        const { data: existingSections } = await supabase
          .from('syllabus_sections')
          .select('id, created_at')
          .eq('syllabus_id', targetSyllabusId)
          .eq('heading', sectionTitle)
          .order('created_at', { ascending: false })
          .limit(1);

        let sectionId = existingSections?.[0]?.id;
        if (!sectionId) {
          const derivedRole = normalizeUpload(upload).role;
          const roleForAttach = syllabusType === 'all' ? derivedRole : syllabusType;
          if (!roleForAttach || roleForAttach === 'all') {
            Alert.alert(
              'Choose a document role',
              'Select Syllabus, Lesson plan, Assignment, Resource, or Assessment to attach this document.'
            );
            return;
          }
          const sectionType = roleToSectionType(roleForAttach);
          const { data: newSection, error: sectionError } = await supabase
            .from('syllabus_sections')
            .insert({
              syllabus_id: targetSyllabusId,
              position: 1,
              section_type: sectionType,
              heading: sectionTitle,
              notes: withDocKindTag(upload.storage_path || '', roleForAttach),
            })
            .select()
            .single();
          if (sectionError) throw sectionError;
          sectionId = newSection.id;
        }

        await handleAttach(sectionId);
        setShowSearch(false);
        setSearchQuery('');
        setSearchResults([]);
      } catch (err) {
        console.error('[EventSyllabusTab] Retry attach error:', err);
        Alert.alert('Error', `Failed to attach file: ${err.message || 'Unknown error'}`);
      } finally {
        setUploadingFile(false);
        setPendingAttachUploadId(null);
        setShowSubjectSelector(false);
      }
      return;
    }

    if (!pendingUploadData || !pendingUploadRecord) return;
    
    setUploadingFile(true);
    try {
      // Get the original file name from the upload path
      const rawFileName = pendingUploadData.path.split('/').pop() || 'syllabus.pdf';
      const fileName = rawFileName.replace(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i,
        ''
      );
      const syllabusTitle = event?.title 
        ? `${event.title} - Syllabus`
        : `Syllabus - ${fileName.replace(/\.[^/.]+$/, '')}`;
      
      // Try to create syllabus with selected subject
      const { data: newSyllabus, error: syllabusError } = await supabase
        .from('syllabi')
        .insert({
          family_id: familyId,
          child_id: event?.child_id || null,
          subject_id: selectedSubjectId,
          upload_id: pendingUploadRecord.id,
          title: syllabusTitle,
        })
        .select()
        .single();

      let targetSyllabusId = null;
      
      if (syllabusError) {
        // If still fails, try API endpoint
        if (event?.child_id) {
          try {
            const apiResult = await apiRequest('/api/syllabus/upload', {
              method: 'POST',
              body: JSON.stringify({
                upload_id: pendingUploadRecord.id,
                family_id: familyId,
                child_id: event.child_id,
                subject_id: selectedSubjectId,
                title: syllabusTitle,
              }),
            });
            
            if (apiResult.error) throw apiResult.error;
            if (apiResult.syllabus?.id) {
              targetSyllabusId = apiResult.syllabus.id;
            } else {
              throw new Error('API returned no syllabus ID');
            }
          } catch (apiErr) {
            console.error('[EventSyllabusTab] API endpoint also failed:', apiErr);
            throw new Error(`Failed to create syllabus: ${syllabusError.message}`);
          }
        } else {
          throw new Error(`Failed to create syllabus: ${syllabusError.message}`);
        }
      } else {
        targetSyllabusId = newSyllabus.id;
      }
      
      if (targetSyllabusId) {
        // Create section and attach to event
        await createSectionForUpload(targetSyllabusId, pendingUploadRecord.id, fileName);
      }
    } catch (err) {
      console.error('[EventSyllabusTab] Retry syllabus creation error:', err);
      Alert.alert('Error', `Failed to create syllabus: ${err.message || 'Unknown error'}`);
      setShowUploadError(true);
    } finally {
      setUploadingFile(false);
      setPendingUploadData(null);
      setPendingUploadRecord(null);
      setPendingAttachUploadId(null);
      setShowSubjectSelector(false);
    }
  };

  // Helper to create section after syllabus is created
  const createSectionForUpload = async (syllabusId, uploadRecordId, fileName) => {
    const cleanFileName = (fileName || '').replace(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_/i,
      ''
    );
    // Create a new section linked to this upload
    const sectionType = roleToSectionType(syllabusType);
    const sectionTitle = (cleanFileName || 'Document').replace(/\.[^/.]+$/, '');
    const baseNotes = uploadRecordId
      ? `Uploaded PDF: ${cleanFileName || fileName} (Upload ID: ${uploadRecordId})`
      : `Uploaded PDF: ${cleanFileName || fileName}`;
    const sectionNotes = withDocKindTag(baseNotes, syllabusType);
    
    console.log('[EventSyllabusTab] Creating section with:', {
      syllabus_id: syllabusId,
      section_type: sectionType,
      heading: sectionTitle,
    });

    const { data: newSection, error: sectionError } = await supabase
      .from('syllabus_sections')
      .insert({
        syllabus_id: syllabusId,
        position: 1,
        section_type: sectionType,
        heading: sectionTitle,
        notes: sectionNotes,
      })
      .select()
      .single();

    if (sectionError) {
      console.error('[EventSyllabusTab] Error creating section:', sectionError);
      throw new Error(`Failed to create section: ${sectionError.message}`);
    }

    console.log('[EventSyllabusTab] Section created:', newSection.id);

    // Auto-attach to event
    console.log('[EventSyllabusTab] Attaching section to event:', event.id);
    await handleAttach(newSection.id);
    
    // Reload attached sections to show the new one
    await loadAttachedSections();
    
    // Reload sections if we have a syllabus
    if (syllabusId && syllabus?.id === syllabusId) {
      await loadSections();
    } else if (!syllabus?.id) {
      // We created a new syllabus, trigger parent reload
      onRelink?.();
    }
    
    setShowCreate(false);
    setShowUploadError(false);
    Alert.alert('Success', 'PDF uploaded and attached to event successfully!');
  };

  const handleCreateSection = async () => {
    if (!newSectionTitle.trim()) {
      Alert.alert('Validation', 'Please enter a section title.');
      return;
    }
    if (syllabusType === 'all') {
      Alert.alert('Choose a document role', 'Select Syllabus, Lesson plan, Assignment, Resource, or Assessment before creating.');
      return;
    }

    // Determine which syllabus to use
    let targetSyllabusId = syllabus?.id;
    
    // If no syllabus exists, create one automatically
    if (!targetSyllabusId) {
      const syllabusTitle = event?.title 
        ? `${event.title} - Syllabus`
        : `Syllabus - ${newSectionTitle.trim()}`;
      
      const { data: newSyllabus, error: syllabusError } = await supabase
        .from('syllabi')
        .insert({
          family_id: familyId,
          child_id: event?.child_id || null,
          subject_id: event?.subject_id || null,
          title: syllabusTitle,
        })
        .select()
        .single();

      if (syllabusError) {
        Alert.alert('Error', `Failed to create syllabus: ${syllabusError.message}`);
        setCreating(false);
        return;
      }

      targetSyllabusId = newSyllabus.id;
      onRelink?.();
    }

    setCreating(true);
    try {
      const sectionType = roleToSectionType(syllabusType);
      const notes = withDocKindTag((newSectionDescription.trim() || sectionUrl.trim()) || null, syllabusType);
      
      const { data: newSection, error: sectionError } = await supabase
        .from('syllabus_sections')
        .insert({
          syllabus_id: targetSyllabusId,
          position: (sections.length || 0) + 1,
          section_type: sectionType,
          heading: newSectionTitle.trim(),
          notes: notes,
        })
        .select()
        .single();

      if (sectionError) {
        throw new Error(sectionError.message);
      }

      // Auto-attach to event
      await handleAttach(newSection.id);
      
      // Reload attached sections
      await loadAttachedSections();
      
      // Reload sections if we have a syllabus
      if (targetSyllabusId && syllabus?.id === targetSyllabusId) {
        await loadSections();
      }
      
      // Reset form
      setNewSectionTitle('');
      setNewSectionDescription('');
      setSectionUrl('');
      setShowCreate(false);
      setShowUploadError(false);
      
      Alert.alert('Success', 'Section created and attached to event successfully!');
    } catch (err) {
      Alert.alert('Error', `Failed to create section: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const filteredSections = sections.filter((section) => {
    const norm = normalizeSyllabusSection(section);
    if (!matchesRole(syllabusType, norm)) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (norm.title || '').toLowerCase().includes(q) ||
      (section.notes || '').toLowerCase().includes(q)
    );
  });

  return (
    <View style={styles.container}>
      {/* Subject Selector Modal */}
      {showSubjectSelector && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select a Subject</Text>
            <Text style={styles.modalDescription}>
              This event needs a subject to create the syllabus. Please select one:
        </Text>
            
            <ScrollView style={styles.subjectList}>
              {subjects.map((subject) => (
        <TouchableOpacity
                  key={subject.id}
                  style={styles.subjectOption}
                  onPress={() => retrySyllabusCreation(subject.id)}
                  disabled={uploadingFile}
                >
                  <Text style={styles.subjectOptionText}>{subject.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
          onPress={() => {
                  setShowSubjectSelector(false);
                  setPendingUploadData(null);
                  setPendingUploadRecord(null);
                  setPendingAttachUploadId(null);
                  setUploadingFile(false);
                }}
                disabled={uploadingFile}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
            
            {uploadingFile && (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="small" color={colors.accent || colors.indigo} />
                <Text style={styles.modalLoadingText}>Creating syllabus...</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Duplicate File Alert Modal */}
      {showDuplicateAlert && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>File Already Exists</Text>
            <Text style={styles.modalDescription}>
              A file named "{duplicateFileName}" already exists in your library.{'\n\n'}
              Please either:{'\n'}
              • Search for the existing file to attach it, or{'\n'}
              • Rename your file and try uploading again
            </Text>
            
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowDuplicateAlert(false);
                  setDuplicateFileName('');
                  setPendingFile(null);
                }}
              >
                <Text style={styles.modalCancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => {
                  setShowDuplicateAlert(false);
                  setShowSearch(true);
                  setSearchQuery(duplicateFileName);
                  setDuplicateFileName('');
                  setPendingFile(null);
                }}
              >
                <Text style={styles.modalButtonText}>Search Existing</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Inline Attachment Surface - always visible */}
        <View style={styles.inlineAttacher}>
          {/* Role Selector Chips (single shared row) */}
          <View style={styles.typePillsRow}>
            {DOCUMENT_ROLE_CHIPS.map((chip) => (
              <TouchableOpacity
                key={chip.value}
                style={[styles.typePill, syllabusType === chip.value && styles.typePillActive]}
                onPress={() => setSyllabusType(chip.value)}
              >
                <Text style={[styles.typePillText, syllabusType === chip.value && styles.typePillTextActive]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.roleHelperText}>
            {syllabusType === 'all'
              ? 'Showing: All documents'
              : `Filtering search: ${
                  DOCUMENT_ROLE_CHIPS.find((c) => c.value === syllabusType)?.label || 'Documents'
                }`}
          </Text>

          {/* Search Interface - Always Visible */}
          <View style={styles.searchInterface}>
            <View style={styles.searchInputContainer}>
              <Search size={16} color={colors.muted || 'rgba(15, 23, 42, 0.5)'} />
            <TextInput
                style={styles.searchInput}
              placeholder="Search existing documents…"
                placeholderTextColor={colors.muted || 'rgba(15, 23, 42, 0.5)'}
                value={searchQuery}
                onChangeText={(text) => {
                  setSearchQuery(text);
                  if (text.length > 0) {
                    setShowSearch(true);
                  }
                }}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => {
                    setSearchQuery('');
                    setShowSearch(false);
                    setSearchResults([]);
                  }}
                >
                  <X size={16} color={colors.muted || 'rgba(15, 23, 42, 0.5)'} />
                </TouchableOpacity>
              )}
            </View>

            {showSearch && searchQuery.length > 0 && (
              <>
                {searching ? (
                  <View style={styles.searchLoadingContainer}>
                    <ActivityIndicator size="small" color={colors.accent || colors.indigo} />
                    <Text style={styles.searchLoadingText}>Searching...</Text>
                  </View>
                ) : searchResults.length > 0 ? (
                  <ScrollView style={styles.searchResults} nestedScrollEnabled>
                    <Text style={styles.searchResultsLabel}>Uploaded Files</Text>
                    {searchResults.map((file) => {
                      const nu = normalizeUpload(file);
                      const filename = getUploadDisplayName(file) || nu.title || 'Untitled';
  return (
                        <TouchableOpacity
                          key={file.id}
                          style={styles.searchResultItem}
                          onPress={() => handleAttachUploadedFile(file.id)}
                          disabled={loading}
                        >
                          <View style={styles.searchResultContent}>
                            <View style={styles.searchResultHeader}>
                              <FileText size={16} color={colors.accent || colors.indigo} />
                              <Text style={styles.searchResultTitle} numberOfLines={1}>
                                {filename}
              </Text>
          </View>
                            <Text style={styles.searchResultMeta}>{nu.subtitle}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                ) : filteredSections.length > 0 ? (
                  <ScrollView style={styles.searchResults} nestedScrollEnabled>
                    <Text style={styles.searchResultsLabel}>Syllabus Sections</Text>
                    {filteredSections.map((section) => (
          <TouchableOpacity
                        key={section.id}
                        style={styles.searchResultItem}
                        onPress={() => handleAttach(section.id)}
                        disabled={loading}
                      >
                        <View style={styles.searchResultContent}>
                          <Text style={styles.searchResultTitle}>{section.heading || 'Untitled Section'}</Text>
                          {section.notes && (
                            <Text style={styles.searchResultDescription} numberOfLines={2}>
                              {section.notes}
                            </Text>
                          )}
                          <View style={styles.searchResultMeta}>
                            <View style={[styles.typeBadge, { backgroundColor: 'rgba(148, 163, 184, 0.12)' }]}>
                              <Text style={styles.typeBadgeText}>{roleLabel(normalizeSyllabusSection(section).role)}</Text>
                            </View>
                            {section.estimated_minutes && (
                              <Text style={styles.searchResultMinutes}>{section.estimated_minutes} min</Text>
                            )}
                          </View>
                        </View>
          </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={styles.emptySearchText}>No files or sections found</Text>
                )}
              </>
            )}
        </View>

          {/* Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Create Interface - Always Visible */}
          <View style={styles.createInterface}>
            <View style={styles.createOptions}>
              <TouchableOpacity
                style={[styles.createOptionButton, (uploadingFile || !familyId) && styles.createOptionButtonDisabled]}
                onPress={() => {
                  console.log('[EventSyllabusTab] Upload PDF button pressed');
                  if (!familyId) {
                    Alert.alert('Error', 'Family ID is missing. Please refresh the page.');
                    return;
                  }
                  handleUploadPDF();
                }}
                disabled={uploadingFile || !familyId}
              >
                {uploadingFile ? (
                  <ActivityIndicator size="small" color={colors.accent || colors.indigo} />
                ) : (
                  <Upload size={18} color={colors.accent || colors.indigo} />
                )}
                <View style={styles.createOptionContent}>
                  <Text style={styles.createOptionTitle}>{uploadingFile ? 'Uploading...' : 'Upload PDF'}</Text>
                  <Text style={styles.createOptionDescription}>
                    {uploadingFile
                      ? 'Please wait while we upload your file...'
                      : 'Upload a syllabus PDF to create sections automatically'}
                </Text>
            </View>
              </TouchableOpacity>

              {showUploadError && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorBannerText}>
                    Upload blocked by permissions. You can create a section with a URL or link to an existing upload below.
                  </Text>
          </View>
        )}

              <View style={styles.manualCreateForm}>
                <TextInput
                  style={styles.createInput}
                  placeholder="Section title"
                  placeholderTextColor={colors.muted || 'rgba(15, 23, 42, 0.5)'}
                  value={newSectionTitle}
                  onChangeText={setNewSectionTitle}
                />
                <TextInput
                  style={[styles.createInput, styles.createTextArea]}
                  placeholder="Description or URL (optional)"
                  placeholderTextColor={colors.muted || 'rgba(15, 23, 42, 0.5)'}
                  value={newSectionDescription || sectionUrl}
                  onChangeText={(text) => {
                    setNewSectionDescription(text);
                    setSectionUrl(text);
                  }}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
                <Text style={styles.urlHint}>
                  You can paste a URL to a PDF or document here, or describe the section.
                </Text>
                <View style={styles.createActions}>
              <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setNewSectionTitle('');
                      setNewSectionDescription('');
                      setSectionUrl('');
                      setShowUploadError(false);
                    }}
                    disabled={creating}
                  >
                    <Text style={styles.cancelButtonText}>Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.createButton, (!newSectionTitle.trim() || creating) && styles.createButtonDisabled]}
                    onPress={handleCreateSection}
                    disabled={!newSectionTitle.trim() || creating}
                    {...(Platform.OS === 'web' ? { className: 'btnPrimary' } : {})}
                  >
                    {creating ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={styles.createButtonText}>Create</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>

          {/* Helper Text */}
          <Text style={styles.helperText}>Linking syllabus content helps track progress and coverage.</Text>
        </View>

        {/* Attached documents - always show all attachments */}
        {attachedSections.length > 0 && (
          <View style={styles.attachedSection}>
            <Text style={styles.attachedSectionTitle}>Attached documents</Text>
            {attachedSections.map((section) => {
              const ns = normalizeSyllabusSection(section);
              return (
              <View key={section.id} style={styles.attachedCard}>
                <View style={styles.attachedCardContent}>
                  <View style={styles.attachedCardHeader}>
                    <Text style={styles.attachedCardTitle}>
                      {stripStoragePrefix(section.heading) || 'Untitled Section'}
                    </Text>
                    <View style={[styles.typeBadge, { backgroundColor: 'rgba(148, 163, 184, 0.12)' }]}>
                      <Text style={styles.typeBadgeText}>{roleLabel(ns.role)}</Text>
                    </View>
                  </View>
                  <Text style={styles.attachedCardRoleMeta}>{ns.subtitle}</Text>
                  {section.notes && (
                    <Text style={styles.attachedCardDescription} numberOfLines={2}>
                      {stripStoragePrefix(section.notes)}
                    </Text>
                  )}
                  {section.estimated_minutes && (
                    <Text style={styles.attachedCardMinutes}>{section.estimated_minutes} minutes</Text>
                  )}
                  {section.syllabi && (
                    <Text style={styles.attachedCardSyllabus}>
                      From: {section.syllabi.title || 'Syllabus'}
                    </Text>
                  )}
                </View>
                <View style={styles.attachedCardActions}>
                  {section.syllabi && onOpenSyllabus && (
                    <TouchableOpacity style={styles.attachedCardAction} onPress={() => onOpenSyllabus()}>
                      <Text style={styles.attachedCardActionText}>View</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.attachedCardAction}
                    onPress={() => handleUnlink(section.id)}
                    disabled={loading}
                  >
                    <X size={14} color={colors.muted || 'rgba(15, 23, 42, 0.5)'} />
                    <Text style={[styles.attachedCardActionText, styles.unlinkText]}>Unlink</Text>
              </TouchableOpacity>
          </View>
        </View>
              );
            })}
      </View>
        )}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 0,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 28,
  },
  inlineAttacher: {
    marginBottom: 24,
  },
  typePillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  roleHelperText: {
    fontSize: 12,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
    fontWeight: '500',
    marginTop: -8,
    marginBottom: 16,
  },
  typePill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border || 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#ffffff',
  },
  typePillActive: {
    borderColor: colors.accent || '#7c8cff',
    backgroundColor: colors.accentLight || 'rgba(124, 140, 255, 0.12)',
  },
  typePillText: {
    fontSize: 14,
    color: colors.text || '#111827',
  },
  typePillTextActive: {
    color: colors.accent || '#7c8cff',
    fontWeight: '500',
  },
  actionOptions: {
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: 'transparent',
    width: '100%',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text || '#111827',
  },
  actionDivider: {
    fontSize: 12,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.24)',
  },
  dividerText: {
    fontSize: 12,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
    fontWeight: '500',
  },
  searchInterface: {
    gap: 12,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: 'transparent',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text || '#111827',
    padding: 0,
  },
  searchResults: {
    maxHeight: 300,
    minHeight: 60,
    gap: 8,
  },
  searchResultsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  searchResultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchResultItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: 'transparent',
  },
  searchResultContent: {
    gap: 4,
  },
  searchResultTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text || '#111827',
  },
  searchResultDescription: {
    fontSize: 12,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
    marginTop: 2,
  },
  searchResultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(15, 23, 42, 0.7)',
  },
  searchResultMinutes: {
    fontSize: 11,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
  },
  emptySearchText: {
    fontSize: 12,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
    textAlign: 'center',
    padding: 16,
  },
  cancelButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.muted || 'rgba(15, 23, 42, 0.6)',
  },
  createInterface: {
    gap: 16,
  },
  createOptions: {
    gap: 16,
  },
  createOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: 'transparent',
  },
  createOptionButtonDisabled: {
    opacity: 0.5,
  },
  createOptionContent: {
    flex: 1,
    gap: 4,
  },
  createOptionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text || '#111827',
  },
  createOptionDescription: {
    fontSize: 12,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
  },
  createDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(148, 163, 184, 0.24)',
  },
  dividerText: {
    fontSize: 12,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
  },
  manualCreateForm: {
    gap: 12,
  },
  createInput: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: 'transparent',
    fontSize: 14,
    color: colors.text || '#111827',
  },
  createTextArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorBanner: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    marginTop: 8,
  },
  errorBannerText: {
    fontSize: 12,
    color: 'rgba(239, 68, 68, 0.9)',
    lineHeight: 16,
  },
  urlHint: {
    fontSize: 11,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
    marginTop: -8,
    marginBottom: 8,
  },
  createActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  createButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: colors.text || '#111827',
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  helperText: {
    fontSize: 11,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
    marginTop: 12,
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  searchLoadingContainer: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
  },
  searchLoadingText: {
    marginTop: 8,
    fontSize: 12,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
  },
  attachedSection: {
    marginTop: 8,
  },
  attachedSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  attachedCard: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: 'transparent',
    marginBottom: 12,
    gap: 12,
  },
  attachedCardContent: {
    flex: 1,
    gap: 6,
  },
  attachedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  attachedCardRoleMeta: {
    fontSize: 12,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
    fontWeight: '500',
    marginBottom: 6,
  },
  attachedCardTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text || '#111827',
    flex: 1,
  },
  attachedCardDescription: {
    fontSize: 12,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
    lineHeight: 16,
  },
  attachedCardMinutes: {
    fontSize: 11,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
    marginTop: 2,
  },
  attachedCardSyllabus: {
    fontSize: 11,
    color: colors.muted || 'rgba(15, 23, 42, 0.5)',
    fontStyle: 'italic',
    marginTop: 4,
  },
  attachedCardActions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  attachedCardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  attachedCardActionText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text || '#111827',
  },
  unlinkText: {
    color: colors.muted || 'rgba(15, 23, 42, 0.6)',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10000,
    ...Platform.select({
      web: {
        position: 'fixed',
      },
      default: {
        position: 'absolute',
      },
    }),
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.15)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text || '#111827',
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    color: colors.muted || 'rgba(15, 23, 42, 0.7)',
    marginBottom: 20,
    lineHeight: 20,
  },
  subjectList: {
    maxHeight: 300,
    marginBottom: 20,
  },
  subjectOption: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  subjectOptionText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text || '#111827',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: colors.text || '#111827',
  },
  modalButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalCancelButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: 'transparent',
    minWidth: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.muted || 'rgba(15, 23, 42, 0.7)',
  },
  modalLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.12)',
  },
  modalLoadingText: {
    fontSize: 14,
    color: colors.muted || 'rgba(15, 23, 42, 0.7)',
  },
});
