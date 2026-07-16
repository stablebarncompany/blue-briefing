import { Pressable, StyleSheet, View } from 'react-native';

import { AppCard, AppText } from '@/components/common';
import { colors, spacing } from '@/theme';
import type { PersonnelMember } from '@/types/personnel';
import {
  formatMembershipStatus,
  formatPersonnelRole,
  personnelDisplayName,
} from '@/types/personnel';

export type PersonnelCardProps = {
  member: PersonnelMember;
  onPress?: () => void;
};

export function PersonnelCard({ member, onPress }: PersonnelCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [pressed && onPress ? styles.pressed : null]}>
      <AppCard raised style={styles.card}>
        <View style={styles.header}>
          <AppText variant="title" style={styles.name}>
            {personnelDisplayName(member)}
          </AppText>
          <AppText variant="caption" color="textMuted">
            {formatMembershipStatus(member.status)}
          </AppText>
        </View>

        {member.email ? (
          <AppText variant="caption" color="textMuted">
            {member.email}
          </AppText>
        ) : null}

        <AppText variant="body" color="textMuted">
          Role: {formatPersonnelRole(member.role)}
        </AppText>
        {member.title ? (
          <AppText variant="caption" color="textMuted">
            Title: {member.title}
          </AppText>
        ) : null}
        {member.unit ? (
          <AppText variant="caption" color="textMuted">
            Unit: {member.unit}
          </AppText>
        ) : null}
        {member.badge_number ? (
          <AppText variant="caption" color="textSubtle">
            Badge {member.badge_number}
          </AppText>
        ) : null}

        <AppText variant="caption" color="textSubtle">
          Joined{' '}
          {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : '—'}
          {typeof member.group_count === 'number' ? ` · ${member.group_count} groups` : ''}
        </AppText>
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.9,
  },
  card: {
    gap: spacing.sm,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  name: {
    flex: 1,
  },
});
