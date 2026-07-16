import { supabase } from '@/services/supabase';
import type { AgencyPersonnel } from '@/services/agency';
import { listActiveAgencyPersonnel } from '@/services/agency';
import type {
  Conversation,
  ConversationMember,
  ConversationSummary,
  CreateDirectMessageInput,
  DirectMessage,
  DirectMessageWithMeta,
  MessageAuthor,
} from '@/types/messages';
import { DIRECT_MESSAGE_MAX_LENGTH } from '@/types/messages';

export class MessageServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageServiceError';
  }
}

function requireAgencyId(agencyId: string | null | undefined): string {
  if (!agencyId) {
    throw new MessageServiceError('No agency is selected. Choose an agency to continue.');
  }
  return agencyId;
}

function mapConversation(row: Record<string, unknown>): Conversation {
  return {
    id: String(row.id),
    agency_id: String(row.agency_id),
    created_by: String(row.created_by),
    participant_pair_key: String(row.participant_pair_key),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    last_message_at: (row.last_message_at as string | null) ?? null,
  };
}

function mapMember(row: Record<string, unknown>): ConversationMember {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    agency_id: String(row.agency_id),
    user_id: String(row.user_id),
    joined_at: String(row.joined_at),
    is_archived: Boolean(row.is_archived),
    is_muted: Boolean(row.is_muted),
  };
}

function mapMessage(row: Record<string, unknown>): DirectMessage {
  return {
    id: String(row.id),
    conversation_id: String(row.conversation_id),
    agency_id: String(row.agency_id),
    sender_id: String(row.sender_id),
    body: String(row.body ?? ''),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    deleted_at: (row.deleted_at as string | null) ?? null,
  };
}

async function fetchAuthorsByIds(
  agencyId: string,
  userIds: string[],
): Promise<Map<string, MessageAuthor>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, MessageAuthor>();
  if (unique.length === 0) {
    return map;
  }

  const [profilesResult, personnel] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name, first_name, last_name')
      .in('id', unique),
    listActiveAgencyPersonnel(agencyId).catch(() => [] as AgencyPersonnel[]),
  ]);

  if (profilesResult.error) {
    throw new MessageServiceError(profilesResult.error.message || 'Unable to load member profiles.');
  }

  const personnelById = new Map(personnel.map((row) => [row.user_id, row]));

  for (const row of profilesResult.data ?? []) {
    const person = personnelById.get(row.id);
    map.set(row.id, {
      id: row.id,
      display_name: row.display_name,
      first_name: row.first_name,
      last_name: row.last_name,
      unit: person?.unit ?? null,
      title: person?.title ?? null,
      role: person?.role ?? null,
    });
  }

  for (const userId of unique) {
    if (!map.has(userId)) {
      const person = personnelById.get(userId);
      map.set(userId, {
        id: userId,
        display_name: person?.profile?.display_name ?? null,
        first_name: person?.profile?.first_name ?? null,
        last_name: person?.profile?.last_name ?? null,
        unit: person?.unit ?? null,
        title: person?.title ?? null,
        role: person?.role ?? null,
      });
    }
  }

  return map;
}

