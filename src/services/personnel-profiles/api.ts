import { Platform } from 'react-native';

import { supabase } from '@/services/supabase';
import type { AgencyRole, MembershipStatus } from '@/types/agency';
import { isAgencyRole, isMembershipStatus } from '@/types/agency';
import type {
  PersonnelCertification,
  PersonnelCertificationInput,
  PersonnelEmergencyContact,
  PersonnelEmergencyContactInput,
  PersonnelProfile,
  PersonnelProfileUpdateInput,
} from '@/types/personnelProfiles';
import {
  PERSONNEL_AVATARS_BUCKET,
  PERSONNEL_AVATAR_MAX_BYTES,
  PERSONNEL_AVATAR_SIGNED_URL_SECONDS,
  computeCertificationEffectiveStatus,
  isCertificationStatus,
  isEmploymentType,
} from '@/types/personnelProfiles';
import { canManagePersonnel } from '@/types/personnel';

export class PersonnelProfileServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersonnelProfileServiceError';
  }
}

function requireAgencyId(agencyId: string | null | undefined): string {
  if (!agencyId) {
    throw new PersonnelProfileServiceError('No agency is selected.');
  }
  return agencyId;
}

function mapRpcError(error: { message?: string } | null, fallback: string): never {
  throw new PersonnelProfileServiceError(error?.message?.trim() || fallback);
}

function extForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

async function readUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new PersonnelProfileServiceError('Unable to read the selected image.');
  }
  return response.arrayBuffer();
}

