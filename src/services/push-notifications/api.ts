import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

import { supabase } from '@/services/supabase';
import type {
  NotificationPreferences,
  NotificationPreferencesUpdate,
  PushPermissionStatus,
  PushPlatform,
  PushRegistrationResult,
} from '@/types/pushNotifications';
import { isSafePushRoute } from '@/types/pushNotifications';

export class PushNotificationServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushNotificationServiceError';
  }
}

type NotificationsModule = typeof import('expo-notifications');

let notificationsModule: NotificationsModule | null | undefined;
let handlerConfigured = false;
const activeSubscriptions: { remove: () => void }[] = [];

async function loadNotificationsModule(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  if (notificationsModule !== undefined) {
    return notificationsModule;
  }
  try {
    notificationsModule = await import('expo-notifications');
    return notificationsModule;
  } catch {
    notificationsModule = null;
    return null;
  }
}

function tokenFingerprint(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length < 12) {
    return '••••';
  }
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

function resolveProjectId(): string | null {
  const fromEas =
    Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId ||
    null;
  if (typeof fromEas === 'string' && fromEas.trim()) {
    return fromEas.trim();
  }
  return null;
}

function mapPreferences(row: Record<string, unknown>): NotificationPreferences {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    agency_id: row.agency_id == null ? null : String(row.agency_id),
    critical_briefings: Boolean(row.critical_briefings),
    acknowledgement_requests: Boolean(row.acknowledgement_requests),
    direct_messages: Boolean(row.direct_messages),
    group_mentions: Boolean(row.group_mentions),
    group_activity: Boolean(row.group_activity),
    membership_changes: Boolean(row.membership_changes),
    quiet_hours_enabled: Boolean(row.quiet_hours_enabled),
    quiet_hours_start: row.quiet_hours_start == null ? null : String(row.quiet_hours_start),
    quiet_hours_end: row.quiet_hours_end == null ? null : String(row.quiet_hours_end),
    timezone: row.timezone == null ? null : String(row.timezone),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export function isPushPlatformSupported(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export async function configureNotificationHandler(): Promise<void> {
  if (handlerConfigured || Platform.OS === 'web') {
    return;
  }
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return;
  }
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
  handlerConfigured = true;
}

export async function getNotificationPermissionStatus(): Promise<PushPermissionStatus> {
  if (Platform.OS === 'web') {
    return 'unsupported';
  }
  if (!Device.isDevice) {
    return 'unavailable';
  }
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return 'unsupported';
  }

  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) {
    return 'granted';
  }
  if (settings.status === 'denied' || settings.canAskAgain === false) {
    return 'denied';
  }
  if (settings.status === 'undetermined') {
    return 'undetermined';
  }
  return settings.granted ? 'granted' : 'denied';
}

/**
 * Request OS notification permission after an explicit user action.
 * Does not re-prompt when already denied.
 */
export async function requestNotificationPermission(): Promise<PushPermissionStatus> {
  if (Platform.OS === 'web') {
    return 'unsupported';
  }
  if (!Device.isDevice) {
    return 'unavailable';
  }

  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return 'unsupported';
  }

  await configureNotificationHandler();

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) {
    return 'granted';
  }
  if (!current.canAskAgain || current.status === 'denied') {
    return 'denied';
  }

  const requested = await Notifications.requestPermissionsAsync();
  if (requested.granted) {
    return 'granted';
  }
  return requested.status === 'denied' ? 'denied' : 'undetermined';
}

export async function openDeviceNotificationSettings(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }
  try {
    await Linking.openSettings();
    return true;
  } catch {
    return false;
  }
}

async function ensureAndroidChannel(Notifications: NotificationsModule): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync('blue-briefing-alerts', {
    name: 'Blue Briefing Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#2F6FED',
  });
}

export async function registerPushDevice(options: {
  agencyId?: string | null;
}): Promise<PushRegistrationResult> {
  if (Platform.OS === 'web') {
    return {
      supported: false,
      registered: false,
      permissionStatus: 'unsupported',
      message: 'Native push is unavailable on web. In-app notifications still work.',
      tokenFingerprint: null,
    };
  }

  if (!Device.isDevice) {
    return {
      supported: false,
      registered: false,
      permissionStatus: 'unavailable',
      message: 'Push registration requires a physical device (or a supported emulator build).',
      tokenFingerprint: null,
    };
  }

  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return {
      supported: false,
      registered: false,
      permissionStatus: 'unsupported',
      message: 'Push notifications module is unavailable in this build.',
      tokenFingerprint: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new PushNotificationServiceError('Sign in before registering for push notifications.');
  }

  await configureNotificationHandler();
  await ensureAndroidChannel(Notifications);

  const permissionStatus = await requestNotificationPermission();
  if (permissionStatus !== 'granted') {
    return {
      supported: true,
      registered: false,
      permissionStatus,
      message:
        permissionStatus === 'denied'
          ? 'Notification permission is denied. Enable it in device settings to receive alerts.'
          : 'Notification permission is required to register this device.',
      tokenFingerprint: null,
    };
  }

  const projectId = resolveProjectId();
  if (!projectId) {
    return {
      supported: true,
      registered: false,
      permissionStatus,
      message:
        'EAS project ID is not configured yet. Set extra.eas.projectId after running eas init.',
      tokenFingerprint: null,
    };
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResponse.data?.trim();
  if (!token) {
    throw new PushNotificationServiceError('Unable to obtain an Expo push token.');
  }

  const platform: PushPlatform = Platform.OS === 'ios' ? 'ios' : 'android';
  const { error } = await supabase.rpc('upsert_push_device', {
    p_expo_push_token: token,
    p_platform: platform,
    p_agency_id: options.agencyId ?? null,
    p_device_identifier: Device.modelId ?? Device.modelName ?? null,
    p_device_name: Device.deviceName ?? Device.modelName ?? null,
    p_app_version: Constants.expoConfig?.version ?? null,
  });

  if (error) {
    throw new PushNotificationServiceError(error.message || 'Unable to register this device.');
  }

  return {
    supported: true,
    registered: true,
    permissionStatus,
    message: 'Device registered for push alerts.',
    tokenFingerprint: tokenFingerprint(token),
  };
}

export async function unregisterPushDevice(): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) {
    return;
  }

  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    await supabase.rpc('deactivate_my_push_devices');
    return;
  }

  try {
    const projectId = resolveProjectId();
    if (projectId) {
      const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenResponse.data?.trim();
      if (token) {
        await supabase.rpc('deactivate_push_device', { p_expo_push_token: token });
        return;
      }
    }
  } catch {
    // Fall through to deactivate all devices for this user.
  }

  await supabase.rpc('deactivate_my_push_devices');
}

