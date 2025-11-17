import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

const Card = ({ 
  title, 
  subtitle, 
  icon, 
  onClick, 
  href, 
  ariaLabel,
  children 
}) => {
  const handlePress = () => {
    if (onClick) {
      onClick();
    } else if (href) {
      // In a real app, this would use React Router or similar
      console.log('Navigate to:', href);
    }
  };

  const getIconText = (iconType) => {
    const icons = {
      checklist: '☑',
      document: '📄',
      calendar: '📅',
      book: '📖',
      user: '👤',
      flask: '🧪',
      'book-open': '📖',
      chart: '📊',
      home: '🏠',
      settings: '⚙️',
      list: '📋',
      clock: '🕐'
    };
    return icons[iconType] || '📄';
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={handlePress}
      accessibilityLabel={ariaLabel || title}
      accessibilityRole="button"
      accessibilityHint={subtitle}
    >
      <View style={styles.cardContent}>
        {icon && (
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>{getIconText(icon)}</Text>
          </View>
        )}
        <View style={styles.textContainer}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && (
            <Text style={styles.subtitle}>{subtitle}</Text>
          )}
        </View>
        {children}
      </View>
    </TouchableOpacity>
  );
};

const styles = {
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.6)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
  },
  cardContent: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#f9fafb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  icon: {
    fontSize: 18,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
};

export default Card;