function mapCertification(row: Record<string, unknown>): PersonnelCertification {
  const status = String(row.status);
  if (!isCertificationStatus(status)) {
    throw new PersonnelProfileServiceError('Invalid certification status.');
  }
  const expiration = row.expiration_date == null ? null : String(row.expiration_date);
  return {
    id: String(row.id),
    agency_id: String(row.agency_id),
    user_id: String(row.user_id),
    certification_name: String(row.certification_name),
    issuing_authority: (row.issuing_authority as string | null) ?? null,
    credential_number: (row.credential_number as string | null) ?? null,
    issued_date: row.issued_date == null ? null : String(row.issued_date),
    expiration_date: expiration,
    status,
    effective_status: computeCertificationEffectiveStatus(status, expiration),
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapEmergencyContact(row: Record<string, unknown>): PersonnelEmergencyContact {
  return {
    id: String(row.id),
    agency_id: String(row.agency_id),
    user_id: String(row.user_id),
    name: String(row.name),
    relationship: (row.relationship as string | null) ?? null,
    phone: String(row.phone),
    alternate_phone: (row.alternate_phone as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function getPersonnelProfile(options: {
  agencyId: string;
  userId: string;
  currentUserId: string;
  currentRole: AgencyRole | null | undefined;
}): Promise<PersonnelProfile> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data: member, error } = await supabase
    .from('agency_members')
    .select(
      `
      id, agency_id, user_id, role, status, badge_number, unit, title, joined_at,
      rank, shift_name, supervisor_user_id, employee_number, hire_date, employment_type,
      callsign, radio_number, status_notes, created_at, updated_at
    `,
    )
    .eq('agency_id', agencyId)
    .eq('user_id', options.userId)
    .maybeSingle();

  if (error) {
    throw new PersonnelProfileServiceError(error.message || 'Unable to load membership.');
  }
  if (!member) {
    throw new PersonnelProfileServiceError('Personnel profile not found in this agency.');
  }

  const role = String(member.role);
  const status = String(member.status);
  if (!isAgencyRole(role) || !isMembershipStatus(status)) {
    throw new PersonnelProfileServiceError('Invalid membership record.');
  }

  const employmentTypeRaw = member.employment_type == null ? null : String(member.employment_type);
  const employment_type =
    employmentTypeRaw && isEmploymentType(employmentTypeRaw) ? employmentTypeRaw : null;

  const [{ data: profile }, supervisorResult, groupCountResult, emergencyGate] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, first_name, last_name, display_name, preferred_name, pronouns, email, work_phone, mobile_phone, phone, avatar_path',
      )
      .eq('id', options.userId)
      .maybeSingle(),
    member.supervisor_user_id
      ? supabase
          .from('profiles')
          .select('display_name, first_name, last_name')
          .eq('id', member.supervisor_user_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.rpc('list_personnel_group_counts', { p_agency_id: agencyId }),
    supabase.rpc('can_view_emergency_contacts', {
      target_agency_id: agencyId,
      target_user_id: options.userId,
    }),
  ]);

  const supervisor = supervisorResult.data as {
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;

  const supervisor_name = supervisor
    ? supervisor.display_name?.trim() ||
      [supervisor.first_name, supervisor.last_name].filter(Boolean).join(' ').trim() ||
      null
    : null;

  const counts = Array.isArray(groupCountResult.data) ? groupCountResult.data : [];
  const groupRow = counts.find(
    (row: { user_id?: string }) => String(row.user_id) === options.userId,
  ) as { group_count?: number } | undefined;

  const isSelf = options.currentUserId === options.userId;
  const manager = canManagePersonnel(options.currentRole);

  return {
    membership_id: String(member.id),
    agency_id: String(member.agency_id),
    user_id: String(member.user_id),
    role,
    status: status as MembershipStatus,
    rank: (member.rank as string | null) ?? null,
    title: (member.title as string | null) ?? null,
    unit: (member.unit as string | null) ?? null,
    shift_name: (member.shift_name as string | null) ?? null,
    supervisor_user_id: (member.supervisor_user_id as string | null) ?? null,
    supervisor_name,
    badge_number: (member.badge_number as string | null) ?? null,
    employee_number: (member.employee_number as string | null) ?? null,
    hire_date: member.hire_date == null ? null : String(member.hire_date),
    employment_type,
    callsign: (member.callsign as string | null) ?? null,
    radio_number: (member.radio_number as string | null) ?? null,
    status_notes: (member.status_notes as string | null) ?? null,
    joined_at: (member.joined_at as string | null) ?? null,
    first_name: (profile?.first_name as string | null) ?? null,
    last_name: (profile?.last_name as string | null) ?? null,
    display_name: (profile?.display_name as string | null) ?? null,
    preferred_name: (profile?.preferred_name as string | null) ?? null,
    pronouns: (profile?.pronouns as string | null) ?? null,
    email: (profile?.email as string | null) ?? null,
    work_phone: (profile?.work_phone as string | null) ?? null,
    mobile_phone: (profile?.mobile_phone as string | null) ?? null,
    phone: (profile?.phone as string | null) ?? null,
    avatar_path: (profile?.avatar_path as string | null) ?? null,
    group_count: groupRow?.group_count ?? 0,
    can_view_emergency_contacts: Boolean(emergencyGate.data),
    can_edit_personal: isSelf,
    can_edit_employment: manager,
    can_manage_certifications: manager,
  };
}

export async function updatePersonnelProfile(options: {
  agencyId: string;
  userId: string;
  membershipId: string;
  currentUserId: string;
  currentRole: AgencyRole | null | undefined;
  input: PersonnelProfileUpdateInput;
}): Promise<PersonnelProfile> {
  const agencyId = requireAgencyId(options.agencyId);
  const isSelf = options.currentUserId === options.userId;
  const manager = canManagePersonnel(options.currentRole);

  if (isSelf) {
    const { error } = await supabase.rpc('update_own_personnel_profile', {
      p_first_name: options.input.first_name ?? null,
      p_last_name: options.input.last_name ?? null,
      p_display_name: options.input.display_name ?? null,
      p_preferred_name: options.input.preferred_name ?? null,
      p_pronouns: options.input.pronouns ?? null,
      p_work_phone: options.input.work_phone ?? null,
      p_mobile_phone: options.input.mobile_phone ?? null,
      p_phone: options.input.phone ?? null,
    });
    if (error) {
      mapRpcError(error, 'Unable to update personal profile.');
    }
  } else if (
    options.input.first_name !== undefined ||
    options.input.last_name !== undefined ||
    options.input.display_name !== undefined ||
    options.input.preferred_name !== undefined ||
    options.input.pronouns !== undefined ||
    options.input.work_phone !== undefined ||
    options.input.mobile_phone !== undefined
  ) {
    throw new PersonnelProfileServiceError('You can only edit your own personal profile fields.');
  }

  if (manager) {
    const { error } = await supabase.rpc('update_agency_employment', {
      p_membership_id: options.membershipId,
      p_rank: options.input.rank ?? null,
      p_title: options.input.title ?? null,
      p_unit: options.input.unit ?? null,
      p_shift_name: options.input.shift_name ?? null,
      p_supervisor_user_id: options.input.supervisor_user_id ?? null,
      p_clear_supervisor: Boolean(options.input.clear_supervisor),
      p_badge_number: options.input.badge_number ?? null,
      p_employee_number: options.input.employee_number ?? null,
      p_hire_date: options.input.hire_date ?? null,
      p_clear_hire_date: Boolean(options.input.clear_hire_date),
      p_employment_type: options.input.employment_type ?? null,
      p_clear_employment_type: Boolean(options.input.clear_employment_type),
      p_callsign: options.input.callsign ?? null,
      p_radio_number: options.input.radio_number ?? null,
      p_status_notes: options.input.status_notes ?? null,
    });
    if (error) {
      mapRpcError(error, 'Unable to update employment details.');
    }
  }

  return getPersonnelProfile({
    agencyId,
    userId: options.userId,
    currentUserId: options.currentUserId,
    currentRole: options.currentRole,
  });
}

export async function createSignedPersonnelAvatarUrl(options: {
  agencyId: string;
  storagePath: string | null | undefined;
}): Promise<string | null> {
  const agencyId = requireAgencyId(options.agencyId);
  const path = options.storagePath?.trim();
  if (!path) {
    return null;
  }
  if (!path.startsWith(`${agencyId}/`)) {
    throw new PersonnelProfileServiceError('Avatar path does not match the selected agency.');
  }

  const { data, error } = await supabase.storage
    .from(PERSONNEL_AVATARS_BUCKET)
    .createSignedUrl(path, PERSONNEL_AVATAR_SIGNED_URL_SECONDS);

  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}

export async function uploadPersonnelAvatar(options: {
  agencyId: string;
  userId: string;
  uri: string;
  mimeType: string;
}): Promise<string> {
  const agencyId = requireAgencyId(options.agencyId);
  const mime = options.mimeType.toLowerCase();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    throw new PersonnelProfileServiceError('Avatar must be a JPEG, PNG, or WebP image.');
  }

  const bytes = await readUriAsArrayBuffer(options.uri);
  if (bytes.byteLength > PERSONNEL_AVATAR_MAX_BYTES) {
    throw new PersonnelProfileServiceError('Avatar must be 5 MB or smaller.');
  }

  const storagePath = `${agencyId}/${options.userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extForMime(mime)}`;

  const { error: uploadError } = await supabase.storage
    .from(PERSONNEL_AVATARS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: mime,
      upsert: false,
    });

  if (uploadError) {
    throw new PersonnelProfileServiceError(uploadError.message || 'Unable to upload avatar.');
  }

  const { error } = await supabase.rpc('set_personnel_avatar_path', {
    p_agency_id: agencyId,
    p_user_id: options.userId,
    p_avatar_path: storagePath,
  });

  if (error) {
    await supabase.storage.from(PERSONNEL_AVATARS_BUCKET).remove([storagePath]);
    mapRpcError(error, 'Unable to save avatar.');
  }

  return storagePath;
}

