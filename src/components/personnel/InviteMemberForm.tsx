import { StyleSheet, View } from 'react-native';

import { FormField } from '@/components/common';
import { RoleSelect } from '@/components/personnel/RoleSelect';
import { UnitSelect, resolveUnitSelection } from '@/components/personnel/UnitSelect';
import { UNIT_OTHER_VALUE, normalizeOptionLabel } from '@/constants/personnelOptions';
import { spacing } from '@/theme';
import type { AgencyRole } from '@/types/agency';
import type { CreateAgencyInviteInput } from '@/types/personnel';
import { DEFAULT_INVITE_EXPIRES_DAYS, inviteableRolesFor } from '@/types/personnel';

export type InviteMemberFormValues = {
  email: string;
  role: AgencyRole;
  specialized: boolean;
  unitValue: string;
  unitCustom: string;
  title: string;
  badge_number: string;
  expires_in_days: string;
};

export const EMPTY_INVITE_FORM = (
  actorRole: AgencyRole | null | undefined,
): InviteMemberFormValues => {
  const roles = inviteableRolesFor(actorRole);
  return {
    email: '',
    role: roles.includes('officer') ? 'officer' : (roles[0] ?? 'officer'),
    specialized: false,
    unitValue: '',
    unitCustom: '',
    title: '',
    badge_number: '',
    expires_in_days: String(DEFAULT_INVITE_EXPIRES_DAYS),
  };
};

export function validateInviteMemberFormValues(
  values: InviteMemberFormValues,
): Partial<Record<keyof InviteMemberFormValues, string>> {
  const errors: Partial<Record<keyof InviteMemberFormValues, string>> = {};
  if (values.specialized && !normalizeOptionLabel(values.title)) {
    errors.title = 'Enter a custom title or classification for specialized assignments.';
  }
  if (
    values.unitValue === UNIT_OTHER_VALUE &&
    !resolveUnitSelection(values.unitValue, values.unitCustom)
  ) {
    errors.unitCustom = 'Enter a custom unit name.';
  }
  return errors;
}

export function inviteFormToInput(values: InviteMemberFormValues): CreateAgencyInviteInput {
  const days = Number.parseInt(values.expires_in_days, 10);
  return {
    email: values.email,
    role: values.role,
    unit: resolveUnitSelection(values.unitValue, values.unitCustom),
    title: normalizeOptionLabel(values.title) || null,
    badge_number: values.badge_number.trim() || null,
    expires_in_days: Number.isFinite(days) ? days : DEFAULT_INVITE_EXPIRES_DAYS,
  };
}

export type InviteMemberFormProps = {
  values: InviteMemberFormValues;
  actorRole: AgencyRole | null | undefined;
  agencyUnits?: string[];
  knownUnits?: string[];
  fieldErrors?: Partial<Record<keyof InviteMemberFormValues, string>>;
  onChange: (next: InviteMemberFormValues) => void;
};

export function InviteMemberForm({
  values,
  actorRole,
  agencyUnits = [],
  knownUnits = [],
  fieldErrors,
  onChange,
}: InviteMemberFormProps) {
  const roles = inviteableRolesFor(actorRole);

  return (
    <View style={styles.wrap}>
      <FormField
        label="Email"
        value={values.email}
        onChangeText={(email) => onChange({ ...values, email })}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        placeholder="name@agency.gov"
        error={fieldErrors?.email}
      />

      <RoleSelect
        roles={roles}
        value={values.role}
        title={values.title}
        specialized={values.specialized}
        onRoleChange={(role) => onChange({ ...values, role })}
        onTitleChange={(title) => onChange({ ...values, title })}
        onSpecializedChange={(specialized) => onChange({ ...values, specialized })}
        roleError={fieldErrors?.role}
        titleError={fieldErrors?.title}
      />

      <UnitSelect
        value={values.unitValue}
        customValue={values.unitCustom}
        agencyUnits={agencyUnits}
        knownUnits={knownUnits}
        onChange={({ value, customValue }) =>
          onChange({ ...values, unitValue: value, unitCustom: customValue })
        }
        error={fieldErrors?.unitCustom ?? fieldErrors?.unitValue}
      />

      <FormField
        label="Badge number (optional)"
        value={values.badge_number}
        onChangeText={(badge_number) => onChange({ ...values, badge_number })}
        placeholder="1234"
        error={fieldErrors?.badge_number}
      />

      <FormField
        label="Expires in (days)"
        value={values.expires_in_days}
        onChangeText={(expires_in_days) => onChange({ ...values, expires_in_days })}
        keyboardType="number-pad"
        error={fieldErrors?.expires_in_days}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
});
