import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common';
import { colors, radius, spacing } from '@/theme';
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
      style={({ pressed }) => [
        styles.row,
        selected ? styles.selected : null,
        pressed ? styles.pressed : null,
      ]}>
      <View style={styles.text}>
        <View style={styles.titleRow}>
          <AppText variant="body" style={styles.name} numberOfLines={1}>
            {group.name}
          </AppText>
          {group.is_archived ? (
            <AppText variant="caption" color="warning">
              Archived
            </AppText>
          ) : null}
        </View>
        {group.description ? (
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {group.description}
          </AppText>
        ) : null}
        <AppText variant="caption" color="textSubtle">
          {group.member_count} member{group.member_count === 1 ? '' : 's'}
          {group.is_private ? ' · Invite only' : ''}
          {group.is_moderator ? ' · Moderator' : ''}
        </AppText>
      </View>
      {selected ? <View style={styles.selectedBar} accessibilityElementsHidden /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'relative',
    gap: spacing.xxs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  pressed: {
    opacity: 0.92,
  },
  text: {
    gap: spacing.xxs,
    paddingRight: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontWeight: '600',
  },
  selectedBar: {
    position: 'absolute',
    left: 0,
    top: spacing.sm,
    bottom: spacing.sm,
    width: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
  },
});
