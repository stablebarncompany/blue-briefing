import { supabase } from '@/services/supabase';
import { listPersonnelIdentitySummaries } from '@/services/personnel-profiles';
import type {
  AgencyShift,
  AssignPersonnelToShiftInput,
  CreateShiftInput,
  PersonnelShiftAssignment,
  ShiftAssignmentType,
  ShiftSupervisor,
  UpdateShiftInput,
} from '@/types/shifts';
import { isShiftAssignmentType } from '@/types/shifts';
import { isAgencyRole } from '@/types/agency';

export class ShiftServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShiftServiceError';
  }
}

function requireAgencyId(agencyId: string | null | undefined): string {
  if (!agencyId) {
    throw new ShiftServiceError('No agency is selected. Choose an agency to continue.');
  }
  return agencyId;
}

function mapRpcError(error: { message?: string } | null, fallback: string): ShiftServiceError {
  return new ShiftServiceError(error?.message || fallback);
}

function mapShift(row: Record<string, unknown>): AgencyShift {
  return {
    id: String(row.id),
    agency_id: String(row.agency_id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    shift_code: (row.shift_code as string | null) ?? null,
    start_time: row.start_time != null ? String(row.start_time) : null,
    end_time: row.end_time != null ? String(row.end_time) : null,
    color_key: (row.color_key as string | null) ?? null,
    is_active: Boolean(row.is_active),
    sort_order: Number(row.sort_order ?? 0),
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapAssignment(row: Record<string, unknown>): PersonnelShiftAssignment {
  const type = String(row.assignment_type ?? 'primary');
  return {
    id: String(row.id),
    agency_id: String(row.agency_id),
    shift_id: String(row.shift_id),
    user_id: String(row.user_id),
    assignment_type: isShiftAssignmentType(type) ? type : 'primary',
    effective_start: row.effective_start != null ? String(row.effective_start) : null,
    effective_end: row.effective_end != null ? String(row.effective_end) : null,
    is_active: Boolean(row.is_active),
    assigned_by: (row.assigned_by as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapSupervisor(row: Record<string, unknown>): ShiftSupervisor {
  return {
    id: String(row.id),
    agency_id: String(row.agency_id),
    shift_id: String(row.shift_id),
    user_id: String(row.user_id),
    is_primary: Boolean(row.is_primary),
    created_at: String(row.created_at),
  };
}

function isMissingRelationError(message: string | undefined): boolean {
  const text = (message ?? '').toLowerCase();
  return (
    text.includes('agency_shifts') ||
    text.includes('personnel_shift_assignments') ||
    text.includes('shift_supervisors') ||
    text.includes('schema cache') ||
    text.includes('does not exist')
  );
}

export function validateCreateShiftInput(input: CreateShiftInput): string | null {
  const name = input.name?.trim() ?? '';
  if (!name) {
    return 'Shift name is required.';
  }
  if (name.toLowerCase() === 'other') {
    return 'Enter a specific shift name instead of Other.';
  }
  if (name.length > 80) {
    return 'Shift name must be 80 characters or fewer.';
  }
  if ((input.description?.length ?? 0) > 500) {
    return 'Description must be 500 characters or fewer.';
  }
  if ((input.shift_code?.length ?? 0) > 32) {
    return 'Shift code must be 32 characters or fewer.';
  }
  return null;
}

export async function listAgencyShifts(options: {
  agencyId: string;
  includeInactive?: boolean;
}): Promise<AgencyShift[]> {
  const agencyId = requireAgencyId(options.agencyId);
  let query = supabase
    .from('agency_shifts')
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
      throw new ShiftServiceError(
        'Shift tables are not available yet. Apply the agency shifts migration.',
      );
    }
    throw mapRpcError(error, 'Unable to load agency shifts.');
  }

  const shifts = (data ?? []).map((row) => mapShift(row as Record<string, unknown>));
  if (shifts.length === 0) {
    return shifts;
  }

  const shiftIds = shifts.map((shift) => shift.id);
  const [{ data: assignmentRows, error: assignmentError }, supervisors] = await Promise.all([
    supabase
      .from('personnel_shift_assignments')
      .select('shift_id')
      .eq('agency_id', agencyId)
      .eq('is_active', true)
      .in('shift_id', shiftIds),
    listShiftSupervisors({ agencyId }).catch(() => [] as ShiftSupervisor[]),
  ]);

  if (assignmentError) {
    throw mapRpcError(assignmentError, 'Unable to load shift assignment counts.');
  }

  const counts = new Map<string, number>();
  for (const row of assignmentRows ?? []) {
    const shiftId = String((row as { shift_id: string }).shift_id);
    counts.set(shiftId, (counts.get(shiftId) ?? 0) + 1);
  }

  const supervisorsByShift = new Map<string, string[]>();
  for (const supervisor of supervisors) {
    const label =
      supervisor.preferred_name ||
      supervisor.display_name ||
      [supervisor.first_name, supervisor.last_name].filter(Boolean).join(' ') ||
      'Supervisor';
    const current = supervisorsByShift.get(supervisor.shift_id) ?? [];
    current.push(supervisor.is_primary ? `${label} (primary)` : label);
    supervisorsByShift.set(supervisor.shift_id, current);
  }

  return shifts.map((shift) => ({
    ...shift,
    member_count: counts.get(shift.id) ?? 0,
    supervisor_names: supervisorsByShift.get(shift.id) ?? [],
  }));
}

export async function getShift(options: {
  agencyId: string;
  shiftId: string;
}): Promise<AgencyShift> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('agency_shifts')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('id', options.shiftId)
    .maybeSingle();

  if (error) {
    throw mapRpcError(error, 'Unable to load shift.');
  }
  if (!data) {
    throw new ShiftServiceError('Shift not found for this agency.');
  }
  return mapShift(data as Record<string, unknown>);
}

export async function createShift(options: {
  agencyId: string;
  input: CreateShiftInput;
}): Promise<AgencyShift> {
  const agencyId = requireAgencyId(options.agencyId);
  const validationError = validateCreateShiftInput(options.input);
  if (validationError) {
    throw new ShiftServiceError(validationError);
  }

  const { data, error } = await supabase.rpc('create_agency_shift', {
    p_agency_id: agencyId,
    p_name: options.input.name.trim(),
    p_description: options.input.description?.trim() || null,
    p_shift_code: options.input.shift_code?.trim() || null,
    p_start_time: options.input.start_time || null,
    p_end_time: options.input.end_time || null,
    p_color_key: options.input.color_key?.trim() || null,
    p_sort_order: options.input.sort_order ?? null,
  });

  if (error) {
    throw mapRpcError(error, 'Unable to create shift.');
  }
  return mapShift(data as Record<string, unknown>);
}

export async function updateShift(options: {
  agencyId: string;
  shiftId: string;
  input: UpdateShiftInput;
}): Promise<AgencyShift> {
  requireAgencyId(options.agencyId);
  if (options.input.name != null) {
    const validationError = validateCreateShiftInput({ name: options.input.name });
    if (validationError) {
      throw new ShiftServiceError(validationError);
    }
  }

  const { data, error } = await supabase.rpc('update_agency_shift', {
    p_shift_id: options.shiftId,
    p_name: options.input.name?.trim() ?? null,
    p_description: options.input.description ?? null,
    p_clear_description: !!options.input.clear_description,
    p_shift_code: options.input.shift_code ?? null,
    p_clear_shift_code: !!options.input.clear_shift_code,
    p_start_time: options.input.start_time ?? null,
    p_clear_start_time: !!options.input.clear_start_time,
    p_end_time: options.input.end_time ?? null,
    p_clear_end_time: !!options.input.clear_end_time,
    p_color_key: options.input.color_key ?? null,
    p_clear_color_key: !!options.input.clear_color_key,
    p_sort_order: options.input.sort_order ?? null,
  });

  if (error) {
    throw mapRpcError(error, 'Unable to update shift.');
  }
  return mapShift(data as Record<string, unknown>);
}

export async function deactivateShift(options: {
  agencyId: string;
  shiftId: string;
}): Promise<AgencyShift> {
  requireAgencyId(options.agencyId);
  const { data, error } = await supabase.rpc('set_agency_shift_active', {
    p_shift_id: options.shiftId,
    p_is_active: false,
  });
  if (error) {
    throw mapRpcError(error, 'Unable to deactivate shift.');
  }
  return mapShift(data as Record<string, unknown>);
}

export async function reactivateShift(options: {
  agencyId: string;
  shiftId: string;
}): Promise<AgencyShift> {
  requireAgencyId(options.agencyId);
  const { data, error } = await supabase.rpc('set_agency_shift_active', {
    p_shift_id: options.shiftId,
    p_is_active: true,
  });
  if (error) {
    throw mapRpcError(error, 'Unable to reactivate shift.');
  }
  return mapShift(data as Record<string, unknown>);
}

export async function listShiftAssignments(options: {
  agencyId: string;
  shiftId?: string;
  userId?: string;
  activeOnly?: boolean;
}): Promise<PersonnelShiftAssignment[]> {
  const agencyId = requireAgencyId(options.agencyId);
  let query = supabase
    .from('personnel_shift_assignments')
    .select('*')
    .eq('agency_id', agencyId)
    .order('updated_at', { ascending: false });

  if (options.shiftId) {
    query = query.eq('shift_id', options.shiftId);
  }
  if (options.userId) {
    query = query.eq('user_id', options.userId);
  }
  if (options.activeOnly !== false) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingRelationError(error.message)) {
      throw new ShiftServiceError(
        'Shift assignment tables are not available yet. Apply the agency shifts migration.',
      );
    }
    throw mapRpcError(error, 'Unable to load shift assignments.');
  }

  const rows = (data ?? []).map((row) => mapAssignment(row as Record<string, unknown>));
  if (rows.length === 0) {
    return rows;
  }

  const shiftIds = [...new Set(rows.map((row) => row.shift_id))];
  const userIds = [...new Set(rows.map((row) => row.user_id))];

  const [{ data: shifts, error: shiftsError }, identities, { data: members }] = await Promise.all([
    supabase.from('agency_shifts').select('id, name, shift_code, start_time, end_time').in('id', shiftIds),
    listPersonnelIdentitySummaries({ agencyId, userIds }),
    supabase
      .from('agency_members')
      .select('user_id, rank, title, unit, badge_number, role')
      .eq('agency_id', agencyId)
      .in('user_id', userIds),
  ]);

  if (shiftsError) {
    throw mapRpcError(shiftsError, 'Unable to load shift details for assignments.');
  }

  const shiftMap = new Map(
    (shifts ?? []).map((row) => [String(row.id), row as Record<string, unknown>]),
  );
  const memberMap = new Map(
    (members ?? []).map((row) => [String(row.user_id), row as Record<string, unknown>]),
  );

  return rows.map((row) => {
    const shift = shiftMap.get(row.shift_id);
    const identity = identities.get(row.user_id);
    const member = memberMap.get(row.user_id);
    const role = member?.role != null ? String(member.role) : null;
    return {
      ...row,
      shift_name: (shift?.name as string | null) ?? null,
      shift_code: (shift?.shift_code as string | null) ?? null,
      start_time: shift?.start_time != null ? String(shift.start_time) : null,
      end_time: shift?.end_time != null ? String(shift.end_time) : null,
      display_name: identity?.display_name ?? null,
      preferred_name: identity?.preferred_name ?? null,
      first_name: identity?.first_name ?? null,
      last_name: identity?.last_name ?? null,
      rank: (member?.rank as string | null) ?? identity?.rank ?? null,
      title: (member?.title as string | null) ?? identity?.title ?? null,
      unit: (member?.unit as string | null) ?? identity?.unit ?? null,
      badge_number: (member?.badge_number as string | null) ?? null,
      role: role && isAgencyRole(role) ? role : null,
    };
  });
}

export async function assignPersonnelToShift(options: {
  agencyId: string;
  shiftId: string;
  input: AssignPersonnelToShiftInput;
}): Promise<PersonnelShiftAssignment> {
  const agencyId = requireAgencyId(options.agencyId);
  const assignmentType: ShiftAssignmentType = options.input.assignmentType ?? 'primary';
  if (!isShiftAssignmentType(assignmentType)) {
    throw new ShiftServiceError('Invalid assignment type.');
  }
  if (!options.input.userId) {
    throw new ShiftServiceError('Select a member to assign.');
  }

  const { data, error } = await supabase.rpc('assign_personnel_to_shift', {
    p_agency_id: agencyId,
    p_shift_id: options.shiftId,
    p_user_id: options.input.userId,
    p_assignment_type: assignmentType,
    p_effective_start: options.input.effectiveStart || null,
    p_effective_end: options.input.effectiveEnd || null,
  });

  if (error) {
    throw mapRpcError(error, 'Unable to assign personnel to shift.');
  }
  return mapAssignment(data as Record<string, unknown>);
}

export async function removeShiftAssignment(options: {
  agencyId: string;
  assignmentId: string;
}): Promise<PersonnelShiftAssignment> {
  requireAgencyId(options.agencyId);
  const { data, error } = await supabase.rpc('remove_personnel_shift_assignment', {
    p_assignment_id: options.assignmentId,
  });
  if (error) {
    throw mapRpcError(error, 'Unable to remove shift assignment.');
  }
  return mapAssignment(data as Record<string, unknown>);
}

export async function listShiftSupervisors(options: {
  agencyId: string;
  shiftId?: string;
}): Promise<ShiftSupervisor[]> {
  const agencyId = requireAgencyId(options.agencyId);
  let query = supabase.from('shift_supervisors').select('*').eq('agency_id', agencyId);
  if (options.shiftId) {
    query = query.eq('shift_id', options.shiftId);
  }

  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) {
    if (isMissingRelationError(error.message)) {
      throw new ShiftServiceError(
        'Shift supervisor tables are not available yet. Apply the agency shifts migration.',
      );
    }
    throw mapRpcError(error, 'Unable to load shift supervisors.');
  }

  const rows = (data ?? []).map((row) => mapSupervisor(row as Record<string, unknown>));
  if (rows.length === 0) {
    return rows;
  }

  const identities = await listPersonnelIdentitySummaries({
    agencyId,
    userIds: rows.map((row) => row.user_id),
  });

  return rows.map((row) => {
    const identity = identities.get(row.user_id);
    return {
      ...row,
      display_name: identity?.display_name ?? null,
      preferred_name: identity?.preferred_name ?? null,
      first_name: identity?.first_name ?? null,
      last_name: identity?.last_name ?? null,
      rank: identity?.rank ?? null,
      title: identity?.title ?? null,
      unit: identity?.unit ?? null,
    };
  });
}

