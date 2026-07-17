import { listPersonnelIdentitySummaries } from '@/services/personnel-profiles';
import { supabase } from '@/services/supabase';
import type {
  Briefing,
  BriefingAcknowledgement,
  BriefingAckWithProfile,
  BriefingAuthor,
  BriefingFilters,
  BriefingWithMeta,
  CreateBriefingInput,
  UpdateBriefingInput,
} from '@/types/briefings';
import {
  BODY_MAX_LENGTH,
  CASE_MAX_LENGTH,
  CATEGORY_MAX_LENGTH,
  LOCATION_MAX_LENGTH,
  SHIFT_MAX_LENGTH,
  TAG_MAX_LENGTH,
  TAGS_MAX_COUNT,
  TITLE_MAX_LENGTH,
  isBriefingPriority,
  isBriefingStatus,
} from '@/types/briefings';
import {
  categoriesMatch,
  formatCategoryNameForStorage,
} from '@/types/briefingCategories';
import { formatShiftNameForStorage, shiftsMatch } from '@/types/shifts';

export class BriefingServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BriefingServiceError';
  }
}

function requireAgencyId(agencyId: string | null | undefined): string {
  if (!agencyId) {
    throw new BriefingServiceError('No agency is selected. Choose an agency to continue.');
  }
  return agencyId;
}

function mapBriefing(row: Record<string, unknown>): Briefing {
  const priority = String(row.priority);
  const status = String(row.status);
  if (!isBriefingPriority(priority) || !isBriefingStatus(status)) {
    throw new BriefingServiceError('Received an invalid briefing record from the server.');
  }

  return {
    id: String(row.id),
    agency_id: String(row.agency_id),
    author_id: String(row.author_id),
    title: String(row.title),
    body: String(row.body),
    shift_name: (row.shift_name as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    priority,
    status,
    case_number: (row.case_number as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    is_pinned: Boolean(row.is_pinned),
    requires_acknowledgement: Boolean(row.requires_acknowledgement),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    resolved_at: (row.resolved_at as string | null) ?? null,
    archived_at: (row.archived_at as string | null) ?? null,
  };
}

async function fetchAuthorsByIds(
  agencyId: string,
  authorIds: string[],
): Promise<Map<string, BriefingAuthor>> {
  const unique = [...new Set(authorIds.filter(Boolean))];
  const map = new Map<string, BriefingAuthor>();
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
      });
    }
  } catch (error) {
    throw new BriefingServiceError(
      error instanceof Error ? error.message : 'Unable to load briefing authors.',
    );
  }

  return map;
}

function sortBriefings(items: BriefingWithMeta[]): BriefingWithMeta[] {
  return [...items].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) {
      return a.is_pinned ? -1 : 1;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function normalizeFilterToken(value: string | null | undefined): string | 'all' {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || trimmed.toLowerCase() === 'all') {
    return 'all';
  }
  return trimmed;
}