export function validateMessageBody(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) {
    return 'Message body is required.';
  }
  if (trimmed.length > DIRECT_MESSAGE_MAX_LENGTH) {
    return `Message must be ${DIRECT_MESSAGE_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

export async function listConversations(options: {
  agencyId: string;
  currentUserId: string;
  search?: string;
  includeArchived?: boolean;
}): Promise<ConversationSummary[]> {
  const agencyId = requireAgencyId(options.agencyId);

  let membershipQuery = supabase
    .from('conversation_members')
    .select('id, conversation_id, agency_id, user_id, joined_at, is_archived, is_muted')
    .eq('agency_id', agencyId)
    .eq('user_id', options.currentUserId);

  if (!options.includeArchived) {
    membershipQuery = membershipQuery.eq('is_archived', false);
  }

  const { data: memberships, error: membershipError } = await membershipQuery;
  if (membershipError) {
    throw new MessageServiceError(membershipError.message || 'Unable to load conversations.');
  }

  const membershipRows = (memberships ?? []).map((row) =>
    mapMember(row as Record<string, unknown>),
  );
  if (membershipRows.length === 0) {
    return [];
  }

  const conversationIds = membershipRows.map((row) => row.conversation_id);
  const { data: conversations, error: conversationError } = await supabase
    .from('conversations')
    .select('*')
    .eq('agency_id', agencyId)
    .in('id', conversationIds)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (conversationError) {
    throw new MessageServiceError(conversationError.message || 'Unable to load conversations.');
  }

  const conversationRows = (conversations ?? []).map((row) =>
    mapConversation(row as Record<string, unknown>),
  );

  const { data: peerRows, error: peerError } = await supabase
    .from('conversation_members')
    .select('conversation_id, user_id')
    .eq('agency_id', agencyId)
    .in('conversation_id', conversationIds)
    .neq('user_id', options.currentUserId);

  if (peerError) {
    throw new MessageServiceError(peerError.message || 'Unable to load conversation members.');
  }

  const otherUserByConversation = new Map<string, string>();
  for (const row of peerRows ?? []) {
    otherUserByConversation.set(String(row.conversation_id), String(row.user_id));
  }

  const authors = await fetchAuthorsByIds(
    agencyId,
    [...otherUserByConversation.values()],
  );

  const { data: recentMessages, error: messagesError } = await supabase
    .from('direct_messages')
    .select('*')
    .eq('agency_id', agencyId)
    .in('conversation_id', conversationIds)
    .order('created_at', { ascending: false });

  if (messagesError) {
    throw new MessageServiceError(messagesError.message || 'Unable to load recent messages.');
  }

  const lastMessageByConversation = new Map<string, DirectMessage>();
  for (const row of recentMessages ?? []) {
    const message = mapMessage(row as Record<string, unknown>);
    if (!lastMessageByConversation.has(message.conversation_id)) {
      lastMessageByConversation.set(message.conversation_id, message);
    }
  }

  const membershipByConversation = new Map(
    membershipRows.map((row) => [row.conversation_id, row]),
  );

  const search = options.search?.trim().toLowerCase() ?? '';
  const summaries: ConversationSummary[] = [];

  for (const conversation of conversationRows) {
    const membership = membershipByConversation.get(conversation.id);
    const otherUserId = otherUserByConversation.get(conversation.id);
    if (!membership || !otherUserId) {
      continue;
    }
    const otherMember = authors.get(otherUserId) ?? {
      id: otherUserId,
      display_name: null,
      first_name: null,
      last_name: null,
    };

    if (search) {
      const haystack = [
        otherMember.display_name,
        otherMember.first_name,
        otherMember.last_name,
        otherMember.unit,
        otherMember.title,
        otherMember.role,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) {
        continue;
      }
    }

    summaries.push({
      conversation,
      otherMember,
      membership,
      lastMessage: lastMessageByConversation.get(conversation.id) ?? null,
    });
  }

  return summaries.sort((a, b) => {
    const aTime = a.conversation.last_message_at ?? a.conversation.created_at;
    const bTime = b.conversation.last_message_at ?? b.conversation.created_at;
    return new Date(bTime).getTime() - new Date(aTime).getTime();
  });
}

export async function startConversation(options: {
  agencyId: string;
  otherUserId: string;
}): Promise<string> {
  const agencyId = requireAgencyId(options.agencyId);
  if (!options.otherUserId) {
    throw new MessageServiceError('Select a person to message.');
  }

  const { data, error } = await supabase.rpc('start_direct_conversation', {
    target_agency_id: agencyId,
    other_user_id: options.otherUserId,
  });

  if (error) {
    throw new MessageServiceError(error.message || 'Unable to start conversation.');
  }
  if (!data || typeof data !== 'string') {
    throw new MessageServiceError('Conversation could not be created.');
  }
  return data;
}

export async function getConversation(options: {
  agencyId: string;
  conversationId: string;
  currentUserId: string;
}): Promise<ConversationSummary> {
  const agencyId = requireAgencyId(options.agencyId);
  const summaries = await listConversations({
    agencyId,
    currentUserId: options.currentUserId,
    includeArchived: true,
  });
  const match = summaries.find((item) => item.conversation.id === options.conversationId);
  if (!match) {
    throw new MessageServiceError('Conversation not found or you are not a member.');
  }
  return match;
}

export async function listMessages(options: {
  agencyId: string;
  conversationId: string;
}): Promise<DirectMessageWithMeta[]> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('conversation_id', options.conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new MessageServiceError(error.message || 'Unable to load messages.');
  }

  const messages = (data ?? []).map((row) => mapMessage(row as Record<string, unknown>));
  const authors = await fetchAuthorsByIds(
    agencyId,
    messages.map((message) => message.sender_id),
  );

  return messages.map((message) => ({
    ...message,
    sender: authors.get(message.sender_id) ?? null,
  }));
}

export async function sendMessage(options: {
  agencyId: string;
  conversationId: string;
  senderId: string;
  input: CreateDirectMessageInput;
}): Promise<DirectMessage> {
  const agencyId = requireAgencyId(options.agencyId);
  const validationError = validateMessageBody(options.input.body);
  if (validationError) {
    throw new MessageServiceError(validationError);
  }

  const { data, error } = await supabase
    .from('direct_messages')
    .insert({
      agency_id: agencyId,
      conversation_id: options.conversationId,
      sender_id: options.senderId,
      body: options.input.body.trim(),
    })
    .select('*')
    .single();

  if (error) {
    throw new MessageServiceError(error.message || 'Unable to send message.');
  }
  return mapMessage(data as Record<string, unknown>);
}

export async function updateMessage(options: {
  agencyId: string;
  messageId: string;
  body: string;
}): Promise<DirectMessage> {
  const agencyId = requireAgencyId(options.agencyId);
  const validationError = validateMessageBody(options.body);
  if (validationError) {
    throw new MessageServiceError(validationError);
  }

  const { data, error } = await supabase
    .from('direct_messages')
    .update({ body: options.body.trim() })
    .eq('agency_id', agencyId)
    .eq('id', options.messageId)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error) {
    throw new MessageServiceError(error.message || 'Unable to update message.');
  }
  return mapMessage(data as Record<string, unknown>);
}

export async function deleteMessage(options: {
  agencyId: string;
  messageId: string;
}): Promise<DirectMessage> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('direct_messages')
    .update({ deleted_at: new Date().toISOString() })
    .eq('agency_id', agencyId)
    .eq('id', options.messageId)
    .is('deleted_at', null)
    .select('*')
    .single();

  if (error) {
    throw new MessageServiceError(error.message || 'Unable to delete message.');
  }
  return mapMessage(data as Record<string, unknown>);
}

async function updateOwnMembershipFlags(options: {
  agencyId: string;
  conversationId: string;
  userId: string;
  patch: Partial<Pick<ConversationMember, 'is_archived' | 'is_muted'>>;
}): Promise<ConversationMember> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('conversation_members')
    .update(options.patch)
    .eq('agency_id', agencyId)
    .eq('conversation_id', options.conversationId)
    .eq('user_id', options.userId)
    .select('id, conversation_id, agency_id, user_id, joined_at, is_archived, is_muted')
    .single();

  if (error) {
    throw new MessageServiceError(error.message || 'Unable to update conversation preferences.');
  }
  return mapMember(data as Record<string, unknown>);
}

export async function archiveConversation(options: {
  agencyId: string;
  conversationId: string;
  userId: string;
}): Promise<ConversationMember> {
  return updateOwnMembershipFlags({
    ...options,
    patch: { is_archived: true },
  });
}

export async function unarchiveConversation(options: {
  agencyId: string;
  conversationId: string;
  userId: string;
}): Promise<ConversationMember> {
  return updateOwnMembershipFlags({
    ...options,
    patch: { is_archived: false },
  });
}

export async function muteConversation(options: {
  agencyId: string;
  conversationId: string;
  userId: string;
}): Promise<ConversationMember> {
  return updateOwnMembershipFlags({
    ...options,
    patch: { is_muted: true },
  });
}

export async function unmuteConversation(options: {
  agencyId: string;
  conversationId: string;
  userId: string;
}): Promise<ConversationMember> {
  return updateOwnMembershipFlags({
    ...options,
    patch: { is_muted: false },
  });
}
