import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { getAuthErrorMessage } from '@/services/auth/errors';
import type {
  AuthActionResult,
  AuthContextValue,
  SignInInput,
  SignUpInput,
} from '@/services/auth/types';
import { normalizeEmail } from '@/services/auth/validation';
import { supabase } from '@/services/supabase';

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) {
          return;
        }
        setSession(data.session);
        setUser(data.session?.user ?? null);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setSession(null);
        setUser(null);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async ({ email, password }: SignInInput): Promise<AuthActionResult> => {
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });

    if (error) {
      return {
        errorMessage: getAuthErrorMessage(error, 'Unable to sign in. Please try again.'),
      };
    }

    return { errorMessage: null };
  }, []);

  const signUp = useCallback(async ({
    firstName,
    lastName,
    email,
    password,
  }: SignUpInput): Promise<AuthActionResult> => {
    const { data, error } = await supabase.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: {
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        },
      },
    });

    if (error) {
      return {
        errorMessage: getAuthErrorMessage(error, 'Unable to create your account. Please try again.'),
      };
    }

    if (data.user && !data.session) {
      return {
        errorMessage: null,
        requiresEmailConfirmation: true,
      };
    }

    return { errorMessage: null };
  }, []);

  const signOut = useCallback(async (): Promise<AuthActionResult> => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      return {
        errorMessage: getAuthErrorMessage(error, 'Unable to sign out. Please try again.'),
      };
    }

    return { errorMessage: null };
  }, []);

  const requestPasswordReset = useCallback(async (email: string): Promise<AuthActionResult> => {
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email));

    // Always return a generic success path to the UI; do not reveal whether the account exists.
    if (error) {
      // Network/config failures can still surface a generic retry message without account enumeration.
      const isLikelyEnumerationSafe =
        !error.message.toLowerCase().includes('network') &&
        !error.message.toLowerCase().includes('fetch');

      if (isLikelyEnumerationSafe) {
        return { errorMessage: null };
      }

      return {
        errorMessage: 'Unable to send a reset email right now. Please try again.',
      };
    }

    return { errorMessage: null };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      isLoading,
      // Agency membership is not implemented yet — keep this flag for the next guard phase.
      hasAgencyAccess: false,
      signIn,
      signUp,
      signOut,
      requestPasswordReset,
    }),
    [session, user, isLoading, signIn, signUp, signOut, requestPasswordReset],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