function applyClientFilters(items: BriefingWithMeta[], filters: BriefingFilters): BriefingWithMeta[] {
  const search = filters.search?.trim().toLowerCase() ?? '';
  const priority = normalizeFilterToken(filters.priority);
  const status = normalizeFilterToken(filters.status);
  const shift = normalizeFilterToken(filters.shift);
  const category = normalizeFilterToken(filters.category);

  return items.filter((item) => {
    if (priority !== 'all' && item.priority !== priority) {
      return false;
    }
    if (status !== 'all' && item.status !== status) {
      return false;
    }
    if (shift !== 'all') {
      if (!shiftsMatch(item.shift_name, shift)) {
        return false;
      }
    }
    if (category !== 'all') {
      if (!categoriesMatch(item.category, category)) {
        return false;
      }
    }
    if (filters.pinnedOnly && !item.is_pinned) {
      return false;
    }
    if (filters.acknowledgement === 'acknowledged' && !item.acknowledged_by_me) {
      return false;
    }
    if (filters.acknowledgement === 'unacknowledged') {
      if (!item.requires_acknowledgement || item.acknowledged_by_me || item.status !== 'active') {
        return false;
      }
    }
    if (search) {
      const haystack = [
        item.title,
        item.body,
        item.shift_name,
        item.category,
        item.case_number,
        item.location,
        ...(item.tags ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(search)) {
        return false;
      }
    }
    return true;
  });
}

export function validateCreateBriefingInput(input: CreateBriefingInput): string | null {
  const title = input.title?.trim() ?? '';
  const body = input.body?.trim() ?? '';
  if (!title) {
    return 'Title is required.';
  }
  if (title.length > TITLE_MAX_LENGTH) {
    return `Title must be ${TITLE_MAX_LENGTH} characters or fewer.`;
  }
  if (!body) {
    return 'Body is required.';
  }
  if (body.length > BODY_MAX_LENGTH) {
    return `Body must be ${BODY_MAX_LENGTH} characters or fewer.`;
  }
  if ((input.shift_name?.length ?? 0) > SHIFT_MAX_LENGTH) {
    return `Shift name must be ${SHIFT_MAX_LENGTH} characters or fewer.`;
  }
  if ((input.category?.length ?? 0) > CATEGORY_MAX_LENGTH) {
    return `Category must be ${CATEGORY_MAX_LENGTH} characters or fewer.`;
  }
  if ((input.case_number?.length ?? 0) > CASE_MAX_LENGTH) {
    return `Case number must be ${CASE_MAX_LENGTH} characters or fewer.`;
  }
  if ((input.location?.length ?? 0) > LOCATION_MAX_LENGTH) {
    return `Location must be ${LOCATION_MAX_LENGTH} characters or fewer.`;
  }
  const tags = input.tags ?? [];
  if (tags.length > TAGS_MAX_COUNT) {
    return `Use at most ${TAGS_MAX_COUNT} tags.`;
  }
  if (tags.some((tag) => tag.length > TAG_MAX_LENGTH)) {
    return `Each tag must be ${TAG_MAX_LENGTH} characters or fewer.`;
  }
  return null;
}

async function attachMeta(
  briefings: Briefing[],
  currentUserId: string,
  agencyId: string,
): Promise<BriefingWithMeta[]> {
  const authors = await fetchAuthorsByIds(
    agencyId,
    briefings.map((item) => item.author_id),
  );
  const briefingIds = briefings.map((item) => item.id);

  let acknowledgements: BriefingAcknowledgement[] = [];
  const attachmentCounts = new Map<string, number>();

  if (briefingIds.length > 0) {
    const [acksResult, attachmentsResult] = await Promise.all([
      supabase
        .from('briefing_acknowledgements')
        .select('id, briefing_id, agency_id, user_id, acknowledged_at')
        .in('briefing_id', briefingIds),
      supabase.from('briefing_attachments').select('briefing_id').in('briefing_id', briefingIds),
    ]);

    if (acksResult.error) {
      throw new BriefingServiceError(
        acksResult.error.message || 'Unable to load acknowledgements.',
      );
    }
    acknowledgements = (acksResult.data ?? []) as BriefingAcknowledgement[];

    // Attachment metadata is optional until the attachments migration is applied.
    if (!attachmentsResult.error) {
      for (const row of attachmentsResult.data ?? []) {
        const briefingId = String((row as { briefing_id: string }).briefing_id);
        attachmentCounts.set(briefingId, (attachmentCounts.get(briefingId) ?? 0) + 1);
      }
    }
  }

  return briefings.map((briefing) => {
    const related = acknowledgements.filter((ack) => ack.briefing_id === briefing.id);
    return {
      ...briefing,
      author: authors.get(briefing.author_id) ?? null,
      acknowledgement_count: related.length,
      acknowledged_by_me: related.some((ack) => ack.user_id === currentUserId),
      attachment_count: attachmentCounts.get(briefing.id) ?? 0,
    };
  });
}

export async function listBriefings(options: {
  agencyId: string;
  currentUserId: string;
  filters?: BriefingFilters;
}): Promise<BriefingWithMeta[]> {
  const agencyId = requireAgencyId(options.agencyId);
  const filters = options.filters ?? {};
  const statusFilter = normalizeFilterToken(filters.status);

  let query = supabase
    .from('briefings')
    .select('*')
    .eq('agency_id', agencyId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false });

  if (statusFilter !== 'all' && isBriefingStatus(statusFilter)) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    if (__DEV__) {
      console.warn('[briefings] listBriefings query failed', {
        agencyIdPresent: !!agencyId,
        statusFilter,
        message: error.message,
      });
    }
    throw new BriefingServiceError(error.message || 'Unable to load briefings.');
  }

  const briefings = (data ?? []).map((row) => mapBriefing(row as Record<string, unknown>));
  const withMeta = await attachMeta(briefings, options.currentUserId, agencyId);
  const sorted = sortBriefings(applyClientFilters(withMeta, filters));

  if (__DEV__) {
    console.log('[briefings] listBriefings', {
      agencyIdPresent: !!agencyId,
      statusFilter,
      priority: normalizeFilterToken(filters.priority),
      pinnedOnly: !!filters.pinnedOnly,
      acknowledgement: filters.acknowledgement ?? 'all',
      searchActive: !!(filters.search?.trim()),
      returnedCount: sorted.length,
    });
  }

  return sorted;
}

