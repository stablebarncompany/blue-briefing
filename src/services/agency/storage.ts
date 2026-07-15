import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const CURRENT_AGENCY_KEY = 'bluebriefing.currentAgencyId';

export async function readStoredAgencyId(): Promise<string | null> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') {
      return null;
    }
    return window.localStorage.getItem(CURRENT_AGENCY_KEY);
  }

  return SecureStore.getItemAsync(CURRENT_AGENCY_KEY);
}

export async function writeStoredAgencyId(agencyId: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') {
      return;
    }
    if (agencyId) {
      window.localStorage.setItem(CURRENT_AGENCY_KEY, agencyId);
    } else {
      window.localStorage.removeItem(CURRENT_AGENCY_KEY);
    }
    return;
  }

  if (agencyId) {
    await SecureStore.setItemAsync(CURRENT_AGENCY_KEY, agencyId);
  } else {
    await SecureStore.deleteItemAsync(CURRENT_AGENCY_KEY);
  }
}
