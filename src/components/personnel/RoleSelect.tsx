import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, FormField } from '@/components/common';
import { CustomOptionField } from '@/components/personnel/CustomOptionField';
import { SPECIALIZED_TITLE_EXAMPLES } from '@/constants/personnelOptions';
import { colors, radius, spacing } from '@/theme';
import type { AgencyRole } from '@/types/agency';
import { formatPersonnelRole } from '@/types/personnel';

export type RoleSelectProps = {
  roles: AgencyRole[];
  value: AgencyRole;
  title: string;
  specialized: boolean;
  onRoleChange: (role: AgencyRole) => void;
  onTitleChange: (title: string) => void;
  onSpecializedChange: (specialized: boolean) => void;
  disabled?: boolean;
  roleError?: string | null;
  titleError?: string | null;
  searchEnabled?: boolean;
};

export function RoleSelect({
  roles,
  value,
  title,
  specialized,
  onRoleChange,
  onTitleChange,
  onSpecializedChange,
  disabled = false,
  roleError,
  titleError,
  searchEnabled = true,
}: RoleSelectProps) {
  const [query, setQuery] = useState('');

  const filteredRoles = roles.filter((role) => {
    if (!query.trim()) {
      return true;
    }
    return formatPersonnelRole(role).toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <View style={styles.wrap}>
      <AppText variant="label" color="textMuted">
        Official permission role
      </AppText>
      <AppText variant="caption" color="textSubtle">
        Permission roles control access. Custom titles do not grant permissions.
      </AppText>

      {searchEnabled && roles.length > 4 ? (
        <FormField
          label="Search roles"
          value={query}
          onChangeText={setQuery}
          placeholder="Search official roles…"
          editable={!disabled}
        />
      ) : null}

      <View style={styles.chipRow}>
        {filteredRoles.map((role) => {
          const selected = !specialized && value === role;
          return (
            <Pressable
              key={role}
              accessibilityRole="button"
              disabled={disabled}
              onPress={() => {
                onSpecializedChange(false);
                onRoleChange(role);
              }}
              style={[styles.chip, selected ? styles.chipSelected : null]}>
              <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
                {formatPersonnelRole(role)}
              </AppText>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={() => onSpecializedChange(true)}
          style={[styles.chip, specialized ? styles.chipSelected : null]}>
          <AppText variant="caption" color={specialized ? 'text' : 'textMuted'}>
            Other / Specialized Assignment
          </AppText>
        </Pressable>
      </View>
      {roleError ? (
        <AppText variant="caption" color="danger">
          {roleError}
        </AppText>
      ) : null}

      {specialized ? (
        <View style={styles.specializedBlock}>
          <AppText variant="label" color="textMuted">
            Closest official permission role
          </AppText>
          <View style={styles.chipRow}>
            {roles.map((role) => {
              const selected = value === role;
              return (
                <Pressable
                  key={`specialized-${role}`}
                  accessibilityRole="button"
                  disabled={disabled}
                  onPress={() => onRoleChange(role)}
                  style={[styles.chip, selected ? styles.chipSelected : null]}>
                  <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
                    {formatPersonnelRole(role)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <CustomOptionField
            label="Custom title / classification"
            value={title}
            onChangeText={onTitleChange}
            placeholder="e.g. Crime Analyst"
            required
            error={titleError}
            helperText={`Examples: ${SPECIALIZED_TITLE_EXAMPLES.slice(0, 4).join(', ')}…`}
          />
        </View>
      ) : (
        <FormField
          label="Title / rank (optional)"
          value={title}
          onChangeText={onTitleChange}
          placeholder="Sergeant, Detective, etc."
          autoCapitalize="words"
          editable={!disabled}
          error={titleError}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  specializedBlock: {
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
