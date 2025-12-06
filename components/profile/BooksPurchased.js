import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, Platform } from 'react-native';
import { Plus, ShoppingBag, Edit, Trash2, BookOpen, Calendar, DollarSign, X, Save } from 'lucide-react';
import { useSensoryMode } from '../../contexts/SensoryModeContext';
import { getModeTokens, spacing, radius } from '../../theme/pastelDesignTokens';
import { supabase } from '../../lib/supabase';
import GeistCard from '../GeistCard';

export default function BooksPurchased({ childId, familyId }) {
  const { mode } = useSensoryMode();
  const tokens = getModeTokens(mode);
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBook, setEditingBook] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    isbn: '',
    purchaseDate: new Date().toISOString().split('T')[0],
    price: '',
    subject: '',
    notes: '',
  });

  useEffect(() => {
    loadBooks();
  }, [childId]);

  const loadBooks = async () => {
    try {
      setLoading(true);
      // Store books in child_documents with type 'book' or use a dedicated table
      // For now, using child_documents
      const { data, error } = await supabase
        .from('child_documents')
        .select('*')
        .eq('child_id', childId)
        .eq('type', 'book')
        .order('created_at', { ascending: false });

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      setBooks(data || []);
    } catch (error) {
      console.error('Error loading books:', error);
      setBooks([]);
    } finally {
      setLoading(false);
    }
  };

  const saveBook = async () => {
    if (!formData.title.trim()) {
      Alert.alert('Error', 'Please enter a book title');
      return;
    }

    try {
      const bookData = {
        child_id: childId,
        family_id: familyId,
        type: 'book',
        title: formData.title.trim(),
        description: formData.notes.trim() || null,
        metadata: {
          author: formData.author.trim() || null,
          isbn: formData.isbn.trim() || null,
          purchaseDate: formData.purchaseDate || null,
          price: formData.price ? parseFloat(formData.price) : null,
          subject: formData.subject.trim() || null,
        },
      };

      if (editingBook) {
        const { error } = await supabase
          .from('child_documents')
          .update(bookData)
          .eq('id', editingBook.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('child_documents')
          .insert(bookData);

        if (error) throw error;
      }

      await loadBooks();
      setShowModal(false);
      setEditingBook(null);
      setFormData({
        title: '',
        author: '',
        isbn: '',
        purchaseDate: new Date().toISOString().split('T')[0],
        price: '',
        subject: '',
        notes: '',
      });
    } catch (error) {
      console.error('Error saving book:', error);
      Alert.alert('Error', 'Failed to save book. Please try again.');
    }
  };

  const deleteBook = async (book) => {
    Alert.alert(
      'Delete Book',
      `Are you sure you want to delete "${book.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('child_documents')
                .delete()
                .eq('id', book.id);

              if (error) throw error;
              await loadBooks();
            } catch (error) {
              console.error('Error deleting book:', error);
              Alert.alert('Error', 'Failed to delete book.');
            }
          },
        },
      ]
    );
  };

  const openEditModal = (book) => {
    setEditingBook(book);
    setFormData({
      title: book.title || '',
      author: book.metadata?.author || '',
      isbn: book.metadata?.isbn || '',
      purchaseDate: book.metadata?.purchaseDate || new Date().toISOString().split('T')[0],
      price: book.metadata?.price?.toString() || '',
      subject: book.metadata?.subject || '',
      notes: book.description || '',
    });
    setShowModal(true);
  };

  const openAddModal = () => {
    setEditingBook(null);
    setFormData({
      title: '',
      author: '',
      isbn: '',
      purchaseDate: new Date().toISOString().split('T')[0],
      price: '',
      subject: '',
      notes: '',
    });
    setShowModal(true);
  };

  const totalSpent = books.reduce((sum, book) => {
    const price = book.metadata?.price || 0;
    return sum + (typeof price === 'number' ? price : parseFloat(price) || 0);
  }, 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: tokens.text }]}>Books Purchased</Text>
          <Text style={[styles.subtitle, { color: tokens.textSecondary }]}>
            Track books and materials purchased for learning
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: tokens.accent }]}
          onPress={openAddModal}
        >
          <Plus size={16} color={tokens.surface} />
          <Text style={[styles.addButtonText, { color: tokens.surface }]}>Add Book</Text>
        </TouchableOpacity>
      </View>

      {/* Summary Card */}
      <GeistCard variant="medium" style={styles.summaryCard}>
        <View style={styles.summary}>
          <BookOpen size={32} color={tokens.accent} />
          <View style={styles.summaryInfo}>
            <Text style={[styles.summaryLabel, { color: tokens.textSecondary }]}>Total Books</Text>
            <Text style={[styles.summaryValue, { color: tokens.text }]}>{books.length}</Text>
          </View>
          <View style={styles.summaryInfo}>
            <Text style={[styles.summaryLabel, { color: tokens.textSecondary }]}>Total Spent</Text>
            <Text style={[styles.summaryValue, { color: tokens.text }]}>
              ${totalSpent.toFixed(2)}
            </Text>
          </View>
        </View>
      </GeistCard>

      {/* Books List */}
      {loading ? (
        <Text style={[styles.loading, { color: tokens.textSecondary }]}>Loading books...</Text>
      ) : books.length === 0 ? (
        <GeistCard variant="medium">
          <Text style={[styles.emptyText, { color: tokens.textSecondary }]}>
            No books recorded yet. Click "Add Book" to get started.
          </Text>
        </GeistCard>
      ) : (
        <ScrollView style={styles.booksList}>
          {books.map((book) => (
            <GeistCard key={book.id} variant="medium" hoverable style={styles.bookCard}>
              <View style={styles.bookContent}>
                <View style={styles.bookHeader}>
                  <View style={styles.bookInfo}>
                    <Text style={[styles.bookTitle, { color: tokens.text }]}>
                      {book.title}
                    </Text>
                    {book.metadata?.author && (
                      <Text style={[styles.bookAuthor, { color: tokens.textSecondary }]}>
                        by {book.metadata.author}
                      </Text>
                    )}
                  </View>
                  <View style={styles.bookActions}>
                    <TouchableOpacity onPress={() => openEditModal(book)}>
                      <Edit size={16} color={tokens.iconMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteBook(book)}>
                      <Trash2 size={16} color={tokens.iconMuted} />
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.bookMeta}>
                  {book.metadata?.purchaseDate && (
                    <View style={styles.metaItem}>
                      <Calendar size={14} color={tokens.iconMuted} />
                      <Text style={[styles.metaText, { color: tokens.textSecondary }]}>
                        {new Date(book.metadata.purchaseDate).toLocaleDateString()}
                      </Text>
                    </View>
                  )}
                  {book.metadata?.price && (
                    <View style={styles.metaItem}>
                      <DollarSign size={14} color={tokens.iconMuted} />
                      <Text style={[styles.metaText, { color: tokens.textSecondary }]}>
                        ${typeof book.metadata.price === 'number' ? book.metadata.price.toFixed(2) : parseFloat(book.metadata.price).toFixed(2)}
                      </Text>
                    </View>
                  )}
                  {book.metadata?.subject && (
                    <Text style={[styles.metaText, { color: tokens.textSecondary }]}>
                      {book.metadata.subject}
                    </Text>
                  )}
                </View>

                {book.description && (
                  <Text style={[styles.bookNotes, { color: tokens.textSecondary }]}>
                    {book.description}
                  </Text>
                )}
              </View>
            </GeistCard>
          ))}
        </ScrollView>
      )}

      {/* Add/Edit Modal */}
      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowModal(false);
          setEditingBook(null);
          setFormData({
            title: '',
            author: '',
            isbn: '',
            purchaseDate: new Date().toISOString().split('T')[0],
            price: '',
            subject: '',
            notes: '',
          });
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: tokens.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: tokens.text }]}>
                {editingBook ? 'Edit Book' : 'Add Book'}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowModal(false);
                  setEditingBook(null);
                  setFormData({
                    title: '',
                    author: '',
                    isbn: '',
                    purchaseDate: new Date().toISOString().split('T')[0],
                    price: '',
                    subject: '',
                    notes: '',
                  });
                }}
              >
                <X size={20} color={tokens.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Title *</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                  placeholder="Book title"
                  value={formData.title}
                  onChangeText={(text) => setFormData({ ...formData, title: text })}
                />
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: tokens.text }]}>Author</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                    placeholder="Author name"
                    value={formData.author}
                    onChangeText={(text) => setFormData({ ...formData, author: text })}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: tokens.text }]}>ISBN</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                    placeholder="ISBN number"
                    value={formData.isbn}
                    onChangeText={(text) => setFormData({ ...formData, isbn: text })}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: tokens.text }]}>Purchase Date</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                    placeholder="YYYY-MM-DD"
                    value={formData.purchaseDate}
                    onChangeText={(text) => setFormData({ ...formData, purchaseDate: text })}
                  />
                </View>
                <View style={[styles.formGroup, { flex: 1 }]}>
                  <Text style={[styles.label, { color: tokens.text }]}>Price</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                    placeholder="0.00"
                    keyboardType="numeric"
                    value={formData.price}
                    onChangeText={(text) => setFormData({ ...formData, price: text })}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Subject</Text>
                <TextInput
                  style={[styles.input, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                  placeholder="e.g., Math, Science, Literature"
                  value={formData.subject}
                  onChangeText={(text) => setFormData({ ...formData, subject: text })}
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={[styles.label, { color: tokens.text }]}>Notes</Text>
                <TextInput
                  style={[styles.textArea, { backgroundColor: tokens.bg, color: tokens.text, borderColor: tokens.border }]}
                  placeholder="Additional notes about this book..."
                  multiline
                  numberOfLines={4}
                  value={formData.notes}
                  onChangeText={(text) => setFormData({ ...formData, notes: text })}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.cancelButton, { borderColor: tokens.border }]}
                onPress={() => {
                  setShowModal(false);
                  setEditingBook(null);
                  setFormData({
                    title: '',
                    author: '',
                    isbn: '',
                    purchaseDate: new Date().toISOString().split('T')[0],
                    price: '',
                    subject: '',
                    notes: '',
                  });
                }}
              >
                <Text style={[styles.cancelButtonText, { color: tokens.text }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: tokens.accent }]}
                onPress={saveBook}
              >
                <Save size={16} color={tokens.surface} />
                <Text style={[styles.saveButtonText, { color: tokens.surface }]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  summaryCard: {
    marginBottom: spacing.md,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  summaryInfo: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 14,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
  },
  loading: {
    textAlign: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    textAlign: 'center',
    padding: spacing.xl,
  },
  booksList: {
    flex: 1,
  },
  bookCard: {
    marginBottom: spacing.md,
  },
  bookContent: {
    gap: spacing.md,
  },
  bookHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  bookInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  bookTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  bookAuthor: {
    fontSize: 14,
  },
  bookActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bookMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaText: {
    fontSize: 13,
  },
  bookNotes: {
    fontSize: 14,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '80%',
    borderRadius: radius.lg,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
    }),
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
  },
  modalBody: {
    flex: 1,
    padding: spacing.lg,
  },
  formGroup: {
    marginBottom: spacing.md,
  },
  formRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
  },
  textArea: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    fontSize: 14,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '500',
  },
});
