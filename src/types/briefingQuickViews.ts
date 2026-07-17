import type { BriefingFilters, BriefingWithMeta } from '@/types/briefings';
import { DEFAULT_BRIEFING_FILTERS } from '@/types/briefings';
import { shiftsMatch } from '@/types/shifts';

export const BRIEFING_QUICK_VIEWS = [
  'all',
  'my_shift',
  'required_review',
  'critical_pinned',
  'start_of_shift',
] as const;

export type BriefingQuickView = (typeof BRIEFING_QUICK_VIEWS)[number];

export const BRIEFING_QUICK_VIEW_LABELS: Record<BriefingQuickView, string> = {
  all: 'All Briefings',
  my_shift: 'My Shift',
  required_review: 'Required Review',
  critical_pinned: 'Critical & Pinned',
  start_of_shift: 'Start-of-Shift View',
};

export function isBriefingQuickView(value: string | null | undefined): value is BriefingQuickView {
  return !!value && (BRIEFING_QUICK_VIEWS as readonly string[]).includes(value);
}

/** Base filters a quick view applies before listBriefings. */
export function filtersForQuickView(
  view: BriefingQuickView,
  options: {
    myShiftName?: string | null;
    preserved?: Pick<BriefingFilters, 'search' | 'category'>;
  } = {},
): BriefingFilters {
  const preserved = {
    search: options.preserved?.search ?? '',
    category: options.preserved?.category ?? 'all',
  };

  switch (view) {
    case 'my_shift':
      return {
        ...DEFAULT_BRIEFING_FILTERS,
        ...preserved,
        status: 'active',
        shift: options.myShiftName?.trim() || 'all',
      };
    case 'required_review':
      return {
        ...DEFAULT_BRIEFING_FILTERS,
        ...preserved,
        status: 'active',
        acknowledgement: 'unacknowledged',
      };
    case 'critical_pinned':
    case 'start_of_shift':
      return {
        ...DEFAULT_BRIEFING_FILTERS,
        ...preserved,
        status: 'active',
      };
    case 'all':
    default:
      return {
        ...DEFAULT_BRIEFING_FILTERS,
        ...preserved,
      };
  }
}

export function sortCriticalAndPinned(items: BriefingWithMeta[]): BriefingWithMeta[] {
  return [...items].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) {
      return a.is_pinned ? -1 : 1;
    }
    const aCritical = a.priority === 'critical' ? 1 : 0;
    const bCritical = b.priority === 'critical' ? 1 : 0;
    if (aCritical !== bCritical) {
      return bCritical - aCritical;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function startOfShiftUrgencyScore(item: BriefingWithMeta): number {
  let score = 0;
  if (item.priority === 'critical') score += 100;
  if (item.is_pinned) score += 80;
  if (item.requires_acknowledgement && !item.acknowledged_by_me) score += 60;
  if (item.priority === 'high') score += 20;
  return score;
}

export function sortStartOfShift(items: BriefingWithMeta[]): BriefingWithMeta[] {
  return [...items].sort((a, b) => {
    const scoreDiff = startOfShiftUrgencyScore(b) - startOfShiftUrgencyScore(a);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

/** Active briefings that are critical or pinned. */
export function selectCriticalAndPinned(items: BriefingWithMeta[]): BriefingWithMeta[] {
  return sortCriticalAndPinned(
    items.filter(
      (item) => item.status === 'active' && (item.priority === 'critical' || item.is_pinned),
    ),
  );
}

/**
 * Curated start-of-shift union:
 * critical, pinned, unacknowledged required, my-shift, and department-wide (no shift).
 */
export function selectStartOfShiftBriefings(
  items: BriefingWithMeta[],
  myShiftName: string | null | undefined,
): BriefingWithMeta[] {
  const byId = new Map<string, BriefingWithMeta>();

  for (const item of items) {
    if (item.status !== 'active') {
      continue;
    }

    const noShift = !item.shift_name?.trim();
    const matchesShift = !!myShiftName && shiftsMatch(item.shift_name, myShiftName);
    const needsReview = item.requires_acknowledgement && !item.acknowledged_by_me;
    const include =
      item.priority === 'critical' ||
      item.is_pinned ||
      needsReview ||
      matchesShift ||
      noShift;

    if (include) {
      byId.set(item.id, item);
    }
  }

  return sortStartOfShift([...byId.values()]);
}

export function visibleRequiredAcknowledgements(items: BriefingWithMeta[]): BriefingWithMeta[] {
  return items.filter(
    (item) =>
      item.status === 'active' &&
      item.requires_acknowledgement &&
      !item.acknowledged_by_me,
  );
}

export function supportsBulkAcknowledge(view: BriefingQuickView): boolean {
  return view === 'required_review' || view === 'start_of_shift';
}
