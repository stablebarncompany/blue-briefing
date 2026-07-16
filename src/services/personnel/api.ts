import * as Linking from 'expo-linking';

import { supabase } from '@/services/supabase';
import type { AgencyRole, MembershipStatus } from '@/types/agency';
import { isAgencyRole, isMembershipStatus } from '@/types/agency';
import type {
  AcceptAgencyInviteResult,
  AgencyInvite,
  CreateAgencyInviteInput,
  CreatedAgencyInvite,
  PersonnelListFilters,
  PersonnelMember,
  UpdateMembershipInput,
} from '@/types/personnel';
import {
  DEFAULT_INVITE_EXPIRES_DAYS,
  MAX_INVITE_EXPIRES_DAYS,
  isAgencyInviteStatus,
} from '@/types/personnel';

export class PersonnelServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersonnelServiceError';
  }
}

function requireAgencyId(agencyId: string | null | undefined): string {
  if (!agencyId) {
    throw new PersonnelServiceError('No agency is selected. Choose an agency to continue.');
  }
  return agencyId;
}

function mapRpcError(error: { message?: string } | null, fallback: string): never {
  const message = error?.message?.trim();
  throw new PersonnelServiceError(message || fallback);
}

function mapInvite(row: Record<string, unknown>): AgencyInvite {
  const role = String(row.role);
  const status = String(row.status);
  if (!isAgencyRole(role) || !isAgencyInviteStatus(status)) {
    throw new PersonnelServiceError('Received an invalid invitation record from the server.');
  }

  return {
    id: String(row.id),
    agency_id: String(row.agency_id),
    email: String(row.email),
    role,
    unit: (row.unit as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    badge_number: (row.badge_number as string | null) ?? null,
    invited_by: String(row.invited_by),
    status,
    expires_at: String(row.expires_at),
    accepted_by: (row.accepted_by as string | null) ?? null,
    accepted_at: (row.accepted_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapPersonnelMember(
  row: Record<string, unknown>,
  profile: {
    display_name: string | null;
    email: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null,
): PersonnelMember {
  const role = String(row.role);
  const status = String(row.status);
  if (!isAgencyRole(role) || !isMembershipStatus(status)) {
    throw new PersonnelServiceError('Received an invalid membership record from the server.');
  }

  return {
    id: String(row.id),
    agency_id: String(row.agency_id),
    user_id: String(row.user_id),
    role,
    status,
    unit: (row.unit as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    badge_number: (row.badge_number as string | null) ?? null,
    joined_at: (row.joined_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    display_name: profile?.display_name ?? null,
    email: profile?.email ?? null,
    first_name: profile?.first_name ?? null,
    last_name: profile?.last_name ?? null,
  };
}

function applyPersonnelFilters(
  items: PersonnelMember[],
  filters: PersonnelListFilters,
): PersonnelMember[] {
  const search = filters.search?.trim().toLowerCase() ?? '';
  const role = filters.role && filters.role !== 'all' ? filters.role : null;
  const unit = filters.unit && filters.unit !== 'all' ? filters.unit.trim().toLowerCase() : null;
  const status = filters.status && filters.status !== 'all' ? filters.status : null;

  return items.filter((item) => {
    if (role && item.role !== role) {
      return false;
    }
    if (status && item.status !== status) {
      return false;
    }
    if (unit && (item.unit ?? '').trim().toLowerCase() !== unit) {
      return false;
    }
    if (!search) {
      return true;
    }
    const haystack = [
      item.display_name,
      item.first_name,
      item.last_name,
      item.email,
      item.role,
      item.unit,
      item.title,
      item.badge_number,
      item.status,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(search);
  });
}

export function validateCreateAgencyInviteInput(
  input: CreateAgencyInviteInput,
): string | null {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return 'Enter a valid email address.';
  }
  if (!isAgencyRole(input.role)) {
    return 'Select a valid role.';
  }
  const days = input.expires_in_days ?? DEFAULT_INVITE_EXPIRES_DAYS;
  if (!Number.isFinite(days) || days < 1 || days > MAX_INVITE_EXPIRES_DAYS) {
    return `Expiration must be between 1 and ${MAX_INVITE_EXPIRES_DAYS} days.`;
  }
  return null;
}

export async function listPersonnel(
  agencyId: string,
  filters: PersonnelListFilters = {},
): Promise<PersonnelMember[]> {
  const scopedAgencyId = requireAgencyId(agencyId);

  let query = supabase
    .from('agency_members')
    .select(
      `
      id,
      agency_id,
      user_id,
      role,
      status,
      unit,
      title,
      badge_number,
      joined_at,
      created_at,
      updated_at
    `,
    )
    .eq('agency_id', scopedAgencyId)
    .order('created_at', { ascending: true });

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  const { data, error } = await query;
  if (error) {
    throw new PersonnelServiceError(error.message || 'Unable to load personnel.');
  }

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((row) => String(row.user_id)).filter(Boolean))];
  const profiles = new Map<
    string,
    {
      display_name: string | null;
      email: string | null;
      first_name: string | null;
      last_name: string | null;
    }
  >();

  if (userIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from('profiles')
      .select('id, display_name, email, first_name, last_name')
      .in('id', userIds);

    if (profileError) {
      throw new PersonnelServiceError(profileError.message || 'Unable to load member profiles.');
    }

    for (const profile of profileRows ?? []) {
      profiles.set(String(profile.id), {
        display_name: profile.display_name,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
      });
    }
  }

  const members = rows.map((row) =>
    mapPersonnelMember(row as Record<string, unknown>, profiles.get(String(row.user_id)) ?? null),
  );

  const filtered = applyPersonnelFilters(members, {
    ...filters,
    status: 'all',
  });

  const groupCounts = await fetchPersonnelGroupCounts(
    scopedAgencyId,
    filtered.map((member) => member.user_id),
  );

  return filtered.map((member) => ({
    ...member,
    group_count: groupCounts.get(member.user_id) ?? 0,
  }));
}

async function fetchPersonnelGroupCounts(
  agencyId: string,
  userIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (userIds.length === 0) {
    return map;
  }

  const { data, error } = await supabase.rpc('list_personnel_group_counts', {
    p_agency_id: agencyId,
  });

  if (error) {
    // Group counts are optional enrichment; do not fail the roster.
    return map;
  }

  const countRows = (data ?? []) as { user_id?: string; group_count?: number }[];
  for (const row of countRows) {
    const userId = String(row.user_id ?? '');
    const count = Number(row.group_count ?? 0);
    if (userId) {
      map.set(userId, count);
    }
  }
  return map;
}

export async function listAgencyInvites(agencyId: string): Promise<AgencyInvite[]> {
  const scopedAgencyId = requireAgencyId(agencyId);

  const { data, error } = await supabase.rpc('list_agency_invites', {
    p_agency_id: scopedAgencyId,
  });

  if (error) {
    throw new PersonnelServiceError(error.message || 'Unable to load invitations.');
  }

  const inviteRows = (data ?? []) as Record<string, unknown>[];
  const invites = inviteRows.map((row) => mapInvite(row));
  const inviterIds = [...new Set(invites.map((invite) => invite.invited_by).filter(Boolean))];
  const names = new Map<string, string>();

  if (inviterIds.length > 0) {
    const { data: profileRows } = await supabase
      .from('profiles')
      .select('id, display_name, first_name, last_name, email')
      .in('id', inviterIds);

    for (const profile of profileRows ?? []) {
      const label =
        profile.display_name?.trim() ||
        [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
        profile.email ||
        'Administrator';
      names.set(String(profile.id), label);
    }
  }

  return invites.map((invite) => ({
    ...invite,
    invited_by_name: names.get(invite.invited_by) ?? null,
  }));
}

export async function createAgencyInvite(
  agencyId: string,
  input: CreateAgencyInviteInput,
): Promise<CreatedAgencyInvite> {
  const scopedAgencyId = requireAgencyId(agencyId);
  const validationError = validateCreateAgencyInviteInput(input);
  if (validationError) {
    throw new PersonnelServiceError(validationError);
  }

  const expiresInDays = input.expires_in_days ?? DEFAULT_INVITE_EXPIRES_DAYS;

  const { data, error } = await supabase.rpc('create_agency_invite', {
    p_agency_id: scopedAgencyId,
    p_email: input.email.trim().toLowerCase(),
    p_role: input.role,
    p_unit: input.unit?.trim() || null,
    p_title: input.title?.trim() || null,
    p_badge_number: input.badge_number?.trim() || null,
    p_expires_in_days: expiresInDays,
  });

  if (error) {
    mapRpcError(error, 'Unable to create invitation.');
  }

  const payload = data as Record<string, unknown> | null;
  if (!payload || typeof payload.invite_token !== 'string') {
    throw new PersonnelServiceError('Invitation was created but the invite token was not returned.');
  }

  const invite = mapInvite(payload);
  return {
    ...invite,
    invite_token: payload.invite_token,
  };
}

export async function revokeAgencyInvite(inviteId: string): Promise<AgencyInvite['status']> {
  if (!inviteId) {
    throw new PersonnelServiceError('Invitation id is required.');
  }

  const { data, error } = await supabase.rpc('revoke_agency_invite', {
    invite_id: inviteId,
  });

  if (error) {
    mapRpcError(error, 'Unable to revoke invitation.');
  }

  const status = String((data as { status?: string } | null)?.status ?? '');
  if (!isAgencyInviteStatus(status)) {
    throw new PersonnelServiceError('Invitation revoked, but the server returned an unexpected status.');
  }
  return status;
}

export async function acceptAgencyInvite(inviteToken: string): Promise<AcceptAgencyInviteResult> {
  const token = inviteToken.trim();
  if (!token) {
    throw new PersonnelServiceError('Invitation code is required.');
  }

  const { data, error } = await supabase.rpc('accept_agency_invite', {
    invite_token: token,
  });

  if (error) {
    mapRpcError(error, 'Unable to accept invitation.');
  }

  const payload = data as Record<string, unknown> | null;
  const status = String(payload?.status ?? '');
  if (status !== 'accepted' && status !== 'already_accepted') {
    throw new PersonnelServiceError('Unexpected invitation acceptance response.');
  }

  const roleValue = payload?.role ? String(payload.role) : null;

  return {
    status,
    agency_id: String(payload?.agency_id ?? ''),
    membership_id: payload?.membership_id ? String(payload.membership_id) : null,
    role: roleValue && isAgencyRole(roleValue) ? roleValue : undefined,
  };
}

export async function updateMembership(
  membershipId: string,
  input: UpdateMembershipInput,
): Promise<PersonnelMember> {
  if (!membershipId) {
    throw new PersonnelServiceError('Membership id is required.');
  }

  const { data, error } = await supabase.rpc('update_agency_membership', {
    p_membership_id: membershipId,
    p_role: input.role ?? null,
    p_unit: input.unit === undefined ? null : input.unit,
    p_title: input.title === undefined ? null : input.title,
    p_badge_number: input.badge_number === undefined ? null : input.badge_number,
  });

  if (error) {
    mapRpcError(error, 'Unable to update membership.');
  }

  const row = data as Record<string, unknown> | null;
  if (!row) {
    throw new PersonnelServiceError('Membership update returned no data.');
  }

  return mapPersonnelMember(row, null);
}

async function setMembershipStatus(
  membershipId: string,
  status: MembershipStatus,
): Promise<PersonnelMember> {
  if (!membershipId) {
    throw new PersonnelServiceError('Membership id is required.');
  }

  const { data, error } = await supabase.rpc('set_agency_membership_status', {
    p_membership_id: membershipId,
    p_status: status,
  });

  if (error) {
    mapRpcError(error, `Unable to set membership status to ${status}.`);
  }

  const row = data as Record<string, unknown> | null;
  if (!row) {
    throw new PersonnelServiceError('Membership status update returned no data.');
  }

  return mapPersonnelMember(row, null);
}

export async function suspendMembership(membershipId: string): Promise<PersonnelMember> {
  return setMembershipStatus(membershipId, 'suspended');
}

export async function reactivateMembership(membershipId: string): Promise<PersonnelMember> {
  return setMembershipStatus(membershipId, 'active');
}

export async function removeMembership(membershipId: string): Promise<PersonnelMember> {
  return setMembershipStatus(membershipId, 'removed');
}

export function buildInviteUrl(inviteToken: string): string {
  const token = inviteToken.trim();
  return Linking.createURL('accept-invite', {
    queryParams: { token },
  });
}

export function uniqueUnitsFromPersonnel(members: PersonnelMember[]): string[] {
  const map = new Map<string, string>();
  for (const member of members) {
    const cleaned = (member.unit ?? '').trim().replace(/\s+/g, ' ');
    if (!cleaned) {
      continue;
    }
    const key = cleaned.toLowerCase();
    if (!map.has(key)) {
      map.set(key, cleaned);
    }
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

export type AgencyUnit = {
  id: string;
  agency_id: string;
  name: string;
  is_active: boolean;
};

export async function listAgencyUnits(agencyId: string): Promise<AgencyUnit[]> {
  const scopedAgencyId = requireAgencyId(agencyId);
  const { data, error } = await supabase
    .from('agency_units')
    .select('id, agency_id, name, is_active')
    .eq('agency_id', scopedAgencyId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    // Table may not be migrated yet; keep UI usable with suggested units.
    return [];
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    agency_id: String(row.agency_id),
    name: String(row.name),
    is_active: Boolean(row.is_active),
  }));
}

export async function ensureAgencyUnit(agencyId: string, name: string): Promise<AgencyUnit | null> {
  const scopedAgencyId = requireAgencyId(agencyId);
  const cleaned = name.trim().replace(/\s+/g, ' ');
  if (!cleaned || cleaned.toLowerCase() === 'other') {
    return null;
  }

  const { data, error } = await supabase.rpc('ensure_agency_unit', {
    p_agency_id: scopedAgencyId,
    p_name: cleaned,
  });

  if (error) {
    // Non-blocking: membership/invite can still save the unit text field.
    return null;
  }

  const row = data as Record<string, unknown> | null;
  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    agency_id: String(row.agency_id),
    name: String(row.name),
    is_active: Boolean(row.is_active),
  };
}

export type MemberGroupSummary = {
  group_id: string;
  group_name: string;
  is_moderator: boolean;
  is_archived: boolean;
};

export type AgencyGroupOption = {
  id: string;
  name: string;
  is_archived: boolean;
};

export async function listMemberGroups(
  agencyId: string,
  userId: string,
): Promise<MemberGroupSummary[]> {
  const scopedAgencyId = requireAgencyId(agencyId);
  if (!userId) {
    throw new PersonnelServiceError('Member user id is required.');
  }

  const { data, error } = await supabase.rpc('list_member_groups', {
    p_agency_id: scopedAgencyId,
    p_user_id: userId,
  });

  if (error) {
    throw new PersonnelServiceError(error.message || 'Unable to load member groups.');
  }

  const rows = (data ?? []) as {
    group_id: string;
    group_name: string;
    is_moderator: boolean;
    is_archived: boolean;
  }[];

  return rows.map((row) => ({
    group_id: String(row.group_id),
    group_name: String(row.group_name),
    is_moderator: Boolean(row.is_moderator),
    is_archived: Boolean(row.is_archived),
  }));
}

export async function listAgencyGroupsForPersonnel(
  agencyId: string,
): Promise<AgencyGroupOption[]> {
  const scopedAgencyId = requireAgencyId(agencyId);
  const { data, error } = await supabase.rpc('list_agency_groups_for_personnel', {
    p_agency_id: scopedAgencyId,
  });

  if (error) {
    throw new PersonnelServiceError(error.message || 'Unable to load agency groups.');
  }

  const rows = (data ?? []) as { id: string; name: string; is_archived: boolean }[];
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    is_archived: Boolean(row.is_archived),
  }));
}

export type { AgencyRole };
