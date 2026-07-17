import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import {
  AppButton,
  AppText,
  EmptyState,
  FormField,
  InlineFormMessage,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import { ShiftDetailPanel, ShiftSelect } from '@/components/shifts';
import { PERSONNEL_HREF, personnelShiftDetailHref } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { useIsWideLayout } from '@/hooks/use-is-wide-layout';
import {
  ShiftServiceError,
  createShift,
  listAgencyShifts,
} from '@/services/shifts';
import { colors, radius, spacing } from '@/theme';
import {
  canManageShiftCatalog,
  formatShiftHours,
  type AgencyShift,
} from '@/types/shifts';

export default function PersonnelShiftsScreen() {
  const { user } = useAuth();
  const { currentAgency, currentMembership } = useAgency();
  const isWide = useIsWideLayout();
  const agencyId = currentAgency?.id ?? null;
  const role = currentMembership?.role;
  const canManage = canManageShiftCatalog(role);

  const [shifts, setShifts] = useState<AgencyShift[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!agencyId) {
      setShifts([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const rows = await listAgencyShifts({
        agencyId,
        includeInactive: showInactive || canManage,
      });
      setShifts(rows);
      setSelectedId((current) => {
        if (current && rows.some((row) => row.id === current)) {
          return current;
        }
        return rows.find((row) => row.is_active)?.id ?? rows[0]?.id ?? null;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof ShiftServiceError ? error.message : 'Unable to load shifts.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [agencyId, canManage, showInactive]);

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

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return shifts.filter((shift) => {
      if (!showInactive && !shift.is_active) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [shift.name, shift.shift_code, shift.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [search, shifts, showInactive]);

  const selected = filtered.find((shift) => shift.id === selectedId) ?? null;

  async function onCreate() {
    if (!agencyId || busy) {
      return;
    }
    setBusy(true);
    setCreateError(null);
    try {
      const created = await createShift({
        agencyId,
        input: { name: createName },
      });
      setCreating(false);
      setCreateName('');
      await load();
      setSelectedId(created.id);
    } catch (error) {
      setCreateError(error instanceof ShiftServiceError ? error.message : 'Unable to create shift.');
    } finally {
      setBusy(false);
    }
  }

  if (!currentAgency || !user?.id) {
    return (
      <PageContainer>
        <EmptyState
          title="Select an agency"
          description="Choose an agency membership before managing shifts."
        />
      </PageContainer>
    );
  }

  const listPane = (
    <View style={styles.listPane}>
      <View style={styles.heading}>
        <AppText variant="display">Shifts & Assignments</AppText>
        <AppText variant="body" color="textMuted">
          Agency shift catalog and personnel assignments.
        </AppText>
      </View>
      <View style={styles.toolbar}>
        <AppButton label="Back to Personnel" variant="ghost" onPress={() => router.push(PERSONNEL_HREF)} />
        {canManage ? (
          <AppButton
            label={creating ? 'Cancel' : 'Create shift'}
            variant={creating ? 'ghost' : 'primary'}
            onPress={() => setCreating((value) => !value)}
          />
        ) : null}
        {canManage ? (
          <AppButton
            label={showInactive ? 'Hide inactive' : 'Show inactive'}
            variant="ghost"
            onPress={() => setShowInactive((value) => !value)}
          />
        ) : null}
      </View>
      <FormField
        label="Search shifts"
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name or code…"
        autoCapitalize="none"
      />
      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}
      {creating && canManage ? (
        <View style={styles.createBlock}>
          <ShiftSelect
            label="Suggested shift name"
            agencyShifts={[]}
            value={createName}
            customValue={createName}
            createMode
            allowNone={false}
            onChange={(next) => setCreateName(next.name)}
            error={createError}
          />
          <AppButton
            label="Save shift"
            loading={busy}
            disabled={busy || !createName.trim() || createName.trim().toLowerCase() === 'other'}
            onPress={() => void onCreate()}
          />
        </View>
      ) : null}
      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No shifts yet"
          description={
            canManage
              ? 'Create A/B/C, Day/Night, or custom shifts for this agency.'
              : 'Ask an administrator to configure agency shifts.'
          }
        />
      ) : (
        <View style={styles.list}>
          {filtered.map((shift) => {
            const selectedRow = isWide && shift.id === selectedId;
            return (
              <Pressable
                key={shift.id}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedRow }}
                onPress={() => {
                  if (isWide) {
                    setSelectedId(shift.id);
                    return;
                  }
                  router.push(personnelShiftDetailHref(shift.id));
                }}
                style={[styles.shiftCard, selectedRow ? styles.shiftCardSelected : null]}>
                <AppText variant="body">{shift.name}</AppText>
                <AppText variant="caption" color="textMuted">
                  {[
                    formatShiftHours(shift.start_time, shift.end_time),
                    `${shift.member_count ?? 0} assigned`,
                    shift.is_active ? null : 'Inactive',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </AppText>
                {(shift.supervisor_names?.length ?? 0) > 0 ? (
                  <AppText variant="caption" color="textSubtle" numberOfLines={1}>
                    Supervisors: {shift.supervisor_names?.join(', ')}
                  </AppText>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  if (isWide) {
    return (
      <PageContainer contentStyle={styles.widePage}>
        <View style={styles.split}>
          <View style={styles.left}>{listPane}</View>
          <View style={styles.right}>
            {selected ? (
              <ShiftDetailPanel
                agencyId={currentAgency.id}
                shiftId={selected.id}
                agencyName={currentAgency.name}
                role={role}
                currentUserId={user.id}
                onChanged={() => void load()}
              />
            ) : (
              <EmptyState
                title="Select a shift"
                description="Choose a shift to view assignments and supervisors."
              />
            )}
          </View>
        </View>
      </PageContainer>
    );
  }

  return <PageContainer contentStyle={styles.mobilePage}>{listPane}</PageContainer>;
}

const styles = StyleSheet.create({
  widePage: {
    maxWidth: 1200,
    gap: 0,
  },
  mobilePage: {
    gap: spacing.lg,
  },
  split: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing['2xl'],
  },
  left: {
    width: 360,
    maxWidth: '36%',
    minWidth: 280,
  },
  right: {
    flex: 1,
    minWidth: 0,
    paddingLeft: spacing.lg,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  listPane: {
    gap: spacing.md,
  },
  heading: {
    gap: spacing.xs,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  createBlock: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
  },
  list: {
    gap: spacing.sm,
  },
  shiftCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    gap: spacing.xxs,
  },
  shiftCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
});
