import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, FormField } from '@/components/common';
import { colors, radius, spacing } from '@/theme';
import {
  BRIEFING_PRIORITIES,
  BRIEFING_STATUSES,
  formatBriefingPriority,
  type BriefingFilters,
  type BriefingPriority,
  type BriefingStatus,
} from '@/types/briefings';

function asAllToken(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  return !trimmed || trimmed.toLowerCase() === 'all' ? 'all' : trimmed;
}

type ChipOption<T extends string> = {
  value: T;
  label: string;
};

export type BriefingFiltersBarProps = {
  filters: BriefingFilters;
  shiftOptions: string[];
  categoryOptions: string[];
  onChange: (next: BriefingFilters) => void;
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

function ChipRow<T extends string>({
  label,
  options,
  value,
  onSelect,
}: {
  label: string;
  options: ChipOption<T>[];
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <View style={styles.rowBlock}>
      <AppText variant="label" color="textSubtle">
        {label}
      </AppText>
      <View style={styles.chipRow}>
        {options.map((option) => (
          <FilterChip
            key={option.value}
            label={option.label}
            selected={value === option.value}
            onPress={() => onSelect(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

export function BriefingFiltersBar({
  filters,
  shiftOptions,
  categoryOptions,
  onChange,
}: BriefingFiltersBarProps) {
  const priorityValue = asAllToken(filters.priority) as BriefingPriority | 'all';
  const statusValue = asAllToken(filters.status) as BriefingStatus | 'all';
  const shiftValue = asAllToken(filters.shift);
  const categoryValue = asAllToken(filters.category);
  const ackValue = filters.acknowledgement ?? 'all';

  return (
    <View style={styles.wrap}>
      <FormField
        label="Search"
        value={filters.search ?? ''}
        onChangeText={(search) => onChange({ ...filters, search })}
        placeholder="Search title, body, case, tags…"
        autoCapitalize="sentences"
        autoCorrect
      />

      <ChipRow
        label="Priority"
        value={priorityValue}
        onSelect={(priority) => onChange({ ...filters, priority })}
        options={[
          { value: 'all', label: 'All' },
          ...BRIEFING_PRIORITIES.map((priority) => ({
            value: priority,
            label: formatBriefingPriority(priority),
          })),
        ]}
      />

      <ChipRow
        label="Status"
        value={statusValue}
        onSelect={(status) => onChange({ ...filters, status })}
        options={[
          { value: 'all', label: 'All' },
          ...BRIEFING_STATUSES.map((status) => ({
            value: status,
            label: status.charAt(0).toUpperCase() + status.slice(1),
          })),
        ]}
      />

      {shiftOptions.length > 0 ? (
        <ChipRow
          label="Shift"
          value={shiftValue}
          onSelect={(shift) => onChange({ ...filters, shift })}
          options={[
            { value: 'all', label: 'All' },
            ...shiftOptions.map((shift) => ({ value: shift, label: shift })),
          ]}
        />
      ) : null}

      {categoryOptions.length > 0 ? (
        <ChipRow
          label="Category"
          value={categoryValue}
          onSelect={(category) => onChange({ ...filters, category })}
          options={[
            { value: 'all', label: 'All' },
            ...categoryOptions.map((category) => ({ value: category, label: category })),
          ]}
        />
      ) : null}

      <ChipRow
        label="Pinned"
        value={filters.pinnedOnly ? 'pinned' : 'all'}
        onSelect={(value) => onChange({ ...filters, pinnedOnly: value === 'pinned' })}
        options={[
          { value: 'all', label: 'All' },
          { value: 'pinned', label: 'Pinned only' },
        ]}
      />

      <ChipRow
        label="Acknowledgement"
        value={ackValue}
        onSelect={(acknowledgement) => onChange({ ...filters, acknowledgement })}
        options={[
          { value: 'all', label: 'All' },
          { value: 'unacknowledged', label: 'Unacknowledged' },
          { value: 'acknowledged', label: 'Acknowledged' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.lg,
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
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
});
