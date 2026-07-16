import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common';
import { colors, radius, spacing } from '@/theme';
import {
  NOTIFICATION_TYPES,
  type NotificationType,
  formatNotificationType,
} from '@/types/notifications';

export type NotificationFiltersBarProps = {
  unreadOnly: boolean;
  type: NotificationType | 'all';
  onUnreadOnlyChange: (unreadOnly: boolean) => void;
  onTypeChange: (type: NotificationType | 'all') => void;
};

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : null]}>
      <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function NotificationFiltersBar({
  unreadOnly,
  type,
  onUnreadOnlyChange,
  onTypeChange,
}: NotificationFiltersBarProps) {
  return (
    <View style={styles.wrap}>
      <AppText variant="label" color="textSubtle">
        Status
      </AppText>
      <View style={styles.chipRow}>
        <Chip label="All" selected={!unreadOnly} onPress={() => onUnreadOnlyChange(false)} />
        <Chip label="Unread" selected={unreadOnly} onPress={() => onUnreadOnlyChange(true)} />
      </View>

      <AppText variant="label" color="textSubtle">
        Type
      </AppText>
      <View style={styles.chipRow}>
        <Chip label="All types" selected={type === 'all'} onPress={() => onTypeChange('all')} />
        {NOTIFICATION_TYPES.map((item) => (
          <Chip
            key={item}
            label={formatNotificationType(item)}
            selected={type === item}
            onPress={() => onTypeChange(item)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
});
