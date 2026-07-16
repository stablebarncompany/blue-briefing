import { useSyncExternalStore } from 'react';

import {
  getPendingInviteToken,
  hasPendingInviteToken,
  subscribePendingInviteToken,
} from '@/services/personnel/inviteTokenSession';

function subscribe(onStoreChange: () => void): () => void {
  return subscribePendingInviteToken(onStoreChange);
}

function getSnapshot(): string | null {
  return getPendingInviteToken();
}

function getHasSnapshot(): boolean {
  return hasPendingInviteToken();
}

/** Reactive pending invitation token (in-memory only). */
export function usePendingInviteToken(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useHasPendingInviteToken(): boolean {
  return useSyncExternalStore(subscribe, getHasSnapshot, getHasSnapshot);
}
