/**
 * Hand-maintained briefing domain types aligned to the SQL migration
 * (not generated Supabase types).
 */

import type { AgencyRole } from '@/types/agency';

export const BRIEFING_PRIORITIES = ['critical', 'high', 'medium', 'low'] as const;
export type BriefingPriority = (typeof BRIEFING_PRIORITIES)[number];

export const BRIEFING_STATUSES = ['active', 'resolved', 'archived'] as const;
export type BriefingStatus = (typeof BRIEFING_STATUSES)[number];

export type Briefing = {
  id: string;
  agency_id: string;
  author_id: string;
  title: string;
  body: string;
  shift_name: string | null;
  category: string | null;
  priority: BriefingPriority;
  status: BriefingStatus;
  case_number: string | null;
  location: string | null;
  tags: string[];
  is_pinned: boolean;
  requires_acknowledgement: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  archived_at: string | null;
};

export type BriefingAcknowledgement = {
  id: string;
  briefing_id: string;
  agency_id: string;
  user_id: string;
  acknowledged_at: string;
};

export type BriefingAuthor = {
  id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
};

export type BriefingWithMeta = Briefing & {
  author: BriefingAuthor | null;
  acknowledgement_count: number;
  acknowledged_by_me: boolean;
};

export type CreateBriefingInput = {
  title: string;
  body: string;
  shift_name?: string | null;
  category?: string | null;
  priority?: BriefingPriority;
  case_number?: string | null;
  location?: string | null;
  tags?: string[];
  requires_acknowledgement?: boolean;
};

export type UpdateBriefingInput = Partial<
  Pick<
    CreateBriefingInput,
    | 'title'
    | 'body'
    | 'shift_name'
    | 'category'
    | 'priority'
    | 'case_number'
    | 'location'
    | 'tags'
    | 'requires_acknowledgement'
  >
>;

export type BriefingFilters = {
  search?: string;
  priority?: BriefingPriority | 'all';
  status?: BriefingStatus | 'all';
  shift?: string | 'all';
  category?: string | 'all';
  pinnedOnly?: boolean;
  acknowledgement?: 'all' | 'acknowledged' | 'unacknowledged';
};

export type BriefingAckWithProfile = BriefingAcknowledgement & {
  profile: BriefingAuthor | null;
};

export const TITLE_MAX_LENGTH = 160;
export const BODY_MAX_LENGTH = 8000;
export const SHIFT_MAX_LENGTH = 80;
export const CATEGORY_MAX_LENGTH = 80;
export const CASE_MAX_LENGTH = 80;
export const LOCATION_MAX_LENGTH = 160;
export const TAG_MAX_LENGTH = 40;
export const TAGS_MAX_COUNT = 12;

export function isBriefingPriority(value: string): value is BriefingPriority {
  return (BRIEFING_PRIORITIES as readonly string[]).includes(value);
}

export function isBriefingStatus(value: string): value is BriefingStatus {
  return (BRIEFING_STATUSES as readonly string[]).includes(value);
}

export function formatBriefingPriority(priority: BriefingPriority): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function formatAuthorName(author: BriefingAuthor | null | undefined): string {
  if (!author) {
    return 'Unknown author';
  }
  if (author.display_name?.trim()) {
    return author.display_name.trim();
  }
  const combined = [author.first_name, author.last_name].filter(Boolean).join(' ').trim();
  return combined || 'Unknown author';
}

export function canSuperviseBriefings(role: AgencyRole | null | undefined): boolean {
  return role === 'agency_admin' || role === 'command_staff' || role === 'supervisor';
}

export function canDeleteBriefings(role: AgencyRole | null | undefined): boolean {
  return role === 'agency_admin' || role === 'command_staff';
}

export function canEditBriefing(options: {
  role: AgencyRole | null | undefined;
  authorId: string;
  currentUserId: string | null | undefined;
  status: BriefingStatus;
}): boolean {
  if (!options.currentUserId) {
    return false;
  }
  if (canSuperviseBriefings(options.role)) {
    return true;
  }
  return (
    options.authorId === options.currentUserId && options.status === 'active'
  );
}

export function formatBriefingDateTime(iso: string): string {
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

export function previewBriefingBody(body: string, maxLength = 160): string {
  const normalized = body.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}
