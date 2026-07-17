import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common';
import { createSignedPersonnelAvatarUrl } from '@/services/personnel-profiles';
import { colors, spacing } from '@/theme';
import { formatPersonnelRole } from '@/types/personnel';
import type { AgencyRole } from '@/types/agency';
import { personnelProfileDisplayName } from '@/types/personnelProfiles';

export type PersonnelIdentityProps = {
  agencyId: string | null | undefined;
  userId?: string | null;
  displayName?: string | null;
  preferredName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  avatarPath?: string | null;
  rank?: string | null;
  title?: string | null;
  unit?: string | null;
  role?: AgencyRole | null;
  size?: 'sm' | 'md' | 'lg';
  showMeta?: boolean;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export function PersonnelIdentity({
  agencyId,
  displayName,
  preferredName,
  firstName,
  lastName,
  email,
  avatarPath,
  rank,
  title,
  unit,
  role,
  size = 'md',
  showMeta = true,
}: PersonnelIdentityProps) {
  const [loaded, setLoaded] = useState<{ path: string; url: string } | null>(null);
  const name = personnelProfileDisplayName({
    preferred_name: preferredName,
    display_name: displayName,
    first_name: firstName,
    last_name: lastName,
    email,
  });
  const dimension = size === 'lg' ? 72 : size === 'sm' ? 32 : 44;
  const assignment = [rank || title, unit].filter(Boolean).join(' · ');
  const canResolve = !!agencyId && !!avatarPath;
  const avatarUrl =
    canResolve && loaded?.path === avatarPath ? loaded.url : null;

  useEffect(() => {
    if (!agencyId || !avatarPath) {
      return;
    }
    let cancelled = false;
    void createSignedPersonnelAvatarUrl({ agencyId, storagePath: avatarPath })
      .then((url) => {
        if (!cancelled) {
          setLoaded({ path: avatarPath, url });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agencyId, avatarPath]);

  return (
    <View style={styles.row}>
      <View
        style={[
          styles.avatar,
          { width: dimension, height: dimension, borderRadius: dimension / 2 },
        ]}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.image} accessibilityIgnoresInvertColors />
        ) : (
          <AppText variant={size === 'lg' ? 'title' : 'caption'} color="textMuted">
            {initials(name)}
          </AppText>
        )}
      </View>
      <View style={styles.text}>
        <AppText variant={size === 'lg' ? 'title' : 'body'}>{name}</AppText>
        {showMeta ? (
          <>
            {assignment ? (
              <AppText variant="caption" color="textMuted">
                {assignment}
              </AppText>
            ) : null}
            {role ? (
              <AppText variant="caption" color="textSubtle">
                {formatPersonnelRole(role)}
              </AppText>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
  },
});
