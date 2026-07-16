import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  EmptyState,
  FormField,
  InlineFormMessage,
  SectionLabel,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import {
  RoleSelect,
  UnitSelect,
  resolveUnitSelection,
  splitUnitSelection,
} from '@/components/personnel';
import { UNIT_OTHER_VALUE, normalizeOptionLabel } from '@/constants/personnelOptions';
import { PERSONNEL_HREF } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { GroupServiceError, addGroupMember, removeGroupMember } from '@/services/groups';
import {
  PersonnelServiceError,
  ensureAgencyUnit,
  listAgencyGroupsForPersonnel,
  listAgencyUnits,
  listMemberGroups,
  listPersonnel,
  reactivateMembership,
  removeMembership,
  suspendMembership,
  uniqueUnitsFromPersonnel,
  updateMembership,
  type AgencyGroupOption,
  type MemberGroupSummary,
} from '@/services/personnel';
import { colors, radius, spacing } from '@/theme';
import type { AgencyRole } from '@/types/agency';
import type { PersonnelMember } from '@/types/personnel';
import {
  canAssignAgencyAdmin,
  canManagePersonnel,
  formatMembershipStatus,
  formatPersonnelRole,
  inviteableRolesFor,
  personnelDisplayName,
} from '@/types/personnel';

