/**
 * Materials Library Page
 * Main page for viewing and managing family materials
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Plus, Search, Filter, BookOpen, DollarSign, Users, TrendingUp } from 'lucide-react';
import { colors } from '../../theme/colors';
import { getMaterials } from '../../lib/services/materialsClient';
import MaterialCard from './MaterialCard';
import MaterialDetailDrawer from './MaterialDetailDrawer';
import QuickReviewModal from './QuickReviewModal';
import AddMaterialModal from './AddMaterialModal';
import { calculateReusePotential } from '../../lib/utils/materialReuseLogic';

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'textbook', label: 'Textbook' },
  { value: 'workbook', label: 'Workbook' },
  { value: 'kit', label: 'Kit' },
  { value: 'course', label: 'Course' },
  { value: 'subscription', label: 'Subscription' },
  { value: 'video', label: 'Video' },
  { value: 'other', label: 'Other' },
];

export default function MaterialsLibrary({ familyId, children = [] }) {
  // console.log('[MaterialsLibrary] Component rendering, familyId:', familyId);
  const [materials, setMaterials] = useState([]);
  const [allMaterials, setAllMaterials] = useState([]); // Store all materials for stats
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedChildId, setSelectedChildId] = useState('');
  const [showReuseOnly, setShowReuseOnly] = useState(false);

  useEffect(() => {
    if (familyId) {
      loadMaterials();
    } else {
      setLoading(false);
      setError('No family ID provided');
    }
  }, [familyId, selectedType, selectedChildId, searchQuery]);

  const loadMaterials = async () => {
    if (!familyId) {
      setError('No family ID provided');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const filters = {};
      if (selectedType) filters.type = selectedType;
      if (selectedChildId) filters.child_id = selectedChildId;
      if (searchQuery) filters.search = searchQuery;

      const data = await getMaterials(familyId, filters);
      
      // Store all materials for stats (when no filters)
      if (!selectedType && !selectedChildId && !searchQuery) {
        setAllMaterials(data);
      }
      
      // Filter for reuse candidates if needed
      let filtered = data;
      if (showReuseOnly) {
        filtered = data.filter(m => {
          const reuse = calculateReusePotential(m);
          return reuse.score === 'high';
        });
      }
      
      setMaterials(filtered);
    } catch (err) {
      console.error('Error loading materials:', err);
      setError(err.message || 'Failed to load materials');
    } finally {
      setLoading(false);
    }
  };

  const handleMaterialClick = (material) => {
    setSelectedMaterial(material);
    setShowDetailDrawer(true);
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
        .catch(console.error);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Family Library</Text>
          <Text style={styles.subtitle}>
            Track purchased resources and how each child responds to them
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Plus size={20} color="#ffffff" />
          <Text style={styles.addButtonText}>Add Material</Text>
        </TouchableOpacity>
      </View>

      {/* Stats Panel */}
      {allMaterials.length > 0 && (
        <View style={styles.statsPanel}>
          <Text style={styles.statsTitle}>This year's library impact</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <BookOpen size={20} color={colors.accent} />
              <Text style={styles.statValue}>{allMaterials.length}</Text>
              <Text style={styles.statLabel}>Materials in library</Text>
            </View>
            <View style={styles.statCard}>
              <DollarSign size={20} color={colors.accent} />
              <Text style={styles.statValue}>
                ${allMaterials
                  .filter(m => m.purchase_price)
                  .reduce((sum, m) => sum + parseFloat(m.purchase_price || 0), 0)
                  .toFixed(0)}
              </Text>
              <Text style={styles.statLabel}>Total spent</Text>
            </View>
            <View style={styles.statCard}>
              <Users size={20} color={colors.accent} />
              <Text style={styles.statValue}>
                {allMaterials.filter(m => (m.material_children || []).length > 1).length}
              </Text>
              <Text style={styles.statLabel}>Reused by multiple children</Text>
            </View>
            <View style={styles.statCard}>
              <TrendingUp size={20} color="#10b981" />
              <Text style={styles.statValue}>
                {allMaterials.filter(m => {
                  const reuse = calculateReusePotential(m);
                  return reuse.score === 'high';
                }).length}
              </Text>
              <Text style={styles.statLabel}>Good for siblings</Text>
            </View>
          </View>
        </View>
      )}

      {/* Filters */}
      <View style={styles.filters}>
        {/* Search */}
        <View style={styles.searchContainer}>
          <Search size={18} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search materials..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={colors.muted}
          />
        </View>

        {/* Type Filter */}
        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            {TYPE_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.filterChip,
                  selectedType === opt.value && styles.filterChipActive
                ]}
                onPress={() => setSelectedType(opt.value)}
              >
                <Text style={[
                  styles.filterChipText,
                  selectedType === opt.value && styles.filterChipTextActive
                ]}>
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Child Filter */}
        {children.length > 0 && (
          <View style={styles.filterRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  !selectedChildId && styles.filterChipActive
                ]}
                onPress={() => setSelectedChildId('')}
              >
                <Text style={[
                  styles.filterChipText,
                  !selectedChildId && styles.filterChipTextActive
                ]}>
                  All Children
                </Text>
              </TouchableOpacity>
              {children.map(child => (
                <TouchableOpacity
                  key={child.id}
                  style={[
                    styles.filterChip,
                    selectedChildId === child.id && styles.filterChipActive
                  ]}
                  onPress={() => setSelectedChildId(selectedChildId === child.id ? '' : child.id)}
                >
                  <Text style={[
                    styles.filterChipText,
                    selectedChildId === child.id && styles.filterChipTextActive
                  ]}>
                    {child.first_name || child.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Reuse Filter */}
        <TouchableOpacity
          style={styles.reuseToggle}
          onPress={() => setShowReuseOnly(!showReuseOnly)}
        >
          <View style={[styles.checkbox, showReuseOnly && styles.checkboxChecked]}>
            {showReuseOnly && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.reuseToggleText}>Reuse candidates only</Text>
        </TouchableOpacity>
      </View>

      {/* Materials Grid */}
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Error: {error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={loadMaterials}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading materials...</Text>
        </View>
      ) : materials.length === 0 ? (
        <View style={styles.emptyState}>
          <BookOpen size={48} color={colors.muted} />
          <Text style={styles.emptyTitle}>No materials found</Text>
          <Text style={styles.emptyText}>
            {searchQuery || selectedType || selectedChildId
              ? 'Try adjusting your filters'
              : 'Add your first material to get started'}
          </Text>
          {!searchQuery && !selectedType && !selectedChildId && (
            <TouchableOpacity
              style={styles.emptyButton}
              onPress={() => setShowAddModal(true)}
            >
              <Plus size={18} color={colors.accent} />
              <Text style={styles.emptyButtonText}>Add Material</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView style={styles.gridContainer} contentContainerStyle={styles.grid}>
          {materials.map(material => (
            <MaterialCard
              key={material.id}
              material={material}
              children={children}
              onPress={() => handleMaterialClick(material)}
            />
          ))}
        </ScrollView>
      )}

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
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    padding: 24,
    minHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  statsPanel: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  statCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginTop: 8,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: colors.muted,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.muted,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.accent,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ffffff',
  },
  filters: {
    marginBottom: 24,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#ffffff',
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
  },
  filterRow: {
    marginBottom: 12,
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
  },
  filterChipTextActive: {
    color: colors.accent,
    fontWeight: '500',
  },
  reuseToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
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
  reuseToggleText: {
    fontSize: 14,
    color: colors.text,
  },
  gridContainer: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    ...Platform.select({
      web: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
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
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 24,
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
  },
});

