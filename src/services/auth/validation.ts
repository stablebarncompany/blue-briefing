import { MIN_PASSWORD_LENGTH } from '@/services/auth/types';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateEmailField(email: string): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return 'Email is required.';
  }
  // Practical client-side check; Supabase remains the source of truth.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return 'Enter a valid email address.';
  }
  return null;
}

export function validatePasswordField(password: string): string | null {
  if (!password) {
    return 'Password is required.';
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return null;
}

export function validateRequiredName(value: string, label: string): string | null {
  if (!value.trim()) {
    return `${label} is required.`;
  }
  return null;
}

export function validatePasswordConfirmation(password: string, confirmPassword: string): string | null {
  if (!confirmPassword) {
    return 'Confirm your password.';
  }
  if (password !== confirmPassword) {
    return 'Passwords do not match.';
  }
  return null;
}
