import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, FormField } from '@/components/common';
import { colors, radius, spacing } from '@/theme';
import { SUGGESTED_SHIFT_NAMES, type AgencyShift } from '@/types/shifts';

export type ShiftSelectProps = {
  label?: string;
  agencyShifts: AgencyShift[];
  value: string;
  customValue?: string;
  onChange: (next: { mode: 'none' | 'shift' | 'custom'; shiftId?: string; name: string }) => void;
  allowNone?: boolean;
  allowCustom?: boolean;
  disabled?: boolean;
  error?: string | null;
  /** When true, show suggested names for creating a new catalog shift. */
  createMode?: boolean;
};

export function ShiftSelect({
  label = 'Shift',
  agencyShifts,
  value,
  customValue = '',
  onChange,
  allowNone = true,
  allowCustom = true,
  disabled,
  error,
  createMode = false,
}: ShiftSelectProps) {
  const [showCustom, setShowCustom] = useState(
    allowCustom && !!customValue && !agencyShifts.some((shift) => shift.name === value),
  );

  const options = useMemo(() => {
    if (createMode) {
      return SUGGESTED_SHIFT_NAMES.map((name) => ({ key: name, label: name }));
    }
    return agencyShifts
      .filter((shift) => shift.is_active)
      .map((shift) => ({ key: shift.id, label: shift.name }));
  }, [agencyShifts, createMode]);

  return (
    <View style={styles.wrap}>
      <AppText variant="label" color="textSubtle">
        {label}
      </AppText>
      <View style={styles.chipRow}>
        {allowNone ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !value && !showCustom }}
            disabled={disabled}
            onPress={() => {
              setShowCustom(false);
              onChange({ mode: 'none', name: '' });
            }}
            style={[styles.chip, !value && !showCustom ? styles.chipSelected : null]}>
            <AppText variant="caption" color={!value && !showCustom ? 'text' : 'textMuted'}>
              None
            </AppText>
          </Pressable>
        ) : null}
        {options.map((option) => {
          const selected = !showCustom && value === option.key;
          return (
            <Pressable
              key={option.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={disabled}
              onPress={() => {
                if (createMode && option.key === 'Other') {
                  setShowCustom(true);
                  onChange({ mode: 'custom', name: customValue });
                  return;
                }
                setShowCustom(false);
                if (createMode) {
                  onChange({ mode: 'custom', name: option.label });
                  return;
                }
                onChange({ mode: 'shift', shiftId: option.key, name: option.label });
              }}
              style={[styles.chip, selected ? styles.chipSelected : null]}>
              <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
        {allowCustom && !createMode ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: showCustom }}
            disabled={disabled}
            onPress={() => {
              setShowCustom(true);
              onChange({ mode: 'custom', name: customValue || value });
            }}
            style={[styles.chip, showCustom ? styles.chipSelected : null]}>
            <AppText variant="caption" color={showCustom ? 'text' : 'textMuted'}>
              Other / Custom
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {showCustom || (createMode && value.toLowerCase() === 'other') ? (
        <FormField
          label="Custom shift name"
          value={customValue || (createMode && value !== 'Other' ? value : '')}
          onChangeText={(name) => onChange({ mode: 'custom', name })}
          placeholder="Enter shift name"
          editable={!disabled}
          error={error ?? undefined}
        />
      ) : error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
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
