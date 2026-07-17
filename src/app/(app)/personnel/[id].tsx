import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import {
  AppButton,
  AppCard,
  AppText,
  EmptyState,
  FormField,
  InlineFormMessage,
  SectionLabel,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import { PersonnelIdentity } from '@/components/personnel/PersonnelIdentity';
import { UnitSelect, resolveUnitSelection, splitUnitSelection } from '@/components/personnel';
import { PERSONNEL_HREF, PERSONNEL_SHIFTS_HREF } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { useIsWideLayout } from '@/hooks/use-is-wide-layout';
import {
  GroupServiceError,
  addGroupMember,
  removeGroupMember,
} from '@/services/groups';
import {
  PersonnelServiceError,
  listAgencyGroupsForPersonnel,
  listAgencyUnits,
  listMemberGroups,
  listPersonnel,
  reactivateMembership,
  removeMembership,
  suspendMembership,
  updateMembership,
  uniqueUnitsFromPersonnel,
  type AgencyGroupOption,
  type MemberGroupSummary,
} from '@/services/personnel';
import {
  PersonnelProfileServiceError,
  createEmergencyContact,
  createPersonnelCertification,
  deleteEmergencyContact,
  deletePersonnelCertification,
  getPersonnelProfile,
  listEmergencyContacts,
  listPersonnelCertifications,
  updatePersonnelProfile,
  uploadPersonnelAvatar,
} from '@/services/personnel-profiles';
import {
  ShiftServiceError,
  assignPersonnelToShift,
  listAgencyShifts,
  listShiftAssignments,
  removeShiftAssignment,
} from '@/services/shifts';
import {
  formatShiftAssignmentType,
  formatShiftHours,
  type AgencyShift,
  type PersonnelShiftAssignment,
} from '@/types/shifts';
import { UNIT_OTHER_VALUE, normalizeOptionLabel } from '@/constants/personnelOptions';
import { colors, spacing } from '@/theme';
import type { AgencyRole } from '@/types/agency';
import {
  canAssignAgencyAdmin,
  canManagePersonnel,
  formatMembershipStatus,
  formatPersonnelRole,
  inviteableRolesFor,
} from '@/types/personnel';
import type {
  PersonnelCertification,
  PersonnelEmergencyContact,
  PersonnelEmploymentType,
  PersonnelProfile,
} from '@/types/personnelProfiles';
import {
  EMPLOYMENT_TYPES,
  formatEmploymentType,
  isEmploymentType,
} from '@/types/personnelProfiles';

type SectionKey = 'overview' | 'assignment' | 'contact' | 'certs' | 'emergency' | 'groups';

export default function PersonnelProfileScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const userId = typeof params.id === 'string' ? params.id : params.id?.[0] ?? '';
  const { user } = useAuth();
  const { currentAgency, currentMembership } = useAgency();
  const agencyId = currentAgency?.id ?? null;
  const actorRole = currentMembership?.role;
  const allowed = !!agencyId && !!userId;
  const isWide = useIsWideLayout();
  const manager = canManagePersonnel(actorRole);

  const [profile, setProfile] = useState<PersonnelProfile | null>(null);
  const [certs, setCerts] = useState<PersonnelCertification[]>([]);
  const [contacts, setContacts] = useState<PersonnelEmergencyContact[]>([]);
  const [memberGroups, setMemberGroups] = useState<MemberGroupSummary[]>([]);
  const [agencyGroups, setAgencyGroups] = useState<AgencyGroupOption[]>([]);
  const [agencyUnitNames, setAgencyUnitNames] = useState<string[]>([]);
  const [knownUnits, setKnownUnits] = useState<string[]>([]);
  const [agencyShifts, setAgencyShifts] = useState<AgencyShift[]>([]);
  const [shiftAssignments, setShiftAssignments] = useState<PersonnelShiftAssignment[]>([]);
  const [section, setSection] = useState<SectionKey>('overview');
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // Edit form state
  const [displayName, setDisplayName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [workPhone, setWorkPhone] = useState('');
  const [mobilePhone, setMobilePhone] = useState('');
  const [rank, setRank] = useState('');
  const [title, setTitle] = useState('');
  const [unitValue, setUnitValue] = useState('');
  const [unitCustom, setUnitCustom] = useState('');
  const [shiftName, setShiftName] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [employmentType, setEmploymentType] = useState<PersonnelEmploymentType | ''>('');
  const [callsign, setCallsign] = useState('');
  const [radioNumber, setRadioNumber] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [role, setRole] = useState<AgencyRole>('officer');

  // Cert / emergency quick add
  const [certName, setCertName] = useState('');
  const [certExpires, setCertExpires] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const hydrateForm = useCallback((next: PersonnelProfile) => {
    setDisplayName(next.display_name ?? '');
    setPreferredName(next.preferred_name ?? '');
    setPronouns(next.pronouns ?? '');
    setWorkPhone(next.work_phone ?? '');
    setMobilePhone(next.mobile_phone ?? '');
    setRank(next.rank ?? '');
    setTitle(next.title ?? '');
    const split = splitUnitSelection(next.unit, []);
    setUnitValue(split.value);
    setUnitCustom(split.customValue);
    setShiftName(next.shift_name ?? '');
    setBadgeNumber(next.badge_number ?? '');
    setEmployeeNumber(next.employee_number ?? '');
    setHireDate(next.hire_date ?? '');
    setEmploymentType(next.employment_type ?? '');
    setCallsign(next.callsign ?? '');
    setRadioNumber(next.radio_number ?? '');
    setStatusNotes(next.status_notes ?? '');
    setRole(next.role);
  }, []);

  const load = useCallback(async () => {
    if (!agencyId || !userId || !user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const next = await getPersonnelProfile({
        agencyId,
        userId,
        currentUserId: user.id,
        currentRole: actorRole,
      });
      setProfile(next);
      hydrateForm(next);

      const [nextCerts, groups, allGroups, units, roster, shifts, assignments] =
        await Promise.all([
          listPersonnelCertifications({ agencyId, userId }).catch(() => []),
          listMemberGroups(agencyId, userId),
          listAgencyGroupsForPersonnel(agencyId),
          listAgencyUnits(agencyId),
          listPersonnel(agencyId),
          listAgencyShifts({ agencyId, includeInactive: false }).catch(() => [] as AgencyShift[]),
          listShiftAssignments({ agencyId, userId, activeOnly: true }).catch(
            () => [] as PersonnelShiftAssignment[],
          ),
        ]);
      setCerts(nextCerts);
      setMemberGroups(groups);
      setAgencyGroups(allGroups);
      setAgencyUnitNames(units.map((unit) => unit.name));
      setKnownUnits(uniqueUnitsFromPersonnel(roster));
      setAgencyShifts(shifts);
      setShiftAssignments(assignments);

      if (next.can_view_emergency_contacts) {
        setContacts(await listEmergencyContacts({ agencyId, userId }));
      } else {
        setContacts([]);
      }
    } catch (error) {
      setProfile(null);
      setErrorMessage(
        error instanceof PersonnelProfileServiceError ||
          error instanceof PersonnelServiceError ||
          error instanceof GroupServiceError
          ? error.message
          : 'Unable to load personnel profile.',
      );
    } finally {
      setLoading(false);
    }
  }, [actorRole, agencyId, hydrateForm, user, userId]);

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

  async function onSave() {
    if (!profile || !agencyId || !user?.id || saving) {
      return;
    }
    setSaving(true);
    setErrorMessage(null);
    setInfoMessage(null);
    try {
      const nextUnit = resolveUnitSelection(unitValue, unitCustom);
      if (unitValue === UNIT_OTHER_VALUE && !nextUnit) {
        setErrorMessage('Enter a custom unit name.');
        return;
      }

      if (profile.can_edit_personal || profile.can_edit_employment) {
        await updatePersonnelProfile({
          agencyId,
          userId: profile.user_id,
          membershipId: profile.membership_id,
          currentUserId: user.id,
          currentRole: actorRole,
          input: {
            ...(profile.can_edit_personal
              ? {
                  first_name: profile.first_name,
                  last_name: profile.last_name,
                  display_name: normalizeOptionLabel(displayName) || null,
                  preferred_name: normalizeOptionLabel(preferredName) || null,
                  pronouns: normalizeOptionLabel(pronouns) || null,
                  work_phone: workPhone.trim() || null,
                  mobile_phone: mobilePhone.trim() || null,
                }
              : {}),
            ...(profile.can_edit_employment
              ? {
                  rank: rank.trim() || null,
                  title: title.trim() || null,
                  unit: nextUnit,
                  shift_name: shiftName.trim() || null,
                  badge_number: badgeNumber.trim() || null,
                  employee_number: employeeNumber.trim() || null,
                  hire_date: hireDate.trim() || null,
                  clear_hire_date: !hireDate.trim(),
                  employment_type: employmentType || null,
                  clear_employment_type: !employmentType,
                  callsign: callsign.trim() || null,
                  radio_number: radioNumber.trim() || null,
                  status_notes: statusNotes.trim() || null,
                }
              : {}),
          },
        });
      }

      if (manager && role !== profile.role) {
        await updateMembership(profile.membership_id, {
          role,
          unit: nextUnit,
          title: title.trim() || null,
          badge_number: badgeNumber.trim() || null,
        });
      }

      setInfoMessage('Profile saved.');
      setEditing(false);
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof PersonnelProfileServiceError || error instanceof PersonnelServiceError
          ? error.message
          : 'Unable to save profile.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function onPickAvatar() {
    if (!profile || !agencyId || (!profile.can_edit_personal && !manager)) {
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage('Photo library permission is required to update an avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) {
      return;
    }
    const asset = result.assets[0];
    setSaving(true);
    setErrorMessage(null);
    try {
      await uploadPersonnelAvatar({
        agencyId,
        userId: profile.user_id,
        uri: asset.uri,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setInfoMessage('Avatar updated.');
      await load();
    } catch (error) {
      setErrorMessage(
        error instanceof PersonnelProfileServiceError
          ? error.message
          : 'Unable to upload avatar.',
      );
    } finally {
      setSaving(false);
    }
  }

  const roleOptions: AgencyRole[] = (() => {
    const base = inviteableRolesFor(actorRole);
    const options =
      canAssignAgencyAdmin(actorRole) && !base.includes('agency_admin')
        ? (['agency_admin', ...base] as AgencyRole[])
        : base;
    if (profile && !options.includes(profile.role)) {
      return [profile.role, ...options];
    }
    return options;
  })();

  if (!allowed) {
    return (
      <PageContainer>
        <EmptyState title="Unavailable" description="Select an agency to view personnel." />
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

  if (!profile) {
    return (
      <PageContainer>
        <EmptyState
          title="Profile unavailable"
          description={errorMessage ?? 'This member is not visible in the current agency.'}
        />
        <AppButton label="Back to directory" variant="ghost" onPress={() => router.replace(PERSONNEL_HREF)} />
      </PageContainer>
    );
  }

  const sections: { key: SectionKey; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'assignment', label: 'Assignment' },
    { key: 'contact', label: 'Contact' },
    { key: 'certs', label: 'Certifications' },
    { key: 'emergency', label: 'Emergency' },
    { key: 'groups', label: 'Groups & Access' },
  ];

  return (
    <PageContainer>
      <AppButton label="Back" variant="ghost" onPress={() => router.back()} />

      <PersonnelIdentity
        agencyId={agencyId}
        userId={profile.user_id}
        displayName={profile.display_name}
        preferredName={profile.preferred_name}
        firstName={profile.first_name}
        lastName={profile.last_name}
        email={profile.email}
        avatarPath={profile.avatar_path}
        rank={profile.rank}
        title={profile.title}
        unit={profile.unit}
        role={profile.role}
        size="lg"
      />

      <AppText variant="caption" color="textMuted">
        Badge: {profile.badge_number ?? '—'} · Shift:{' '}
        {shiftAssignments.find((row) => row.assignment_type === 'primary')?.shift_name ||
          profile.shift_name ||
          '—'}{' '}
        · Status: {formatMembershipStatus(profile.status)}
      </AppText>

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}
      {infoMessage ? <InlineFormMessage message={infoMessage} tone="success" /> : null}

      <View style={styles.actions}>
        {(profile.can_edit_personal || profile.can_edit_employment) && (
          <AppButton
            label={editing ? 'Cancel edit' : 'Edit profile'}
            variant="secondary"
            onPress={() => {
              setEditing((value) => !value);
              hydrateForm(profile);
            }}
          />
        )}
        {(profile.can_edit_personal || manager) && (
          <AppButton label="Change avatar" variant="ghost" onPress={() => void onPickAvatar()} disabled={saving} />
        )}
      </View>

      <View style={[styles.tabs, isWide ? styles.tabsWide : null]}>
        {sections.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            onPress={() => setSection(item.key)}
            style={[styles.tab, section === item.key ? styles.tabSelected : null]}>
            <AppText variant="caption" color={section === item.key ? 'text' : 'textMuted'}>
              {item.label}
            </AppText>
          </Pressable>
        ))}
      </View>

      {editing ? (
        <AppCard raised style={styles.block}>
          <SectionLabel>Edit</SectionLabel>
          {profile.can_edit_personal ? (
            <>
              <FormField label="Display name" value={displayName} onChangeText={setDisplayName} />
              <FormField label="Preferred name" value={preferredName} onChangeText={setPreferredName} />
              <FormField label="Pronouns" value={pronouns} onChangeText={setPronouns} />
              <FormField label="Work phone" value={workPhone} onChangeText={setWorkPhone} keyboardType="phone-pad" />
              <FormField label="Mobile phone" value={mobilePhone} onChangeText={setMobilePhone} keyboardType="phone-pad" />
            </>
          ) : null}
          {profile.can_edit_employment ? (
            <>
              <FormField label="Rank" value={rank} onChangeText={setRank} />
              <FormField label="Title" value={title} onChangeText={setTitle} />
              <UnitSelect
                value={unitValue}
                customValue={unitCustom}
                agencyUnits={agencyUnitNames}
                knownUnits={knownUnits}
                onChange={({ value, customValue }) => {
                  setUnitValue(value);
                  setUnitCustom(customValue);
                }}
              />
              <FormField
                label="Legacy shift label (compat)"
                value={shiftName}
                onChangeText={setShiftName}
                placeholder="Prefer Shifts & Assignments"
              />
              <AppButton
                label="Manage shift assignments"
                variant="ghost"
                onPress={() => router.push(PERSONNEL_SHIFTS_HREF)}
              />
              <FormField label="Badge" value={badgeNumber} onChangeText={setBadgeNumber} />
              <FormField label="Employee number" value={employeeNumber} onChangeText={setEmployeeNumber} />
              <FormField label="Hire date (YYYY-MM-DD)" value={hireDate} onChangeText={setHireDate} />
              <AppText variant="label" color="textSubtle">
                Employment type
              </AppText>
              <View style={styles.chipRow}>
                {EMPLOYMENT_TYPES.map((type) => (
                  <Pressable
                    key={type}
                    accessibilityRole="button"
                    onPress={() => setEmploymentType(type)}
                    style={[styles.chip, employmentType === type ? styles.chipSelected : null]}>
                    <AppText variant="caption">{formatEmploymentType(type)}</AppText>
                  </Pressable>
                ))}
              </View>
              <FormField label="Callsign" value={callsign} onChangeText={setCallsign} />
              <FormField label="Radio number" value={radioNumber} onChangeText={setRadioNumber} />
              <FormField label="Status notes" value={statusNotes} onChangeText={setStatusNotes} />
              {manager ? (
                <>
                  <AppText variant="label" color="textSubtle">
                    Official permission role
                  </AppText>
                  <View style={styles.chipRow}>
                    {roleOptions.map((option) => (
                      <Pressable
                        key={option}
                        accessibilityRole="button"
                        onPress={() => setRole(option)}
                        style={[styles.chip, role === option ? styles.chipSelected : null]}>
                        <AppText variant="caption">{formatPersonnelRole(option)}</AppText>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
            </>
          ) : null}
          <AppButton label="Save changes" onPress={() => void onSave()} loading={saving} disabled={saving} />
        </AppCard>
      ) : null}

      {!editing && section === 'overview' ? (
        <AppCard raised style={styles.block}>
          <AppText variant="body">Preferred name: {profile.preferred_name ?? '—'}</AppText>
          <AppText variant="body">Pronouns: {profile.pronouns ?? '—'}</AppText>
          <AppText variant="body">Hire date: {profile.hire_date ?? '—'}</AppText>
          <AppText variant="body">
            Employment:{' '}
            {profile.employment_type && isEmploymentType(profile.employment_type)
              ? formatEmploymentType(profile.employment_type)
              : '—'}
          </AppText>
          <AppText variant="body">Employee number: {profile.employee_number ?? '—'}</AppText>
          <AppText variant="body">Callsign: {profile.callsign ?? '—'}</AppText>
          <AppText variant="body">Radio: {profile.radio_number ?? '—'}</AppText>
        </AppCard>
      ) : null}

      {!editing && section === 'assignment' ? (
        <AppCard raised style={styles.block}>
          <AppText variant="body">Role: {formatPersonnelRole(profile.role)}</AppText>
          <AppText variant="body">Rank: {profile.rank ?? '—'}</AppText>
          <AppText variant="body">Title: {profile.title ?? '—'}</AppText>
          <AppText variant="body">Unit: {profile.unit ?? '—'}</AppText>
          <AppText variant="body">Supervisor: {profile.supervisor_name ?? '—'}</AppText>
          <AppText variant="label" color="textSubtle">
            Shift assignments
          </AppText>
          {shiftAssignments.length === 0 ? (
            <AppText variant="body" color="textMuted">
              No relational shift assignments.
              {profile.shift_name ? ` Legacy label: ${profile.shift_name}` : ''}
            </AppText>
          ) : (
            shiftAssignments.map((assignment) => (
              <View key={assignment.id} style={styles.shiftRow}>
                <AppText variant="body">
                  {assignment.shift_name ?? 'Shift'} ·{' '}
                  {formatShiftAssignmentType(assignment.assignment_type)}
                </AppText>
                <AppText variant="caption" color="textMuted">
                  {formatShiftHours(assignment.start_time, assignment.end_time)}
                  {assignment.effective_start || assignment.effective_end
                    ? ` · ${assignment.effective_start ?? '…'} → ${assignment.effective_end ?? '…'}`
                    : ''}
                </AppText>
                {manager && assignment.user_id !== user?.id ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove shift assignment"
                    disabled={saving}
                    onPress={() => {
                      if (!agencyId) return;
                      void (async () => {
                        setSaving(true);
                        setErrorMessage(null);
                        try {
                          await removeShiftAssignment({
                            agencyId,
                            assignmentId: assignment.id,
                          });
                          await load();
                        } catch (error) {
                          setErrorMessage(
                            error instanceof ShiftServiceError
                              ? error.message
                              : 'Unable to remove assignment.',
                          );
                        } finally {
                          setSaving(false);
                        }
                      })();
                    }}>
                    <AppText variant="caption" color="danger">
                      Remove
                    </AppText>
                  </Pressable>
                ) : null}
              </View>
            ))
          )}
          {manager && agencyShifts.length > 0 ? (
            <View style={styles.shiftAssign}>
              <AppText variant="caption" color="textMuted">
                Assign primary shift
              </AppText>
              <View style={styles.chipRow}>
                {agencyShifts.map((shift) => (
                  <Pressable
                    key={shift.id}
                    accessibilityRole="button"
                    disabled={saving}
                    onPress={() => {
                      if (!agencyId) return;
                      void (async () => {
                        setSaving(true);
                        setErrorMessage(null);
                        try {
                          await assignPersonnelToShift({
                            agencyId,
                            shiftId: shift.id,
                            input: { userId, assignmentType: 'primary' },
                          });
                          await load();
                          setInfoMessage(`Assigned to ${shift.name}.`);
                        } catch (error) {
                          setErrorMessage(
                            error instanceof ShiftServiceError
                              ? error.message
                              : 'Unable to assign shift.',
                          );
                        } finally {
                          setSaving(false);
                        }
                      })();
                    }}
                    style={styles.chip}>
                    <AppText variant="caption" color="textMuted">
                      {shift.name}
                    </AppText>
                  </Pressable>
                ))}
              </View>
              <AppButton
                label="Open Shifts & Assignments"
                variant="ghost"
                onPress={() => router.push(PERSONNEL_SHIFTS_HREF)}
              />
            </View>
          ) : null}
          {profile.status_notes ? (
            <AppText variant="caption" color="textSubtle">
              Notes: {profile.status_notes}
            </AppText>
          ) : null}
        </AppCard>
      ) : null}

      {!editing && section === 'contact' ? (
        <AppCard raised style={styles.block}>
          <AppText variant="body">Email: {profile.email ?? '—'}</AppText>
          <AppText variant="body">Work phone: {profile.work_phone ?? '—'}</AppText>
          {profile.can_edit_personal || manager ? (
            <AppText variant="body">Mobile: {profile.mobile_phone ?? '—'}</AppText>
          ) : (
            <AppText variant="caption" color="textSubtle">
              Mobile number is limited to the member and personnel managers.
            </AppText>
          )}
        </AppCard>
      ) : null}

      {!editing && section === 'certs' ? (
        <View style={styles.block}>
          {certs.length === 0 ? (
            <EmptyState title="No certifications" description="None on file for this member." />
          ) : (
            certs.map((cert) => (
              <AppCard key={cert.id} raised style={styles.itemCard}>
                <AppText variant="title">{cert.certification_name}</AppText>
                <AppText variant="caption" color="textMuted">
                  {cert.issuing_authority ?? 'Authority n/a'} · {cert.effective_status}
                  {cert.expiration_date ? ` · Exp ${cert.expiration_date}` : ' · No expiration'}
                </AppText>
                {cert.credential_number ? (
                  <AppText variant="caption" color="textSubtle">
                    Credential: {cert.credential_number}
                  </AppText>
                ) : null}
                {profile.can_manage_certifications ? (
                  <AppButton
                    label="Delete"
                    variant="ghost"
                    onPress={() =>
                      void deletePersonnelCertification({
                        agencyId: agencyId!,
                        certificationId: cert.id,
                      }).then(load)
                    }
                  />
                ) : null}
              </AppCard>
            ))
          )}
          {profile.can_manage_certifications ? (
            <AppCard raised style={styles.itemCard}>
              <FormField label="Certification name" value={certName} onChangeText={setCertName} />
              <FormField label="Expiration (YYYY-MM-DD)" value={certExpires} onChangeText={setCertExpires} />
              <AppButton
                label="Add certification"
                onPress={() =>
                  void createPersonnelCertification({
                    agencyId: agencyId!,
                    userId: profile.user_id,
                    input: {
                      certification_name: certName,
                      expiration_date: certExpires || null,
                    },
                  })
                    .then(() => {
                      setCertName('');
                      setCertExpires('');
                      return load();
                    })
                    .catch((error) =>
                      setErrorMessage(
                        error instanceof PersonnelProfileServiceError
                          ? error.message
                          : 'Unable to add certification.',
                      ),
                    )
                }
              />
            </AppCard>
          ) : null}
        </View>
      ) : null}

      {!editing && section === 'emergency' ? (
        <View style={styles.block}>
          {!profile.can_view_emergency_contacts ? (
            <EmptyState
              title="Restricted"
              description="Emergency contacts are only visible to the member and agency administrators / command staff."
            />
          ) : (
            <>
              {contacts.map((contact) => (
                <AppCard key={contact.id} raised style={styles.itemCard}>
                  <AppText variant="title">{contact.name}</AppText>
                  <AppText variant="caption" color="textMuted">
                    {contact.relationship ?? 'Contact'} · {contact.phone}
                  </AppText>
                  {(profile.can_edit_personal || manager) && (
                    <AppButton
                      label="Delete"
                      variant="ghost"
                      onPress={() =>
                        void deleteEmergencyContact({
                          agencyId: agencyId!,
                          contactId: contact.id,
                        }).then(load)
                      }
                    />
                  )}
                </AppCard>
              ))}
              {(profile.can_edit_personal || manager) && (
                <AppCard raised style={styles.itemCard}>
                  <FormField label="Name" value={contactName} onChangeText={setContactName} />
                  <FormField label="Phone" value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" />
                  <AppButton
                    label="Add emergency contact"
                    onPress={() =>
                      void createEmergencyContact({
                        agencyId: agencyId!,
                        userId: profile.user_id,
                        input: { name: contactName, phone: contactPhone },
                      })
                        .then(() => {
                          setContactName('');
                          setContactPhone('');
                          return load();
                        })
                        .catch((error) =>
                          setErrorMessage(
                            error instanceof PersonnelProfileServiceError
                              ? error.message
                              : 'Unable to add contact.',
                          ),
                        )
                    }
                  />
                </AppCard>
              )}
            </>
          )}
        </View>
      ) : null}

      {!editing && section === 'groups' ? (
        <View style={styles.block}>
          <AppText variant="body">Agency role: {formatPersonnelRole(profile.role)}</AppText>
          <AppText variant="body">Membership: {formatMembershipStatus(profile.status)}</AppText>
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
                {manager ? (
                  <AppButton
                    label="Remove"
                    variant="ghost"
                    onPress={() =>
                      void removeGroupMember({
                        agencyId: agencyId!,
                        groupId: group.group_id,
                        userId: profile.user_id,
                      }).then(load)
                    }
                  />
                ) : null}
              </View>
            ))
          )}
          {manager ? (
            <>
              <SectionLabel>Add to group</SectionLabel>
              {agencyGroups
                .filter((group) => !memberGroups.some((item) => item.group_id === group.id))
                .map((group) => (
                  <AppButton
                    key={group.id}
                    label={group.name}
                    variant="ghost"
                    onPress={() =>
                      void addGroupMember({
                        agencyId: agencyId!,
                        groupId: group.id,
                        userId: profile.user_id,
                      }).then(load)
                    }
                  />
                ))}
              {profile.status === 'active' ? (
                <AppButton
                  label="Suspend membership"
                  variant="secondary"
                  onPress={() => void suspendMembership(profile.membership_id).then(load)}
                />
              ) : null}
              {profile.status === 'suspended' || profile.status === 'removed' ? (
                <AppButton
                  label="Reactivate membership"
                  variant="secondary"
                  onPress={() => void reactivateMembership(profile.membership_id).then(load)}
                />
              ) : null}
              {profile.status !== 'removed' ? (
                <AppButton
                  label="Mark removed"
                  variant="ghost"
                  onPress={() => void removeMembership(profile.membership_id).then(load)}
                />
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tabsWide: {
    marginBottom: spacing.sm,
  },
  tab: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  tabSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  block: {
    gap: spacing.sm,
  },
  itemCard: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  shiftRow: {
    gap: spacing.xxs,
    paddingVertical: spacing.xs,
  },
  shiftAssign: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  flex: {
    flex: 1,
  },
});
