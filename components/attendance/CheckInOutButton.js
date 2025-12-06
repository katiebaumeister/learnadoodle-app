/**
 * Check-In/Out Button Component
 * Quick check-in/out functionality for attendance tracking
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Clock, LogIn, LogOut } from 'lucide-react';
import { colors } from '../../theme/colors';
import { checkIn, checkOut, getCheckInStatus } from '../../lib/services/attendanceClient';

export default function CheckInOutButton({ childId, familyId, onStatusChange }) {
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    loadStatus();
  }, [childId]);

  const loadStatus = async () => {
    if (!childId) return;
    
    setCheckingStatus(true);
    try {
      const result = await getCheckInStatus(childId);
      setStatus(result);
      if (onStatusChange) {
        onStatusChange(result);
      }
    } catch (error) {
      console.error('Error loading check-in status:', error);
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleCheckIn = async () => {
    if (!childId) return;
    
    setLoading(true);
    try {
      await checkIn(childId);
      await loadStatus();
    } catch (error) {
      console.error('Error checking in:', error);
      alert('Failed to check in. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOut = async () => {
    if (!status?.checked_in || !status?.check_in_record?.id) return;
    
    setLoading(true);
    try {
      await checkOut(status.check_in_record.id);
      await loadStatus();
    } catch (error) {
      console.error('Error checking out:', error);
      alert('Failed to check out. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checkingStatus) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={colors.indigo} />
      </View>
    );
  }

  const isCheckedIn = status?.checked_in || false;

  return (
    <TouchableOpacity
      style={[styles.button, isCheckedIn && styles.buttonCheckedIn]}
      onPress={isCheckedIn ? handleCheckOut : handleCheckIn}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.white} />
      ) : (
        <>
          {isCheckedIn ? (
            <>
              <LogOut size={18} color={colors.white} />
              <Text style={styles.buttonText}>Check Out</Text>
            </>
          ) : (
            <>
              <LogIn size={18} color={colors.white} />
              <Text style={styles.buttonText}>Check In</Text>
            </>
          )}
        </>
      )}
      {isCheckedIn && status?.check_in_record?.check_in_time && (
        <Text style={styles.timeText}>
          Since {new Date(status.check_in_record.check_in_time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.indigo,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 140,
  },
  buttonCheckedIn: {
    backgroundColor: colors.green,
  },
  buttonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  timeText: {
    color: colors.white,
    fontSize: 12,
    opacity: 0.9,
    marginTop: 4,
  },
});