export default function PersonnelMemberScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const membershipId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
  const { user } = useAuth();
  const { currentAgency, currentMembership, refreshAgencyContext } = useAgency();
  const agencyId = currentAgency?.id ?? null;
  const actorRole = currentMembership?.role;
  const allowed = canManagePersonnel(actorRole);

  const [member, setMember] = useState<PersonnelMember | null>(null);
  const [role, setRole] = useState<AgencyRole>('officer');
  const [specialized, setSpecialized] = useState(false);
  const [unitValue, setUnitValue] = useState('');
  const [unitCustom, setUnitCustom] = useState('');
  const [title, setTitle] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [agencyUnitNames, setAgencyUnitNames] = useState<string[]>([]);
  const [knownUnits, setKnownUnits] = useState<string[]>([]);
  const [memberGroups, setMemberGroups] = useState<MemberGroupSummary[]>([]);
  const [agencyGroups, setAgencyGroups] = useState<AgencyGroupOption[]>([]);
  const [groupToAdd, setGroupToAdd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!agencyId || !membershipId || !allowed) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      const [all, units] = await Promise.all([
        listPersonnel(agencyId),
        listAgencyUnits(agencyId),
      ]);
      const found = all.find((item) => item.id === membershipId) ?? null;
      setMember(found);
      const unitNames = units.map((unit) => unit.name);
      const rosterUnits = uniqueUnitsFromPersonnel(all);
      setAgencyUnitNames(unitNames);
      setKnownUnits(rosterUnits);
      if (found) {
        setRole(found.role);
        const split = splitUnitSelection(found.unit, [...unitNames, ...rosterUnits]);
        setUnitValue(split.value);
        setUnitCustom(split.customValue);
        setTitle(found.title ?? '');
        setSpecialized(false);
        setBadgeNumber(found.badge_number ?? '');
        const [groups, allGroups] = await Promise.all([
          listMemberGroups(agencyId, found.user_id),
          listAgencyGroupsForPersonnel(agencyId),
        ]);
        setMemberGroups(groups);
        setAgencyGroups(allGroups);
      }
    } catch (error) {
      const message =
        error instanceof PersonnelServiceError || error instanceof GroupServiceError
          ? error.message
          : 'Unable to load member details.';
      setErrorMessage(message);
    } finally {
      setLoading(false);
    }
  }, [allowed, agencyId, membershipId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          void load();
        }
      });
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  const roleOptions: AgencyRole[] = (() => {
    const base = inviteableRolesFor(actorRole);
    const options =
      canAssignAgencyAdmin(actorRole) && !base.includes('agency_admin')
        ? (['agency_admin', ...base] as AgencyRole[])
        : base;
    if (member && !options.includes(member.role)) {
      return [member.role, ...options];
    }
    return options;
  })();

  async function onSave() {
    if (!member || saving || !agencyId) {
      return;
    }

    const nextTitle = normalizeOptionLabel(title);
    const nextUnit = resolveUnitSelection(unitValue, unitCustom);
    setTitleError(null);
    setUnitError(null);

    if (specialized && !nextTitle) {
      setTitleError('Enter a custom title or classification for specialized assignments.');
      return;
    }
    if (unitValue === UNIT_OTHER_VALUE && !nextUnit) {
      setUnitError('Enter a custom unit name.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      if (nextUnit) {
        await ensureAgencyUnit(agencyId, nextUnit);
      }
      await updateMembership(member.id, {
        role,
        unit: nextUnit,
        title: nextTitle || null,
        badge_number: badgeNumber,
      });
      setInfoMessage('Membership updated.');
      await load();
      if (member.user_id === user?.id) {
        await refreshAgencyContext();
      }
    } catch (error) {
      const message =
        error instanceof PersonnelServiceError
          ? error.message
          : 'Unable to update membership.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  }

  async function onStatusAction(action: 'suspend' | 'reactivate' | 'remove') {
    if (!member || saving) {
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      if (action === 'suspend') {
        await suspendMembership(member.id);
        setInfoMessage('Membership suspended.');
      } else if (action === 'reactivate') {
        await reactivateMembership(member.id);
        setInfoMessage('Membership reactivated.');
      } else {
        await removeMembership(member.id);
        setInfoMessage('Membership marked removed.');
      }
      await load();
      if (member.user_id === user?.id) {
        await refreshAgencyContext();
      }
    } catch (error) {
      const message =
        error instanceof PersonnelServiceError
          ? error.message
          : 'Unable to update membership status.';
      setErrorMessage(message);
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) {
    return (
      <PageContainer>
        <EmptyState title="You do not have permission to manage this member." />
      </PageContainer>
    );
  }

  if (loading) {
    return (
      <PageContainer>
        <ActivityIndicator color={colors.primary} />
      </PageContainer>
    );
  }

  if (!member) {
    return (
      <PageContainer>
        <EmptyState title="Member not found." />
        <AppButton
          label="Back to personnel"
          variant="ghost"
          onPress={() => router.replace(PERSONNEL_HREF)}
        />
      </PageContainer>
    );
  }

  const isSelf = member.user_id === user?.id;

  return (
    <PageContainer>
      <SectionLabel>Member details</SectionLabel>
      <AppText variant="title">{personnelDisplayName(member)}</AppText>
      {member.email ? (
        <AppText variant="caption" color="textMuted">
          {member.email}
        </AppText>
      ) : null}
      <AppText variant="body" color="textMuted">
        Status: {formatMembershipStatus(member.status)}
      </AppText>
      <AppText variant="body" color="textMuted">
        Role: {formatPersonnelRole(member.role)}
      </AppText>
      {member.title ? (
        <AppText variant="caption" color="textMuted">
          Title: {member.title}
        </AppText>
      ) : null}
      {member.unit ? (
        <AppText variant="caption" color="textMuted">
          Unit: {member.unit}
        </AppText>
      ) : null}

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}
      {infoMessage ? <InlineFormMessage message={infoMessage} tone="success" /> : null}

      {isSelf ? (
        <AppText variant="caption" color="textSubtle">
          You cannot change your own official permission role.
        </AppText>
      ) : null}

      <RoleSelect
        roles={roleOptions}
        value={role}
        title={title}
        specialized={specialized}
        onRoleChange={setRole}
        onTitleChange={setTitle}
        onSpecializedChange={setSpecialized}
        disabled={isSelf}
        titleError={titleError}
      />

      <UnitSelect
        value={unitValue}
        customValue={unitCustom}
        agencyUnits={agencyUnitNames}
        knownUnits={knownUnits}
        onChange={({ value, customValue }) => {
          setUnitValue(value);
          setUnitCustom(customValue);
        }}
        error={unitError}
      />

      <FormField
        label="Badge number"
        value={badgeNumber}
        onChangeText={setBadgeNumber}
        placeholder="Badge"
      />

      <AppButton label="Save changes" onPress={onSave} loading={saving} disabled={saving} />

      <View style={styles.statusActions}>
        {member.status === 'active' ? (
          <AppButton
            label="Suspend membership"
            variant="secondary"
            disabled={saving || isSelf}
            onPress={() => void onStatusAction('suspend')}
          />
        ) : null}
        {member.status === 'suspended' ? (
          <AppButton
            label="Reactivate membership"
            variant="secondary"
            disabled={saving}
            onPress={() => void onStatusAction('reactivate')}
          />
        ) : null}
        {member.status !== 'removed' ? (
          <AppButton
            label="Mark removed"
            variant="ghost"
            disabled={saving || isSelf}
            onPress={() => void onStatusAction('remove')}
          />
        ) : (
          <AppButton
            label="Reactivate membership"
            variant="secondary"
            disabled={saving}
            onPress={() => void onStatusAction('reactivate')}
          />
        )}
      </View>

      <View style={styles.groupsBlock}>
        <AppText variant="label" color="textMuted">
          Group memberships
        </AppText>
        {memberGroups.length === 0 ? (
          <AppText variant="caption" color="textSubtle">
            Not in any active groups.
          </AppText>
        ) : (
          memberGroups.map((group) => (
            <View key={group.group_id} style={styles.groupRow}>
              <AppText variant="body" style={styles.flex}>
                {group.group_name}
                {group.is_moderator ? ' · Moderator' : ''}
              </AppText>
              <AppButton
                label="Remove"
                variant="ghost"
                disabled={saving || member.status !== 'active'}
                onPress={() => {
                  if (!agencyId) {
                    return;
                  }
                  setSaving(true);
                  setErrorMessage(null);
                  void removeGroupMember({
                    agencyId,
                    groupId: group.group_id,
                    userId: member.user_id,
                  })
                    .then(async () => {
                      setInfoMessage('Removed from group.');
                      await load();
                    })
                    .catch((error) => {
                      setErrorMessage(
                        error instanceof GroupServiceError
                          ? error.message
                          : 'Unable to remove from group.',
                      );
                    })
                    .finally(() => setSaving(false));
                }}
              />
            </View>
          ))
        )}

        {member.status === 'active' ? (
          <>
            <AppText variant="label" color="textMuted">
              Add to group
            </AppText>
            <View style={styles.roleRow}>
              {agencyGroups
                .filter((group) => !memberGroups.some((item) => item.group_id === group.id))
                .map((group) => {
                  const selected = groupToAdd === group.id;
                  return (
                    <Pressable
                      key={group.id}
                      accessibilityRole="button"
                      onPress={() => setGroupToAdd(group.id)}
                      style={[styles.roleChip, selected ? styles.roleChipSelected : null]}>
                      <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
                        {group.name}
                      </AppText>
                    </Pressable>
                  );
                })}
            </View>
            <AppButton
              label="Add selected group"
              variant="secondary"
              disabled={!groupToAdd || saving}
              onPress={() => {
                if (!agencyId || !groupToAdd) {
                  return;
                }
                setSaving(true);
                setErrorMessage(null);
                void addGroupMember({
                  agencyId,
                  groupId: groupToAdd,
                  userId: member.user_id,
                })
                  .then(async () => {
                    setGroupToAdd(null);
                    setInfoMessage('Added to group.');
                    await load();
                  })
                  .catch((error) => {
                    setErrorMessage(
                      error instanceof GroupServiceError
                        ? error.message
                        : 'Unable to add to group.',
                    );
                  })
                  .finally(() => setSaving(false));
              }}
            />
          </>
        ) : null}
      </View>

      <AppButton label="Back" variant="ghost" onPress={() => router.back()} disabled={saving} />
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  roleBlock: {
    gap: spacing.sm,
  },
  roleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  roleChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  roleChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  statusActions: {
    gap: spacing.sm,
  },
  groupsBlock: {
    gap: spacing.sm,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
