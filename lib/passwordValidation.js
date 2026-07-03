export const PASSWORD_SPECIAL_CHAR_RE = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/;

export function validatePassword(password = '') {
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasDigits = /\d/.test(password);
  const hasSpecialChar = PASSWORD_SPECIAL_CHAR_RE.test(password);
  const hasMinLength = password.length >= 10;
  return {
    isValid: hasUpperCase && hasLowerCase && hasDigits && hasSpecialChar && hasMinLength,
    hasUpperCase,
    hasLowerCase,
    hasDigits,
    hasSpecialChar,
    hasMinLength,
  };
}

export function isPasswordSetupValid(password, confirmPassword) {
  if (!password || !confirmPassword) return false;
  const validation = validatePassword(password);
  return validation.isValid && password === confirmPassword;
}

export function passwordRequirementsErrorMessage(validation) {
  const missing = [];
  if (!validation.hasMinLength) missing.push('at least 10 characters');
  if (!validation.hasUpperCase) missing.push('1 uppercase letter');
  if (!validation.hasLowerCase) missing.push('1 lowercase letter');
  if (!validation.hasDigits) missing.push('1 number');
  if (!validation.hasSpecialChar) missing.push('1 special character');
  if (missing.length === 0) return null;
  return `Please include: ${missing.join(', ')}.`;
}
