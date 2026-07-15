import 'react-native-url-polyfill/auto';

import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

function requirePublicEnv(name: 'EXPO_PUBLIC_SUPABASE_URL' | 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `[Blue Briefing] Missing ${name}. Copy .env.example to .env and set your Supabase project URL and publishable key. Never use a service-role key in the app.`,
    );
  }

  return value;
}

const ExpoSecureStoreAdapter: SupportedStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

const WebStorageAdapter: SupportedStorage = {
  getItem: (key) => {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage.getItem(key);
  },
  setItem: (key, value) => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.removeItem(key);
  },
};

const supabaseUrl = requirePublicEnv('EXPO_PUBLIC_SUPABASE_URL');
const supabasePublishableKey = requirePublicEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

/**
 * Shared Supabase browser/native client.
 * Uses only the public publishable key. Do not introduce a service-role key here.
 */
export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: Platform.OS === 'web' ? WebStorageAdapter : ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    // Native apps do not complete OAuth via the document URL; web does.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