export async function listPersonnelCertifications(options: {
  agencyId: string;
  userId: string;
}): Promise<PersonnelCertification[]> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('personnel_certifications')
    .select(
      'id, agency_id, user_id, certification_name, issuing_authority, credential_number, issued_date, expiration_date, status, notes, created_at, updated_at',
    )
    .eq('agency_id', agencyId)
    .eq('user_id', options.userId)
    .order('expiration_date', { ascending: true, nullsFirst: false });

  if (error) {
    throw new PersonnelProfileServiceError(error.message || 'Unable to load certifications.');
  }

  return (data ?? []).map((row) => mapCertification(row as Record<string, unknown>));
}

export async function createPersonnelCertification(options: {
  agencyId: string;
  userId: string;
  input: PersonnelCertificationInput;
}): Promise<PersonnelCertification> {
  const agencyId = requireAgencyId(options.agencyId);
  const name = options.input.certification_name.trim();
  if (!name) {
    throw new PersonnelProfileServiceError('Certification name is required.');
  }

  const { data, error } = await supabase
    .from('personnel_certifications')
    .insert({
      agency_id: agencyId,
      user_id: options.userId,
      certification_name: name,
      issuing_authority: options.input.issuing_authority?.trim() || null,
      credential_number: options.input.credential_number?.trim() || null,
      issued_date: options.input.issued_date || null,
      expiration_date: options.input.expiration_date || null,
      status: options.input.status ?? 'active',
      notes: options.input.notes?.trim() || null,
    })
    .select(
      'id, agency_id, user_id, certification_name, issuing_authority, credential_number, issued_date, expiration_date, status, notes, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    throw new PersonnelProfileServiceError(error?.message || 'Unable to create certification.');
  }
  return mapCertification(data as Record<string, unknown>);
}

