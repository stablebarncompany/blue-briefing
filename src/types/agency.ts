/**
 * Application domain types for agency membership.
 * These mirror the SQL migration schema and are hand-maintained (not generated).
 */

export const AGENCY_ROLES = [
  'agency_admin',
  'command_staff',
  'supervisor',
  'officer',
  'dispatcher',
  'civilian_staff',
] as const;

export type AgencyRole = (typeof AGENCY_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['pending', 'active', 'suspended', 'removed'] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export type Agency = {
  id: string;
  name: string;
  slug: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_path: string | null;
  created_at: string;
  updated_at: string;
};

export type AgencyMember = {
  id: string;
  agency_id: string;
  user_id: string;
  role: AgencyRole;
  status: MembershipStatus;
  badge_number: string | null;
  unit: string | null;
  title: string | null;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AgencyMemberWithAgency = AgencyMember & {
  agency: Agency | null;
};

export function isAgencyRole(value: string): value is AgencyRole {
  return (AGENCY_ROLES as readonly string[]).includes(value);
}

export function isMembershipStatus(value: string): value is MembershipStatus {
  return (MEMBERSHIP_STATUSES as readonly string[]).includes(value);
}

export function formatAgencyRole(role: AgencyRole): string {
  return role
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
