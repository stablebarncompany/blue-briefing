import { supabase } from '@/services/supabase';
import type {
  BriefingCategory,
  CreateBriefingCategoryInput,
  UpdateBriefingCategoryInput,
} from '@/types/briefingCategories';
import { normalizeCategoryKey } from '@/types/briefingCategories';

export class BriefingCategoryServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BriefingCategoryServiceError';
  }
}

function requireAgencyId(agencyId: string | null | undefined): string {
  if (!agencyId) {
    throw new BriefingCategoryServiceError('No agency is selected. Choose an agency to continue.');
  }
  return agencyId;
}

function mapRpcError(error: { message?: string } | null, fallback: string): BriefingCategoryServiceError {
  return new BriefingCategoryServiceError(error?.message || fallback);
}

function mapCategory(row: Record<string, unknown>): BriefingCategory {
  return {
    id: String(row.id),
    agency_id: String(row.agency_id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    color_key: (row.color_key as string | null) ?? null,
    icon_key: (row.icon_key as string | null) ?? null,
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order ?? 0),
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function isMissingRelationError(message: string | undefined): boolean {
  const text = (message ?? '').toLowerCase();
  return (
    text.includes('briefing_categories') ||
    text.includes('schema cache') ||
    text.includes('does not exist')
  );
}

export function validateCreateCategoryInput(input: CreateBriefingCategoryInput): string | null {
  const name = input.name?.trim() ?? '';
  if (!name) {
    return 'Category name is required.';
  }
  if (name.toLowerCase() === 'other') {
    return 'Enter a specific category name instead of Other.';
  }
  if (name.length > 80) {
    return 'Category name must be 80 characters or fewer.';
  }
  if ((input.description?.length ?? 0) > 500) {
    return 'Description must be 500 characters or fewer.';
  }
  return null;
}

export async function listBriefingCategories(options: {
  agencyId: string;
  includeInactive?: boolean;
  includeUsage?: boolean;
}): Promise<BriefingCategory[]> {
  const agencyId = requireAgencyId(options.agencyId);
  let query = supabase
    .from('briefing_categories')
    .select('*')
    .eq('agency_id', agencyId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (!options.includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error.message)) {
      throw new BriefingCategoryServiceError(
        'Briefing category tables are not available yet. Apply the categories migration.',
      );
    }
    throw mapRpcError(error, 'Unable to load briefing categories.');
  }

  const categories = (data ?? []).map((row) => mapCategory(row as Record<string, unknown>));
  if (!options.includeUsage || categories.length === 0) {
    return categories;
  }

  const { data: briefingRows, error: briefingError } = await supabase
    .from('briefings')
    .select('category')
    .eq('agency_id', agencyId)
    .not('category', 'is', null);

  if (briefingError) {
    return categories;
  }

  const counts = new Map<string, number>();
  for (const row of briefingRows ?? []) {
    const key = normalizeCategoryKey((row as { category: string | null }).category);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return categories.map((category) => ({
    ...category,
    usage_count: counts.get(normalizeCategoryKey(category.name)) ?? 0,
  }));
}

export async function createBriefingCategory(options: {
  agencyId: string;
  input: CreateBriefingCategoryInput;
}): Promise<BriefingCategory> {
  const agencyId = requireAgencyId(options.agencyId);
  const validationError = validateCreateCategoryInput(options.input);
  if (validationError) {
    throw new BriefingCategoryServiceError(validationError);
  }

  const { data, error } = await supabase.rpc('create_briefing_category', {
    p_agency_id: agencyId,
    p_name: options.input.name,
    p_description: options.input.description ?? null,
    p_color_key: options.input.color_key ?? null,
    p_icon_key: options.input.icon_key ?? null,
    p_sort_order: options.input.sort_order ?? null,
  });

  if (error) {
    throw mapRpcError(error, 'Unable to create category.');
  }
  return mapCategory(data as Record<string, unknown>);
}

export async function updateBriefingCategory(options: {
  categoryId: string;
  input: UpdateBriefingCategoryInput;
}): Promise<BriefingCategory> {
  const { data, error } = await supabase.rpc('update_briefing_category', {
    p_category_id: options.categoryId,
    p_name: options.input.name ?? null,
    p_description: options.input.description ?? null,
    p_clear_description: options.input.clear_description ?? false,
    p_color_key: options.input.color_key ?? null,
    p_clear_color_key: options.input.clear_color_key ?? false,
    p_icon_key: options.input.icon_key ?? null,
    p_clear_icon_key: options.input.clear_icon_key ?? false,
    p_sort_order: options.input.sort_order ?? null,
  });

  if (error) {
    throw mapRpcError(error, 'Unable to update category.');
  }
  return mapCategory(data as Record<string, unknown>);
}

export async function setBriefingCategoryActive(options: {
  categoryId: string;
  isActive: boolean;
}): Promise<BriefingCategory> {
  const { data, error } = await supabase.rpc('set_briefing_category_active', {
    p_category_id: options.categoryId,
    p_is_active: options.isActive,
  });

  if (error) {
    throw mapRpcError(error, 'Unable to update category status.');
  }
  return mapCategory(data as Record<string, unknown>);
}

export async function deactivateBriefingCategory(categoryId: string): Promise<BriefingCategory> {
  return setBriefingCategoryActive({ categoryId, isActive: false });
}

export async function reactivateBriefingCategory(categoryId: string): Promise<BriefingCategory> {
  return setBriefingCategoryActive({ categoryId, isActive: true });
}

export async function reorderBriefingCategories(options: {
  agencyId: string;
  categoryIds: string[];
}): Promise<BriefingCategory[]> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase.rpc('reorder_briefing_categories', {
    p_agency_id: agencyId,
    p_category_ids: options.categoryIds,
  });

  if (error) {
    throw mapRpcError(error, 'Unable to reorder categories.');
  }
  return (data ?? []).map((row: Record<string, unknown>) => mapCategory(row));
}