export async function getBriefing(options: {
  agencyId: string;
  briefingId: string;
  currentUserId: string;
}): Promise<BriefingWithMeta> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('briefings')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('id', options.briefingId)
    .maybeSingle();

  if (error) {
    throw new BriefingServiceError(error.message || 'Unable to load briefing.');
  }
  if (!data) {
    throw new BriefingServiceError('Briefing not found for this agency.');
  }

  const [withMeta] = await attachMeta(
    [mapBriefing(data as Record<string, unknown>)],
    options.currentUserId,
    agencyId,
  );
  return withMeta!;
}

export async function createBriefing(options: {
  agencyId: string;
  authorId: string;
  input: CreateBriefingInput;
}): Promise<Briefing> {
  const agencyId = requireAgencyId(options.agencyId);
  const validationError = validateCreateBriefingInput(options.input);
  if (validationError) {
    throw new BriefingServiceError(validationError);
  }

  const payload = {
    agency_id: agencyId,
    author_id: options.authorId,
    title: options.input.title.trim(),
    body: options.input.body.trim(),
    shift_name: formatShiftNameForStorage(options.input.shift_name),
    category: formatCategoryNameForStorage(options.input.category),
    priority: options.input.priority ?? 'medium',
    case_number: options.input.case_number?.trim() || null,
    location: options.input.location?.trim() || null,
    tags: (options.input.tags ?? []).map((tag) => tag.trim()).filter(Boolean),
    requires_acknowledgement: options.input.requires_acknowledgement ?? true,
  };

  const { data, error } = await supabase.from('briefings').insert(payload).select('*').single();
  if (error) {
    throw new BriefingServiceError(error.message || 'Unable to create briefing.');
  }
  return mapBriefing(data as Record<string, unknown>);
}

export async function updateBriefing(options: {
  agencyId: string;
  briefingId: string;
  input: UpdateBriefingInput;
}): Promise<Briefing> {
  const agencyId = requireAgencyId(options.agencyId);
  const patch: Record<string, unknown> = {};

  if (options.input.title !== undefined) {
    const title = options.input.title.trim();
    if (!title) {
      throw new BriefingServiceError('Title is required.');
    }
    if (title.length > TITLE_MAX_LENGTH) {
      throw new BriefingServiceError(`Title must be ${TITLE_MAX_LENGTH} characters or fewer.`);
    }
    patch.title = title;
  }
  if (options.input.body !== undefined) {
    const body = options.input.body.trim();
    if (!body) {
      throw new BriefingServiceError('Body is required.');
    }
    if (body.length > BODY_MAX_LENGTH) {
      throw new BriefingServiceError(`Body must be ${BODY_MAX_LENGTH} characters or fewer.`);
    }
    patch.body = body;
  }
  if (options.input.shift_name !== undefined) {
    const shift = formatShiftNameForStorage(options.input.shift_name);
    if (shift && shift.length > SHIFT_MAX_LENGTH) {
      throw new BriefingServiceError(`Shift name must be ${SHIFT_MAX_LENGTH} characters or fewer.`);
    }
    patch.shift_name = shift;
  }
  if (options.input.category !== undefined) {
    const category = formatCategoryNameForStorage(options.input.category);
    if (category && category.length > CATEGORY_MAX_LENGTH) {
      throw new BriefingServiceError(`Category must be ${CATEGORY_MAX_LENGTH} characters or fewer.`);
    }
    patch.category = category;
  }
  if (options.input.priority !== undefined) {
    patch.priority = options.input.priority;
  }
  if (options.input.case_number !== undefined) {
    const caseNumber = options.input.case_number?.trim() || null;
    if (caseNumber && caseNumber.length > CASE_MAX_LENGTH) {
      throw new BriefingServiceError(`Case number must be ${CASE_MAX_LENGTH} characters or fewer.`);
    }
    patch.case_number = caseNumber;
  }
  if (options.input.location !== undefined) {
    const location = options.input.location?.trim() || null;
    if (location && location.length > LOCATION_MAX_LENGTH) {
      throw new BriefingServiceError(`Location must be ${LOCATION_MAX_LENGTH} characters or fewer.`);
    }
    patch.location = location;
  }
  if (options.input.tags !== undefined) {
    const tags = options.input.tags.map((tag) => tag.trim()).filter(Boolean);
    if (tags.length > TAGS_MAX_COUNT) {
      throw new BriefingServiceError(`Use at most ${TAGS_MAX_COUNT} tags.`);
    }
    if (tags.some((tag) => tag.length > TAG_MAX_LENGTH)) {
      throw new BriefingServiceError(`Each tag must be ${TAG_MAX_LENGTH} characters or fewer.`);
    }
    patch.tags = tags;
  }
  if (options.input.requires_acknowledgement !== undefined) {
    patch.requires_acknowledgement = options.input.requires_acknowledgement;
  }

  if (Object.keys(patch).length === 0) {
    throw new BriefingServiceError('No briefing changes were provided.');
  }

  const { data, error } = await supabase
    .from('briefings')
    .update(patch)
    .eq('agency_id', agencyId)
    .eq('id', options.briefingId)
    .select('*')
    .single();

  if (error) {
    throw new BriefingServiceError(error.message || 'Unable to update briefing.');
  }
  return mapBriefing(data as Record<string, unknown>);
}

