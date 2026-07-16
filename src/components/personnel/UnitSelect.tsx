import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, FormField } from '@/components/common';
import { CustomOptionField } from '@/components/personnel/CustomOptionField';
import {
  COMMON_AGENCY_UNITS,
  UNIT_OTHER_VALUE,
  mergeUniqueLabels,
  normalizeOptionKey,
  normalizeOptionLabel,
} from '@/constants/personnelOptions';
import { colors, radius, spacing } from '@/theme';

export type UnitSelectProps = {
  value: string;
  customValue: string;
  agencyUnits?: string[];
  knownUnits?: string[];
  onChange: (next: { value: string; customValue: string }) => void;
  optional?: boolean;
  disabled?: boolean;
  error?: string | null;
  allowClear?: boolean;
};

export function UnitSelect({
  value,
  customValue,
  agencyUnits = [],
  knownUnits = [],
  onChange,
  optional = true,
  disabled = false,
  error,
  allowClear = true,
}: UnitSelectProps) {
  const [query, setQuery] = useState('');
  const isOther = value === UNIT_OTHER_VALUE;

  const options = useMemo(
    () => mergeUniqueLabels(COMMON_AGENCY_UNITS, agencyUnits, knownUnits),
    [agencyUnits, knownUnits],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return options;
    }
    return options.filter((unit) => unit.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <View style={styles.wrap}>
      <AppText variant="label" color="textMuted">
        Unit / division{optional ? ' (optional)' : ''}
      </AppText>
      <AppText variant="caption" color="textSubtle">
        Units are organizational labels. They do not change permissions.
      </AppText>

      <FormField
        label="Search units"
        value={query}
        onChangeText={setQuery}
        placeholder="Search common or agency units…"
        editable={!disabled}
      />

      <View style={styles.chipRow}>
        {allowClear ? (
          <Pressable
            accessibilityRole="button"
            disabled={disabled}
            onPress={() => onChange({ value: '', customValue: '' })}
            style={[styles.chip, !value && !isOther ? styles.chipSelected : null]}>
            <AppText variant="caption" color={!value && !isOther ? 'text' : 'textMuted'}>
              None
            </AppText>
          </Pressable>
        ) : null}

        {filtered.map((unit) => {
          const selected = !isOther && normalizeOptionKey(value) === normalizeOptionKey(unit);
          return (
            <Pressable
              key={unit}
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => onChange({ value: unit, customValue: '' })}
              style={[styles.chip, selected ? styles.chipSelected : null]}>
              <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
                {unit}
              </AppText>
            </Pressable>
          );
        })}

        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => onChange({ value: UNIT_OTHER_VALUE, customValue })}
          style={[styles.chip, isOther ? styles.chipSelected : null]}>
          <AppText variant="caption" color={isOther ? 'text' : 'textMuted'}>
            Other
          </AppText>
        </Pressable>
      </View>

      {isOther ? (
        <CustomOptionField
          label="Custom unit / division"
          value={customValue}
          onChangeText={(next) => onChange({ value: UNIT_OTHER_VALUE, customValue: next })}
          placeholder="Enter agency-specific unit"
          required
          error={error}
          helperText="Saved as your custom unit name, not “Other”."
        />
      ) : error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

export function resolveUnitSelection(value: string, customValue: string): string | null {
  if (value === UNIT_OTHER_VALUE) {
    const cleaned = normalizeOptionLabel(customValue);
    if (!cleaned || normalizeOptionKey(cleaned) === 'other') {
      return null;
    }
    return cleaned;
  }
  const cleaned = normalizeOptionLabel(value);
  return cleaned || null;
}

export function splitUnitSelection(
  savedUnit: string | null | undefined,
  knownLabels: readonly string[] = [],
): {
  value: string;
  customValue: string;
} {
  const cleaned = normalizeOptionLabel(savedUnit ?? '');
  if (!cleaned) {
    return { value: '', customValue: '' };
  }
  const known = mergeUniqueLabels(COMMON_AGENCY_UNITS, knownLabels);
  const match = known.find((unit) => normalizeOptionKey(unit) === normalizeOptionKey(cleaned));
  if (match) {
    return { value: match, customValue: '' };
  }
  // Treat unknown saved values as a selected custom/other entry.
  return { value: UNIT_OTHER_VALUE, customValue: cleaned };
}

const styles = StyleSheet.create({
  wrap: {
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
