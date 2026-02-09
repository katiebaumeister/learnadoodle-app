/**
 * Holiday Country/Region Picker
 * Bottom sheet modal for selecting country and optional region for public holidays
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { X, Search, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { getHolidayCountries, getHolidaySubdivisions } from '../../lib/services/academicYearClient';

const BG = '#ffffff';
const FG = '#111827';
const SUB = '#6b7280';
const BORDER = '#e5e7eb';
const MUTED = '#9ca3af';
const ACCENT = '#8b5cf6';
const ACCENT_LIGHT = '#ede9fe';

export default function HolidayPicker({
  visible,
  currentCountry,
  currentRegion,
  onClose,
  onApply,
}) {
  const [countries, setCountries] = useState([]);
  const [topCountries, setTopCountries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(currentCountry || 'US');
  const [selectedRegion, setSelectedRegion] = useState(currentRegion || null);
  const [subdivisions, setSubdivisions] = useState([]);
  const [loadingSubdivisions, setLoadingSubdivisions] = useState(false);
  const [showRegionSection, setShowRegionSection] = useState(false);
  const [regionSearchQuery, setRegionSearchQuery] = useState('');

  // Load countries on mount
  useEffect(() => {
    if (visible) {
      loadCountries();
      if (selectedCountry) {
        loadSubdivisions(selectedCountry);
      }
    }
  }, [visible]);

  // Load subdivisions when country changes
  useEffect(() => {
    if (selectedCountry) {
      loadSubdivisions(selectedCountry);
    } else {
      setSubdivisions([]);
      setSelectedRegion(null);
    }
  }, [selectedCountry]);

  const loadCountries = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await getHolidayCountries();
      
      if (error) throw error;
      
      if (data) {
        setCountries(data.countries || []);
        setTopCountries(data.top || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load countries');
      // Use fallback
      setCountries([
        { code: 'US', name: 'United States' },
        { code: 'CA', name: 'Canada' },
        { code: 'GB', name: 'United Kingdom' },
        { code: 'AU', name: 'Australia' },
        { code: 'NZ', name: 'New Zealand' },
      ]);
      setTopCountries(['US', 'CA', 'GB', 'AU', 'NZ']);
    } finally {
      setLoading(false);
    }
  };

  const loadSubdivisions = async (countryCode) => {
    setLoadingSubdivisions(true);
    
    try {
      const { data, error } = await getHolidaySubdivisions(countryCode);
      
      if (error) throw error;
      
      if (data && data.subdivisions && data.subdivisions.length > 0) {
        setSubdivisions(data.subdivisions);
        setShowRegionSection(true);
      } else {
        setSubdivisions([]);
        setShowRegionSection(false);
        setSelectedRegion(null);
      }
    } catch (err) {
      console.error('Error loading subdivisions:', err);
      setSubdivisions([]);
      setShowRegionSection(false);
    } finally {
      setLoadingSubdivisions(false);
    }
  };

  const handleApply = () => {
    onApply({
      country: selectedCountry,
      region: selectedRegion,
    });
    onClose();
  };

  const handleCancel = () => {
    // Reset to original values
    setSelectedCountry(currentCountry || 'US');
    setSelectedRegion(currentRegion || null);
    setSearchQuery('');
    setRegionSearchQuery('');
    onClose();
  };

  // Filter countries by search
  const filteredCountries = countries.filter(country =>
    country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    country.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Separate top countries from others
  const topCountriesList = filteredCountries.filter(c => topCountries.includes(c.code));
  const otherCountriesList = filteredCountries.filter(c => !topCountries.includes(c.code));

  // Filter subdivisions by search
  const filteredSubdivisions = subdivisions.filter(sub =>
    sub.name.toLowerCase().includes(regionSearchQuery.toLowerCase()) ||
    sub.code.toLowerCase().includes(regionSearchQuery.toLowerCase())
  );

  // Get country name
  const getCountryName = (code) => {
    const country = countries.find(c => c.code === code);
    return country ? country.name : code;
  };

  // Get region name
  const getRegionName = (code) => {
    const region = subdivisions.find(s => s.code === code);
    return region ? region.name : code;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Select Country & Region</Text>
            <TouchableOpacity onPress={handleCancel} style={styles.closeButton}>
              <X size={24} color={FG} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Search */}
            <View style={styles.searchContainer}>
              <Search size={18} color={SUB} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search countries..."
                placeholderTextColor={MUTED}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="small" color={ACCENT} />
                <Text style={styles.loadingText}>Loading countries...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : (
              <>
                {/* Top Countries Section */}
                {topCountriesList.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Top</Text>
                    {topCountriesList.map(country => (
                      <TouchableOpacity
                        key={country.code}
                        style={[
                          styles.countryItem,
                          selectedCountry === country.code && styles.countryItemSelected,
                        ]}
                        onPress={() => setSelectedCountry(country.code)}
                      >
                        <Text
                          style={[
                            styles.countryText,
                            selectedCountry === country.code && styles.countryTextSelected,
                          ]}
                        >
                          {country.name}
                        </Text>
                        {selectedCountry === country.code && (
                          <Check size={18} color={ACCENT} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Other Countries Section */}
                {otherCountriesList.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>All Countries</Text>
                    {otherCountriesList.map(country => (
                      <TouchableOpacity
                        key={country.code}
                        style={[
                          styles.countryItem,
                          selectedCountry === country.code && styles.countryItemSelected,
                        ]}
                        onPress={() => setSelectedCountry(country.code)}
                      >
                        <Text
                          style={[
                            styles.countryText,
                            selectedCountry === country.code && styles.countryTextSelected,
                          ]}
                        >
                          {country.name}
                        </Text>
                        {selectedCountry === country.code && (
                          <Check size={18} color={ACCENT} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Region Section */}
                {showRegionSection && subdivisions.length > 0 && (
                  <View style={styles.section}>
                    <TouchableOpacity
                      style={styles.regionHeader}
                      onPress={() => setShowRegionSection(!showRegionSection)}
                    >
                      <Text style={styles.sectionTitle}>
                        Region (optional)
                      </Text>
                      {showRegionSection ? (
                        <ChevronUp size={18} color={SUB} />
                      ) : (
                        <ChevronDown size={18} color={SUB} />
                      )}
                    </TouchableOpacity>

                    {showRegionSection && (
                      <>
                        <View style={styles.searchContainer}>
                          <Search size={18} color={SUB} />
                          <TextInput
                            style={styles.searchInput}
                            placeholder="Search regions..."
                            placeholderTextColor={MUTED}
                            value={regionSearchQuery}
                            onChangeText={setRegionSearchQuery}
                          />
                        </View>

                        {loadingSubdivisions ? (
                          <View style={styles.loadingContainer}>
                            <ActivityIndicator size="small" color={ACCENT} />
                          </View>
                        ) : (
                          <>
                            <TouchableOpacity
                              style={[
                                styles.regionItem,
                                selectedRegion === null && styles.regionItemSelected,
                              ]}
                              onPress={() => setSelectedRegion(null)}
                            >
                              <Text
                                style={[
                                  styles.regionText,
                                  selectedRegion === null && styles.regionTextSelected,
                                ]}
                              >
                                National (no region)
                              </Text>
                              {selectedRegion === null && (
                                <Check size={18} color={ACCENT} />
                              )}
                            </TouchableOpacity>

                            {filteredSubdivisions.map(region => (
                              <TouchableOpacity
                                key={region.code}
                                style={[
                                  styles.regionItem,
                                  selectedRegion === region.code && styles.regionItemSelected,
                                ]}
                                onPress={() => setSelectedRegion(region.code)}
                              >
                                <Text
                                  style={[
                                    styles.regionText,
                                    selectedRegion === region.code && styles.regionTextSelected,
                                  ]}
                                >
                                  {region.name}
                                </Text>
                                {selectedRegion === region.code && (
                                  <Check size={18} color={ACCENT} />
                                )}
                              </TouchableOpacity>
                            ))}
                          </>
                        )}
                      </>
                    )}
                  </View>
                )}
              </>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.applyButton]}
              onPress={handleApply}
            >
              <Text style={styles.applyButtonText}>Use these holidays</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    ...Platform.select({
      web: {
        boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 8,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: FG,
    fontFamily: Platform.select({
      web: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      default: 'System',
    }),
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    marginBottom: 20,
    backgroundColor: BG,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: FG,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: SUB,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: BG,
  },
  countryItemSelected: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_LIGHT,
  },
  countryText: {
    fontSize: 16,
    color: FG,
  },
  countryTextSelected: {
    color: ACCENT,
    fontWeight: '600',
  },
  regionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  regionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: BG,
  },
  regionItemSelected: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_LIGHT,
  },
  regionText: {
    fontSize: 16,
    color: FG,
  },
  regionTextSelected: {
    color: ACCENT,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: SUB,
  },
  errorContainer: {
    padding: 20,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  button: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: BORDER,
  },
  cancelButtonText: {
    fontSize: 16,
    color: FG,
    fontWeight: '500',
  },
  applyButton: {
    backgroundColor: ACCENT,
  },
  applyButtonText: {
    fontSize: 16,
    color: BG,
    fontWeight: '600',
  },
});
