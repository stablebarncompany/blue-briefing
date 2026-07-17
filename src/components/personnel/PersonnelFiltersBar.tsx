import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppText, FormField } from '@/components/common';
import {
  COMMON_AGENCY_UNITS,
  mergeUniqueLabels,
  normalizeOptionKey,
} from '@/constants/personnelOptions';
import { colors, radius, spacing } from '@/theme';
import { AGENCY_ROLES, type AgencyRole } from '@/types/agency';
import type { PersonnelListFilters } from '@/types/personnel';
import { formatPersonnelRole } from '@/types/personnel';
import {
  EMPLOYMENT_TYPES,
  formatEmploymentType,
  type PersonnelEmploymentType,
} from '@/types/personnelProfiles';

export type PersonnelFiltersBarProps = {
  filters: PersonnelListFilters;
  unitOptions: string[];
  agencyUnits?: string[];
  shiftOptions?: string[];
  onChange: (next: PersonnelListFilters) => void;
};

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : null]}>
      <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function PersonnelFiltersBar({
  filters,
  unitOptions,
  agencyUnits = [],
  shiftOptions = [],
  onChange,
}: PersonnelFiltersBarProps) {
  const [roleQuery, setRoleQuery] = useState('');
  const [unitQuery, setUnitQuery] = useState('');
  const roleValue = filters.role ?? 'all';
  const unitValue = filters.unit ?? 'all';
  const shiftValue = filters.shift ?? 'all';
  const employmentValue = filters.employment_type ?? 'all';

  // Filters list known roster + agency-configured units (not the full suggested catalog).
  const mergedUnits = useMemo(
    () => mergeUniqueLabels(agencyUnits, unitOptions),
    [agencyUnits, unitOptions],
  );

  const customUnits = useMemo(() => {
    const commonKeys = new Set(COMMON_AGENCY_UNITS.map((unit) => normalizeOptionKey(unit)));
    return mergeUniqueLabels(agencyUnits, unitOptions).filter(
      (unit) => !commonKeys.has(normalizeOptionKey(unit)),
    );
  }, [agencyUnits, unitOptions]);

  const filteredRoles = AGENCY_ROLES.filter((role) => {
    if (!roleQuery.trim()) {
      return true;
    }
    return formatPersonnelRole(role).toLowerCase().includes(roleQuery.trim().toLowerCase());
  });

  const filteredUnits = mergedUnits.filter((unit) => {
    if (!unitQuery.trim()) {
      return true;
    }
    return unit.toLowerCase().includes(unitQuery.trim().toLowerCase());
  });

  return (
    <View style={styles.wrap}>
      <FormField
        label="Search"
        value={filters.search ?? ''}
        onChangeText={(search) => onChange({ ...filters, search })}
        placeholder="Search name, email, title, unit, badge…"
        autoCapitalize="none"
      />

      <View style={styles.rowBlock}>
        <AppText variant="label" color="textSubtle">
          Official permission role
        </AppText>
        <FormField
          label="Search roles"
          value={roleQuery}
          onChangeText={setRoleQuery}
          placeholder="Filter role chips…"
        />
        <View style={styles.chipRow}>
          <FilterChip
            label="All"
            selected={roleValue === 'all'}
            onPress={() => onChange({ ...filters, role: 'all' })}
          />
          {filteredRoles.map((role) => (
            <FilterChip
              key={role}
              label={formatPersonnelRole(role)}
              selected={roleValue === role}
              onPress={() => onChange({ ...filters, role: role as AgencyRole })}
            />
          ))}
        </View>
        <AppText variant="caption" color="textSubtle">
          Custom titles appear under their official permission role.
        </AppText>
      </View>

      <View style={styles.rowBlock}>
        <AppText variant="label" color="textSubtle">
          Unit / division
        </AppText>
        <FormField
          label="Search units"
          value={unitQuery}
          onChangeText={setUnitQuery}
          placeholder="Filter unit chips…"
        />
        <View style={styles.chipRow}>
          <FilterChip
            label="All"
            selected={unitValue === 'all'}
            onPress={() => onChange({ ...filters, unit: 'all' })}
          />
          {filteredUnits.map((unit) => (
            <FilterChip
              key={unit}
              label={unit}
              selected={normalizeOptionKey(unitValue) === normalizeOptionKey(unit)}
              onPress={() => onChange({ ...filters, unit })}
            />
          ))}
        </View>
        {customUnits.length > 0 ? (
          <AppText variant="caption" color="textSubtle">
            Other / custom units appear by their saved names (never as “Other”).
          </AppText>
        ) : null}
      </View>

      {shiftOptions.length > 0 ? (
        <View style={styles.rowBlock}>
          <AppText variant="label" color="textSubtle">
            Shift
          </AppText>
          <View style={styles.chipRow}>
            <FilterChip
              label="All"
              selected={shiftValue === 'all'}
              onPress={() => onChange({ ...filters, shift: 'all' })}
            />
            {shiftOptions.map((shift) => (
              <FilterChip
                key={shift}
                label={shift}
                selected={shiftValue === shift}
                onPress={() => onChange({ ...filters, shift })}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.rowBlock}>
        <AppText variant="label" color="textSubtle">
          Employment type
        </AppText>
        <View style={styles.chipRow}>
          <FilterChip
            label="All"
            selected={employmentValue === 'all'}
            onPress={() => onChange({ ...filters, employment_type: 'all' })}
          />
          {EMPLOYMENT_TYPES.map((type) => (
            <FilterChip
              key={type}
              label={formatEmploymentType(type)}
              selected={employmentValue === type}
              onPress={() =>
                onChange({ ...filters, employment_type: type as PersonnelEmploymentType })
              }
            />
          ))}
        </View>
      </View>

      <AppButton
        label="Clear filters"
        variant="ghost"
        onPress={() =>
          onChange({
            search: '',
            role: 'all',
            unit: 'all',
            shift: 'all',
            employment_type: 'all',
            status: filters.status,
          })
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  rowBlock: {
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
});
