import type { Session, User } from '@supabase/supabase-js';

export type SignInInput = {
  email: string;
  password: string;
};

export type SignUpInput = {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export type AuthActionResult = {
  errorMessage: string | null;
  /** True when sign-up succeeded but Supabase requires email confirmation before a session exists. */
  requiresEmailConfirmation?: boolean;
};

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  signIn: (input: SignInInput) => Promise<AuthActionResult>;
  signUp: (input: SignUpInput) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
};

export const MIN_PASSWORD_LENGTH = 8;
