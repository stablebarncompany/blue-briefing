/**
 * In-memory invite token hold for the auth → accept handoff.
 * Never write invitation tokens to SecureStore, AsyncStorage, or logs.
 */

type Listener = () => void;

let pendingInviteToken: string | null = null;
const listeners = new Set<Listener>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** True only for a non-empty trimmed token string. */
export function normalizeInviteToken(token: string | null | undefined): string | null {
  if (typeof token !== 'string') {
    return null;
  }
  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function hasPendingInviteToken(): boolean {
  return pendingInviteToken !== null;
}

export function setPendingInviteToken(token: string | null | undefined): void {
  const next = normalizeInviteToken(token);
  if (pendingInviteToken === next) {
    return;
  }
  pendingInviteToken = next;
  notifyListeners();
}

export function getPendingInviteToken(): string | null {
  return pendingInviteToken;
}

export function clearPendingInviteToken(): void {
  if (pendingInviteToken === null) {
    return;
  }
  pendingInviteToken = null;
  notifyListeners();
}

export function takePendingInviteToken(): string | null {
  const token = pendingInviteToken;
  if (token !== null) {
    pendingInviteToken = null;
    notifyListeners();
  }
  return token;
}

export function subscribePendingInviteToken(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
