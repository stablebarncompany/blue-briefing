import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';

import {
  AppButton,
  AppText,
  EmptyState,
  FormField,
  InlineFormMessage,
} from '@/components/common';
import { PersonnelIdentity } from '@/components/personnel';
import { supabase } from '@/services/supabase';
import {
  MessageServiceError,
  archiveConversation,
  deleteMessage,
  getConversation,
  listMessages,
  muteConversation,
  sendMessage,
  unarchiveConversation,
  unmuteConversation,
  updateMessage,
  validateMessageBody,
} from '@/services/messages';
import { colors, layout, radius, spacing } from '@/theme';
import type { AgencyRole } from '@/types/agency';
import { isAgencyRole } from '@/types/agency';
import {
  canEditDirectMessage,
  formatMessageDateTime,
  type ConversationSummary,
  type DirectMessageWithMeta,
  type MessageAuthor,
} from '@/types/messages';

function authorRole(author: MessageAuthor | null | undefined): AgencyRole | null {
  const role = author?.role;
  return role && isAgencyRole(role) ? role : null;
}

export type ConversationThreadProps = {
  agencyId: string;
  conversationId: string;
  currentUserId: string;
  onMembershipChanged?: () => void;
};

export function ConversationThread({
  agencyId,
  conversationId,
  currentUserId,
  onMembershipChanged,
}: ConversationThreadProps) {
  const listRef = useRef<FlatList<DirectMessageWithMeta>>(null);
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [messages, setMessages] = useState<DirectMessageWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [nextSummary, nextMessages] = await Promise.all([
        getConversation({
          agencyId,
          conversationId,
          currentUserId,
        }),
        listMessages({ agencyId, conversationId }),
      ]);
      setSummary(nextSummary);
      setMessages(nextMessages);
    } catch (error) {
      setErrorMessage(
        error instanceof MessageServiceError ? error.message : 'Unable to load conversation.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [agencyId, conversationId, currentUserId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`dm:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'direct_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void listMessages({ agencyId, conversationId })
            .then((rows) => {
              setMessages(rows);
            })
            .catch(() => {
              // Keep current thread; user can refresh via resend/focus.
            });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [agencyId, conversationId]);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(timer);
  }, [messages.length, conversationId]);

  async function onSend() {
    if (sending) {
      return;
    }
    const validationError = validateMessageBody(body);
    if (validationError) {
      setBodyError(validationError);
      return;
    }
    setSending(true);
    setBodyError(null);
    setErrorMessage(null);
    const outgoing = body.trim();
    setBody('');
    try {
      const created = await sendMessage({
        agencyId,
        conversationId,
        senderId: currentUserId,
        input: { body: outgoing },
      });
      setMessages((current) => {
        if (current.some((message) => message.id === created.id)) {
          return current;
        }
        return [
          ...current,
          {
            ...created,
            sender: summary?.otherMember.id === created.sender_id ? summary.otherMember : {
              id: currentUserId,
              display_name: null,
              first_name: null,
              last_name: null,
            },
          },
        ];
      });
      onMembershipChanged?.();
    } catch (error) {
      setBody(outgoing);
      setErrorMessage(
        error instanceof MessageServiceError ? error.message : 'Unable to send message.',
      );
    } finally {
      setSending(false);
    }
  }

  async function runPref(
    key: string,
    action: () => Promise<unknown>,
  ) {
    if (busyAction) {
      return;
    }
    setBusyAction(key);
    setErrorMessage(null);
    try {
      await action();
      await load();
      onMembershipChanged?.();
    } catch (error) {
      setErrorMessage(
        error instanceof MessageServiceError ? error.message : 'Unable to update conversation.',
      );
    } finally {
      setBusyAction(null);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
        <AppText variant="caption" color="textMuted">
          Loading conversation…
        </AppText>
      </View>
    );
  }

  if (!summary) {
    return (
      <EmptyState
        title="Conversation unavailable"
        description={errorMessage ?? 'You may not be a member of this conversation.'}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
      <View style={styles.header}>
        <PersonnelIdentity
          agencyId={agencyId}
          userId={summary.otherMember.id}
          displayName={summary.otherMember.display_name}
          firstName={summary.otherMember.first_name}
          lastName={summary.otherMember.last_name}
          avatarPath={summary.otherMember.avatar_path}
          rank={summary.otherMember.rank}
          title={summary.otherMember.title}
          unit={summary.otherMember.unit}
          role={authorRole(summary.otherMember)}
          size="md"
          showMeta
        />
        <View style={styles.headerActions}>
          <AppButton
            label={summary.membership.is_muted ? 'Unmute' : 'Mute'}
            variant="ghost"
            disabled={!!busyAction}
            onPress={() =>
              void runPref('mute', () =>
                summary.membership.is_muted
                  ? unmuteConversation({
                      agencyId,
                      conversationId,
                      userId: currentUserId,
                    })
                  : muteConversation({
                      agencyId,
                      conversationId,
                      userId: currentUserId,
                    }),
              )
            }
          />
          <AppButton
            label={summary.membership.is_archived ? 'Unarchive' : 'Archive'}
            variant="ghost"
            disabled={!!busyAction}
            onPress={() =>
              void runPref('archive', () =>
                summary.membership.is_archived
                  ? unarchiveConversation({
                      agencyId,
                      conversationId,
                      userId: currentUserId,
                    })
                  : archiveConversation({
                      agencyId,
                      conversationId,
                      userId: currentUserId,
                    }),
              )
            }
          />
        </View>
        {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}
      </View>

      <FlatList
        ref={listRef}
        style={styles.list}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <EmptyState
            title="No messages yet"
            description="Send the first secure agency direct message."
          />
        }
        renderItem={({ item }) => {
          const mine = item.sender_id === currentUserId;
          const editable = canEditDirectMessage({
            senderId: item.sender_id,
            currentUserId,
            createdAt: item.created_at,
            deletedAt: item.deleted_at,
          });
          const isEditing = editingId === item.id;

          return (
            <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
              <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                {!mine ? (
                  <View style={styles.senderIdentity}>
                    <PersonnelIdentity
                      agencyId={agencyId}
                      userId={item.sender?.id}
                      displayName={item.sender?.display_name}
                      firstName={item.sender?.first_name}
                      lastName={item.sender?.last_name}
                      avatarPath={item.sender?.avatar_path}
                      rank={item.sender?.rank}
                      title={item.sender?.title}
                      unit={item.sender?.unit}
                      role={authorRole(item.sender)}
                      size="sm"
                      showMeta
                    />
                  </View>
                ) : null}
                {item.deleted_at ? (
                  <AppText variant="body" color="textSubtle">
                    Message deleted
                  </AppText>
                ) : isEditing ? (
                  <View style={styles.editBlock}>
                    <FormField
                      label="Edit message"
                      value={editBody}
                      onChangeText={setEditBody}
                      multiline
                      autoCapitalize="sentences"
                      style={styles.editInput}
                    />
                    <View style={styles.editActions}>
                      <AppButton
                        label="Save"
                        variant="secondary"
                        disabled={!!busyAction}
                        onPress={() =>
                          void runPref(`edit-${item.id}`, async () => {
                            await updateMessage({
                              agencyId,
                              messageId: item.id,
                              body: editBody,
                            });
                            setEditingId(null);
                            setEditBody('');
                          })
                        }
                      />
                      <AppButton
                        label="Cancel"
                        variant="ghost"
                        onPress={() => {
                          setEditingId(null);
                          setEditBody('');
                        }}
                      />
                    </View>
                  </View>
                ) : (
                  <AppText variant="body">{item.body}</AppText>
                )}
                <AppText variant="caption" color="textSubtle">
                  {formatMessageDateTime(item.created_at)}
                </AppText>
                {mine && !item.deleted_at ? (
                  <View style={styles.messageActions}>
                    {editable ? (
                      <AppButton
                        label="Edit"
                        variant="ghost"
                        style={styles.tinyButton}
                        onPress={() => {
                          setEditingId(item.id);
                          setEditBody(item.body);
                        }}
                      />
                    ) : null}
                    <AppButton
                      label="Delete"
                      variant="ghost"
                      style={styles.tinyButton}
                      disabled={!!busyAction}
                      onPress={() =>
                        void runPref(`del-${item.id}`, async () => {
                          await deleteMessage({ agencyId, messageId: item.id });
                        })
                      }
                    />
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <View style={styles.composer}>
        <FormField
          label="Message"
          value={body}
          onChangeText={setBody}
          placeholder="Write a direct message…"
          autoCapitalize="sentences"
          autoCorrect
          multiline
          textAlignVertical="top"
          style={styles.composerInput}
          editable={!sending}
          error={bodyError}
        />
        <AppButton
          label="Send"
          onPress={() => void onSend()}
          loading={sending}
          disabled={sending || !!busyAction}
          style={styles.sendButton}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    minHeight: 0,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing['3xl'],
  },
  header: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    flexGrow: 1,
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  bubbleRow: {
    width: '100%',
  },
  bubbleRowMine: {
    alignItems: 'flex-end',
  },
  bubbleRowTheirs: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '88%',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  senderIdentity: {
    marginBottom: spacing.xxs,
  },
  bubbleMine: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  messageActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tinyButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  editBlock: {
    gap: spacing.sm,
    minWidth: 220,
  },
  editInput: {
    minHeight: 72,
    paddingTop: spacing.md,
  },
  editActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  composer: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    paddingBottom: layout.bottomNavHeight + spacing.md,
  },
  composerInput: {
    minHeight: 88,
    paddingTop: spacing.md,
  },
  sendButton: {
    alignSelf: 'flex-start',
  },
});
