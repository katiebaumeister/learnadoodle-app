import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Search, Plus, FileText, Filter } from 'lucide-react';
import { colors } from '../../theme/colors';
import { listLessonTemplates } from '../../lib/services/templatesClientWithOffline';
import { useToast } from '../Toast';
import TemplateCard from './TemplateCard';
import PageHeader from '../ui/PageHeader';
import AppContainer from '../ui/AppContainer';
import EmptyState from '../ui/EmptyState';
import TemplatePreviewDrawer from './TemplatePreviewDrawer';
import ApplyTemplateWizard from './ApplyTemplateWizard';
import SaveTemplateModal from './SaveTemplateModal';
import CreateLessonTemplateModal from './CreateLessonTemplateModal';
import ImportTemplateModal from './ImportTemplateModal';
import GenerateTemplateModal from './GenerateTemplateModal';
import TemplateVersionModal from './TemplateVersionModal';
import MarketplaceModal from './MarketplaceModal';
import ShareTemplateModal from './ShareTemplateModal';
import { supabase } from '../../lib/supabase';

export default function TemplatesPage({ familyId, children = [] }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showApplyWizard, setShowApplyWizard] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showCreateLessonTemplateModal, setShowCreateLessonTemplateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [showMarketplaceModal, setShowMarketplaceModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [versionTemplate, setVersionTemplate] = useState(null);
  const [shareTemplate, setShareTemplate] = useState(null);
  const [showMarketplaceOnly, setShowMarketplaceOnly] = useState(false);
  const [filters, setFilters] = useState({
    subjects: [],
    gradeLevels: [],
    duration: null,
    type: null,
  });
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const toast = useToast();

  useEffect(() => {
    if (familyId) {
      loadTemplates();
      loadSubjects();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familyId, filters, searchQuery]);

  const loadSubjects = async () => {
    if (!familyId) return;
    try {
      const { data, error } = await supabase
        .from('subject')
        .select('id, name')
        .eq('family_id', familyId)
        .order('name');
      
      if (error) throw error;
      setAvailableSubjects(data || []);
    } catch (error) {
    }
  };

  const loadTemplates = async () => {
    if (!familyId) return;
    setLoading(true);
    try {
      // Use lesson templates API with offline support
      const { data, error } = await listLessonTemplates({
        subjectId: filters.subjects.length > 0 ? filters.subjects[0] : null,
        familyId: familyId,
      });

      if (error) throw error;
      
      // Apply client-side filtering for search and other filters
      let filtered = data || [];
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filtered = filtered.filter(t => 
          t.title?.toLowerCase().includes(query) ||
          t.default_objectives?.toLowerCase().includes(query)
        );
      }
      
      setTemplates(filtered);
    } catch (error) {
      toast.push('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = (template) => {
    setSelectedTemplate(template);
    setShowPreview(true);
  };

  const handleApply = (template) => {
    setSelectedTemplate(template);
    setShowPreview(false);
    setShowApplyWizard(true);
  };

  const handleApplySuccess = () => {
    setShowApplyWizard(false);
    setSelectedTemplate(null);
    // Optionally refresh templates to update usage counts
    loadTemplates();
  };

  const filteredTemplates = templates.filter(template => {
    // Filter marketplace templates if toggle is on
    if (showMarketplaceOnly) {
      if (!template.is_marketplace_template && !template.is_public) return false;
    } else {
      // Show only user's templates (not marketplace) when toggle is off
      if (template.is_marketplace_template && !template.is_public) return false;
    }

    // Filter by duration (for lesson templates, use default_duration in minutes)
    if (filters.duration) {
      const durationMinutes = template.default_duration || 0;
      const durationDays = Math.ceil(durationMinutes / (60 * 5)); // Approximate: 5 hours per day
      if (filters.duration === '1-2 weeks' && durationDays > 14) return false;
      if (filters.duration === '3-6 weeks' && (durationDays <= 14 || durationDays > 42)) return false;
      if (filters.duration === '>6 weeks' && durationDays <= 42) return false;
    }
    
    // Filter by subject if specified
    if (filters.subjects.length > 0 && template.subject_id) {
      if (!filters.subjects.includes(template.subject_id)) return false;
    }
    
    return true;
  });

  return (
    <View style={styles.container}>
      {/* Header */}
      <PageHeader
        title="Templates"
        subtitle="Save and reuse learning plans"
        icon={FileText}
        iconColor={colors.accent}
        actions={[
          {
            label: showMarketplaceOnly ? 'My Templates' : 'Marketplace',
            onPress: () => setShowMarketplaceOnly(!showMarketplaceOnly),
            secondary: true,
          },
          ...(!showMarketplaceOnly ? [
            {
              label: 'AI Generate',
              icon: Plus,
              onPress: () => setShowGenerateModal(true),
              secondary: true,
            },
            {
              label: 'Create',
              icon: Plus,
              onPress: () => setShowCreateLessonTemplateModal(true),
              secondary: true,
            },
            {
              label: 'Import',
              icon: Plus,
              onPress: () => setShowImportModal(true),
              secondary: true,
            },
            {
              label: 'From Plan',
              icon: Plus,
              onPress: () => setShowSaveModal(true),
              primary: true,
            },
          ] : [
            {
              label: 'Browse Marketplace',
              icon: Plus,
              onPress: () => setShowMarketplaceModal(true),
              primary: true,
            },
          ]),
        ]}
      />

      {/* Filters */}
      <View style={styles.filtersSection}>
        {/* Search */}
        <View style={styles.searchContainer}>
          <Search size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search templates..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Subject Filter */}
        {availableSubjects.length > 0 && (
          <View style={styles.filterChips}>
            <TouchableOpacity
              style={[styles.filterChip, filters.subjects.length === 0 && styles.filterChipActive]}
              onPress={() => setFilters({ ...filters, subjects: [] })}
              {...(Platform.OS === 'web' ? {
                'data-active': filters.subjects.length === 0 ? 'true' : 'false',
                className: 'chip'
              } : {})}
            >
              <Text style={[styles.filterChipText, filters.subjects.length === 0 && styles.filterChipTextActive]}>
                All Subjects
              </Text>
            </TouchableOpacity>
            {availableSubjects.map(subject => (
              <TouchableOpacity
                key={subject.id}
                style={[styles.filterChip, filters.subjects.includes(subject.id) && styles.filterChipActive]}
                onPress={() => {
                  const newSubjects = filters.subjects.includes(subject.id)
                    ? filters.subjects.filter(id => id !== subject.id)
                    : [...filters.subjects, subject.id];
                  setFilters({ ...filters, subjects: newSubjects });
                }}
                {...(Platform.OS === 'web' ? {
                  'data-active': filters.subjects.includes(subject.id) ? 'true' : 'false',
                  className: 'chip'
                } : {})}
              >
                <Text style={[styles.filterChipText, filters.subjects.includes(subject.id) && styles.filterChipTextActive]}>
                  {subject.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Duration Filter */}
        <View style={styles.filterChips}>
          <TouchableOpacity
            style={[styles.filterChip, filters.duration === null && styles.filterChipActive]}
            onPress={() => setFilters({ ...filters, duration: null })}
            {...(Platform.OS === 'web' ? {
              'data-active': filters.duration === null ? 'true' : 'false',
              className: 'chip'
            } : {})}
          >
            <Text style={[styles.filterChipText, filters.duration === null && styles.filterChipTextActive]}>
              All Durations
            </Text>
          </TouchableOpacity>
          {['1-2 weeks', '3-6 weeks', '>6 weeks'].map(duration => (
            <TouchableOpacity
              key={duration}
              style={[styles.filterChip, filters.duration === duration && styles.filterChipActive]}
              onPress={() => setFilters({ ...filters, duration: filters.duration === duration ? null : duration })}
              {...(Platform.OS === 'web' ? {
                'data-active': filters.duration === duration ? 'true' : 'false',
                className: 'chip'
              } : {})}
            >
              <Text style={[styles.filterChipText, filters.duration === duration && styles.filterChipTextActive]}>
                {duration}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Templates Grid */}
      <AppContainer fullWidth noPadding>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : filteredTemplates.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No templates found"
            description={
              searchQuery || Object.values(filters).some(f => f !== null && (Array.isArray(f) ? f.length > 0 : true))
              ? 'Try adjusting your filters'
                : 'Create your first template from an existing plan'
            }
            action={
              !searchQuery && !Object.values(filters).some(f => f !== null && (Array.isArray(f) ? f.length > 0 : true))
                ? {
                    label: 'Create Template',
                    icon: Plus,
                    onPress: () => setShowSaveModal(true),
                  }
                : undefined
            }
            size="default"
          />
        ) : (
          <ScrollView style={styles.templatesGrid} contentContainerStyle={styles.templatesGridContent}>
          {filteredTemplates.map(template => (
            <TemplateCard
              key={template.id}
              template={template}
              onPreview={handlePreview}
              onApply={handleApply}
              onViewVersions={(t) => {
                setVersionTemplate(t);
                setShowVersionModal(true);
              }}
              onShare={(t) => {
                setShareTemplate(t);
                setShowShareModal(true);
              }}
            />
          ))}
        </ScrollView>
      )}
      </AppContainer>

      {/* Modals */}
      <TemplatePreviewDrawer
        template={selectedTemplate}
        isOpen={showPreview}
        onClose={() => {
          setShowPreview(false);
          setSelectedTemplate(null);
        }}
        onApply={handleApply}
      />

      <ApplyTemplateWizard
        template={selectedTemplate}
        isOpen={showApplyWizard}
        onClose={() => {
          setShowApplyWizard(false);
          setSelectedTemplate(null);
        }}
        children={children}
        familyId={familyId}
        onSuccess={handleApplySuccess}
      />

      <SaveTemplateModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        selectedChildren={children.map(c => c.id)}
        dateRange={null} // Will need to be passed from Planner
        familyId={familyId}
        subjects={availableSubjects.map(s => s.id)}
      />

      <CreateLessonTemplateModal
        isOpen={showCreateLessonTemplateModal}
        onClose={() => setShowCreateLessonTemplateModal(false)}
        onSuccess={() => {
          // Optionally refresh templates
          loadTemplates();
        }}
        familyId={familyId}
      />

      <ImportTemplateModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          loadTemplates();
        }}
        familyId={familyId}
      />

      <GenerateTemplateModal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        onSuccess={() => {
          loadTemplates();
        }}
        familyId={familyId}
      />

      <TemplateVersionModal
        isOpen={showVersionModal}
        onClose={() => {
          setShowVersionModal(false);
          setVersionTemplate(null);
        }}
        template={versionTemplate}
        familyId={familyId}
        onVersionCreated={() => {
          loadTemplates();
        }}
      />

      <MarketplaceModal
        isOpen={showMarketplaceModal}
        onClose={() => setShowMarketplaceModal(false)}
        familyId={familyId}
        onTemplateSelected={(template) => {
          setShowMarketplaceModal(false);
          handleApply(template);
        }}
      />

      <ShareTemplateModal
        isOpen={showShareModal}
        onClose={() => {
          setShowShareModal(false);
          setShareTemplate(null);
        }}
        template={shareTemplate}
        familyId={familyId}
        onShared={() => {
          loadTemplates();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  filtersSection: {
    padding: 20, // px-5
    paddingHorizontal: 24, // px-6 (align with AppContainer)
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    backgroundColor: '#ffffff',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#111827',
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  filterChip: {
    // On web, chip class handles styling
    ...(Platform.OS === 'web' ? {
      height: 32,
    } : {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 9999,
      backgroundColor: '#f3f4f6',
      borderWidth: 1,
      borderColor: 'rgba(17,24,39,.08)',
    }),
  },
  filterChipActive: {
    // On web, CSS handles active state
    ...(Platform.OS === 'web' ? {} : {
      backgroundColor: 'rgba(17,24,39,.92)',
      borderColor: 'transparent',
    }),
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
    // On web, CSS handles color
    ...(Platform.OS === 'web' ? {} : {
      color: '#374151',
    }),
  },
  filterChipTextActive: {
    // On web, CSS handles active color
    ...(Platform.OS === 'web' ? {} : {
      color: 'white',
      fontWeight: '500',
    }),
  },
  templatesGrid: {
    flex: 1,
    padding: 20, // p-5
  },
  templatesGridContent: {
    padding: 20, // p-5
    gap: 16, // gap-4
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    minHeight: 400,
  },
});

