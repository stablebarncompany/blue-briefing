import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';

import { GroupPostCard } from '@/components/groups/GroupPostCard';
import {
  AppButton,
  AppText,
  EmptyState,
  FormField,
  InlineFormMessage,
} from '@/components/common';
import { PersonnelIdentity } from '@/components/personnel';
import {
  GroupServiceError,
  archiveGroup,
  createGroupPost,
  createGroupPostReply,
  deleteGroupPost,
  deleteGroupPostReply,
  getGroup,
  listGroupMembers,
  listGroupPostReplies,
  listGroupPosts,
  removeGroupMember,
  setGroupMemberModerator,
  setGroupPostPinned,
  addGroupMember,
} from '@/services/groups';
import { listActiveAgencyPersonnel, type AgencyPersonnel } from '@/services/agency';
import { colors, layout, radius, spacing } from '@/theme';
import type { AgencyRole } from '@/types/agency';
import {
  canArchiveOrDeleteGroups,
  canDeleteGroupPost,
  canManageGroupMembers,
  canModerateGroupContent,
  type GroupMemberWithProfile,
  type GroupPostReplyWithMeta,
  type GroupPostWithMeta,
  type GroupWithMeta,
} from '@/types/groups';

export type GroupDetailPanelProps = {
  agencyId: string;
  groupId: string;
  currentUserId: string;
  role: AgencyRole | null | undefined;
  onArchived?: () => void;
};

