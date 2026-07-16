import { Pressable, StyleSheet, View } from 'react-native';

import { AppCard, AppText } from '@/components/common';
import { colors, spacing } from '@/theme';
import type { AppNotification } from '@/types/notifications';
import { formatNotificationType } from '@/types/notifications';

export type NotificationCardProps = {
  notification: AppNotification;
  onPress: () => void;
};

export function NotificationCard({ notification, onPress }: NotificationCardProps) {
  const unread = !notification.is_read;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${unread ? 'Unread' : 'Read'} notification: ${notification.title}`}
      onPress={onPress}
      style={({ pressed }) => [pressed ? styles.pressed : null]}>
      <AppCard raised style={[styles.card, unread ? styles.unreadCard : null]}>
        <View style={styles.header}>
          <AppText variant="caption" color={unread ? 'primary' : 'textSubtle'}>
            {formatNotificationType(notification.type)}
          </AppText>
          <AppText variant="caption" color="textSubtle">
            {new Date(notification.created_at).toLocaleString()}
          </AppText>
        </View>
        <AppText variant="title" color={unread ? 'text' : 'textMuted'}>
          {notification.title}
        </AppText>
        {notification.body ? (
          <AppText variant="body" color="textMuted" numberOfLines={3}>
            {notification.body}
          </AppText>
        ) : null}
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
    borderColor: colors.border,
  },
  unreadCard: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
});
