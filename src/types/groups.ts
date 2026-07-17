/**
 * Groups MVP domain types (hand-maintained; aligned to SQL migration).
 */

import type { AgencyRole } from '@/types/agency';

export type Group = {
  id: string;
  agency_id: string;
  name: string;
  description: string | null;
  created_by: string;
  is_private: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
};

export type GroupMember = {
  id: string;
  group_id: string;
  agency_id: string;
  user_id: string;
  is_moderator: boolean;
  joined_at: string;
};

export type GroupAuthor = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_name?: string | null;
  avatar_path?: string | null;
  rank?: string | null;
  title?: string | null;
  unit?: string | null;
  role?: AgencyRole | null;
};

export type GroupMemberWithProfile = GroupMember & {
  profile: GroupAuthor | null;
};

export type GroupWithMeta = Group & {
  member_count: number;
  is_moderator: boolean;
};

export type GroupPost = {
  id: string;
  group_id: string;
  agency_id: string;
  author_id: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type GroupPostWithMeta = GroupPost & {
  author: GroupAuthor | null;
  reply_count: number;
};

export type GroupPostReply = {
  id: string;
  post_id: string;
  agency_id: string;
  author_id: string;
  body: string;
  created_at: string;
  updated_at: string;
};

export type GroupPostReplyWithMeta = GroupPostReply & {
  author: GroupAuthor | null;
};

export type CreateGroupInput = {
  name: string;
  description?: string | null;
  is_private?: boolean;
  initialMemberIds?: string[];
  moderatorIds?: string[];
};

export type UpdateGroupInput = {
  name?: string;
  description?: string | null;
  is_private?: boolean;
};

export type CreateGroupPostInput = {
  body: string;
};

export const GROUP_NAME_MAX_LENGTH = 80;
export const GROUP_DESCRIPTION_MAX_LENGTH = 500;
export const GROUP_POST_BODY_MAX_LENGTH = 8000;
export const GROUP_REPLY_BODY_MAX_LENGTH = 4000;

export function formatGroupAuthorName(author: GroupAuthor | null | undefined): string {
  if (!author) {
    return 'Unknown author';
  }
  if (author.display_name?.trim()) {
    return author.display_name.trim();
  }
  const combined = [author.first_name, author.last_name].filter(Boolean).join(' ').trim();
  return combined || 'Unknown author';
}

export function canCreateGroups(role: AgencyRole | null | undefined): boolean {
  return role === 'agency_admin' || role === 'command_staff' || role === 'supervisor';
}

export function canArchiveOrDeleteGroups(role: AgencyRole | null | undefined): boolean {
  return role === 'agency_admin' || role === 'command_staff';
}

export function canManageGroupMembers(options: {
  role: AgencyRole | null | undefined;
  isModerator: boolean;
}): boolean {
  return (
    options.isModerator ||
    options.role === 'agency_admin' ||
    options.role === 'command_staff' ||
    options.role === 'supervisor'
  );
}

export function canUpdateGroupDetails(options: {
  role: AgencyRole | null | undefined;
  isModerator: boolean;
  createdBy: string;
  currentUserId: string | null | undefined;
}): boolean {
  if (!options.currentUserId) {
    return false;
  }
  return (
    options.createdBy === options.currentUserId ||
    options.isModerator ||
    options.role === 'agency_admin' ||
    options.role === 'command_staff'
  );
}

export function canModerateGroupContent(options: {
  role: AgencyRole | null | undefined;
  isModerator: boolean;
}): boolean {
  return (
    options.isModerator ||
    options.role === 'agency_admin' ||
    options.role === 'command_staff' ||
    options.role === 'supervisor'
  );
}

export function canDeleteGroupPost(options: {
  role: AgencyRole | null | undefined;
  isModerator: boolean;
  authorId: string;
  currentUserId: string | null | undefined;
}): boolean {
  if (!options.currentUserId) {
    return false;
  }
  return (
    options.authorId === options.currentUserId ||
    options.isModerator ||
    options.role === 'agency_admin' ||
    options.role === 'command_staff'
  );
}

export function formatGroupDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