export async function assignShiftSupervisor(options: {
  agencyId: string;
  shiftId: string;
  userId: string;
  isPrimary?: boolean;
}): Promise<ShiftSupervisor> {
  const agencyId = requireAgencyId(options.agencyId);
  if (!options.userId) {
    throw new ShiftServiceError('Select a supervisor.');
  }

  const { data, error } = await supabase.rpc('assign_shift_supervisor', {
    p_agency_id: agencyId,
    p_shift_id: options.shiftId,
    p_user_id: options.userId,
    p_is_primary: !!options.isPrimary,
  });

  if (error) {
    throw mapRpcError(error, 'Unable to assign shift supervisor.');
  }
  return mapSupervisor(data as Record<string, unknown>);
}

export async function removeShiftSupervisor(options: {
  agencyId: string;
  supervisorId: string;
}): Promise<ShiftSupervisor> {
  requireAgencyId(options.agencyId);
  const { data, error } = await supabase.rpc('remove_shift_supervisor', {
    p_supervisor_id: options.supervisorId,
  });
  if (error) {
    throw mapRpcError(error, 'Unable to remove shift supervisor.');
  }
  return mapSupervisor(data as Record<string, unknown>);
}

/** Active primary assignments for roster enrichment. */
export async function listPrimaryShiftByUser(options: {
  agencyId: string;
}): Promise<Map<string, { shift_id: string; shift_name: string }>> {
  const agencyId = requireAgencyId(options.agencyId);
  const map = new Map<string, { shift_id: string; shift_name: string }>();

  const { data, error } = await supabase
    .from('personnel_shift_assignments')
    .select('user_id, shift_id')
    .eq('agency_id', agencyId)
    .eq('is_active', true)
    .eq('assignment_type', 'primary');

  if (error) {
    if (isMissingRelationError(error.message)) {
      return map;
    }
    throw mapRpcError(error, 'Unable to load primary shift assignments.');
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return map;
  }

  const shiftIds = [...new Set(rows.map((row) => String(row.shift_id)))];
  const { data: shifts, error: shiftsError } = await supabase
    .from('agency_shifts')
    .select('id, name')
    .eq('agency_id', agencyId)
    .in('id', shiftIds);

  if (shiftsError) {
    if (isMissingRelationError(shiftsError.message)) {
      return map;
    }
    throw mapRpcError(shiftsError, 'Unable to load primary shift names.');
  }

  const names = new Map(
    (shifts ?? []).map((row) => [String(row.id), String(row.name)]),
  );

  for (const row of rows) {
    const userId = String(row.user_id);
    const shiftId = String(row.shift_id);
    const shiftName = names.get(shiftId);
    if (shiftName) {
      map.set(userId, { shift_id: shiftId, shift_name: shiftName });
    }
  }

  return map;
}
