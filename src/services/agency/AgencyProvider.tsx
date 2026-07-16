import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import { useAuth } from '@/hooks/use-auth';
import { fetchMembershipsForUser, fetchProfile } from '@/services/agency/api';
import { readStoredAgencyId, writeStoredAgencyId } from '@/services/agency/storage';
import type { Agency, AgencyMemberWithAgency, Profile } from '@/types/agency';

export type AgencyContextValue = {
  profile: Profile | null;
  memberships: AgencyMemberWithAgency[];
  activeMemberships: AgencyMemberWithAgency[];
  currentMembership: AgencyMemberWithAgency | null;
  currentAgency: Agency | null;
  isLoading: boolean;
  error: string | null;
  refreshAgencyContext: () => Promise<void>;
  selectAgency: (agencyId: string) => Promise<void>;
};

export const AgencyContext = createContext<AgencyContextValue | null>(null);

function resolveCurrentMembership(
  activeMemberships: AgencyMemberWithAgency[],
  preferredAgencyId: string | null,
): AgencyMemberWithAgency | null {
  if (activeMemberships.length === 0) {
    return null;
  }

  if (activeMemberships.length === 1) {
    return activeMemberships[0] ?? null;
  }

  if (preferredAgencyId) {
    return activeMemberships.find((item) => item.agency_id === preferredAgencyId) ?? null;
  }

  return null;
}

export function AgencyProvider({ children }: PropsWithChildren) {
  const { session, user, isLoading: authLoading } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<AgencyMemberWithAgency[]>([]);
  const [currentMembership, setCurrentMembership] = useState<AgencyMemberWithAgency | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasResolvedMemberships, setHasResolvedMemberships] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signedInUserId = session && user ? user.id : null;

  const loadAgencyContext = useCallback(async () => {
    if (!user) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [nextProfile, nextMemberships, storedAgencyId] = await Promise.all([
        fetchProfile(user.id),
        fetchMembershipsForUser(user.id),
        readStoredAgencyId(),
      ]);

      const nextActive = nextMemberships.filter(
        (item) => item.status === 'active' && item.agency?.is_active !== false,
      );
      const resolved = resolveCurrentMembership(nextActive, storedAgencyId);

      if (resolved && storedAgencyId !== resolved.agency_id) {
        await writeStoredAgencyId(resolved.agency_id);
      }

      if (!resolved && storedAgencyId) {
        await writeStoredAgencyId(null);
      }

      setProfile(nextProfile);
      setMemberships(nextMemberships);
      setCurrentMembership(resolved);
    } catch {
      setProfile(null);
      setMemberships([]);
      setCurrentMembership(null);
      setError('Unable to load agency membership. Please try again.');
    } finally {
      setIsLoading(false);
      setHasResolvedMemberships(true);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!signedInUserId) {
      queueMicrotask(() => {
        setProfile(null);
        setMemberships([]);
        setCurrentMembership(null);
        setError(null);
        setIsLoading(false);
        setHasResolvedMemberships(false);
      });
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setHasResolvedMemberships(false);
        void loadAgencyContext();
      }
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, signedInUserId, loadAgencyContext]);

  const selectAgency = useCallback(
    async (agencyId: string) => {
      const active = memberships.filter(
        (item) => item.status === 'active' && item.agency?.is_active !== false,
      );
      const match = active.find((item) => item.agency_id === agencyId) ?? null;
      if (!match) {
        setError('That agency is not available for your account.');
        return;
      }

      await writeStoredAgencyId(agencyId);
      setCurrentMembership(match);
      setError(null);
    },
    [memberships],
  );

  const value = useMemo<AgencyContextValue>(() => {
    const scopedMemberships = signedInUserId ? memberships : [];
    const scopedActive = scopedMemberships.filter(
      (item) => item.status === 'active' && item.agency?.is_active !== false,
    );
    const scopedCurrent = signedInUserId ? currentMembership : null;
    const scopedProfile = signedInUserId ? profile : null;

    return {
      profile: scopedProfile,
      memberships: scopedMemberships,
      activeMemberships: scopedActive,
      currentMembership: scopedCurrent,
      currentAgency: scopedCurrent?.agency ?? null,
      // Block route decisions until the first membership load finishes for this session.
      isLoading: authLoading || (!!signedInUserId && (!hasResolvedMemberships || isLoading)),
      error: signedInUserId ? error : null,
      refreshAgencyContext: loadAgencyContext,
      selectAgency,
    };
  }, [
    signedInUserId,
    memberships,
    currentMembership,
    profile,
    authLoading,
    hasResolvedMemberships,
    isLoading,
    error,
    loadAgencyContext,
    selectAgency,
  ]);

  return <AgencyContext.Provider value={value}>{children}</AgencyContext.Provider>;
}
