import { listPersonnelIdentitySummaries } from '@/services/personnel-profiles';
import { supabase } from '@/services/supabase';
import type {
  CreateGroupInput,
  CreateGroupPostInput,
  Group,
  GroupMember,
  GroupMemberWithProfile,
  GroupAuthor,
  GroupPost,
  GroupPostReply,
  GroupPostReplyWithMeta,
  GroupPostWithMeta,
  GroupWithMeta,
  UpdateGroupInput,
} from '@/types/groups';
import {
  GROUP_DESCRIPTION_MAX_LENGTH,
  GROUP_NAME_MAX_LENGTH,
  GROUP_POST_BODY_MAX_LENGTH,
  GROUP_REPLY_BODY_MAX_LENGTH,
} from '@/types/groups';

export class GroupServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GroupServiceError';
  }
}

function requireAgencyId(agencyId: string | null | undefined): string {
  if (!agencyId) {
    throw new GroupServiceError('No agency is selected. Choose an agency to continue.');
  }
  return agencyId;
}

function mapGroup(row: Record<string, unknown>): Group {
  return {
    id: String(row.id),
    agency_id: String(row.agency_id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    created_by: String(row.created_by),
    is_private: Boolean(row.is_private),
    is_archived: Boolean(row.is_archived),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapMember(row: Record<string, unknown>): GroupMember {
  return {
    id: String(row.id),
    group_id: String(row.group_id),
    agency_id: String(row.agency_id),
    user_id: String(row.user_id),
    is_moderator: Boolean(row.is_moderator),
    joined_at: String(row.joined_at),
  };
}

function mapPost(row: Record<string, unknown>): GroupPost {
  return {
    id: String(row.id),
    group_id: String(row.group_id),
    agency_id: String(row.agency_id),
    author_id: String(row.author_id),
    body: String(row.body),
    is_pinned: Boolean(row.is_pinned),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapReply(row: Record<string, unknown>): GroupPostReply {
  return {
    id: String(row.id),
    post_id: String(row.post_id),
    agency_id: String(row.agency_id),
    author_id: String(row.author_id),
    body: String(row.body),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function fetchAuthorsByIds(
  agencyId: string,
  userIds: string[],
): Promise<Map<string, GroupAuthor>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, GroupAuthor>();
  if (unique.length === 0) {
    return map;
  }

  try {
    const identities = await listPersonnelIdentitySummaries({ agencyId, userIds: unique });
    for (const userId of unique) {
      const identity = identities.get(userId);
      map.set(userId, {
        id: userId,
        display_name: identity?.preferred_name || identity?.display_name || null,
        first_name: identity?.first_name ?? null,
        last_name: identity?.last_name ?? null,
        preferred_name: identity?.preferred_name ?? null,
        avatar_path: identity?.avatar_path ?? null,
        rank: identity?.rank ?? null,
        title: identity?.title ?? null,
        unit: identity?.unit ?? null,
        role: identity?.role ?? null,
      });
    }
  } catch (error) {
    throw new GroupServiceError(
      error instanceof Error ? error.message : 'Unable to load member profiles.',
    );
  }

  return map;
}

export function validateCreateGroupInput(input: CreateGroupInput): string | null {
  const name = input.name?.trim() ?? '';
  if (!name) {
    return 'Group name is required.';
  }
  if (name.length > GROUP_NAME_MAX_LENGTH) {
    return `Group name must be ${GROUP_NAME_MAX_LENGTH} characters or fewer.`;
  }
  if ((input.description?.length ?? 0) > GROUP_DESCRIPTION_MAX_LENGTH) {
    return `Description must be ${GROUP_DESCRIPTION_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export async function listMyGroups(options: {
  agencyId: string;
  currentUserId: string;
  search?: string;
}): Promise<GroupWithMeta[]> {
  const agencyId = requireAgencyId(options.agencyId);

  const { data: memberships, error: membershipError } = await supabase
    .from('group_members')
    .select('group_id, is_moderator')
    .eq('agency_id', agencyId)
    .eq('user_id', options.currentUserId);

  if (membershipError) {
    throw new GroupServiceError(membershipError.message || 'Unable to load group memberships.');
  }

  const membershipRows = memberships ?? [];
  if (membershipRows.length === 0) {
    return [];
  }

  const groupIds = membershipRows.map((row) => String(row.group_id));
  const moderatorByGroup = new Map(
    membershipRows.map((row) => [String(row.group_id), Boolean(row.is_moderator)]),
  );

  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('agency_id', agencyId)
    .in('id', groupIds)
    .order('name', { ascending: true });

  if (error) {
    throw new GroupServiceError(error.message || 'Unable to load groups.');
  }

  const groups = (data ?? []).map((row) => mapGroup(row as Record<string, unknown>));
  const { data: countRows, error: countError } = await supabase
    .from('group_members')
    .select('group_id')
    .eq('agency_id', agencyId)
    .in('group_id', groupIds);

  if (countError) {
    throw new GroupServiceError(countError.message || 'Unable to load group member counts.');
  }

  const counts = new Map<string, number>();
  for (const row of countRows ?? []) {
    const id = String(row.group_id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const search = options.search?.trim().toLowerCase() ?? '';
  return groups
    .filter((group) => {
      if (!search) {
        return true;
      }
      const haystack = `${group.name} ${group.description ?? ''}`.toLowerCase();
      return haystack.includes(search);
    })
    .map((group) => ({
      ...group,
      member_count: counts.get(group.id) ?? 0,
      is_moderator: moderatorByGroup.get(group.id) ?? false,
    }));
}

export async function getGroup(options: {
  agencyId: string;
  groupId: string;
  currentUserId: string;
}): Promise<GroupWithMeta> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('id', options.groupId)
    .maybeSingle();

  if (error) {
    throw new GroupServiceError(error.message || 'Unable to load group.');
  }
  if (!data) {
    throw new GroupServiceError('Group not found or you are not a member.');
  }

  const group = mapGroup(data as Record<string, unknown>);
  const { data: members, error: membersError } = await supabase
    .from('group_members')
    .select('user_id, is_moderator')
    .eq('agency_id', agencyId)
    .eq('group_id', options.groupId);

  if (membersError) {
    throw new GroupServiceError(membersError.message || 'Unable to load group members.');
  }

  const memberRows = members ?? [];
  const self = memberRows.find((row) => String(row.user_id) === options.currentUserId);
  return {
    ...group,
    member_count: memberRows.length,
    is_moderator: Boolean(self?.is_moderator),
  };
}

export async function createGroup(options: {
  agencyId: string;
  createdBy: string;
  input: CreateGroupInput;
}): Promise<Group> {
  const agencyId = requireAgencyId(options.agencyId);
  const validationError = validateCreateGroupInput(options.input);
  if (validationError) {
    throw new GroupServiceError(validationError);
  }

  const name = options.input.name.trim();
  const payload = {
    agency_id: agencyId,
    created_by: options.createdBy,
    name,
    description: options.input.description?.trim() || null,
    is_private: options.input.is_private ?? true,
  };

  const { data, error } = await supabase.from('groups').insert(payload).select('*').single();
  if (error) {
    if (error.code === '23505') {
      throw new GroupServiceError('A group with that name already exists in this agency.');
    }
    throw new GroupServiceError(error.message || 'Unable to create group.');
  }

  const group = mapGroup(data as Record<string, unknown>);
  const initialMemberIds = [...new Set(options.input.initialMemberIds ?? [])].filter(
    (id) => id !== options.createdBy,
  );
  const moderatorIds = new Set(options.input.moderatorIds ?? []);

  for (const userId of initialMemberIds) {
    await addGroupMember({
      agencyId,
      groupId: group.id,
      userId,
      isModerator: moderatorIds.has(userId),
    });
  }

  for (const userId of moderatorIds) {
    if (userId === options.createdBy || initialMemberIds.includes(userId)) {
      continue;
    }
    await addGroupMember({
      agencyId,
      groupId: group.id,
      userId,
      isModerator: true,
    });
  }

  // Ensure selected moderators among initial members are flagged.
  for (const userId of initialMemberIds) {
    if (moderatorIds.has(userId)) {
      await setGroupMemberModerator({
        agencyId,
        groupId: group.id,
        userId,
        isModerator: true,
      });
    }
  }

  return group;
}

export async function updateGroup(options: {
  agencyId: string;
  groupId: string;
  input: UpdateGroupInput;
}): Promise<Group> {
  const agencyId = requireAgencyId(options.agencyId);
  const patch: Record<string, unknown> = {};

  if (options.input.name !== undefined) {
    const name = options.input.name.trim();
    if (!name) {
      throw new GroupServiceError('Group name is required.');
    }
    if (name.length > GROUP_NAME_MAX_LENGTH) {
      throw new GroupServiceError(`Group name must be ${GROUP_NAME_MAX_LENGTH} characters or fewer.`);
    }
    patch.name = name;
  }
  if (options.input.description !== undefined) {
    const description = options.input.description?.trim() || null;
    if (description && description.length > GROUP_DESCRIPTION_MAX_LENGTH) {
      throw new GroupServiceError(
        `Description must be ${GROUP_DESCRIPTION_MAX_LENGTH} characters or fewer.`,
      );
    }
    patch.description = description;
  }
  if (options.input.is_private !== undefined) {
    patch.is_private = options.input.is_private;
  }

  if (Object.keys(patch).length === 0) {
    throw new GroupServiceError('No group changes were provided.');
  }

  const { data, error } = await supabase
    .from('groups')
    .update(patch)
    .eq('agency_id', agencyId)
    .eq('id', options.groupId)
    .select('*')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new GroupServiceError('A group with that name already exists in this agency.');
    }
    throw new GroupServiceError(error.message || 'Unable to update group.');
  }
  return mapGroup(data as Record<string, unknown>);
}

export async function archiveGroup(options: {
  agencyId: string;
  groupId: string;
  archived?: boolean;
}): Promise<Group> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('groups')
    .update({ is_archived: options.archived ?? true })
    .eq('agency_id', agencyId)
    .eq('id', options.groupId)
    .select('*')
    .single();

  if (error) {
    throw new GroupServiceError(error.message || 'Unable to archive group.');
  }
  return mapGroup(data as Record<string, unknown>);
}

export async function listGroupMembers(options: {
  agencyId: string;
  groupId: string;
}): Promise<GroupMemberWithProfile[]> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('group_members')
    .select('id, group_id, agency_id, user_id, is_moderator, joined_at')
    .eq('agency_id', agencyId)
    .eq('group_id', options.groupId)
    .order('joined_at', { ascending: true });

  if (error) {
    throw new GroupServiceError(error.message || 'Unable to load group members.');
  }

  const rows = (data ?? []).map((row) => mapMember(row as Record<string, unknown>));
  const authors = await fetchAuthorsByIds(agencyId, rows.map((row) => row.user_id));
  return rows.map((row) => ({
    ...row,
    profile: authors.get(row.user_id) ?? null,
  }));
}

export async function addGroupMember(options: {
  agencyId: string;
  groupId: string;
  userId: string;
  isModerator?: boolean;
}): Promise<GroupMember> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('group_members')
    .insert({
      agency_id: agencyId,
      group_id: options.groupId,
      user_id: options.userId,
      is_moderator: options.isModerator ?? false,
    })
    .select('id, group_id, agency_id, user_id, is_moderator, joined_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new GroupServiceError('That person is already a member of this group.');
    }
    throw new GroupServiceError(error.message || 'Unable to add group member.');
  }
  return mapMember(data as Record<string, unknown>);
}

export async function removeGroupMember(options: {
  agencyId: string;
  groupId: string;
  userId: string;
}): Promise<void> {
  const agencyId = requireAgencyId(options.agencyId);
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('agency_id', agencyId)
    .eq('group_id', options.groupId)
    .eq('user_id', options.userId);

  if (error) {
    throw new GroupServiceError(error.message || 'Unable to remove group member.');
  }
}

export async function setGroupMemberModerator(options: {
  agencyId: string;
  groupId: string;
  userId: string;
  isModerator: boolean;
}): Promise<GroupMember> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('group_members')
    .update({ is_moderator: options.isModerator })
    .eq('agency_id', agencyId)
    .eq('group_id', options.groupId)
    .eq('user_id', options.userId)
    .select('id, group_id, agency_id, user_id, is_moderator, joined_at')
    .single();

  if (error) {
    throw new GroupServiceError(error.message || 'Unable to update moderator status.');
  }
  return mapMember(data as Record<string, unknown>);
}

export async function listGroupPosts(options: {
  agencyId: string;
  groupId: string;
}): Promise<GroupPostWithMeta[]> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('group_posts')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('group_id', options.groupId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    throw new GroupServiceError(error.message || 'Unable to load group posts.');
  }

  const posts = (data ?? []).map((row) => mapPost(row as Record<string, unknown>));
  const authors = await fetchAuthorsByIds(agencyId, posts.map((post) => post.author_id));
  const postIds = posts.map((post) => post.id);
  const replyCounts = new Map<string, number>();

  if (postIds.length > 0) {
    const { data: replies, error: replyError } = await supabase
      .from('group_post_replies')
      .select('post_id')
      .eq('agency_id', agencyId)
      .in('post_id', postIds);

    if (replyError) {
      throw new GroupServiceError(replyError.message || 'Unable to load reply counts.');
    }
    for (const row of replies ?? []) {
      const postId = String(row.post_id);
      replyCounts.set(postId, (replyCounts.get(postId) ?? 0) + 1);
    }
  }

  return posts.map((post) => ({
    ...post,
    author: authors.get(post.author_id) ?? null,
    reply_count: replyCounts.get(post.id) ?? 0,
  }));
}

export async function createGroupPost(options: {
  agencyId: string;
  groupId: string;
  authorId: string;
  input: CreateGroupPostInput;
}): Promise<GroupPost> {
  const agencyId = requireAgencyId(options.agencyId);
  const body = options.input.body?.trim() ?? '';
  if (!body) {
    throw new GroupServiceError('Post body is required.');
  }
  if (body.length > GROUP_POST_BODY_MAX_LENGTH) {
    throw new GroupServiceError(
      `Post body must be ${GROUP_POST_BODY_MAX_LENGTH} characters or fewer.`,
    );
  }

  const { data, error } = await supabase
    .from('group_posts')
    .insert({
      agency_id: agencyId,
      group_id: options.groupId,
      author_id: options.authorId,
      body,
    })
    .select('*')
    .single();

  if (error) {
    throw new GroupServiceError(error.message || 'Unable to create post.');
  }
  return mapPost(data as Record<string, unknown>);
}

export async function updateGroupPost(options: {
  agencyId: string;
  postId: string;
  body: string;
}): Promise<GroupPost> {
  const agencyId = requireAgencyId(options.agencyId);
  const body = options.body.trim();
  if (!body) {
    throw new GroupServiceError('Post body is required.');
  }
  if (body.length > GROUP_POST_BODY_MAX_LENGTH) {
    throw new GroupServiceError(
      `Post body must be ${GROUP_POST_BODY_MAX_LENGTH} characters or fewer.`,
    );
  }

  const { data, error } = await supabase
    .from('group_posts')
    .update({ body })
    .eq('agency_id', agencyId)
    .eq('id', options.postId)
    .select('*')
    .single();

  if (error) {
    throw new GroupServiceError(error.message || 'Unable to update post.');
  }
  return mapPost(data as Record<string, unknown>);
}

export async function deleteGroupPost(options: {
  agencyId: string;
  postId: string;
}): Promise<void> {
  const agencyId = requireAgencyId(options.agencyId);
  const { error } = await supabase
    .from('group_posts')
    .delete()
    .eq('agency_id', agencyId)
    .eq('id', options.postId);

  if (error) {
    throw new GroupServiceError(error.message || 'Unable to delete post.');
  }
}

export async function setGroupPostPinned(options: {
  agencyId: string;
  postId: string;
  isPinned: boolean;
}): Promise<GroupPost> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('group_posts')
    .update({ is_pinned: options.isPinned })
    .eq('agency_id', agencyId)
    .eq('id', options.postId)
    .select('*')
    .single();

  if (error) {
    throw new GroupServiceError(error.message || 'Unable to update pin state.');
  }
  return mapPost(data as Record<string, unknown>);
}

export async function listGroupPostReplies(options: {
  agencyId: string;
  postId: string;
}): Promise<GroupPostReplyWithMeta[]> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('group_post_replies')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('post_id', options.postId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new GroupServiceError(error.message || 'Unable to load replies.');
  }

  const replies = (data ?? []).map((row) => mapReply(row as Record<string, unknown>));
  const authors = await fetchAuthorsByIds(agencyId, replies.map((reply) => reply.author_id));
  return replies.map((reply) => ({
    ...reply,
    author: authors.get(reply.author_id) ?? null,
  }));
}

export async function createGroupPostReply(options: {
  agencyId: string;
  postId: string;
  authorId: string;
  body: string;
}): Promise<GroupPostReply> {
  const agencyId = requireAgencyId(options.agencyId);
  const body = options.body.trim();
  if (!body) {
    throw new GroupServiceError('Reply body is required.');
  }
  if (body.length > GROUP_REPLY_BODY_MAX_LENGTH) {
    throw new GroupServiceError(
      `Reply must be ${GROUP_REPLY_BODY_MAX_LENGTH} characters or fewer.`,
    );
  }

  const { data, error } = await supabase
    .from('group_post_replies')
    .insert({
      agency_id: agencyId,
      post_id: options.postId,
      author_id: options.authorId,
      body,
    })
    .select('*')
    .single();

  if (error) {
    throw new GroupServiceError(error.message || 'Unable to create reply.');
  }
  return mapReply(data as Record<string, unknown>);
}

export async function deleteGroupPostReply(options: {
  agencyId: string;
  replyId: string;
}): Promise<void> {
  const agencyId = requireAgencyId(options.agencyId);
  const { error } = await supabase
    .from('group_post_replies')
    .delete()
    .eq('agency_id', agencyId)
    .eq('id', options.replyId);

  if (error) {
    throw new GroupServiceError(error.message || 'Unable to delete reply.');
  }
}
