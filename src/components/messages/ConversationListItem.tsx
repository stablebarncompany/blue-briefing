import { Pressable, StyleSheet, View } from 'react-native';

import { AppCard, AppText } from '@/components/common';
import { PersonnelIdentity } from '@/components/personnel';
import { colors, spacing } from '@/theme';
import { isAgencyRole, type AgencyRole } from '@/types/agency';
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

function asAgencyRole(value: string | null | undefined): AgencyRole | null {
  return value && isAgencyRole(value) ? value : null;
}

export function ConversationListItem({
  summary,
  selected,
  onPress,
}: ConversationListItemProps) {
  const member = summary.otherMember;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${formatMessageAuthorName(member)}`}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [pressed ? styles.pressed : null]}>
      <AppCard raised={selected} style={[styles.card, selected ? styles.selected : null]}>
        <View style={styles.row}>
          <PersonnelIdentity
            agencyId={summary.conversation.agency_id}
            userId={member.id}
            displayName={member.display_name}
            firstName={member.first_name}
            lastName={member.last_name}
            avatarPath={member.avatar_path}
            rank={member.rank}
            title={member.title}
            unit={member.unit}
            role={asAgencyRole(member.role)}
            size="sm"
            showMeta
          />
          <AppText variant="caption" color="textSubtle">
            {summary.conversation.last_message_at
              ? formatMessageDateTime(summary.conversation.last_message_at)
              : formatMessageDateTime(summary.conversation.created_at)}
          </AppText>
        </View>
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
});
