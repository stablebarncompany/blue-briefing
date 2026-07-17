/**
 * Personnel management and agency invitation types.
 */

import type { AgencyRole, MembershipStatus } from '@/types/agency';
import { AGENCY_ROLES, formatAgencyRole } from '@/types/agency';

export const AGENCY_INVITE_STATUSES = ['pending', 'accepted', 'revoked', 'expired'] as const;
export type AgencyInviteStatus = (typeof AGENCY_INVITE_STATUSES)[number];

export type AgencyInvite = {
  id: string;
  agency_id: string;
  email: string;
  role: AgencyRole;
  unit: string | null;
  title: string | null;
  badge_number: string | null;
  invited_by: string;
  status: AgencyInviteStatus;
  expires_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  updated_at: string;
  invited_by_name?: string | null;
};

/** Returned once from create_agency_invite; never persist invite_token. */
export type CreatedAgencyInvite = AgencyInvite & {
  invite_token: string;
};

export type CreateAgencyInviteInput = {
  email: string;
  role: AgencyRole;
  unit?: string | null;
  title?: string | null;
  badge_number?: string | null;
  expires_in_days?: number;
};

export type PersonnelMember = {
  id: string;
  agency_id: string;
  user_id: string;
  role: AgencyRole;
  status: MembershipStatus;
  unit: string | null;
  title: string | null;
  rank: string | null;
  shift_name: string | null;
  badge_number: string | null;
  callsign: string | null;
  employment_type: string | null;
  work_phone: string | null;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
  display_name: string | null;
  preferred_name: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_path: string | null;
  group_count?: number | null;
};

export type UpdateMembershipInput = {
  role?: AgencyRole;
  unit?: string | null;
  title?: string | null;
  badge_number?: string | null;
};

export type PersonnelListFilters = {
  search?: string;
  role?: AgencyRole | 'all';
  unit?: string | 'all';
  shift?: string | 'all';
  employment_type?: string | 'all';
  status?: MembershipStatus | 'all';
};

export type PersonnelSortKey =
  | 'name'
  | 'role'
  | 'rank'
  | 'unit'
  | 'shift'
  | 'employment_type'
  | 'badge'
  | 'joined'
  | 'status';

export type PersonnelSection =
  | 'roster'
  | 'invitations'
  | 'roles'
  | 'suspended'
  | 'removed'
  | 'account';

export type AcceptAgencyInviteResult = {
  status: 'accepted' | 'already_accepted';
  agency_id: string;
  membership_id: string | null;
  role?: AgencyRole;
};

export type RolePermissionSummary = {
  role: AgencyRole;
  label: string;
  summary: string;
  capabilities: string[];
};

export const INVITEABLE_ROLES = AGENCY_ROLES.filter((role) => role !== 'agency_admin');

export const PERSONNEL_SECTIONS: {
  key: PersonnelSection;
  label: string;
  managersOnly?: boolean;
}[] = [
  { key: 'roster', label: 'Directory' },
  { key: 'invitations', label: 'Invitations', managersOnly: true },
  { key: 'roles', label: 'Roles & Access', managersOnly: true },
  { key: 'suspended', label: 'Suspended', managersOnly: true },
  { key: 'removed', label: 'Removed', managersOnly: true },
  { key: 'account', label: 'Account' },
];

