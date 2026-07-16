import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppCard,
  AppText,
  EmptyState,
  InlineFormMessage,
  SectionLabel,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import {
  AccountPanel,
  PersonnelCard,
  PersonnelFiltersBar,
  canPrintRoster,
  printPersonnelRoster,
} from '@/components/personnel';
import { PERSONNEL_INVITE_HREF, personnelMemberHref } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useIsWideLayout } from '@/hooks/use-is-wide-layout';
import {
  PersonnelServiceError,
  listAgencyInvites,
  listAgencyUnits,
  listPersonnel,
  revokeAgencyInvite,
  uniqueUnitsFromPersonnel,
} from '@/services/personnel';
import { colors, radius, spacing } from '@/theme';
import type {
  AgencyInvite,
  PersonnelListFilters,
  PersonnelMember,
  PersonnelSection,
  PersonnelSortKey,
} from '@/types/personnel';
import {
  PERSONNEL_SECTIONS,
  ROLE_PERMISSION_SUMMARIES,
  canManagePersonnel,
  formatMembershipStatus,
  formatPersonnelRole,
  personnelDisplayName,
  sortPersonnelMembers,
} from '@/types/personnel';

const SORT_OPTIONS: { key: PersonnelSortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'role', label: 'Role' },
  { key: 'unit', label: 'Unit' },
  { key: 'badge', label: 'Badge' },
  { key: 'joined', label: 'Joined' },
];

function InviteRow({
  invite,
  isExpired,
  onRevoke,
  revoking,
}: {
  invite: AgencyInvite;
  isExpired: boolean;
  onRevoke: (id: string) => void;
  revoking: boolean;
}) {
  const statusLabel = isExpired && invite.status === 'pending' ? 'expired' : invite.status;

  return (
    <AppCard raised style={styles.inviteCard}>
      <View style={styles.inviteHeader}>
        <AppText variant="title" style={styles.flex}>
          {invite.email}
        </AppText>
        <AppText variant="caption" color={statusLabel === 'expired' ? 'warning' : 'textMuted'}>
          {statusLabel}
        </AppText>
      </View>
      <AppText variant="body" color="textMuted">
        Role: {formatPersonnelRole(invite.role)}
      </AppText>
      {invite.title ? (
        <AppText variant="caption" color="textMuted">
          Title: {invite.title}
        </AppText>
      ) : null}
      {invite.unit ? (
        <AppText variant="caption" color="textMuted">
          Unit: {invite.unit}
        </AppText>
      ) : null}
      <AppText variant="caption" color="textSubtle">
        Invited by {invite.invited_by_name ?? 'administrator'}
      </AppText>
      <AppText variant="caption" color="textSubtle">
        Created {new Date(invite.created_at).toLocaleString()} · Expires{' '}
        {new Date(invite.expires_at).toLocaleString()}
      </AppText>
      {invite.status === 'pending' && !isExpired ? (
        <AppButton
          label="Revoke invitation"
          variant="ghost"
          disabled={revoking}
          onPress={() => onRevoke(invite.id)}
        />
      ) : null}
    </AppCard>
  );
}

function DesktopMemberRow({
  member,
  onPress,
}: {
  member: PersonnelMember;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.tableRow, pressed ? styles.pressed : null]}>
      <AppText variant="body" style={styles.colName}>
        {personnelDisplayName(member)}
      </AppText>
      <AppText variant="caption" color="textMuted" style={styles.colEmail}>
        {member.email ?? '—'}
      </AppText>
      <AppText variant="caption" color="textMuted" style={styles.colRole}>
        {formatPersonnelRole(member.role)}
      </AppText>
      <AppText variant="caption" color="textMuted" style={styles.colMeta}>
        {member.title ?? '—'}
      </AppText>
      <AppText variant="caption" color="textMuted" style={styles.colUnit}>
        {member.unit ?? '—'}
      </AppText>
      <AppText variant="caption" color="textMuted" style={styles.colMeta}>
        {member.badge_number ?? '—'}
      </AppText>
      <AppText variant="caption" color="textMuted" style={styles.colMeta}>
        {formatMembershipStatus(member.status)}
      </AppText>
      <AppText variant="caption" color="textMuted" style={styles.colMeta}>
        {member.joined_at ? new Date(member.joined_at).toLocaleDateString() : '—'}
      </AppText>
      <AppText variant="caption" color="textMuted" style={styles.colMeta}>
        {member.group_count ?? 0}
      </AppText>
    </Pressable>
  );
}