export async function updatePersonnelCertification(options: {
  agencyId: string;
  certificationId: string;
  input: PersonnelCertificationInput;
}): Promise<PersonnelCertification> {
  requireAgencyId(options.agencyId);
  const name = options.input.certification_name.trim();
  if (!name) {
    throw new PersonnelProfileServiceError('Certification name is required.');
  }

  const { data, error } = await supabase
    .from('personnel_certifications')
    .update({
      certification_name: name,
      issuing_authority: options.input.issuing_authority?.trim() || null,
      credential_number: options.input.credential_number?.trim() || null,
      issued_date: options.input.issued_date || null,
      expiration_date: options.input.expiration_date || null,
      status: options.input.status ?? 'active',
      notes: options.input.notes?.trim() || null,
    })
    .eq('id', options.certificationId)
    .eq('agency_id', options.agencyId)
    .select(
      'id, agency_id, user_id, certification_name, issuing_authority, credential_number, issued_date, expiration_date, status, notes, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    throw new PersonnelProfileServiceError(error?.message || 'Unable to update certification.');
  }
  return mapCertification(data as Record<string, unknown>);
}

export async function deletePersonnelCertification(options: {
  agencyId: string;
  certificationId: string;
}): Promise<void> {
  requireAgencyId(options.agencyId);
  const { error } = await supabase
    .from('personnel_certifications')
    .delete()
    .eq('id', options.certificationId)
    .eq('agency_id', options.agencyId);

  if (error) {
    throw new PersonnelProfileServiceError(error.message || 'Unable to delete certification.');
  }
}

export async function listEmergencyContacts(options: {
  agencyId: string;
  userId: string;
}): Promise<PersonnelEmergencyContact[]> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('personnel_emergency_contacts')
    .select(
      'id, agency_id, user_id, name, relationship, phone, alternate_phone, notes, created_at, updated_at',
    )
    .eq('agency_id', agencyId)
    .eq('user_id', options.userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new PersonnelProfileServiceError(error.message || 'Unable to load emergency contacts.');
  }
  return (data ?? []).map((row) => mapEmergencyContact(row as Record<string, unknown>));
}

export async function createEmergencyContact(options: {
  agencyId: string;
  userId: string;
  input: PersonnelEmergencyContactInput;
}): Promise<PersonnelEmergencyContact> {
  const agencyId = requireAgencyId(options.agencyId);
  const name = options.input.name.trim();
  const phone = options.input.phone.trim();
  if (!name || !phone) {
    throw new PersonnelProfileServiceError('Name and phone are required.');
  }

  const { data, error } = await supabase
    .from('personnel_emergency_contacts')
    .insert({
      agency_id: agencyId,
      user_id: options.userId,
      name,
      relationship: options.input.relationship?.trim() || null,
      phone,
      alternate_phone: options.input.alternate_phone?.trim() || null,
      notes: options.input.notes?.trim() || null,
    })
    .select(
      'id, agency_id, user_id, name, relationship, phone, alternate_phone, notes, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    throw new PersonnelProfileServiceError(error?.message || 'Unable to create emergency contact.');
  }
  return mapEmergencyContact(data as Record<string, unknown>);
}

