import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppText, FormField, InlineFormMessage } from '@/components/common';
import { colors, radius, spacing } from '@/theme';
import {
  formatGroupAuthorName,
  formatGroupDateTime,
  type GroupPostReplyWithMeta,
  type GroupPostWithMeta,
} from '@/types/groups';

export type GroupPostCardProps = {
  post: GroupPostWithMeta;
  replies: GroupPostReplyWithMeta[];
  repliesLoading?: boolean;
  canPin?: boolean;
  canDeletePost?: boolean;
  canDeleteReply?: (reply: GroupPostReplyWithMeta) => boolean;
  busy?: boolean;
  onToggleReplies: () => void;
  onReply: (body: string) => Promise<void>;
  onPin?: () => void;
  onDeletePost?: () => void;
  onDeleteReply?: (replyId: string) => void;
};

export function GroupPostCard({
  post,
  replies,
  repliesLoading,
  canPin,
  canDeletePost,
  canDeleteReply,
  busy,
  onToggleReplies,
  onReply,
  onPin,
  onDeletePost,
  onDeleteReply,
}: GroupPostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [submittingReply, setSubmittingReply] = useState(false);

  async function submitReply() {
    if (submittingReply || busy) {
      return;
    }
    const body = replyBody.trim();
    if (!body) {
      setReplyError('Reply body is required.');
      return;
    }
    setSubmittingReply(true);
    setReplyError(null);
    try {
      await onReply(body);
      setReplyBody('');
      setExpanded(true);
    } catch (error) {
      setReplyError(error instanceof Error ? error.message : 'Unable to post reply.');
    } finally {
      setSubmittingReply(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.metaRow}>
        {post.is_pinned ? (
          <AppText variant="caption" color="warning">
            Pinned
          </AppText>
        ) : null}
        <AppText variant="caption" color="textSubtle" style={styles.date}>
          {formatGroupDateTime(post.created_at)}
        </AppText>
      </View>
      <AppText variant="label" color="textMuted">
        {formatGroupAuthorName(post.author)}
      </AppText>
      <AppText variant="body">{post.body}</AppText>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={expanded ? 'Hide replies' : 'Show replies'}
          onPress={() => {
            const next = !expanded;
            setExpanded(next);
            if (next) {
              onToggleReplies();
            }
          }}>
          <AppText variant="caption" color="primary">
            {post.reply_count} repl{post.reply_count === 1 ? 'y' : 'ies'}
            {expanded ? ' · Hide' : ' · View'}
          </AppText>
        </Pressable>
        {canPin && onPin ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={post.is_pinned ? 'Unpin post' : 'Pin post'}
            disabled={busy}
            onPress={onPin}>
            <AppText variant="caption" color="textMuted">
              {post.is_pinned ? 'Unpin' : 'Pin'}
            </AppText>
          </Pressable>
        ) : null}
        {canDeletePost && onDeletePost ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete post"
            disabled={busy}
            onPress={onDeletePost}>
            <AppText variant="caption" color="danger">
              Delete
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {expanded ? (
        <View style={styles.replies}>
          {repliesLoading ? (
            <AppText variant="caption" color="textSubtle">
              Loading replies…
            </AppText>
          ) : null}
          {replies.map((reply) => (
            <View key={reply.id} style={styles.reply}>
              <AppText variant="caption" color="textMuted">
                {formatGroupAuthorName(reply.author)} · {formatGroupDateTime(reply.created_at)}
              </AppText>
              <AppText variant="body">{reply.body}</AppText>
              {canDeleteReply?.(reply) && onDeleteReply ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Delete reply"
                  disabled={busy}
                  onPress={() => onDeleteReply(reply.id)}>
                  <AppText variant="caption" color="danger">
                    Delete reply
                  </AppText>
                </Pressable>
              ) : null}
            </View>
          ))}

          <FormField
            label="Reply"
            value={replyBody}
            onChangeText={setReplyBody}
            placeholder="Write a reply…"
            autoCapitalize="sentences"
            autoCorrect
            multiline
            textAlignVertical="top"
            style={styles.replyInput}
            editable={!submittingReply && !busy}
          />
          {replyError ? <InlineFormMessage message={replyError} /> : null}
          <AppButton
            label="Post reply"
            variant="secondary"
            loading={submittingReply}
            disabled={submittingReply || busy}
            onPress={() => void submitReply()}
            style={styles.replyButton}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  date: {
    marginLeft: 'auto',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  replies: {
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  reply: {
    gap: spacing.xs,
    paddingLeft: spacing.md,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  replyInput: {
    minHeight: 88,
    paddingTop: spacing.md,
  },
  replyButton: {
    alignSelf: 'flex-start',
  },
});
