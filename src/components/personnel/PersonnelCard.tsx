import { Pressable, StyleSheet, View } from 'react-native';

import { AppCard, AppText } from '@/components/common';
import { PersonnelIdentity } from '@/components/personnel/PersonnelIdentity';
import { spacing } from '@/theme';
import type { PersonnelMember } from '@/types/personnel';
import {
  formatMembershipStatus,
  formatPersonnelRole,
  personnelDisplayName,
} from '@/types/personnel';

export type PersonnelCardProps = {
  member: PersonnelMember;
  onPress: () => void;
};

export function PersonnelCard({ member, onPress }: PersonnelCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open profile for ${personnelDisplayName(member)}`}
      onPress={onPress}
      style={({ pressed }) => [pressed ? styles.pressed : null]}>
      <AppCard raised style={styles.card}>
        <PersonnelIdentity
          agencyId={member.agency_id}
          userId={member.user_id}
          displayName={member.display_name}
          preferredName={member.preferred_name}
          firstName={member.first_name}
          lastName={member.last_name}
          email={member.email}
          avatarPath={member.avatar_path}
          rank={member.rank}
          title={member.title}
          unit={member.unit}
          role={member.role}
          size="md"
          showMeta
        />
        <View style={styles.meta}>
          <AppText variant="caption" color="textMuted">
            Status: {formatMembershipStatus(member.status)}
          </AppText>
          {member.shift_name ? (
            <AppText variant="caption" color="textMuted">
              Shift: {member.shift_name}
            </AppText>
          ) : null}
          {member.badge_number ? (
            <AppText variant="caption" color="textMuted">
              Badge: {member.badge_number}
            </AppText>
          ) : null}
          {member.callsign ? (
            <AppText variant="caption" color="textMuted">
              Callsign: {member.callsign}
            </AppText>
          ) : null}
          {member.work_phone ? (
            <AppText variant="caption" color="textMuted">
              Work: {member.work_phone}
            </AppText>
          ) : null}
          <AppText variant="caption" color="textSubtle">
            Role: {formatPersonnelRole(member.role)}
            {typeof member.group_count === 'number' ? ` · ${member.group_count} groups` : ''}
          </AppText>
        </View>
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.92,
  },
  card: {
    gap: spacing.sm,
  },
  meta: {
    gap: spacing.xxs,
  },
});
