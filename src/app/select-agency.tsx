import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  AuthScreenLayout,
  InlineFormMessage,
} from '@/components/common';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { colors, radius, spacing } from '@/theme';
import { formatAgencyRole } from '@/types/agency';

export default function SelectAgencyScreen() {
  const { signOut } = useAuth();
  const { activeMemberships, selectAgency, error } = useAgency();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function onContinue() {
    if (!selectedId || submitting) {
      return;
    }
    setSubmitting(true);
    setLocalError(null);
    try {
      await selectAgency(selectedId);
    } catch {
      setLocalError('Unable to select that agency. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function onSignOut() {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <AuthScreenLayout
      title="Select agency"
      subtitle="Choose which agency workspace to open for this session.">
      {error ? <InlineFormMessage message={error} /> : null}
      {localError ? <InlineFormMessage message={localError} /> : null}

      <View style={styles.list}>
        {activeMemberships.map((membership) => {
          const isSelected = selectedId === membership.agency_id;
          return (
            <Pressable
              key={membership.id}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              onPress={() => setSelectedId(membership.agency_id)}
              style={[styles.card, isSelected && styles.cardSelected]}>
              <AppText variant="title">{membership.agency?.name ?? 'Agency'}</AppText>
              <AppText variant="caption" color="textMuted">
                {formatAgencyRole(membership.role)}
                {membership.unit ? ` · ${membership.unit}` : ''}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        <AppButton
          label="Continue"
          onPress={onContinue}
          loading={submitting}
          disabled={!selectedId || submitting || signingOut}
        />
        <AppButton
          label="Sign out"
          variant="ghost"
          onPress={onSignOut}
          loading={signingOut}
          disabled={signingOut || submitting}
        />
      </View>
    </AuthScreenLayout>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  actions: {
    gap: spacing.md,
  },
});
