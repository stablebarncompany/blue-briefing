import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';
import * as Device from 'expo-device';

import {
  AppButton,
  AppText,
  InlineFormMessage,
  SectionLabel,
} from '@/components/common';
import { useAgency } from '@/hooks/use-agency';
import {
  PushNotificationServiceError,
  getNotificationPermissionStatus,
  getNotificationPreferences,
  openDeviceNotificationSettings,
  registerPushDevice,
  requestTestPushNotification,
  updateNotificationPreferences,
} from '@/services/push-notifications';
import { colors, spacing } from '@/theme';
import type {
  NotificationPreferences,
  PushPermissionStatus,
  PushRegistrationResult,
} from '@/types/pushNotifications';

function PreferenceRow({
  label,
  description,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  disabled?: boolean;
  onValueChange: (next: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <AppText variant="body">{label}</AppText>
        {description ? (
          <AppText variant="caption" color="textSubtle">
            {description}
          </AppText>
        ) : null}
      </View>
      <Switch
        value={value}
        disabled={disabled}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: colors.primarySoft }}
        thumbColor={colors.text}
      />
    </View>
  );
}

function formatPermission(status: PushPermissionStatus): string {
  switch (status) {
    case 'granted':
      return 'Granted';
    case 'denied':
      return 'Denied';
    case 'undetermined':
      return 'Not requested';
    case 'unavailable':
      return 'Unavailable on this device';
    case 'unsupported':
    default:
      return 'Not supported on this platform';
  }
}

export function NotificationPreferencesPanel() {
  const { currentAgency } = useAgency();
  const agencyId = currentAgency?.id ?? null;

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PushPermissionStatus>('undetermined');
  const [registration, setRegistration] = useState<PushRegistrationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!agencyId) {
      setPrefs(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const [nextPrefs, permission] = await Promise.all([
        getNotificationPreferences(agencyId),
        getNotificationPermissionStatus(),
      ]);
      setPrefs(nextPrefs);
      setPermissionStatus(permission);
    } catch (error) {
      setErrorMessage(
        error instanceof PushNotificationServiceError
          ? error.message
          : 'Unable to load notification preferences.',
      );
    } finally {
      setLoading(false);
    }
  }, [agencyId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function patchPreference<K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) {
    if (!agencyId || !prefs || saving) {
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const next = await updateNotificationPreferences(agencyId, {
        [key]: value,
      } as never);
      setPrefs(next);
    } catch (error) {
      setErrorMessage(
        error instanceof PushNotificationServiceError
          ? error.message
          : 'Unable to save preference.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function onEnableDeviceNotifications() {
    if (!agencyId || saving) {
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const result = await registerPushDevice({ agencyId });
      setRegistration(result);
      setPermissionStatus(result.permissionStatus);
      setInfoMessage(result.message);
    } catch (error) {
      setErrorMessage(
        error instanceof PushNotificationServiceError
          ? error.message
          : 'Unable to register this device.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function onTestPush() {
    if (testing) {
      return;
    }
    setTesting(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const result = await requestTestPushNotification();
      setInfoMessage(result.message);
    } catch (error) {
      setErrorMessage(
        error instanceof PushNotificationServiceError
          ? error.message
          : 'Unable to send a test push.',
      );
    } finally {
      setTesting(false);
    }
  }

  if (!agencyId) {
    return (
      <View style={styles.panel}>
        <SectionLabel>Notifications & Alerts</SectionLabel>
        <AppText variant="caption" color="textSubtle">
          Select an agency to manage alert preferences.
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <SectionLabel>Notifications & Alerts</SectionLabel>
      <AppText variant="caption" color="textMuted">
        Choose which alerts may reach this device. Delivery is not guaranteed. Critical alerts may
        still be governed by agency policy in the future.
      </AppText>

      {loading ? (
        <AppText variant="caption" color="textSubtle">
          Loading preferences…
        </AppText>
      ) : null}

      {prefs ? (
        <View style={styles.group}>
          <PreferenceRow
            label="Critical briefings"
            value={prefs.critical_briefings}
            disabled={saving}
            onValueChange={(value) => void patchPreference('critical_briefings', value)}
          />
          <PreferenceRow
            label="Briefings requiring acknowledgement"
            value={prefs.acknowledgement_requests}
            disabled={saving}
            onValueChange={(value) => void patchPreference('acknowledgement_requests', value)}
          />
          <PreferenceRow
            label="Direct messages"
            value={prefs.direct_messages}
            disabled={saving}
            onValueChange={(value) => void patchPreference('direct_messages', value)}
          />
          <PreferenceRow
            label="Group mentions / @All"
            value={prefs.group_mentions}
            disabled={saving}
            onValueChange={(value) => void patchPreference('group_mentions', value)}
          />
          <PreferenceRow
            label="General group activity"
            description="Off by default to reduce noise."
            value={prefs.group_activity}
            disabled={saving}
            onValueChange={(value) => void patchPreference('group_activity', value)}
          />
          <PreferenceRow
            label="Membership and access changes"
            value={prefs.membership_changes}
            disabled={saving}
            onValueChange={(value) => void patchPreference('membership_changes', value)}
          />
          <PreferenceRow
            label="Quiet hours"
            description="When enabled, non-critical pushes may be suppressed during the configured window (server-side)."
            value={prefs.quiet_hours_enabled}
            disabled={saving}
            onValueChange={(value) => void patchPreference('quiet_hours_enabled', value)}
          />
        </View>
      ) : null}

      <View style={styles.deviceBlock}>
        <AppText variant="label" color="textSubtle">
          Device notifications
        </AppText>
        <AppText variant="caption" color="textMuted">
          Permission: {formatPermission(permissionStatus)}
        </AppText>
        <AppText variant="caption" color="textMuted">
          Physical device: {Device.isDevice ? 'Yes' : 'No'}
          {Platform.OS === 'web' ? ' · Web uses in-app notifications only' : ''}
        </AppText>
        {registration?.tokenFingerprint ? (
          <AppText variant="caption" color="textSubtle">
            Token fingerprint: {registration.tokenFingerprint}
          </AppText>
        ) : null}

        <AppButton
          label="Enable device notifications"
          onPress={() => void onEnableDeviceNotifications()}
          loading={saving}
          disabled={saving || Platform.OS === 'web'}
        />

        {permissionStatus === 'denied' ? (
          <AppButton
            label="Open device settings"
            variant="ghost"
            onPress={() => void openDeviceNotificationSettings()}
          />
        ) : null}
      </View>

      {__DEV__ ? (
        <View style={styles.deviceBlock}>
          <AppText variant="label" color="textSubtle">
            Development test
          </AppText>
          <AppText variant="caption" color="textSubtle">
            Requires a physical device, a development/production build, deployed Edge Function, and
            EAS project credentials. Full push tokens are never shown.
          </AppText>
          <AppButton
            label="Send test push to me"
            variant="secondary"
            loading={testing}
            disabled={testing || Platform.OS === 'web' || !Device.isDevice}
            onPress={() => void onTestPush()}
          />
        </View>
      ) : null}

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}
      {infoMessage ? <InlineFormMessage message={infoMessage} tone="info" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
  },
  group: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: spacing.xxs,
  },
  deviceBlock: {
    gap: spacing.sm,
  },
});