export const ROLE_PERMISSION_SUMMARIES: RolePermissionSummary[] = [
  {
    role: 'agency_admin',
    label: 'Agency Admin',
    summary: 'Full agency administration and membership control.',
    capabilities: [
      'Manage personnel and invitations',
      'Assign any role including Agency Admin',
      'Create and archive groups',
      'Supervise and delete briefings',
      'Manage group members and moderators',
    ],
  },
  {
    role: 'command_staff',
    label: 'Command Staff',
    summary: 'Operational command with personnel and content supervision.',
    capabilities: [
      'Manage personnel and invitations',
      'Assign roles except Agency Admin',
      'Create and archive groups',
      'Supervise and delete briefings',
      'Manage group members and moderators',
    ],
  },
  {
    role: 'supervisor',
    label: 'Supervisor',
    summary: 'Shift supervision without agency-wide personnel admin.',
    capabilities: [
      'Create groups',
      'Supervise briefings',
      'Manage group members when permitted',
      'Moderate group content',
      'Cannot invite or edit agency memberships',
    ],
  },
  {
    role: 'officer',
    label: 'Officer',
    summary: 'Standard operational access to briefings, groups, and messages.',
    capabilities: [
      'View and acknowledge briefings',
      'Participate in assigned groups',
      'Use direct messages',
      'No personnel administration',
    ],
  },
  {
    role: 'dispatcher',
    label: 'Dispatcher',
    summary: 'Communications-focused operational access.',
    capabilities: [
      'View and acknowledge briefings',
      'Participate in assigned groups',
      'Use direct messages',
      'No personnel administration',
    ],
  },
  {
    role: 'civilian_staff',
    label: 'Civilian Staff',
    summary: 'Limited agency workspace access for civilian personnel.',
    capabilities: [
      'View and acknowledge briefings',
      'Participate in assigned groups',
      'Use direct messages',
      'No personnel administration',
    ],
  },
];

export function isAgencyInviteStatus(value: string): value is AgencyInviteStatus {
  return (AGENCY_INVITE_STATUSES as readonly string[]).includes(value);
}

export function canManagePersonnel(role: AgencyRole | null | undefined): boolean {
  return role === 'agency_admin' || role === 'command_staff';
}

export function canAssignAgencyAdmin(role: AgencyRole | null | undefined): boolean {
  return role === 'agency_admin';
}

export function inviteableRolesFor(actorRole: AgencyRole | null | undefined): AgencyRole[] {
  if (actorRole === 'agency_admin') {
    return [...AGENCY_ROLES];
  }
  if (actorRole === 'command_staff') {
    return [...INVITEABLE_ROLES];
  }
  return [];
}

export function formatMembershipStatus(status: MembershipStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function formatPersonnelRole(role: AgencyRole): string {
  return formatAgencyRole(role);
}

export function personnelDisplayName(member: PersonnelMember): string {
  const composed = [member.first_name, member.last_name].filter(Boolean).join(' ').trim();
  return (
    member.preferred_name?.trim() ||
    member.display_name?.trim() ||
    composed ||
    member.email ||
    'Member'
  );
}

export function sortPersonnelMembers(
  items: PersonnelMember[],
  sortKey: PersonnelSortKey,
): PersonnelMember[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    switch (sortKey) {
      case 'role':
        return formatPersonnelRole(a.role).localeCompare(formatPersonnelRole(b.role));
      case 'rank':
        return (a.rank || a.title || '').localeCompare(b.rank || b.title || '');
      case 'unit':
        return (a.unit ?? '').localeCompare(b.unit ?? '');
      case 'shift':
        return (a.shift_name ?? '').localeCompare(b.shift_name ?? '');
      case 'employment_type':
        return (a.employment_type ?? '').localeCompare(b.employment_type ?? '');
      case 'status':
        return a.status.localeCompare(b.status);
      case 'badge':
        return (a.badge_number ?? '').localeCompare(b.badge_number ?? '', undefined, {
          numeric: true,
        });
      case 'joined': {
        const aTime = a.joined_at ? new Date(a.joined_at).getTime() : 0;
        const bTime = b.joined_at ? new Date(b.joined_at).getTime() : 0;
        return bTime - aTime;
      }
      case 'name':
      default:
        return personnelDisplayName(a).localeCompare(personnelDisplayName(b));
    }
  });
  return sorted;
}

export const DEFAULT_INVITE_EXPIRES_DAYS = 7;
export const MAX_INVITE_EXPIRES_DAYS = 30;
