import { supabase } from '@/services/supabase';
import type {
  BriefingTemplate,
  CreateBriefingTemplateInput,
  UpdateBriefingTemplateInput,
} from '@/types/briefingTemplates';
import { isBriefingPriority } from '@/types/briefings';

export class BriefingTemplateServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BriefingTemplateServiceError';
  }
}

function requireAgencyId(agencyId: string | null | undefined): string {
  if (!agencyId) {
    throw new BriefingTemplateServiceError('No agency is selected. Choose an agency to continue.');
  }
  return agencyId;
}

function mapRpcError(error: { message?: string } | null, fallback: string): BriefingTemplateServiceError {
  return new BriefingTemplateServiceError(error?.message || fallback);
}

function mapTemplate(row: Record<string, unknown>): BriefingTemplate {
  const priority = String(row.default_priority ?? 'medium');
  return {
    id: String(row.id),
    agency_id: String(row.agency_id),
    category_id: (row.category_id as string | null) ?? null,
    name: String(row.name),
    title_template: (row.title_template as string | null) ?? null,
    body_template: String(row.body_template ?? ''),
    default_priority: isBriefingPriority(priority) ? priority : 'medium',
    requires_acknowledgement: Boolean(row.requires_acknowledgement),
    is_active: Boolean(row.is_active),
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function isMissingRelationError(message: string | undefined): boolean {
  const text = (message ?? '').toLowerCase();
  return (
    text.includes('briefing_templates') ||
    text.includes('schema cache') ||
    text.includes('does not exist')
  );
}

export function validateCreateTemplateInput(input: CreateBriefingTemplateInput): string | null {
  const name = input.name?.trim() ?? '';
  const body = input.body_template?.trim() ?? '';
  if (!name) {
    return 'Template name is required.';
  }
  if (name.length > 120) {
    return 'Template name must be 120 characters or fewer.';
  }
  if (!body) {
    return 'Template body is required.';
  }
  if (body.length > 8000) {
    return 'Template body must be 8000 characters or fewer.';
  }
  if ((input.title_template?.length ?? 0) > 160) {
    return 'Title template must be 160 characters or fewer.';
  }
  return null;
}

export async function listBriefingTemplates(options: {
  agencyId: string;
  includeInactive?: boolean;
}): Promise<BriefingTemplate[]> {
  const agencyId = requireAgencyId(options.agencyId);
  let query = supabase
    .from('briefing_templates')
    .select('*')
    .eq('agency_id', agencyId)
    .order('name', { ascending: true });

  if (!options.includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error.message)) {
      throw new BriefingTemplateServiceError(
        'Briefing template tables are not available yet. Apply the categories/templates migration.',
      );
    }
    throw mapRpcError(error, 'Unable to load briefing templates.');
  }

  const templates = (data ?? []).map((row) => mapTemplate(row as Record<string, unknown>));
  if (templates.length === 0) {
    return templates;
  }

  const categoryIds = [
    ...new Set(templates.map((row) => row.category_id).filter((id): id is string => !!id)),
  ];
  if (categoryIds.length === 0) {
    return templates;
  }

  const { data: categoryRows } = await supabase
    .from('briefing_categories')
    .select('id, name')
    .eq('agency_id', agencyId)
    .in('id', categoryIds);

  const names = new Map<string, string>();
  for (const row of categoryRows ?? []) {
    names.set(String((row as { id: string }).id), String((row as { name: string }).name));
  }

  return templates.map((template) => ({
    ...template,
    category_name: template.category_id ? (names.get(template.category_id) ?? null) : null,
  }));
}

export async function createBriefingTemplate(options: {
  agencyId: string;
  input: CreateBriefingTemplateInput;
}): Promise<BriefingTemplate> {
  const agencyId = requireAgencyId(options.agencyId);
  const validationError = validateCreateTemplateInput(options.input);
  if (validationError) {
    throw new BriefingTemplateServiceError(validationError);
  }

  const { data, error } = await supabase.rpc('create_briefing_template', {
    p_agency_id: agencyId,
    p_name: options.input.name,
    p_body_template: options.input.body_template,
    p_title_template: options.input.title_template ?? null,
    p_category_id: options.input.category_id ?? null,
    p_default_priority: options.input.default_priority ?? 'medium',
    p_requires_acknowledgement: options.input.requires_acknowledgement ?? true,
  });

  if (error) {
    throw mapRpcError(error, 'Unable to create template.');
  }
  return mapTemplate(data as Record<string, unknown>);
}

export async function updateBriefingTemplate(options: {
  templateId: string;
  input: UpdateBriefingTemplateInput;
}): Promise<BriefingTemplate> {
  const { data, error } = await supabase.rpc('update_briefing_template', {
    p_template_id: options.templateId,
    p_name: options.input.name ?? null,
    p_title_template: options.input.title_template ?? null,
    p_clear_title_template: options.input.clear_title_template ?? false,
    p_body_template: options.input.body_template ?? null,
    p_category_id: options.input.category_id ?? null,
    p_clear_category: options.input.clear_category ?? false,
    p_default_priority: options.input.default_priority ?? null,
    p_requires_acknowledgement: options.input.requires_acknowledgement ?? null,
  });

  if (error) {
    throw mapRpcError(error, 'Unable to update template.');
  }
  return mapTemplate(data as Record<string, unknown>);
}

export async function setBriefingTemplateActive(options: {
  templateId: string;
  isActive: boolean;
}): Promise<BriefingTemplate> {
  const { data, error } = await supabase.rpc('set_briefing_template_active', {
    p_template_id: options.templateId,
    p_is_active: options.isActive,
  });

  if (error) {
    throw mapRpcError(error, 'Unable to update template status.');
  }
  return mapTemplate(data as Record<string, unknown>);
}

export async function deactivateBriefingTemplate(templateId: string): Promise<BriefingTemplate> {
  return setBriefingTemplateActive({ templateId, isActive: false });
}

export async function reactivateBriefingTemplate(templateId: string): Promise<BriefingTemplate> {
  return setBriefingTemplateActive({ templateId, isActive: true });
}

export async function duplicateBriefingTemplate(options: {
  templateId: string;
  name?: string | null;
}): Promise<BriefingTemplate> {
  const { data, error } = await supabase.rpc('duplicate_briefing_template', {
    p_template_id: options.templateId,
    p_name: options.name ?? null,
  });

  if (error) {
    throw mapRpcError(error, 'Unable to duplicate template.');
  }
  return mapTemplate(data as Record<string, unknown>);
}
