import { Pressable, StyleSheet, View } from 'react-native';

import { AppCard, AppText } from '@/components/common';
import { colors, spacing } from '@/theme';
import type { GroupWithMeta } from '@/types/groups';

export type GroupListItemProps = {
  group: GroupWithMeta;
  selected?: boolean;
  onPress?: () => void;
};

export function GroupListItem({ group, selected, onPress }: GroupListItemProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open group ${group.name}`}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [pressed ? styles.pressed : null]}>
      <AppCard
        raised={selected}
        style={[styles.card, selected ? styles.selected : null]}>
        <View style={styles.row}>
          <AppText variant="title" style={styles.name}>
            {group.name}
          </AppText>
          {group.is_archived ? (
            <AppText variant="caption" color="warning">
              Archived
            </AppText>
          ) : null}
        </View>
        {group.description ? (
          <AppText variant="caption" color="textMuted" numberOfLines={2}>
            {group.description}
          </AppText>
        ) : null}
        <AppText variant="caption" color="textSubtle">
          {group.member_count} member{group.member_count === 1 ? '' : 's'}
          {group.is_private ? ' · Invite only' : ''}
          {group.is_moderator ? ' · Moderator' : ''}
        </AppText>
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
  selected: {
    borderColor: colors.primary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
  },
});
