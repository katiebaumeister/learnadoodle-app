/**
 * Marketplace Page - Browse and purchase lesson packs, templates, curricula
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput } from 'react-native';
import { ShoppingBag, Search, Star, Download, DollarSign, Tag } from 'lucide-react';
import { colors } from '../../theme/colors';
import * as socialClient from '../../lib/services/socialClient';
import PageHeader from '../ui/PageHeader';
import AppContainer from '../ui/AppContainer';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';

export default function MarketplacePage({ familyId }) {
  const [listings, setListings] = useState([]);
  const [filteredListings, setFilteredListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  useEffect(() => {
    loadListings();
  }, []);

  useEffect(() => {
    filterListings();
  }, [listings, searchQuery, filterCategory]);

  const loadListings = async () => {
    setLoading(true);
    try {
      const result = await socialClient.listMarketplaceListings();
      if (result.success) {
        setListings(result.listings || []);
      }
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  const filterListings = () => {
    let filtered = listings;

    if (filterCategory !== 'all') {
      filtered = filtered.filter(l => l.category === filterCategory);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(l =>
        l.title.toLowerCase().includes(query) ||
        (l.description && l.description.toLowerCase().includes(query))
      );
    }

    setFilteredListings(filtered);
  };

  const formatPrice = (cents) => {
    if (cents === 0) return 'Free';
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <PageHeader
        title="Marketplace"
        icon={ShoppingBag}
        iconColor={colors.indigo}
      />

      {/* Search */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Search size={20} color="#6b7280" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search marketplace..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categories}>
          {['all', 'template', 'curriculum', 'lesson_pack', 'syllabus'].map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.categoryChip, filterCategory === cat && styles.categoryChipActive]}
              onPress={() => setFilterCategory(cat)}
            >
              <Text style={[styles.categoryChipText, filterCategory === cat && styles.categoryChipTextActive]}>
                {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1).replace('_', ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Listings Grid */}
      <AppContainer fullWidth noPadding>
        {loading ? (
          <View style={styles.loadingContainer}>
          <Text style={styles.emptyText}>Loading marketplace...</Text>
          </View>
        ) : filteredListings.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="No listings found"
            description="Try adjusting your search or filters"
            size="default"
          />
        ) : (
          <ScrollView style={styles.listingsGrid}>
          filteredListings.map((listing) => (
            <View key={listing.id} style={styles.listingCard}>
              <View style={styles.listingHeader}>
                <View style={styles.listingIcon}>
                  <Tag size={20} color={colors.indigo} />
                </View>
                <View style={styles.priceBadge}>
                  <DollarSign size={12} color="#ffffff" />
                  <Text style={styles.priceText}>{formatPrice(listing.price_cents)}</Text>
                </View>
              </View>

              <Text style={styles.listingTitle}>{listing.title}</Text>
              {listing.description && (
                <Text style={styles.listingDescription} numberOfLines={2}>
                  {listing.description}
                </Text>
              )}

              <View style={styles.listingMeta}>
                {listing.rating && (
                  <View style={styles.rating}>
                    <Star size={14} color="#fbbf24" fill="#fbbf24" />
                    <Text style={styles.ratingText}>{listing.rating.toFixed(1)}</Text>
                    {listing.review_count > 0 && (
                      <Text style={styles.reviewCount}>({listing.review_count})</Text>
                    )}
                  </View>
                )}
                <Text style={styles.downloads}>{listing.downloads || 0} downloads</Text>
              </View>

              {listing.tags && listing.tags.length > 0 && (
                <View style={styles.tags}>
                  {listing.tags.slice(0, 3).map((tag, idx) => (
                    <View key={idx} style={styles.tag}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity
                style={styles.purchaseButton}
                onPress={async () => {
                  const result = await socialClient.purchaseListing(listing.id);
                  if (result.success) {
                    alert('Purchase successful!');
                  } else {
                    alert('Purchase failed: ' + (result.error || 'Unknown error'));
                  }
                }}
              >
                <Download size={16} color="#ffffff" />
                <Text style={styles.purchaseButtonText}>
                  {listing.price_cents === 0 ? 'Get Free' : 'Purchase'}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
          </ScrollView>
        )}
      </AppContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  searchSection: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  categories: {
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    marginRight: 8,
  },
  categoryChipActive: {
    backgroundColor: colors.indigo,
  },
  categoryChipText: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#ffffff',
  },
  listingsGrid: {
    flex: 1,
    padding: 16,
  },
  listingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  listingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  listingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  priceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.indigo,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  priceText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  listingTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  listingDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 20,
  },
  listingMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  reviewCount: {
    fontSize: 12,
    color: '#6b7280',
  },
  downloads: {
    fontSize: 12,
    color: '#6b7280',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tagText: {
    fontSize: 12,
    color: '#6b7280',
  },
  purchaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.indigo,
    paddingVertical: 12,
    borderRadius: 8,
  },
  purchaseButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 16,
    marginTop: 40,
  },
});

