import { supabase } from '@/services/supabase';
import type {
  Agency,
  AgencyMemberWithAgency,
  AgencyRole,
  MembershipStatus,
  Profile,
} from '@/types/agency';
import { isAgencyRole, isMembershipStatus } from '@/types/agency';

type MembershipRow = {
  id: string;
  agency_id: string;
  user_id: string;
  role: string;
  status: string;
  badge_number: string | null;
  unit: string | null;
  title: string | null;
  joined_at: string | null;
  created_at: string;
  updated_at: string;
  agency: Agency | Agency[] | null;
};

function normalizeAgency(agency: Agency | Agency[] | null): Agency | null {
  if (!agency) {
    return null;
  }
  return Array.isArray(agency) ? (agency[0] ?? null) : agency;
}

function mapMembership(row: MembershipRow): AgencyMemberWithAgency | null {
  if (!isAgencyRole(row.role) || !isMembershipStatus(row.status)) {
    return null;
  }

  return {
    id: row.id,
    agency_id: row.agency_id,
    user_id: row.user_id,
    role: row.role as AgencyRole,
    status: row.status as MembershipStatus,
    badge_number: row.badge_number,
    unit: row.unit,
    title: row.title,
    joined_at: row.joined_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    agency: normalizeAgency(row.agency),
  };
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, first_name, last_name, display_name, email, phone, avatar_path, created_at, updated_at',
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as Profile | null;
}

export async function fetchMembershipsForUser(userId: string): Promise<AgencyMemberWithAgency[]> {
  const { data, error } = await supabase
    .from('agency_members')
    .select(
      `
      id,
      agency_id,
      user_id,
      role,
      status,
      badge_number,
      unit,
      title,
      joined_at,
      created_at,
      updated_at,
      agency:agencies (
        id,
        name,
        slug,
        is_active,
        created_by,
        created_at,
        updated_at
      )
    `,
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as MembershipRow[];
  return rows.map(mapMembership).filter((row): row is AgencyMemberWithAgency => row !== null);
}
