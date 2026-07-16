type Listener = (route: string | null) => void;

let pendingRoute: string | null = null;
const listeners = new Set<Listener>();

export function setPendingPushRoute(route: string | null) {
  pendingRoute = route;
  for (const listener of listeners) {
    listener(pendingRoute);
  }
}

export function getPendingPushRoute(): string | null {
  return pendingRoute;
}

export function takePendingPushRoute(): string | null {
  const value = pendingRoute;
  pendingRoute = null;
  for (const listener of listeners) {
    listener(null);
  }
  return value;
}

export function subscribePendingPushRoute(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
