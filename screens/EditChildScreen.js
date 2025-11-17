import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native'
import { supabase } from '../lib/supabase'

export default function EditChildScreen({ route, navigation }) {
  const { childId } = route.params
  const [childName, setChildName] = useState('')
  const [childAge, setChildAge] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [showSuccess, setShowSuccess] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    fetchChildData()
  }, [childId])

  // Auto-navigate after success
  useEffect(() => {
    if (showSuccess) {
      const timer = setTimeout(() => {
        navigation.goBack()
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [showSuccess, navigation])

  const fetchChildData = async () => {
    try {
      setIsLoadingData(true)
      const { data, error } = await supabase
        .from('children')
        .select('*')
        .eq('id', childId)
        .single()

      if (error) {
        console.error('Error fetching child data:', error)
        Alert.alert('Error', 'Failed to load child information')
      } else if (data) {
        setChildName(data.first_name || '')
        setChildAge(data.age ? data.age.toString() : '')
      }
    } catch (error) {
      console.error('Error fetching child data:', error)
      Alert.alert('Error', 'Failed to load child information')
    } finally {
      setIsLoadingData(false)
    }
  }

  const handleUpdateChild = async () => {
    if (!childName.trim()) {
      Alert.alert('Error', 'Please enter a name')
      return
    }

    if (!childAge.trim() || isNaN(parseInt(childAge))) {
      Alert.alert('Error', 'Please enter a valid age')
      return
    }

    const age = parseInt(childAge)
    if (age < 0 || age > 25) {
      Alert.alert('Error', 'Please enter a valid age between 0 and 25')
      return
    }

    setIsLoading(true)

    try {
      console.log('Updating child with ID:', childId)
      console.log('New name:', childName.trim())
      console.log('New age:', age)

      const { data, error } = await supabase
        .from('children')
        .update({
          first_name: childName.trim(),
          age: age,
          updated_at: new Date().toISOString()
        })
        .eq('id', childId)
        .select()

      console.log('Update result - data:', data)
      console.log('Update result - error:', error)

      if (error) {
        console.error('Error updating child:', error)
        Alert.alert(
          'Update Failed',
          'Failed to update child information. Please try again.',
          [{ text: 'OK' }]
        )
      } else {
        console.log('Update successful, showing success message')
        setSuccessMessage('Child information updated successfully!')
        setShowSuccess(true)
      }
    } catch (error) {
      console.error('Exception during update:', error)
      Alert.alert(
        'Update Failed',
        'An unexpected error occurred. Please try again.',
        [{ text: 'OK' }]
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteChild = () => {
    Alert.alert(
      'Delete Child',
      `Are you sure you want to delete ${childName}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true)
            try {
              const { error } = await supabase
                .from('children')
                .delete()
                .eq('id', childId)

              if (error) {
                console.error('Error deleting child:', error)
                Alert.alert(
                  'Delete Failed',
                  'Failed to delete child. Please try again.',
                  [{ text: 'OK' }]
                )
              } else {
                Alert.alert(
                  'Success',
                  'Child deleted successfully!',
                  [
                    {
                      text: 'OK',
                      onPress: () => {
                        // Navigate back to home screen
                        navigation.navigate('Home')
                      }
                    }
                  ]
                )
              }
            } catch (error) {
              console.error('Error:', error)
              Alert.alert(
                'Delete Failed',
                'An unexpected error occurred. Please try again.',
                [{ text: 'OK' }]
              )
            } finally {
              setIsLoading(false)
            }
          }
        }
      ]
    )
  }

  if (isLoadingData) {
    return (
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.loadingText}>Loading child information...</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.content}>
          <Text style={styles.title}>Edit Child Information</Text>
          <Text style={styles.subtitle}>Update your child's details</Text>

          {showSuccess && (
            <View style={styles.successMessage}>
              <Text style={styles.successText}>{successMessage}</Text>
              <Text style={styles.successSubtext}>Redirecting back in 2 seconds...</Text>
            </View>
          )}

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={childName}
                onChangeText={setChildName}
                placeholder="Enter child's name"
                placeholderTextColor="#999"
                maxLength={50}
                editable={!showSuccess}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Age</Text>
              <TextInput
                style={styles.input}
                value={childAge}
                onChangeText={setChildAge}
                placeholder="Enter age"
                placeholderTextColor="#999"
                keyboardType="numeric"
                maxLength={2}
                editable={!showSuccess}
              />
            </View>

            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.button, styles.updateButton]}
                onPress={handleUpdateChild}
                disabled={isLoading || showSuccess}
              >
                <Text style={styles.updateButtonText}>
                  {isLoading ? 'Updating...' : 'Update Child'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => navigation.goBack()}
                disabled={isLoading || showSuccess}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={[styles.button, styles.deleteButton]}
              onPress={handleDeleteChild}
              disabled={isLoading || showSuccess}
            >
              <Text style={styles.deleteButtonText}>Delete Child</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 32,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 100,
  },
  form: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#333',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateButton: {
    backgroundColor: '#007AFF',
  },
  updateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 24,
  },
  deleteButton: {
    backgroundColor: '#ff3b30',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  successMessage: {
    backgroundColor: '#dff0d8',
    borderColor: '#d6e9c6',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
  },
  successText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3c763d',
  },
  successSubtext: {
    fontSize: 14,
    color: '#3c763d',
  },
}) 