export async function setBriefingPinned(options: {
  agencyId: string;
  briefingId: string;
  isPinned: boolean;
}): Promise<Briefing> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('briefings')
    .update({ is_pinned: options.isPinned })
    .eq('agency_id', agencyId)
    .eq('id', options.briefingId)
    .select('*')
    .single();

  if (error) {
    throw new BriefingServiceError(error.message || 'Unable to update pin state.');
  }
  return mapBriefing(data as Record<string, unknown>);
}

export async function resolveBriefing(options: {
  agencyId: string;
  briefingId: string;
}): Promise<Briefing> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('briefings')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
    })
    .eq('agency_id', agencyId)
    .eq('id', options.briefingId)
    .select('*')
    .single();

  if (error) {
    throw new BriefingServiceError(error.message || 'Unable to resolve briefing.');
  }
  return mapBriefing(data as Record<string, unknown>);
}

export async function archiveBriefing(options: {
  agencyId: string;
  briefingId: string;
}): Promise<Briefing> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('briefings')
    .update({
      status: 'archived',
      archived_at: new Date().toISOString(),
    })
    .eq('agency_id', agencyId)
    .eq('id', options.briefingId)
    .select('*')
    .single();

  if (error) {
    throw new BriefingServiceError(error.message || 'Unable to archive briefing.');
  }
  return mapBriefing(data as Record<string, unknown>);
}

export async function acknowledgeBriefing(options: {
  agencyId: string;
  briefingId: string;
  userId: string;
}): Promise<BriefingAcknowledgement> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('briefing_acknowledgements')
    .insert({
      agency_id: agencyId,
      briefing_id: options.briefingId,
      user_id: options.userId,
    })
    .select('id, briefing_id, agency_id, user_id, acknowledged_at')
    .single();

  if (error) {
    throw new BriefingServiceError(error.message || 'Unable to acknowledge briefing.');
  }
  return data as BriefingAcknowledgement;
}

export async function removeAcknowledgement(options: {
  agencyId: string;
  briefingId: string;
  userId: string;
}): Promise<void> {
  const agencyId = requireAgencyId(options.agencyId);
  const { error } = await supabase
    .from('briefing_acknowledgements')
    .delete()
    .eq('agency_id', agencyId)
    .eq('briefing_id', options.briefingId)
    .eq('user_id', options.userId);

  if (error) {
    throw new BriefingServiceError(error.message || 'Unable to remove acknowledgement.');
  }
}

export async function getBriefingAcknowledgements(options: {
  agencyId: string;
  briefingId: string;
}): Promise<BriefingAckWithProfile[]> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('briefing_acknowledgements')
    .select('id, briefing_id, agency_id, user_id, acknowledged_at')
    .eq('agency_id', agencyId)
    .eq('briefing_id', options.briefingId)
    .order('acknowledged_at', { ascending: true });

  if (error) {
    throw new BriefingServiceError(error.message || 'Unable to load acknowledgements.');
  }

  const rows = (data ?? []) as BriefingAcknowledgement[];
  const authors = await fetchAuthorsByIds(
    agencyId,
    rows.map((row) => row.user_id),
  );
  return rows.map((row) => ({
    ...row,
    profile: authors.get(row.user_id) ?? null,
  }));
}

export async function getHomeBriefingSummary(options: {
  agencyId: string;
  currentUserId: string;
}): Promise<{
  criticalActiveCount: number;
  unacknowledgedCount: number;
  highlightBriefings: BriefingWithMeta[];
}> {
  const items = await listBriefings({
    agencyId: options.agencyId,
    currentUserId: options.currentUserId,
    filters: { status: 'active' },
  });

  const criticalActiveCount = items.filter((item) => item.priority === 'critical').length;
  const unacknowledgedCount = items.filter(
    (item) => item.requires_acknowledgement && !item.acknowledged_by_me,
  ).length;
  const highlightBriefings = sortBriefings(items).slice(0, 3);

  return {
    criticalActiveCount,
    unacknowledgedCount,
    highlightBriefings,
  };
}
