// Simple notification system for immediate UI feedback
// No complex scheduling, just immediate success/error messages

import { Alert } from 'react-native';

/**
 * Simple notification types
 */
export const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warning'
};

/**
 * Show a simple alert message
 * @param {string} message - The message to display
 * @param {string} type - success, error, info, or warning
 * @param {string} title - Optional title (defaults based on type)
 */
export const showNotification = (message, type = NOTIFICATION_TYPES.INFO, title = null) => {
  // Default titles based on type
  const defaultTitles = {
    [NOTIFICATION_TYPES.SUCCESS]: 'Success',
    [NOTIFICATION_TYPES.ERROR]: 'Error',
    [NOTIFICATION_TYPES.INFO]: 'Info',
    [NOTIFICATION_TYPES.WARNING]: 'Warning'
  };

  const alertTitle = title || defaultTitles[type] || 'Notification';
  
  // Show alert with appropriate styling
  if (type === NOTIFICATION_TYPES.ERROR) {
    Alert.alert(alertTitle, message, [{ text: 'OK' }], { cancelable: true });
  } else {
    Alert.alert(alertTitle, message, [{ text: 'OK' }], { cancelable: true });
  }
};

/**
 * Show success message
 */
export const showSuccess = (message, title = 'Success') => {
  showNotification(message, NOTIFICATION_TYPES.SUCCESS, title);
};

/**
 * Show error message
 */
export const showError = (message, title = 'Error') => {
  showNotification(message, NOTIFICATION_TYPES.ERROR, title);
};

/**
 * Show info message
 */
export const showInfo = (message, title = 'Info') => {
  showNotification(message, NOTIFICATION_TYPES.INFO, title);
};

/**
 * Show warning message
 */
export const showWarning = (message, title = 'Warning') => {
  showNotification(message, NOTIFICATION_TYPES.WARNING, title);
};

/**
 * Cache refresh notifications
 */
export const showCacheRefreshSuccess = () => {
  showSuccess('Schedule cache refreshed successfully!');
};

export const showCacheRefreshError = (error) => {
  showError(`Failed to refresh schedule cache: ${error.message}`);
};

/**
 * Schedule change notifications
 */
export const showScheduleUpdateSuccess = () => {
  showSuccess('Schedule updated successfully!');
};

export const showScheduleUpdateError = (error) => {
  showError(`Failed to update schedule: ${error.message}`);
};

/**
 * Event notifications
 */
export const showEventSaveSuccess = () => {
  showSuccess('Event saved successfully!');
};

export const showEventSaveError = (error) => {
  showError(`Failed to save event: ${error.message}`);
};

export const showEventDeleteSuccess = () => {
  showSuccess('Event deleted successfully!');
};

export const showEventDeleteError = (error) => {
  showError(`Failed to delete event: ${error.message}`);
};

/**
 * AI Planner notifications
 */
export const showPlanGeneratedSuccess = (eventCount) => {
  showSuccess(`AI generated ${eventCount} events successfully!`);
};

export const showPlanGeneratedError = (error) => {
  showError(`Failed to generate plan: ${error.message}`);
};

export const showPlanCommitSuccess = () => {
  showSuccess('Plan committed successfully!');
};

export const showPlanCommitError = (error) => {
  showError(`Failed to commit plan: ${error.message}`);
};

/**
 * Rules notifications
 */
export const showRuleSaveSuccess = () => {
  showSuccess('Schedule rule saved successfully!');
};

export const showRuleSaveError = (error) => {
  showError(`Failed to save schedule rule: ${error.message}`);
};

export const showRuleDeleteSuccess = () => {
  showSuccess('Schedule rule deleted successfully!');
};

export const showRuleDeleteError = (error) => {
  showError(`Failed to delete schedule rule: ${error.message}`);
};

/**
 * Override notifications
 */
export const showOverrideSaveSuccess = () => {
  showSuccess('Schedule override saved successfully!');
};

export const showOverrideSaveError = (error) => {
  showError(`Failed to save schedule override: ${error.message}`);
};

/**
 * Generic loading and completion notifications
 */
export const showLoading = (message = 'Loading...') => {
  // For now, just log to console. In the future, you could show a loading spinner
  console.log(`Loading: ${message}`);
};

export const showOperationComplete = (operation, success = true) => {
  if (success) {
    showSuccess(`${operation} completed successfully!`);
  } else {
    showError(`${operation} failed. Please try again.`);
  }
};

/**
 * Utility function to handle async operations with notifications
 */
export const withNotification = async (operation, successMessage, errorMessage) => {
  try {
    const result = await operation();
    showSuccess(successMessage);
    return result;
  } catch (error) {
    console.error('Operation failed:', error);
    showError(errorMessage || error.message);
    throw error;
  }
};

export default {
  showNotification,
  showSuccess,
  showError,
  showInfo,
  showWarning,
  showCacheRefreshSuccess,
  showCacheRefreshError,
  showScheduleUpdateSuccess,
  showScheduleUpdateError,
  showEventSaveSuccess,
  showEventSaveError,
  showEventDeleteSuccess,
  showEventDeleteError,
  showPlanGeneratedSuccess,
  showPlanGeneratedError,
  showPlanCommitSuccess,
  showPlanCommitError,
  showRuleSaveSuccess,
  showRuleSaveError,
  showRuleDeleteSuccess,
  showRuleDeleteError,
  showOverrideSaveSuccess,
  showOverrideSaveError,
  showLoading,
  showOperationComplete,
  withNotification
};
