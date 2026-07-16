/**
 * Direct messages domain types (hand-maintained; aligned to SQL migration).
 */

export type Conversation = {
  id: string;
  agency_id: string;
  created_by: string;
  participant_pair_key: string;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

export type ConversationMember = {
  id: string;
  conversation_id: string;
  agency_id: string;
  user_id: string;
  joined_at: string;
  is_archived: boolean;
  is_muted: boolean;
};

export type MessageAuthor = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  unit?: string | null;
  title?: string | null;
  role?: string | null;
};

export type DirectMessage = {
  id: string;
  conversation_id: string;
  agency_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type DirectMessageWithMeta = DirectMessage & {
  sender: MessageAuthor | null;
};

export type ConversationSummary = {
  conversation: Conversation;
  otherMember: MessageAuthor;
  membership: ConversationMember;
  lastMessage: DirectMessage | null;
};

export type CreateDirectMessageInput = {
  body: string;
};

export const DIRECT_MESSAGE_MAX_LENGTH = 4000;
export const DIRECT_MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

export function formatMessageAuthorName(author: MessageAuthor | null | undefined): string {
  if (!author) {
    return 'Unknown member';
  }
  if (author.display_name?.trim()) {
    return author.display_name.trim();
  }
  const combined = [author.first_name, author.last_name].filter(Boolean).join(' ').trim();
  return combined || 'Unknown member';
}

export function formatMessageDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function canEditDirectMessage(options: {
  senderId: string;
  currentUserId: string | null | undefined;
  createdAt: string;
  deletedAt: string | null;
}): boolean {
  if (!options.currentUserId || options.senderId !== options.currentUserId || options.deletedAt) {
    return false;
  }
  const created = new Date(options.createdAt).getTime();
  if (Number.isNaN(created)) {
    return false;
  }
  return Date.now() - created <= DIRECT_MESSAGE_EDIT_WINDOW_MS;
}

export function previewMessageBody(message: DirectMessage | null): string {
  if (!message) {
    return 'No messages yet';
  }
  if (message.deleted_at) {
    return 'Message deleted';
  }
  const normalized = message.body.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 90) {
    return normalized;
  }
  return `${normalized.slice(0, 89).trimEnd()}…`;
}
