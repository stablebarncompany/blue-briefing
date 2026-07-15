export function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const normalized = message.toLowerCase();

  if (normalized.includes('invalid login credentials')) {
    return 'Incorrect email or password.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Confirm your email before signing in. Check your inbox for a verification link.';
  }
  if (normalized.includes('user already registered')) {
    return 'An account with this email already exists. Sign in or reset your password.';
  }
  if (
    (normalized.includes('password') && normalized.includes('least')) ||
    (normalized.includes('password') && normalized.includes('characters'))
  ) {
    return 'Password does not meet the minimum requirements.';
  }
  if (normalized.includes('rate limit') || normalized.includes('too many')) {
    return 'Too many attempts. Please wait a moment and try again.';
  }
  if (normalized.includes('network') || normalized.includes('fetch')) {
    return 'Network error. Check your connection and try again.';
  }

  return fallback;
}