export function GroupDetailPanel({
  agencyId,
  groupId,
  currentUserId,
  role,
  onArchived,
}: GroupDetailPanelProps) {
  const [group, setGroup] = useState<GroupWithMeta | null>(null);
  const [posts, setPosts] = useState<GroupPostWithMeta[]>([]);
  const [members, setMembers] = useState<GroupMemberWithProfile[]>([]);
  const [personnel, setPersonnel] = useState<AgencyPersonnel[]>([]);
  const [repliesByPost, setRepliesByPost] = useState<Record<string, GroupPostReplyWithMeta[]>>({});
  const [loadingReplies, setLoadingReplies] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [postBody, setPostBody] = useState('');
  const [postError, setPostError] = useState<string | null>(null);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const [memberToAdd, setMemberToAdd] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);
      try {
        const [nextGroup, nextPosts, nextMembers, nextPersonnel] = await Promise.all([
          getGroup({ agencyId, groupId, currentUserId }),
          listGroupPosts({ agencyId, groupId }),
          listGroupMembers({ agencyId, groupId }),
          listActiveAgencyPersonnel(agencyId),
        ]);
        setGroup(nextGroup);
        setPosts(nextPosts);
        setMembers(nextMembers);
        setPersonnel(nextPersonnel);
      } catch (error) {
        setErrorMessage(
          error instanceof GroupServiceError ? error.message : 'Unable to load group.',
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [agencyId, currentUserId, groupId],
  );

  useEffect(() => {
    queueMicrotask(() => {
      void load('initial');
    });
  }, [load]);

  const canManage = canManageGroupMembers({
    role,
    isModerator: group?.is_moderator ?? false,
  });
  const canModerate = canModerateGroupContent({
    role,
    isModerator: group?.is_moderator ?? false,
  });
  const canArchive = canArchiveOrDeleteGroups(role);

  async function loadReplies(postId: string) {
    setLoadingReplies((current) => ({ ...current, [postId]: true }));
    try {
      const replies = await listGroupPostReplies({ agencyId, postId });
      setRepliesByPost((current) => ({ ...current, [postId]: replies }));
    } catch (error) {
      setErrorMessage(
        error instanceof GroupServiceError ? error.message : 'Unable to load replies.',
      );
    } finally {
      setLoadingReplies((current) => ({ ...current, [postId]: false }));
    }
  }

  async function onCreatePost() {
    if (submittingPost) {
      return;
    }
    setSubmittingPost(true);
    setPostError(null);
    try {
      await createGroupPost({
        agencyId,
        groupId,
        authorId: currentUserId,
        input: { body: postBody },
      });
      setPostBody('');
      await load('refresh');
    } catch (error) {
      setPostError(error instanceof GroupServiceError ? error.message : 'Unable to create post.');
    } finally {
      setSubmittingPost(false);
    }
  }

  async function runBusy(key: string, action: () => Promise<void>) {
    if (busyAction) {
      return;
    }
    setBusyAction(key);
    setErrorMessage(null);
    try {
      await action();
      await load('refresh');
    } catch (error) {
      setErrorMessage(error instanceof GroupServiceError ? error.message : 'Action failed.');
    } finally {
      setBusyAction(null);
    }
  }

  function confirmArchive() {
    const run = () =>
      void runBusy('archive', async () => {
        await archiveGroup({ agencyId, groupId, archived: true });
        onArchived?.();
      });

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm('Archive this group?')) {
        run();
      }
      return;
    }
    Alert.alert('Archive group', 'Archive this group for the agency?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Archive', style: 'destructive', onPress: run },
    ]);
  }

  const memberIds = new Set(members.map((member) => member.user_id));
  const addable = personnel.filter((person) => !memberIds.has(person.user_id));

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.primary} />
        <AppText variant="caption" color="textMuted">
          Loading group…
        </AppText>
      </View>
    );
  }

  if (!group) {
    return (
      <EmptyState
        title="Group unavailable"
        description={errorMessage ?? 'You may not be a member of this group.'}
      />
    );
  }

  const header = (
    <View style={styles.header}>
      <AppText variant="display">{group.name}</AppText>
      {group.description ? (
        <AppText variant="body" color="textMuted">
          {group.description}
        </AppText>
      ) : null}
      <AppText variant="caption" color="textSubtle">
        {group.member_count} members
        {group.is_private ? ' · Invite only' : ''}
        {group.is_archived ? ' · Archived' : ''}
      </AppText>

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}

      <View style={styles.headerActions}>
        <AppButton
          label={showMembers ? 'Hide members' : 'Members'}
          variant="ghost"
          onPress={() => setShowMembers((value) => !value)}
        />
        {canArchive && !group.is_archived ? (
          <AppButton
            label="Archive"
            variant="ghost"
            disabled={!!busyAction}
            onPress={confirmArchive}
          />
        ) : null}
      </View>

      {showMembers ? (
        <View style={styles.membersPanel}>
          <AppText variant="title">Members</AppText>
          {members.map((member) => (
            <View key={member.id} style={styles.memberRow}>
              <View style={styles.memberMeta}>
                <PersonnelIdentity
                  agencyId={agencyId}
                  userId={member.user_id}
                  displayName={member.profile?.display_name}
                  preferredName={member.profile?.preferred_name}
                  firstName={member.profile?.first_name}
                  lastName={member.profile?.last_name}
                  avatarPath={member.profile?.avatar_path}
                  rank={member.profile?.rank}
                  title={member.profile?.title}
                  unit={member.profile?.unit}
                  role={member.profile?.role}
                  size="sm"
                  showMeta
                />
                <AppText variant="caption" color="textSubtle">
                  {member.is_moderator ? 'Moderator' : 'Member'}
                </AppText>
              </View>
              {canManage && member.user_id !== currentUserId ? (
                <View style={styles.memberActions}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      member.is_moderator ? 'Remove moderator' : 'Make moderator'
                    }
                    disabled={!!busyAction}
                    onPress={() =>
                      void runBusy(`mod-${member.user_id}`, async () => {
                        await setGroupMemberModerator({
                          agencyId,
                          groupId,
                          userId: member.user_id,
                          isModerator: !member.is_moderator,
                        });
                      })
                    }>
                    <AppText variant="caption" color="primary">
                      {member.is_moderator ? 'Remove mod' : 'Make mod'}
                    </AppText>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove member"
                    disabled={!!busyAction}
                    onPress={() =>
                      void runBusy(`remove-${member.user_id}`, async () => {
                        await removeGroupMember({
                          agencyId,
                          groupId,
                          userId: member.user_id,
                        });
                      })
                    }>
                    <AppText variant="caption" color="danger">
                      Remove
                    </AppText>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ))}

          {canManage ? (
            <View style={styles.addMember}>
              <AppText variant="label" color="textMuted">
                Add agency member
              </AppText>
              {addable.length === 0 ? (
                <AppText variant="caption" color="textSubtle">
                  All active agency personnel are already members.
                </AppText>
              ) : (
                <View style={styles.addList}>
                  {addable.map((person) => {
                    const selected = memberToAdd === person.user_id;
                    return (
                      <Pressable
                        key={person.user_id}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        onPress={() => setMemberToAdd(person.user_id)}
                        style={[styles.chip, selected ? styles.chipSelected : null]}>
                        <PersonnelIdentity
                          agencyId={agencyId}
                          userId={person.user_id}
                          displayName={person.profile?.display_name}
                          firstName={person.profile?.first_name}
                          lastName={person.profile?.last_name}
                          email={person.profile?.email}
                          rank={null}
                          title={person.title}
                          unit={person.unit}
                          role={person.role}
                          size="sm"
                          showMeta
                        />
                      </Pressable>
                    );
                  })}
                </View>
              )}
              <AppButton
                label="Add selected member"
                variant="secondary"
                disabled={!memberToAdd || !!busyAction}
                loading={busyAction === 'add-member'}
                onPress={() => {
                  if (!memberToAdd) {
                    return;
                  }
                  void runBusy('add-member', async () => {
                    await addGroupMember({
                      agencyId,
                      groupId,
                      userId: memberToAdd,
                    });
                    setMemberToAdd(null);
                  });
                }}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {!group.is_archived ? (
        <View style={styles.composer}>
          <FormField
            label="New post"
            value={postBody}
            onChangeText={setPostBody}
            placeholder="Share an update. Use @All to notify the group as a mention."
            autoCapitalize="sentences"
            autoCorrect
            multiline
            textAlignVertical="top"
            style={styles.postInput}
            editable={!submittingPost}
            error={postError}
          />
          <AppButton
            label="Post to group"
            onPress={() => void onCreatePost()}
            loading={submittingPost}
            disabled={submittingPost || !!busyAction}
            style={styles.postButton}
          />
        </View>
      ) : (
        <InlineFormMessage
          message="This group is archived. Posting is unavailable."
          tone="info"
        />
      )}
    </View>
  );

  return (
    <FlatList
      style={styles.list}
      data={posts}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void load('refresh')}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={header}
      ListEmptyComponent={
        <EmptyState
          title="No posts yet"
          description="Start the conversation with the first group post."
        />
      }
      renderItem={({ item }) => (
        <View style={styles.postWrap}>
          <GroupPostCard
            post={item}
            replies={repliesByPost[item.id] ?? []}
            repliesLoading={!!loadingReplies[item.id]}
            canPin={canModerate}
            canDeletePost={canDeleteGroupPost({
              role,
              isModerator: group.is_moderator,
              authorId: item.author_id,
              currentUserId,
            })}
            canDeleteReply={(reply) =>
              reply.author_id === currentUserId ||
              canModerateGroupContent({ role, isModerator: group.is_moderator })
            }
            busy={!!busyAction}
            onToggleReplies={() => {
              if (!repliesByPost[item.id]) {
                void loadReplies(item.id);
              }
            }}
            onReply={async (body) => {
              await createGroupPostReply({
                agencyId,
                postId: item.id,
                authorId: currentUserId,
                body,
              });
              await loadReplies(item.id);
              await load('refresh');
            }}
            onPin={() =>
              void runBusy(`pin-${item.id}`, async () => {
                await setGroupPostPinned({
                  agencyId,
                  postId: item.id,
                  isPinned: !item.is_pinned,
                });
              })
            }
            onDeletePost={() =>
              void runBusy(`del-post-${item.id}`, async () => {
                await deleteGroupPost({ agencyId, postId: item.id });
              })
            }
            onDeleteReply={(replyId) =>
              void runBusy(`del-reply-${replyId}`, async () => {
                await deleteGroupPostReply({ agencyId, replyId });
                await loadReplies(item.id);
              })
            }
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    flexGrow: 1,
    gap: spacing.md,
    paddingBottom: layout.bottomNavHeight + spacing['3xl'],
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing['3xl'],
  },
  header: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  membersPanel: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  memberRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberMeta: {
    flex: 1,
    minWidth: 140,
    gap: spacing.xxs,
  },
  memberActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  addMember: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  addList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceRaised,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  composer: {
    gap: spacing.sm,
  },
  postInput: {
    minHeight: 110,
    paddingTop: spacing.md,
  },
  postButton: {
    alignSelf: 'flex-start',
  },
  postWrap: {
    marginBottom: spacing.sm,
  },
});
