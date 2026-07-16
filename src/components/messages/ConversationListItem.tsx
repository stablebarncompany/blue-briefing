import { Pressable, StyleSheet, View } from 'react-native';

import { AppCard, AppText } from '@/components/common';
import { colors, spacing } from '@/theme';
import {
  formatMessageAuthorName,
  formatMessageDateTime,
  previewMessageBody,
  type ConversationSummary,
} from '@/types/messages';

export type ConversationListItemProps = {
  summary: ConversationSummary;
  selected?: boolean;
  onPress?: () => void;
};

export function ConversationListItem({
  summary,
  selected,
  onPress,
}: ConversationListItemProps) {
  const subtitle = [summary.otherMember.role, summary.otherMember.unit, summary.otherMember.title]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${formatMessageAuthorName(summary.otherMember)}`}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [pressed ? styles.pressed : null]}>
      <AppCard raised={selected} style={[styles.card, selected ? styles.selected : null]}>
        <View style={styles.row}>
          <AppText variant="title" style={styles.name}>
            {formatMessageAuthorName(summary.otherMember)}
          </AppText>
          <AppText variant="caption" color="textSubtle">
            {summary.conversation.last_message_at
              ? formatMessageDateTime(summary.conversation.last_message_at)
              : formatMessageDateTime(summary.conversation.created_at)}
          </AppText>
        </View>
        {subtitle ? (
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
        <AppText variant="body" color="textMuted" numberOfLines={2}>
          {previewMessageBody(summary.lastMessage)}
        </AppText>
        <AppText variant="caption" color="textSubtle">
          {[
            summary.membership.is_muted ? 'Muted' : null,
            summary.membership.is_archived ? 'Archived' : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'Active'}
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
