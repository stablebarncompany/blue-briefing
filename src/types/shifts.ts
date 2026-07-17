import type { AgencyRole } from '@/types/agency';

export const SHIFT_ASSIGNMENT_TYPES = ['primary', 'secondary', 'temporary'] as const;
export type ShiftAssignmentType = (typeof SHIFT_ASSIGNMENT_TYPES)[number];

export const SUGGESTED_SHIFT_NAMES = [
  'A Shift',
  'B Shift',
  'C Shift',
  'D Shift',
  'Day Shift',
  'Night Shift',
  'Evening Shift',
  'Swing Shift',
  'Rotating Shift',
  'Administration',
  'Dispatch Days',
  'Dispatch Nights',
  'Other',
] as const;

export type AgencyShift = {
  id: string;
  agency_id: string;
  name: string;
  description: string | null;
  shift_code: string | null;
  start_time: string | null;
  end_time: string | null;
  color_key: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  member_count?: number;
  supervisor_names?: string[];
};

export type PersonnelShiftAssignment = {
  id: string;
  agency_id: string;
  shift_id: string;
  user_id: string;
  assignment_type: ShiftAssignmentType;
  effective_start: string | null;
  effective_end: string | null;
  is_active: boolean;
  assigned_by: string | null;
  created_at: string;
  updated_at: string;
  shift_name?: string | null;
  shift_code?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  display_name?: string | null;
  preferred_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  rank?: string | null;
  title?: string | null;
  unit?: string | null;
  badge_number?: string | null;
  role?: AgencyRole | null;
};

export type ShiftSupervisor = {
  id: string;
  agency_id: string;
  shift_id: string;
  user_id: string;
  is_primary: boolean;
  created_at: string;
  display_name?: string | null;
  preferred_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  rank?: string | null;
  title?: string | null;
  unit?: string | null;
};

export type CreateShiftInput = {
  name: string;
  description?: string | null;
  shift_code?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  color_key?: string | null;
  sort_order?: number | null;
};

export type UpdateShiftInput = {
  name?: string;
  description?: string | null;
  clear_description?: boolean;
  shift_code?: string | null;
  clear_shift_code?: boolean;
  start_time?: string | null;
  clear_start_time?: boolean;
  end_time?: string | null;
  clear_end_time?: boolean;
  color_key?: string | null;
  clear_color_key?: boolean;
  sort_order?: number | null;
};

export type AssignPersonnelToShiftInput = {
  userId: string;
  assignmentType?: ShiftAssignmentType;
  effectiveStart?: string | null;
  effectiveEnd?: string | null;
};

export function isShiftAssignmentType(value: string): value is ShiftAssignmentType {
  return (SHIFT_ASSIGNMENT_TYPES as readonly string[]).includes(value);
}

export function formatShiftAssignmentType(type: ShiftAssignmentType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function formatShiftHours(
  startTime: string | null | undefined,
  endTime: string | null | undefined,
): string {
  if (!startTime && !endTime) {
    return 'Hours not set';
  }
  const start = formatTimeLabel(startTime);
  const end = formatTimeLabel(endTime);
  if (start && end) {
    return `${start} – ${end}`;
  }
  return start || end || 'Hours not set';
}

export function formatTimeLabel(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?/.exec(trimmed);
  if (!match) {
    return trimmed;
  }
  const hour = Number(match[1]);
  const minute = match[2];
  if (!Number.isFinite(hour)) {
    return trimmed;
  }
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

export function assignmentDisplayName(row: {
  preferred_name?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  if (row.preferred_name?.trim()) {
    return row.preferred_name.trim();
  }
  if (row.display_name?.trim()) {
    return row.display_name.trim();
  }
  const combined = [row.first_name, row.last_name].filter(Boolean).join(' ').trim();
  return combined || 'Unknown member';
}

export function canManageShiftCatalog(role: AgencyRole | null | undefined): boolean {
  return role === 'agency_admin' || role === 'command_staff';
}

/**
 * Normalize a shift label for equality checks.
 * Collapses whitespace/punctuation differences and lowercases.
 * Does not merge distinct names like "Day" vs "Day Shift".
 */
export function normalizeShiftKey(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value
    .trim()
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[_/\\|,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Title-case a historical/custom shift label for display. */
export function titleCaseShiftLabel(value: string): string {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return '';
  }
  return cleaned
    .split(' ')
    .map((part) => {
      if (!part) return part;
      if (/^\d/.test(part)) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

/** Format a custom shift name before persisting on a new/updated briefing. */
export function formatShiftNameForStorage(value: string | null | undefined): string | null {
  const cleaned = value?.trim().replace(/\s+/g, ' ') ?? '';
  if (!cleaned) {
    return null;
  }
  return titleCaseShiftLabel(cleaned);
}

export function shiftsMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = normalizeShiftKey(left);
  const b = normalizeShiftKey(right);
  return !!a && !!b && a === b;
}

export type ShiftFilterOption = {
  /** Canonical display/filter label shown in chips. */
  label: string;
  /** Normalized comparison key. */
  key: string;
  /** True when label comes from the agency shift catalog. */
  fromCatalog: boolean;
};

/**
 * Build deduplicated shift filter options from agency catalog + historical names.
 * Prefer catalog names when normalized keys collide.
 */
export function buildShiftFilterOptions(options: {
  agencyShifts: { name: string; sort_order?: number; is_active?: boolean }[];
  historicalNames: (string | null | undefined)[];
}): ShiftFilterOption[] {
  const byKey = new Map<string, ShiftFilterOption>();

  const catalog = [...options.agencyShifts]
    .filter((shift) => shift.is_active !== false)
    .sort((a, b) => {
      const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });

  for (const shift of catalog) {
    const key = normalizeShiftKey(shift.name);
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        label: shift.name.trim().replace(/\s+/g, ' '),
        fromCatalog: true,
      });
    }
  }

  const historicalOnly: ShiftFilterOption[] = [];
  for (const raw of options.historicalNames) {
    const key = normalizeShiftKey(raw);
    if (!key || byKey.has(key)) {
      continue;
    }
    const label = titleCaseShiftLabel(String(raw));
    const option = { key, label, fromCatalog: false };
    byKey.set(key, option);
    historicalOnly.push(option);
  }

  historicalOnly.sort((a, b) => a.label.localeCompare(b.label));

  const catalogOptions = catalog
    .map((shift) => byKey.get(normalizeShiftKey(shift.name)))
    .filter((option): option is ShiftFilterOption => !!option)
    // Preserve first occurrence / catalog sort without duplicating keys.
    .filter((option, index, list) => list.findIndex((row) => row.key === option.key) === index);

  const catalogKeys = new Set(catalogOptions.map((option) => option.key));
  const remainingHistorical = historicalOnly.filter((option) => !catalogKeys.has(option.key));

  return [...catalogOptions, ...remainingHistorical];
}

/** Resolve a filter selection (label or raw param) to a normalized key. */
export function resolveShiftFilterKey(
  selected: string | null | undefined,
  options: ShiftFilterOption[],
): string | 'all' {
  const trimmed = selected?.trim() ?? '';
  if (!trimmed || trimmed.toLowerCase() === 'all') {
    return 'all';
  }
  const key = normalizeShiftKey(trimmed);
  const match = options.find(
    (option) => option.key === key || normalizeShiftKey(option.label) === key,
  );
  return match?.key ?? key;
}
