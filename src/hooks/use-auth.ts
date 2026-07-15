import { use } from 'react';

import { AuthContext } from '@/services/auth/AuthProvider';
import type { AuthContextValue } from '@/services/auth/types';

export function useAuth(): AuthContextValue {
  const value = use(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return value;
}
