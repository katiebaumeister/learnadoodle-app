import React, { useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Platform,
} from 'react-native';

export default function BlogSearchBar({ onSearch, placeholder = "Search topics, strategies, or questions parents ask…" }) {
  const [query, setQuery] = useState('');

  const handleSubmit = () => {
    if (query.trim() && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.href = `/blog/search?q=${encodeURIComponent(query.trim())}`;
    }
  };

  const handleChange = (text) => {
    setQuery(text);
    if (onSearch) {
      onSearch(text);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={handleChange}
        onSubmitEditing={handleSubmit}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        returnKeyType="search"
        {...(Platform.OS === 'web' && {
          onKeyDown: (e) => {
            if (e.key === 'Enter') {
              handleSubmit();
            }
          },
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginBottom: 0,
    ...(Platform.OS === 'web' && {
      paddingHorizontal: 0,
      maxWidth: '100%',
      marginHorizontal: 0,
    } : {
      paddingHorizontal: 0,
    }),
  },
  input: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#ffffff',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
