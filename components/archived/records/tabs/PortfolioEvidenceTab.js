/**
 * Portfolio & Evidence Tab
 * Evidence grid, filters, upload, notes
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, TextInput, Platform, Modal, Alert } from 'react-native';
import { FileText, Upload, Filter, Tag, X, Plus, GripVertical, Camera, Mic, Link2, Download, Award } from 'lucide-react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { supabase } from '../../../../lib/supabase';
import { colors } from '../../../../theme/colors';
import EvidenceDrawer from '../EvidenceDrawer';
import EvidenceUploadModal from '../EvidenceUploadModal';
import ChildAccordion from '../ChildAccordion';
import { reorderEvidence } from '../../../../lib/services/recordsClient';
import PDFViewer from '../../content/PDFViewer';
import MagicExtract from '../../content/MagicExtract';
import { apiRequest } from '../../../../lib/apiClient';

export default function PortfolioEvidenceTab({
  familyId,
  selectedChildren,
  children = [],
  dateRange,
  resolvedChildIds,
  onUploadEvidence,
  onAddNote,
}) {
  const [loading, setLoading] = useState(true);
  const [evidence, setEvidence] = useState([]);
  const [filters, setFilters] = useState({
    child: null,
    subject: null,
    evidenceType: null,
    tag: null,
    syllabusUnit: null,
  });
  
  const handleFilterChange = (filterKey, value) => {
    setFilters(prev => ({
      ...prev,
      [filterKey]: prev[filterKey] === value ? null : value,
    }));
  };
  const [selectedEvidenceId, setSelectedEvidenceId] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [isReordering, setIsReordering] = useState(false);
  const reorderDebounceTimeoutRef = useRef(null);
  const pendingReorderRef = useRef(null);
  
  // Portfolio enhancements
  const [showLinkStandardsModal, setShowLinkStandardsModal] = useState(false);
  const [selectedItemForStandards, setSelectedItemForStandards] = useState(null);
  const [standards, setStandards] = useState([]);
  const [selectedStandards, setSelectedStandards] = useState([]);
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    loadSubjects();
    loadStandards();
  }, [familyId]);

  useEffect(() => {
    loadEvidence();
  }, [familyId, resolvedChildIds, dateRange, filters]);

  const loadStandards = async () => {
    try {
      const { data } = await supabase
        .from('standards')
        .select('id, standard_code, standard_text')
        .limit(200);
      setStandards(data || []);
    } catch (error) {
    }
  };

  const loadSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from('subject')
        .select('id, name')
        .eq('family_id', familyId)
        .order('name');
      
      if (!error && data) {
        setSubjects(data);
      }
    } catch (error) {
    }
  };

  const loadEvidence = async () => {
    setLoading(true);
    try {
      const { getEvidence } = await import('../../../lib/services/recordsClient');
      
      // Apply filters
      const filterParams = {
        subject: filters.subject,
        evidenceType: filters.evidenceType,
      };
      
      // Filter child IDs if child filter is set
      const filteredChildIds = filters.child
        ? [filters.child]
        : resolvedChildIds;
      
      const evidenceData = await getEvidence(familyId, filteredChildIds, filterParams, dateRange);
      
      // Fetch linked standards for each evidence item
      const evidenceIds = evidenceData.map(e => e.id);
      let links = [];
      if (evidenceIds.length > 0) {
        try {
          const { data, error } = await supabase
        .from('portfolio_evidence_links')
        .select('upload_id, link_type, linked_id')
        .in('upload_id', evidenceIds)
        .eq('link_type', 'standard');
          
          if (error) {
            // Handle permission errors gracefully
            if (error.code === '42501' || error.code === 'PGRST301' || error.code === '403') {
            } else {
            }
          } else {
            links = data || [];
          }
        } catch (err) {
        }
      }

      const linksByEvidence = {};
      (links || []).forEach(link => {
        if (!linksByEvidence[link.upload_id]) {
          linksByEvidence[link.upload_id] = [];
        }
        linksByEvidence[link.upload_id].push(link.linked_id);
      });

      // Map to display format
      let mapped = evidenceData.map((item, index) => {
        const subject = subjects.find(s => s.id === item.subject_id);
        return {
          id: item.id,
          title: item.auto_caption || item.caption || item.storage_path?.split('/').pop() || 'Untitled',
          type: getEvidenceType(item.mime || item.storage_path),
          subject: subject?.name || 'Unassigned',
          date: item.created_at ? new Date(item.created_at).toISOString().split('T')[0] : null,
          storage_path: item.storage_path,
          mime: item.mime,
          bytes: item.bytes,
          child_id: item.child_id,
          display_order: item.display_order !== undefined ? item.display_order : index,
          is_voice_note: item.is_voice_note || false,
          voice_duration: item.voice_duration_seconds,
          auto_tags: item.auto_tags || [],
          linked_standards: linksByEvidence[item.id] || [],
        };
      });
      
      // Sort by display_order if available
      mapped.sort((a, b) => (a.display_order || 0) - (b.display_order || 0));
      
      // Apply type filter if set
      if (filters.evidenceType) {
        mapped = mapped.filter(item => item.type === filters.evidenceType);
      }
      
      setEvidence(mapped);
    } catch (error) {
      setEvidence([]);
    } finally {
      setLoading(false);
    }
  };

  // Group evidence by child for accordion display
  const evidenceByChild = useMemo(() => {
    if (resolvedChildIds.length <= 1 || filters.child) {
      return null; // Don't group if single child or child filter is active
    }
    
    const grouped = {};
    evidence.forEach(item => {
      if (!grouped[item.child_id]) {
        grouped[item.child_id] = [];
      }
      grouped[item.child_id].push(item);
    });
    
    return grouped;
  }, [evidence, resolvedChildIds, filters.child]);

  const getEvidenceType = (mimeOrPath) => {
    if (!mimeOrPath) return 'file';
    if (mimeOrPath.startsWith('image/')) return 'photo';
    if (mimeOrPath === 'application/pdf') return 'pdf';
    if (mimeOrPath.includes('video')) return 'video';
    if (mimeOrPath.includes('audio')) return 'audio';
    return 'file';
  };

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    
    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;
    
    if (sourceIndex === destIndex) return;
    
    // Create new ordered array
    const reordered = Array.from(evidence);
    const [removed] = reordered.splice(sourceIndex, 1);
    reordered.splice(destIndex, 0, removed);
    
    // Update display_order for all items
    const evidenceOrder = reordered.map((item, index) => ({
      id: item.id,
      display_order: index,
    }));
    
    // Optimistically update UI immediately
    setEvidence(reordered);
    
    // Clear any pending debounce
    if (reorderDebounceTimeoutRef.current) {
      clearTimeout(reorderDebounceTimeoutRef.current);
    }
    
    // Store the pending reorder
    pendingReorderRef.current = evidenceOrder;
    
    // Debounce the API call (wait 500ms after last drag)
    reorderDebounceTimeoutRef.current = setTimeout(async () => {
      if (!pendingReorderRef.current) return;
      
      setIsReordering(true);
      const orderToSave = pendingReorderRef.current;
      pendingReorderRef.current = null;
      
      try {
        const { error } = await reorderEvidence(orderToSave);
        if (error) {
          // Revert on error
          loadEvidence();
          if (Platform.OS === 'web') {
            alert('Failed to reorder evidence. Please try again.');
          }
        }
      } catch (err) {
        // Revert on error
        loadEvidence();
        if (Platform.OS === 'web') {
          alert('Failed to reorder evidence. Please try again.');
        }
      } finally {
        setIsReordering(false);
      }
    }, 500);
  };
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (reorderDebounceTimeoutRef.current) {
        clearTimeout(reorderDebounceTimeoutRef.current);
      }
    };
  }, []);

  // Render evidence grid (reusable function)
  const renderEvidenceGrid = (itemsToRender) => {
    if (Platform.OS === 'web') {
      return (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="evidence-grid" direction="horizontal">
            {(provided, snapshot) => (
              <View
                {...provided.droppableProps}
                ref={provided.innerRef}
                style={[styles.grid, snapshot.isDraggingOver && styles.gridDragging]}
              >
                {itemsToRender.map((item, index) => (
                  <Draggable key={item.id} draggableId={item.id} index={index}>
                    {(provided, snapshot) => (
                      <View
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        style={[
                          styles.artifactCard,
                          snapshot.isDragging && styles.artifactCardDragging,
                          provided.draggableProps.style,
                        ]}
                      >
                        <TouchableOpacity
                          style={styles.artifactContent}
                          onPress={() => {
                            setSelectedEvidenceId(item.id);
                            setIsDrawerOpen(true);
                          }}
                        >
                          <View style={styles.artifactThumbnail}>
                            {item.is_voice_note ? (
                              <>
                                <Mic size={32} color={colors.textSecondary} />
                                {item.voice_duration && (
                                  <Text style={styles.voiceDuration}>
                                    {Math.floor(item.voice_duration / 60)}:{(item.voice_duration % 60).toString().padStart(2, '0')}
                                  </Text>
                                )}
                              </>
                            ) : (
                              <FileText size={32} color={colors.textSecondary} />
                            )}
                          </View>
                          <Text style={styles.artifactTitle} numberOfLines={2}>{item.title}</Text>
                          <Text style={styles.artifactMeta}>{item.subject} • {item.type}</Text>
                          {item.linked_standards.length > 0 && (
                            <View style={styles.standardsBadge}>
                              <Award size={10} color={colors.textSecondary} />
                              <Text style={styles.standardsText}>
                                {item.linked_standards.length} standard{item.linked_standards.length !== 1 ? 's' : ''}
                              </Text>
                            </View>
                          )}
                          {item.auto_tags.length > 0 && (
                            <View style={styles.tagsRow}>
                              {item.auto_tags.slice(0, 2).map((tag, idx) => (
                                <View key={idx} style={styles.tagChip}>
                                  <Text style={styles.tagChipText}>{tag}</Text>
                                </View>
                              ))}
                            </View>
                          )}
                          <Text style={styles.artifactDate}>{item.date}</Text>
                          {item.mime === 'application/pdf' && (
                            <View style={styles.pdfActions}>
                              <PDFViewer uploadId={item.id} familyId={familyId} />
                              <MagicExtract
                                uploadId={item.id}
                                onExtracted={(extractedItem, type) => {
                                  Alert.alert('Extracted', `${type} extracted. Create event from extracted item?`);
                                }}
                              />
                            </View>
                          )}
                        </TouchableOpacity>
                        <View {...provided.dragHandleProps} style={styles.dragHandle}>
                          <GripVertical size={16} color={colors.textSecondary} />
                        </View>
                      </View>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </View>
            )}
          </Droppable>
        </DragDropContext>
      );
    } else {
      return (
        <View style={styles.grid}>
          {itemsToRender.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.artifactCard}
              onPress={() => {
                setSelectedEvidenceId(item.id);
                setIsDrawerOpen(true);
              }}
            >
              <View style={styles.artifactThumbnail}>
                {item.is_voice_note ? (
                  <>
                    <Mic size={32} color={colors.textSecondary} />
                    {item.voice_duration && (
                      <Text style={styles.voiceDuration}>
                        {Math.floor(item.voice_duration / 60)}:{(item.voice_duration % 60).toString().padStart(2, '0')}
                      </Text>
                    )}
                  </>
                ) : (
                  <FileText size={32} color={colors.textSecondary} />
                )}
              </View>
              <Text style={styles.artifactTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.artifactMeta}>{item.subject} • {item.type}</Text>
              {item.linked_standards.length > 0 && (
                <View style={styles.standardsBadge}>
                  <Award size={10} color={colors.textSecondary} />
                  <Text style={styles.standardsText}>
                    {item.linked_standards.length} standard{item.linked_standards.length !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
              {item.auto_tags.length > 0 && (
                <View style={styles.tagsRow}>
                  {item.auto_tags.slice(0, 2).map((tag, idx) => (
                    <View key={idx} style={styles.tagChip}>
                      <Text style={styles.tagChipText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
              <Text style={styles.artifactDate}>{item.date}</Text>
              {item.mime === 'application/pdf' && (
                <View style={styles.pdfActions}>
                  <PDFViewer uploadId={item.id} familyId={familyId} />
                  <MagicExtract
                    uploadId={item.id}
                    onExtracted={(extractedItem, type) => {
                      Alert.alert('Extracted', `${type} extracted. Create event from extracted item?`);
                    }}
                  />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      );
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.indigo} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Tab Header */}
      <View style={styles.tabHeader}>
        <View style={[styles.accentDot, { backgroundColor: '#14b8a6' }]} />
        <Camera size={20} color="#14b8a6" />
        <Text style={styles.tabTitle}>Portfolio & Evidence</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              // Voice recording - placeholder for now
              Alert.alert('Voice Recording', 'Voice recording requires audio library integration');
            }}
          >
            <Mic size={18} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => {
              // Export portfolio
              Alert.alert(
                'Export Portfolio',
                'This will create a PDF export of the portfolio. Continue?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Export',
                    onPress: async () => {
                      try {
                        const childIds = resolvedChildIds.length > 0 ? resolvedChildIds : null;
                        const { data, error } = await supabase
                          .from('portfolio_exports')
                          .insert({
                            child_id: childIds?.[0] || null,
                            family_id: familyId,
                            export_type: 'pdf',
                            status: 'pending',
                            filters: { childIds, dateRange, filters },
                          })
                          .select()
                          .single();

                        if (error) throw error;
                        Alert.alert('Export Started', 'Your portfolio export is being prepared.');
                      } catch (error) {
                        Alert.alert('Error', 'Failed to start export');
                      }
                    },
                  },
                ]
              );
            }}
          >
            <Download size={18} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.section}>
        <View style={styles.filtersRow}>
          <Filter size={16} color={colors.textSecondary} />
          <Text style={styles.filtersLabel}>Filters:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChips}>
            {/* Child Filter */}
            {children.map(child => (
              <TouchableOpacity
                key={child.id}
                style={[
                  styles.filterChip,
                  filters.child === child.id && styles.filterChipActive
                ]}
                onPress={() => handleFilterChange('child', child.id)}
              >
                <Text style={[
                  styles.filterChipText,
                  filters.child === child.id && styles.filterChipTextActive
                ]}>
                  {child.first_name || child.name}
                </Text>
              </TouchableOpacity>
            ))}
            
            {/* Subject Filter */}
            {subjects.map(subj => (
              <TouchableOpacity
                key={subj.id}
                style={[
                  styles.filterChip,
                  filters.subject === subj.id && styles.filterChipActive
                ]}
                onPress={() => handleFilterChange('subject', subj.id)}
              >
                <Text style={[
                  styles.filterChipText,
                  filters.subject === subj.id && styles.filterChipTextActive
                ]}>
                  {subj.name}
                </Text>
              </TouchableOpacity>
            ))}
            
            {/* Type Filter */}
            {['photo', 'pdf', 'video', 'project', 'writing'].map(type => (
              <TouchableOpacity
                key={type}
                style={[
                  styles.filterChip,
                  filters.evidenceType === type && styles.filterChipActive
                ]}
                onPress={() => handleFilterChange('evidenceType', type)}
              >
                <Text style={[
                  styles.filterChipText,
                  filters.evidenceType === type && styles.filterChipTextActive
                ]}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Upload Button */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.uploadButton}
          onPress={() => setShowUploadModal(true)}
        >
          <Upload size={16} color={colors.white} />
          <Text style={styles.uploadButtonText}>Upload Artifact</Text>
        </TouchableOpacity>
      </View>
      
      {/* Upload Modal */}
      <EvidenceUploadModal
        visible={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUploaded={() => {
          loadEvidence();
          setShowUploadModal(false);
        }}
        familyId={familyId}
        defaultChildId={resolvedChildIds.length === 1 ? resolvedChildIds[0] : null}
        children={children}
        subjects={subjects}
      />

      {/* Evidence Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Artifacts ({evidence.length})</Text>
        {evidence.length === 0 ? (
          <View style={styles.emptyState}>
            {/* Skeleton Grid */}
            <View style={styles.skeletonGrid}>
              {[1, 2, 3, 4].map(i => (
                <View key={i} style={styles.skeletonCard}>
                  <View style={styles.skeletonThumbnail} />
                  <View style={styles.skeletonLine} />
                  <View style={[styles.skeletonLine, { width: '60%' }]} />
                </View>
              ))}
            </View>
            
            {/* CTA and Why It Matters */}
            <View style={styles.emptyContent}>
              <Text style={styles.emptyTitle}>Upload your first artifact</Text>
              <Text style={styles.emptyDescription}>
                Artifacts help with transcripts, portfolios, and evidence requirements
              </Text>
              <TouchableOpacity
                style={styles.emptyCTA}
                onPress={() => setShowUploadModal(true)}
              >
                <Upload size={16} color={colors.white} />
                <Text style={styles.emptyCTAText}>Upload Artifact</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : evidenceByChild ? (
          // Multiple children - show in accordions
          <View style={styles.childAccordions}>
            {resolvedChildIds.map(childId => {
              const child = children.find(c => c.id === childId);
              if (!child) return null;
              const childEvidence = evidenceByChild[childId] || [];
              
              return (
                <ChildAccordion
                  key={childId}
                  child={child}
                  defaultExpanded={false}
                  hideChildName={true}
                  summary={{
                    portfolioCount: childEvidence.length,
                  }}
                >
                  {renderEvidenceGrid(childEvidence)}
                </ChildAccordion>
              );
            })}
          </View>
        ) : (
          // Single child or filtered - show flat grid
          renderEvidenceGrid(evidence)
        )}
      </View>

      {/* Evidence Drawer */}
      <EvidenceDrawer
        isOpen={isDrawerOpen}
        evidenceId={selectedEvidenceId}
        familyId={familyId}
        children={children}
        subjects={subjects}
        onClose={() => {
          setIsDrawerOpen(false);
          setSelectedEvidenceId(null);
        }}
        onUpdated={() => {
          // Reload evidence list when metadata changes
          loadEvidence();
        }}
        onAddNote={onAddNote ? (evidenceId) => {
          // Use the onAddNote handler from parent, or navigate to Notes tab
          if (onAddNote) {
            onAddNote(evidenceId);
          }
        } : undefined}
      />

      {/* Link Standards Modal */}
      <Modal
        visible={showLinkStandardsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowLinkStandardsModal(false);
          setSelectedItemForStandards(null);
          setSelectedStandards([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Link Standards</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowLinkStandardsModal(false);
                  setSelectedItemForStandards(null);
                  setSelectedStandards([]);
                }}
              >
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalText}>
              Select standards that this portfolio item demonstrates:
            </Text>

            <ScrollView style={styles.standardsList}>
              {standards.map(standard => {
                const isSelected = selectedStandards.includes(standard.id);
                return (
                  <TouchableOpacity
                    key={standard.id}
                    style={[
                      styles.standardOption,
                      isSelected && styles.standardOptionSelected
                    ]}
                    onPress={() => {
                      if (isSelected) {
                        setSelectedStandards(selectedStandards.filter(id => id !== standard.id));
                      } else {
                        setSelectedStandards([...selectedStandards, standard.id]);
                      }
                    }}
                  >
                    <Text style={styles.standardCode}>{standard.standard_code}</Text>
                    <Text style={styles.standardText} numberOfLines={2}>
                      {standard.standard_text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => {
                  setShowLinkStandardsModal(false);
                  setSelectedItemForStandards(null);
                  setSelectedStandards([]);
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton]}
                onPress={async () => {
                  if (!selectedItemForStandards || selectedStandards.length === 0) return;

                  try {
                    // Remove existing links
                    const { error: deleteError } = await supabase
                      .from('portfolio_evidence_links')
                      .delete()
                      .eq('upload_id', selectedItemForStandards.id)
                      .eq('link_type', 'standard');

                    if (deleteError && deleteError.code !== '42501' && deleteError.code !== 'PGRST301') {
                    }

                    // Add new links
                    const links = selectedStandards.map(standardId => ({
                      upload_id: selectedItemForStandards.id,
                      child_id: selectedItemForStandards.child_id,
                      link_type: 'standard',
                      linked_id: standardId,
                    }));

                    const { error: insertError } = await supabase
                      .from('portfolio_evidence_links')
                      .insert(links);

                    if (insertError) {
                      if (insertError.code === '42501' || insertError.code === 'PGRST301' || insertError.code === '403') {
                        Alert.alert('Permission Denied', 'You do not have permission to link standards. This feature may require additional setup.');
                      } else {
                        Alert.alert('Error', 'Failed to link standards: ' + (insertError.message || 'Unknown error'));
                      }
                      return;
                    }

                    await loadEvidence();
                    setShowLinkStandardsModal(false);
                    setSelectedItemForStandards(null);
                    setSelectedStandards([]);
                    Alert.alert('Success', 'Standards linked successfully');
                  } catch (error) {
                    Alert.alert('Error', 'Failed to link standards: ' + (error.message || 'Unknown error'));
                  }
                }}
              >
                <Text style={styles.saveButtonText}>Link Standards</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  section: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  accentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tabTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filtersLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  filterChips: {
    flex: 1,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  filterChipText: {
    fontSize: 12,
    color: colors.text,
  },
  filterChipTextActive: {
    color: colors.white,
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.indigo,
    borderRadius: 8,
  },
  uploadButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  artifactCard: {
    width: '48%',
    backgroundColor: colors.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  artifactCardDragging: {
    opacity: 0.8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  artifactContent: {
    padding: 12,
  },
  dragHandle: {
    position: 'absolute',
    top: 8,
    right: 8,
    padding: 4,
    cursor: 'grab',
  },
  gridDragging: {
    backgroundColor: colors.blueSoft + '20',
  },
  artifactThumbnail: {
    height: 100,
    backgroundColor: colors.background,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  artifactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  artifactMeta: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  artifactDate: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  emptyState: {
    marginTop: 16,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  skeletonCard: {
    width: '48%',
    gap: 8,
  },
  skeletonThumbnail: {
    height: 100,
    backgroundColor: colors.panel,
    borderRadius: 6,
  },
  skeletonLine: {
    height: 12,
    backgroundColor: colors.panel,
    borderRadius: 4,
    width: '80%',
  },
  emptyContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    maxWidth: 400,
  },
  emptyCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#14b8a6',
    borderRadius: 8,
  },
  emptyCTAText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  childAccordions: {
    gap: 12,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  drawerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  drawerContent: {
    flex: 1,
    padding: 16,
  },
  drawerSection: {
    marginBottom: 24,
  },
  drawerSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  drawerText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.panel,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 12,
    color: colors.indigo,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 'auto',
  },
  iconButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.panel,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  standardsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  standardsText: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  tagChip: {
    backgroundColor: colors.panel,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagChipText: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  voiceDuration: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 4,
  },
  pdfActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 600,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  modalText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  standardsList: {
    maxHeight: 400,
    marginBottom: 16,
  },
  standardOption: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: colors.panel,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  standardOptionSelected: {
    backgroundColor: colors.indigo,
    borderColor: colors.indigo,
  },
  standardCode: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  standardText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: colors.panel,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  saveButton: {
    backgroundColor: colors.indigo,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.white,
  },
  linkStandardsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: colors.panel,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  linkStandardsText: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  pdfActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
});

