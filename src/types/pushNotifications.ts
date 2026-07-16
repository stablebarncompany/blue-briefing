export type PushPlatform = 'ios' | 'android';

export type PushPermissionStatus =
  | 'unsupported'
  | 'undetermined'
  | 'granted'
  | 'denied'
  | 'unavailable';

export type PushRegistrationResult = {
  supported: boolean;
  registered: boolean;
  permissionStatus: PushPermissionStatus;
  message: string | null;
  /** Truncated token fingerprint for safe display — never the full token. */
  tokenFingerprint: string | null;
};

export type NotificationPreferences = {
  id: string;
  user_id: string;
  agency_id: string | null;
  critical_briefings: boolean;
  acknowledgement_requests: boolean;
  direct_messages: boolean;
  group_mentions: boolean;
  group_activity: boolean;
  membership_changes: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationPreferencesUpdate = Partial<
  Pick<
    NotificationPreferences,
    | 'critical_briefings'
    | 'acknowledgement_requests'
    | 'direct_messages'
    | 'group_mentions'
    | 'group_activity'
    | 'membership_changes'
    | 'quiet_hours_enabled'
    | 'quiet_hours_start'
    | 'quiet_hours_end'
    | 'timezone'
  >
>;

/** Allowlisted deep-link route prefixes from push payloads. */
export const SAFE_PUSH_ROUTE_PREFIXES = [
  '/briefings/',
  '/groups/',
  '/messages/',
  '/notifications',
  '/personnel',
  '/accept-invite',
] as const;

export function isSafePushRoute(route: string | null | undefined): route is string {
  if (!route || typeof route !== 'string') {
    return false;
  }
  const cleaned = route.trim();
  if (!cleaned.startsWith('/') || cleaned.includes('://') || cleaned.includes('..')) {
    return false;
  }
  return SAFE_PUSH_ROUTE_PREFIXES.some((prefix) => {
    if (cleaned === prefix) {
      return true;
    }
    if (prefix.endsWith('/')) {
      return cleaned.startsWith(prefix);
    }
    return cleaned.startsWith(`${prefix}/`);
  });
}