export async function refreshPushRegistration(options: {
  agencyId?: string | null;
}): Promise<PushRegistrationResult> {
  const status = await getNotificationPermissionStatus();
  if (status !== 'granted') {
    return {
      supported: isPushPlatformSupported() && Device.isDevice,
      registered: false,
      permissionStatus: status,
      message: 'Permission is not granted; registration was not refreshed.',
      tokenFingerprint: null,
    };
  }
  return registerPushDevice(options);
}

export async function getNotificationPreferences(
  agencyId: string,
): Promise<NotificationPreferences> {
  if (!agencyId) {
    throw new PushNotificationServiceError('Agency is required.');
  }

  const { data, error } = await supabase.rpc('get_or_create_notification_preferences', {
    p_agency_id: agencyId,
  });

  if (error || !data) {
    throw new PushNotificationServiceError(
      error?.message || 'Unable to load notification preferences.',
    );
  }

  return mapPreferences(data as Record<string, unknown>);
}

export async function updateNotificationPreferences(
  agencyId: string,
  updates: NotificationPreferencesUpdate,
): Promise<NotificationPreferences> {
  if (!agencyId) {
    throw new PushNotificationServiceError('Agency is required.');
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new PushNotificationServiceError('Authentication required.');
  }

  // Ensure a row exists first.
  await getNotificationPreferences(agencyId);

  const { data, error } = await supabase
    .from('notification_preferences')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq('agency_id', agencyId)
    .select(
      'id, user_id, agency_id, critical_briefings, acknowledgement_requests, direct_messages, group_mentions, group_activity, membership_changes, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, timezone, created_at, updated_at',
    )
    .maybeSingle();

  if (error || !data) {
    throw new PushNotificationServiceError(
      error?.message || 'Unable to update notification preferences.',
    );
  }

  return mapPreferences(data as Record<string, unknown>);
}

export type NotificationListener = (payload: {
  title: string | null;
  body: string | null;
  route: string | null;
  entityType: string | null;
  entityId: string | null;
}) => void;

function readDataField(data: Record<string, unknown> | undefined, key: string): string | null {
  if (!data) {
    return null;
  }
  const value = data[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export async function addNotificationReceivedListener(
  listener: NotificationListener,
): Promise<() => void> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return () => undefined;
  }

  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    const data = notification.request.content.data as Record<string, unknown> | undefined;
    listener({
      title: notification.request.content.title ?? null,
      body: notification.request.content.body ?? null,
      route: readDataField(data, 'route'),
      entityType: readDataField(data, 'entityType'),
      entityId: readDataField(data, 'entityId'),
    });
  });
  activeSubscriptions.push(subscription);
  return () => {
    subscription.remove();
  };
}

export async function addNotificationResponseListener(
  listener: NotificationListener,
): Promise<() => void> {
  const Notifications = await loadNotificationsModule();
  if (!Notifications) {
    return () => undefined;
  }

  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const content = response.notification.request.content;
    const data = content.data as Record<string, unknown> | undefined;
    const route = readDataField(data, 'route');
    listener({
      title: content.title ?? null,
      body: content.body ?? null,
      route: isSafePushRoute(route) ? route : null,
      entityType: readDataField(data, 'entityType'),
      entityId: readDataField(data, 'entityId'),
    });
  });
  activeSubscriptions.push(subscription);
  return () => {
    subscription.remove();
  };
}

export function cleanupPushNotificationListeners(): void {
  while (activeSubscriptions.length > 0) {
    const subscription = activeSubscriptions.pop();
    subscription?.remove();
  }
}

/** Dev/test helper: invoke Edge Function to send a self-targeted test push. */
export async function requestTestPushNotification(): Promise<{ message: string }> {
  const { data, error } = await supabase.functions.invoke('send-push-notification', {
    body: { mode: 'test' },
  });

  if (error) {
    throw new PushNotificationServiceError(
      error.message || 'Unable to send a test push notification.',
    );
  }

  const message =
    data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
      ? data.message
      : 'Test push request accepted.';

  return { message };
}
