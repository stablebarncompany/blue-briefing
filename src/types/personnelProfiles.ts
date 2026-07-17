import type { AgencyRole, MembershipStatus } from '@/types/agency';

export const EMPLOYMENT_TYPES = [
  'full_time',
  'part_time',
  'reserve',
  'volunteer',
  'contractor',
  'civilian',
  'other',
] as const;

export type PersonnelEmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const CERTIFICATION_STATUSES = [
  'active',
  'expiring',
  'expired',
  'suspended',
  'revoked',
] as const;

export type CertificationStatus = (typeof CERTIFICATION_STATUSES)[number];

export const PERSONNEL_AVATARS_BUCKET = 'personnel-avatars';
export const PERSONNEL_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const PERSONNEL_AVATAR_SIGNED_URL_SECONDS = 10 * 60;
export const CERTIFICATION_EXPIRING_DAYS = 90;

export type PersonnelProfile = {
  membership_id: string;
  agency_id: string;
  user_id: string;
  role: AgencyRole;
  status: MembershipStatus;
  rank: string | null;
  title: string | null;
  unit: string | null;
  shift_name: string | null;
  supervisor_user_id: string | null;
  supervisor_name: string | null;
  badge_number: string | null;
  employee_number: string | null;
  hire_date: string | null;
  employment_type: PersonnelEmploymentType | null;
  callsign: string | null;
  radio_number: string | null;
  status_notes: string | null;
  joined_at: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  preferred_name: string | null;
  pronouns: string | null;
  email: string | null;
  work_phone: string | null;
  mobile_phone: string | null;
  phone: string | null;
  avatar_path: string | null;
  group_count: number | null;
  can_view_emergency_contacts: boolean;
  can_edit_personal: boolean;
  can_edit_employment: boolean;
  can_manage_certifications: boolean;
};

export type PersonnelProfileUpdateInput = {
  // Personal (self)
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  preferred_name?: string | null;
  pronouns?: string | null;
  work_phone?: string | null;
  mobile_phone?: string | null;
  phone?: string | null;
  // Employment (managers)
  rank?: string | null;
  title?: string | null;
  unit?: string | null;
  shift_name?: string | null;
  supervisor_user_id?: string | null;
  clear_supervisor?: boolean;
  badge_number?: string | null;
  employee_number?: string | null;
  hire_date?: string | null;
  clear_hire_date?: boolean;
  employment_type?: PersonnelEmploymentType | null;
  clear_employment_type?: boolean;
  callsign?: string | null;
  radio_number?: string | null;
  status_notes?: string | null;
};

export type PersonnelCertification = {
  id: string;
  agency_id: string;
  user_id: string;
  certification_name: string;
  issuing_authority: string | null;
  credential_number: string | null;
  issued_date: string | null;
  expiration_date: string | null;
  status: CertificationStatus;
  effective_status: CertificationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonnelCertificationInput = {
  certification_name: string;
  issuing_authority?: string | null;
  credential_number?: string | null;
  issued_date?: string | null;
  expiration_date?: string | null;
  status?: CertificationStatus;
  notes?: string | null;
};

export type PersonnelEmergencyContact = {
  id: string;
  agency_id: string;
  user_id: string;
  name: string;
  relationship: string | null;
  phone: string;
  alternate_phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonnelEmergencyContactInput = {
  name: string;
  relationship?: string | null;
  phone: string;
  alternate_phone?: string | null;
  notes?: string | null;
};

export type PrintRosterMode = 'basic' | 'contact' | 'assignment';

export function isEmploymentType(value: string): value is PersonnelEmploymentType {
  return (EMPLOYMENT_TYPES as readonly string[]).includes(value);
}

export function isCertificationStatus(value: string): value is CertificationStatus {
  return (CERTIFICATION_STATUSES as readonly string[]).includes(value);
}

export function formatEmploymentType(type: PersonnelEmploymentType): string {
  return type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function computeCertificationEffectiveStatus(
  status: CertificationStatus,
  expirationDate: string | null,
  now = new Date(),
): CertificationStatus {
  if (status === 'suspended' || status === 'revoked') {
    return status;
  }
  if (!expirationDate) {
    return status === 'expired' || status === 'expiring' ? 'active' : status;
  }
  const expires = new Date(`${expirationDate}T23:59:59`);
  if (Number.isNaN(expires.getTime())) {
    return status;
  }
  if (expires.getTime() < now.getTime()) {
    return 'expired';
  }
  const limit = new Date(now);
  limit.setDate(limit.getDate() + CERTIFICATION_EXPIRING_DAYS);
  if (expires.getTime() <= limit.getTime()) {
    return 'expiring';
  }
  return status === 'expired' || status === 'expiring' ? 'active' : status;
}

export function personnelProfileDisplayName(profile: {
  preferred_name?: string | null;
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}): string {
  const preferred = profile.preferred_name?.trim();
  if (preferred) {
    return preferred;
  }
  const composed = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  return profile.display_name?.trim() || composed || profile.email || 'Member';
}