export default function PersonnelScreen() {
  const { currentAgency, currentMembership } = useAgency();
  const agencyId = currentAgency?.id ?? null;
  const isWide = useIsWideLayout();
  const allowed = canManagePersonnel(currentMembership?.role);

  const [section, setSection] = useState<PersonnelSection>(allowed ? 'roster' : 'account');
  const [filtersOpen, setFiltersOpen] = useState(isWide);
  const [filters, setFilters] = useState<PersonnelListFilters>({
    search: '',
    role: 'all',
    unit: 'all',
  });
  const [sortKey, setSortKey] = useState<PersonnelSortKey>('name');
  const [members, setMembers] = useState<PersonnelMember[]>([]);
  const [invites, setInvites] = useState<AgencyInvite[]>([]);
  const [agencyUnitNames, setAgencyUnitNames] = useState<string[]>([]);
  const [expiredInviteIds, setExpiredInviteIds] = useState<Set<string>>(new Set());
  const [rosterLoading, setRosterLoading] = useState(allowed);
  const [invitesLoading, setInvitesLoading] = useState(allowed);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadRoster = useCallback(async () => {
    if (!agencyId || !allowed) {
      setRosterLoading(false);
      return;
    }
    setRosterLoading(true);
    setRosterError(null);
    try {
      const [nextMembers, units] = await Promise.all([
        listPersonnel(agencyId, {
          search: filters.search,
          role: filters.role,
          unit: filters.unit,
        }),
        listAgencyUnits(agencyId),
      ]);
      setMembers(nextMembers);
      setAgencyUnitNames(units.map((unit) => unit.name));
    } catch (error) {
      setMembers([]);
      setRosterError(
        error instanceof PersonnelServiceError ? error.message : 'Unable to load roster.',
      );
    } finally {
      setRosterLoading(false);
    }
  }, [allowed, agencyId, filters.role, filters.search, filters.unit]);

  const loadInvites = useCallback(async () => {
    if (!agencyId || !allowed) {
      setInvitesLoading(false);
      return;
    }
    setInvitesLoading(true);
    setInvitesError(null);
    try {
      const nextInvites = await listAgencyInvites(agencyId);
      const nowMs = Date.now();
      const expired = new Set(
        nextInvites
          .filter(
            (invite) =>
              invite.status === 'pending' && new Date(invite.expires_at).getTime() <= nowMs,
          )
          .map((invite) => invite.id),
      );
      setInvites(nextInvites);
      setExpiredInviteIds(expired);
    } catch (error) {
      setInvites([]);
      setInvitesError(
        error instanceof PersonnelServiceError ? error.message : 'Unable to load invitations.',
      );
    } finally {
      setInvitesLoading(false);
    }
  }, [allowed, agencyId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) {
          return;
        }
        if (allowed) {
          void loadRoster();
          void loadInvites();
        }
      });
      return () => {
        cancelled = true;
      };
    }, [allowed, loadInvites, loadRoster]),
  );

  async function onRevoke(inviteId: string) {
    if (revokingId) {
      return;
    }
    setRevokingId(inviteId);
    setInvitesError(null);
    try {
      await revokeAgencyInvite(inviteId);
      await loadInvites();
    } catch (error) {
      setInvitesError(
        error instanceof PersonnelServiceError ? error.message : 'Unable to revoke invitation.',
      );
    } finally {
      setRevokingId(null);
    }
  }

  function onPrint() {
    setPrintError(null);
    if (!canPrintRoster()) {
      setPrintError('Printing is available on web in this MVP.');
      return;
    }
    try {
      printPersonnelRoster({
        agencyName: currentAgency?.name ?? 'Agency',
        members: rosterMembers,
        filters,
      });
    } catch (error) {
      setPrintError(error instanceof Error ? error.message : 'Unable to print roster.');
    }
  }

  const unitOptions = uniqueUnitsFromPersonnel(members);
  const activeMembers = useMemo(
    () => sortPersonnelMembers(
      members.filter((m) => m.status === 'active'),
      sortKey,
    ),
    [members, sortKey],
  );
  const suspendedMembers = useMemo(
    () => sortPersonnelMembers(
      members.filter((m) => m.status === 'suspended'),
      sortKey,
    ),
    [members, sortKey],
  );
  const removedMembers = useMemo(
    () => sortPersonnelMembers(
      members.filter((m) => m.status === 'removed'),
      sortKey,
    ),
    [members, sortKey],
  );

  const rosterMembers =
    section === 'suspended'
      ? suspendedMembers
      : section === 'removed'
        ? removedMembers
        : activeMembers;

  const visibleSections = PERSONNEL_SECTIONS.filter(
    (item) => !item.managersOnly || allowed,
  );

  const inviteBuckets = useMemo(() => {
    return {
      pending: invites.filter((invite) => invite.status === 'pending'),
      accepted: invites.filter((invite) => invite.status === 'accepted'),
      expired: invites.filter(
        (invite) => invite.status === 'expired' || expiredInviteIds.has(invite.id),
      ),
      revoked: invites.filter((invite) => invite.status === 'revoked'),
    };
  }, [expiredInviteIds, invites]);

  function renderMemberList(list: PersonnelMember[], emptyTitle: string) {
    if (rosterLoading) {
      return <ActivityIndicator color={colors.primary} />;
    }
    if (rosterError) {
      return <InlineFormMessage message={`Unable to load roster. ${rosterError}`} />;
    }
    if (list.length === 0) {
      return <EmptyState title={emptyTitle} />;
    }
    if (isWide) {
      return (
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <AppText variant="label" color="textSubtle" style={styles.colName}>
              Name
            </AppText>
            <AppText variant="label" color="textSubtle" style={styles.colEmail}>
              Email
            </AppText>
            <AppText variant="label" color="textSubtle" style={styles.colRole}>
              Role
            </AppText>
            <AppText variant="label" color="textSubtle" style={styles.colMeta}>
              Title
            </AppText>
            <AppText variant="label" color="textSubtle" style={styles.colUnit}>
              Unit
            </AppText>
            <AppText variant="label" color="textSubtle" style={styles.colMeta}>
              Badge
            </AppText>
            <AppText variant="label" color="textSubtle" style={styles.colMeta}>
              Status
            </AppText>
            <AppText variant="label" color="textSubtle" style={styles.colMeta}>
              Joined
            </AppText>
            <AppText variant="label" color="textSubtle" style={styles.colMeta}>
              Groups
            </AppText>
          </View>
          {list.map((member) => (
            <DesktopMemberRow
              key={member.id}
              member={member}
              onPress={() => router.push(personnelMemberHref(member.id))}
            />
          ))}
        </View>
      );
    }
    return (
      <View style={styles.list}>
        {list.map((member) => (
          <PersonnelCard
            key={member.id}
            member={member}
            onPress={() => router.push(personnelMemberHref(member.id))}
          />
        ))}
      </View>
    );
  }

  return (
    <PageContainer>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <SectionLabel>Personnel</SectionLabel>
          <AppText variant="body" color="textMuted">
            Manage agency members, invitations, roles, and access.
          </AppText>
          {currentAgency?.name ? (
            <AppText variant="caption" color="textSubtle">
              {currentAgency.name}
            </AppText>
          ) : null}
        </View>

        {allowed ? (
          <View style={styles.headerActions}>
            <AppButton label="Invite member" onPress={() => router.push(PERSONNEL_INVITE_HREF)} />
            {section === 'roster' || section === 'suspended' || section === 'removed' ? (
              <>
                <AppButton
                  label="Refresh roster"
                  variant="secondary"
                  onPress={() => void loadRoster()}
                  disabled={rosterLoading}
                />
                {canPrintRoster() ? (
                  <AppButton label="Print roster" variant="ghost" onPress={onPrint} />
                ) : (
                  <AppButton
                    label="Print (web only)"
                    variant="ghost"
                    disabled
                    onPress={() => undefined}
                  />
                )}
              </>
            ) : null}
            {section === 'invitations' ? (
              <AppButton
                label="Refresh invitations"
                variant="secondary"
                onPress={() => void loadInvites()}
                disabled={invitesLoading}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.tabs}>
        {visibleSections.map((item) => {
          const selected = section === item.key;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              onPress={() => setSection(item.key)}
              style={[styles.tab, selected ? styles.tabSelected : null]}>
              <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
                {item.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {printError ? <InlineFormMessage message={printError} /> : null}

      {section === 'account' ? <AccountPanel /> : null}

      {section === 'roles' && allowed ? (
        <View style={styles.list}>
          <InlineFormMessage
            tone="info"
            message="Official permission roles control authorization and RLS. Custom titles/classifications and units are organizational labels only and never grant permissions."
          />
          {ROLE_PERMISSION_SUMMARIES.map((roleInfo) => (
            <AppCard key={roleInfo.role} raised style={styles.roleCard}>
              <AppText variant="title">{roleInfo.label}</AppText>
              <AppText variant="body" color="textMuted">
                {roleInfo.summary}
              </AppText>
              {roleInfo.capabilities.map((capability) => (
                <AppText key={capability} variant="caption" color="textSubtle">
                  • {capability}
                </AppText>
              ))}
              <AppText variant="caption" color="textMuted">
                {
                  members.filter((member) => member.role === roleInfo.role && member.status === 'active')
                    .length
                }{' '}
                active
              </AppText>
              {members.some(
                (member) =>
                  member.role === roleInfo.role &&
                  member.status === 'active' &&
                  Boolean(member.title?.trim()),
              ) ? (
                <AppText variant="caption" color="textSubtle">
                  Includes members with custom titles under this official role.
                </AppText>
              ) : null}
            </AppCard>
          ))}
        </View>
      ) : null}

      {section === 'invitations' && allowed ? (
        <View style={styles.list}>
          {invitesLoading ? <ActivityIndicator color={colors.primary} /> : null}
          {invitesError ? (
            <InlineFormMessage message={`Unable to load invitations. ${invitesError}`} />
          ) : null}
          {!invitesLoading && !invitesError ? (
            <>
              {(
                [
                  ['Pending', inviteBuckets.pending],
                  ['Accepted', inviteBuckets.accepted],
                  ['Expired', inviteBuckets.expired],
                  ['Revoked', inviteBuckets.revoked],
                ] as const
              ).map(([label, rows]) => (
                <View key={label} style={styles.inviteBucket}>
                  <AppText variant="label" color="textSubtle">
                    {label} ({rows.length})
                  </AppText>
                  {rows.length === 0 ? (
                    <AppText variant="caption" color="textMuted">
                      None
                    </AppText>
                  ) : (
                    rows.map((invite) => (
                      <InviteRow
                        key={invite.id}
                        invite={invite}
                        isExpired={expiredInviteIds.has(invite.id)}
                        onRevoke={onRevoke}
                        revoking={revokingId === invite.id}
                      />
                    ))
                  )}
                </View>
              ))}
              <AppText variant="caption" color="textSubtle">
                Invitation links are shared manually in this MVP. The app does not send email.
              </AppText>
            </>
          ) : null}
        </View>
      ) : null}

      {(section === 'roster' || section === 'suspended' || section === 'removed') && allowed ? (
        <>
          {!isWide ? (
            <AppButton
              label={filtersOpen ? 'Hide filters' : 'Show filters'}
              variant="ghost"
              onPress={() => setFiltersOpen((value) => !value)}
            />
          ) : null}

          {(isWide || filtersOpen) && section === 'roster' ? (
            <>
              <PersonnelFiltersBar
                filters={filters}
                unitOptions={unitOptions}
                agencyUnits={agencyUnitNames}
                onChange={setFilters}
              />
              <View style={styles.sortRow}>
                <AppText variant="label" color="textSubtle">
                  Sort
                </AppText>
                <View style={styles.tabs}>
                  {SORT_OPTIONS.map((option) => {
                    const selected = sortKey === option.key;
                    return (
                      <Pressable
                        key={option.key}
                        accessibilityRole="button"
                        onPress={() => setSortKey(option.key)}
                        style={[styles.tab, selected ? styles.tabSelected : null]}>
                        <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
                          {option.label}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          ) : null}

          {renderMemberList(
            rosterMembers,
            section === 'roster'
              ? 'No active personnel match your filters.'
              : `No ${section} personnel found.`,
          )}
        </>
      ) : null}

      {!allowed && section !== 'account' ? (
        <EmptyState title="Personnel administration is limited to agency admins and command staff." />
      ) : null}

      {Platform.OS !== 'web' && (section === 'roster' || section === 'suspended') ? (
        <AppText variant="caption" color="textSubtle">
          Print roster is available on web. Native PDF export is planned later.
        </AppText>
      ) : null}
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.md,
  },
  headerText: {
    gap: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tab: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  list: {
    gap: spacing.md,
  },
  inviteCard: {
    gap: spacing.sm,
  },
  inviteHeader: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  inviteBucket: {
    gap: spacing.sm,
  },
  roleCard: {
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  sortRow: {
    gap: spacing.sm,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  tableHeader: {
    backgroundColor: colors.surfaceRaised,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pressed: {
    backgroundColor: colors.primarySoft,
  },
  colName: {
    flex: 1.3,
  },
  colEmail: {
    flex: 1.4,
  },
  colRole: {
    flex: 1,
  },
  colUnit: {
    flex: 0.9,
  },
  colMeta: {
    flex: 0.75,
  },
});
