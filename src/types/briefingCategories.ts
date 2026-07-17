import type { AgencyRole } from '@/types/agency';
import type { ColorToken } from '@/theme';

export const SUGGESTED_CATEGORY_NAMES = [
  'Officer Safety',
  'BOLO',
  'Wanted Person',
  'Missing Person',
  'Suspicious Activity',
  'Criminal Intelligence',
  'Case Update',
  'Investigations',
  'Narcotics',
  'Traffic',
  'Patrol',
  'Court',
  'Training',
  'Equipment',
  'Policy',
  'Administrative',
  'Community Information',
  'Road Closure',
  'Weather',
  'Follow-Up Required',
  'Other',
] as const;

export const CATEGORY_COLOR_KEYS = [
  'primary',
  'success',
  'warning',
  'danger',
  'textMuted',
] as const;

export type CategoryColorKey = (typeof CATEGORY_COLOR_KEYS)[number];

export const CATEGORY_ICON_KEYS = [
  'shield',
  'alert',
  'search',
  'person',
  'car',
  'doc',
  'tool',
  'info',
  'weather',
  'flag',
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

export type BriefingCategory = {
  id: string;
  agency_id: string;
  name: string;
  description: string | null;
  color_key: string | null;
  icon_key: string | null;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  usage_count?: number;
};

export type CreateBriefingCategoryInput = {
  name: string;
  description?: string | null;
  color_key?: string | null;
  icon_key?: string | null;
  sort_order?: number | null;
};

export type UpdateBriefingCategoryInput = {
  name?: string;
  description?: string | null;
  clear_description?: boolean;
  color_key?: string | null;
  clear_color_key?: boolean;
  icon_key?: string | null;
  clear_icon_key?: boolean;
  sort_order?: number | null;
};

export type CategoryFilterOption = {
  label: string;
  key: string;
  fromCatalog: boolean;
};

export function canManageBriefingCatalog(role: AgencyRole | null | undefined): boolean {
  return role === 'agency_admin' || role === 'command_staff';
}

export function isCategoryColorKey(value: string | null | undefined): value is CategoryColorKey {
  return !!value && (CATEGORY_COLOR_KEYS as readonly string[]).includes(value);
}

export function isCategoryIconKey(value: string | null | undefined): value is CategoryIconKey {
  return !!value && (CATEGORY_ICON_KEYS as readonly string[]).includes(value);
}

export function categoryAccentColor(colorKey: string | null | undefined): ColorToken {
  if (isCategoryColorKey(colorKey)) {
    return colorKey;
  }
  return 'textMuted';
}

export function formatCategoryIconLabel(iconKey: string | null | undefined): string {
  if (!iconKey?.trim()) {
    return '';
  }
  const key = iconKey.trim().toLowerCase();
  const labels: Record<string, string> = {
    shield: 'Shield',
    alert: 'Alert',
    search: 'Search',
    person: 'Person',
    car: 'Vehicle',
    doc: 'Document',
    tool: 'Equipment',
    info: 'Info',
    weather: 'Weather',
    flag: 'Flag',
  };
  return labels[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/**
 * Normalize a category label for equality checks.
 * Collapses whitespace/punctuation differences and lowercases.
 * Does not merge distinct names like "Patrol" vs "Patrol Ops".
 */
export function normalizeCategoryKey(value: string | null | undefined): string {
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

export function titleCaseCategoryLabel(value: string): string {
  const cleaned = value.trim().replace(/\s+/g, ' ');
  if (!cleaned) {
    return '';
  }
  return cleaned
    .split(' ')
    .map((part) => {
      if (!part) return part;
      if (/^(bolo|ai|id)$/i.test(part)) {
        return part.toUpperCase();
      }
      if (/^\d/.test(part)) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

export function formatCategoryNameForStorage(value: string | null | undefined): string | null {
  const cleaned = value?.trim().replace(/\s+/g, ' ') ?? '';
  if (!cleaned) {
    return null;
  }
  return titleCaseCategoryLabel(cleaned);
}

export function categoriesMatch(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const a = normalizeCategoryKey(left);
  const b = normalizeCategoryKey(right);
  return !!a && !!b && a === b;
}

export function buildCategoryFilterOptions(options: {
  agencyCategories: { name: string; sort_order?: number; is_active?: boolean }[];
  historicalNames: (string | null | undefined)[];
}): CategoryFilterOption[] {
  const byKey = new Map<string, CategoryFilterOption>();

  const catalog = [...options.agencyCategories]
    .filter((category) => category.is_active !== false)
    .sort((a, b) => {
      const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });

  for (const category of catalog) {
    const key = normalizeCategoryKey(category.name);
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        label: category.name.trim().replace(/\s+/g, ' '),
        fromCatalog: true,
      });
    }
  }

  const historicalOnly: CategoryFilterOption[] = [];
  for (const raw of options.historicalNames) {
    const key = normalizeCategoryKey(raw);
    if (!key || byKey.has(key)) {
      continue;
    }
    const option = {
      key,
      label: titleCaseCategoryLabel(String(raw)),
      fromCatalog: false,
    };
    byKey.set(key, option);
    historicalOnly.push(option);
  }

  historicalOnly.sort((a, b) => a.label.localeCompare(b.label));

  const catalogOptions = catalog
    .map((category) => byKey.get(normalizeCategoryKey(category.name)))
    .filter((option): option is CategoryFilterOption => !!option)
    .filter((option, index, list) => list.findIndex((row) => row.key === option.key) === index);

  const catalogKeys = new Set(catalogOptions.map((option) => option.key));
  const remainingHistorical = historicalOnly.filter((option) => !catalogKeys.has(option.key));

  return [...catalogOptions, ...remainingHistorical];
}

export function resolveCategoryFilterKey(
  selected: string | null | undefined,
  options: CategoryFilterOption[],
): string | 'all' {
  const trimmed = selected?.trim() ?? '';
  if (!trimmed || trimmed.toLowerCase() === 'all') {
    return 'all';
  }
  const key = normalizeCategoryKey(trimmed);
  const match = options.find(
    (option) => option.key === key || normalizeCategoryKey(option.label) === key,
  );
  return match?.key ?? key;
}