export async function updateEmergencyContact(options: {
  agencyId: string;
  contactId: string;
  input: PersonnelEmergencyContactInput;
}): Promise<PersonnelEmergencyContact> {
  requireAgencyId(options.agencyId);
  const name = options.input.name.trim();
  const phone = options.input.phone.trim();
  if (!name || !phone) {
    throw new PersonnelProfileServiceError('Name and phone are required.');
  }

  const { data, error } = await supabase
    .from('personnel_emergency_contacts')
    .update({
      name,
      relationship: options.input.relationship?.trim() || null,
      phone,
      alternate_phone: options.input.alternate_phone?.trim() || null,
      notes: options.input.notes?.trim() || null,
    })
    .eq('id', options.contactId)
    .eq('agency_id', options.agencyId)
    .select(
      'id, agency_id, user_id, name, relationship, phone, alternate_phone, notes, created_at, updated_at',
    )
    .single();

  if (error || !data) {
    throw new PersonnelProfileServiceError(error?.message || 'Unable to update emergency contact.');
  }
  return mapEmergencyContact(data as Record<string, unknown>);
}

export async function deleteEmergencyContact(options: {
  agencyId: string;
  contactId: string;
}): Promise<void> {
  requireAgencyId(options.agencyId);
  const { error } = await supabase
    .from('personnel_emergency_contacts')
    .delete()
    .eq('id', options.contactId)
    .eq('agency_id', options.agencyId);

  if (error) {
    throw new PersonnelProfileServiceError(error.message || 'Unable to delete emergency contact.');
  }
}

/** Shared identity fields for messages/groups/briefings enrichment. */
export type PersonnelIdentitySummary = {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  preferred_name: string | null;
  avatar_path: string | null;
  rank: string | null;
  title: string | null;
  unit: string | null;
  role: AgencyRole | null;
};

export async function listPersonnelIdentitySummaries(options: {
  agencyId: string;
  userIds: string[];
}): Promise<Map<string, PersonnelIdentitySummary>> {
  const agencyId = requireAgencyId(options.agencyId);
  const unique = [...new Set(options.userIds.filter(Boolean))];
  const map = new Map<string, PersonnelIdentitySummary>();
  if (unique.length === 0) {
    return map;
  }

  const [{ data: members }, { data: profiles }] = await Promise.all([
    supabase
      .from('agency_members')
      .select('user_id, role, rank, title, unit')
      .eq('agency_id', agencyId)
      .in('user_id', unique),
    supabase
      .from('profiles')
      .select('id, display_name, first_name, last_name, preferred_name, avatar_path')
      .in('id', unique),
  ]);

  const profileMap = new Map(
    (profiles ?? []).map((row) => [String(row.id), row as Record<string, unknown>]),
  );

  for (const member of members ?? []) {
    const userId = String(member.user_id);
    const profile = profileMap.get(userId);
    const role = String(member.role);
    map.set(userId, {
      user_id: userId,
      display_name: (profile?.display_name as string | null) ?? null,
      first_name: (profile?.first_name as string | null) ?? null,
      last_name: (profile?.last_name as string | null) ?? null,
      preferred_name: (profile?.preferred_name as string | null) ?? null,
      avatar_path: (profile?.avatar_path as string | null) ?? null,
      rank: (member.rank as string | null) ?? null,
      title: (member.title as string | null) ?? null,
      unit: (member.unit as string | null) ?? null,
      role: isAgencyRole(role) ? role : null,
    });
  }

  // Fill profiles for users without membership rows (should be rare).
  for (const userId of unique) {
    if (map.has(userId)) continue;
    const profile = profileMap.get(userId);
    if (!profile) continue;
    map.set(userId, {
      user_id: userId,
      display_name: (profile.display_name as string | null) ?? null,
      first_name: (profile.first_name as string | null) ?? null,
      last_name: (profile.last_name as string | null) ?? null,
      preferred_name: (profile.preferred_name as string | null) ?? null,
      avatar_path: (profile.avatar_path as string | null) ?? null,
      rank: null,
      title: null,
      unit: null,
      role: null,
    });
  }

  return map;
}

export function avatarUploadSupported(): boolean {
  return Platform.OS === 'web' || Platform.OS === 'ios' || Platform.OS === 'android';
}
