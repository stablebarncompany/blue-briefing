import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common';
import { PersonnelIdentity } from '@/components/personnel';
import { colors, radius, spacing } from '@/theme';
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
  const status = [
    summary.membership.is_muted ? 'Muted' : null,
    summary.membership.is_archived ? 'Archived' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open conversation with ${formatMessageAuthorName(member)}`}
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        selected ? styles.selected : null,
        pressed ? styles.pressed : null,
      ]}>
      {selected ? <View style={styles.selectedBar} accessibilityElementsHidden /> : null}
      <View style={styles.body}>
        <View style={styles.topRow}>
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
          <AppText variant="caption" color="textSubtle" style={styles.time}>
            {summary.conversation.last_message_at
              ? formatMessageDateTime(summary.conversation.last_message_at)
              : formatMessageDateTime(summary.conversation.created_at)}
          </AppText>
        </View>
        <AppText variant="caption" color="textMuted" numberOfLines={1} style={styles.preview}>
          {previewMessageBody(summary.lastMessage)}
        </AppText>
        {status ? (
          <AppText variant="caption" color="textSubtle">
            {status}
          </AppText>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'relative',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  selected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  pressed: {
    opacity: 0.92,
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
  body: {
    gap: spacing.xs,
    paddingLeft: spacing.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  time: {
    marginTop: spacing.xxs,
  },
  preview: {
    paddingLeft: 40,
  },
});
