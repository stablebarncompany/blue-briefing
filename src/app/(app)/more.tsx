import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  EmptyState,
  InlineFormMessage,
  SectionLabel,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { spacing } from '@/theme';
import { formatAgencyRole } from '@/types/agency';

export default function MoreScreen() {
  const { signOut } = useAuth();
  const { profile, currentMembership, currentAgency, activeMemberships, selectAgency } =
    useAgency();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [switching, setSwitching] = useState(false);

  const displayName =
    profile?.display_name ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
    profile?.email ||
    'Profile';

  async function onSignOut() {
    if (signingOut) {
      return;
    }
    setSigningOut(true);
    setErrorMessage(null);
    try {
      const result = await signOut();
      if (result.errorMessage) {
        setErrorMessage(result.errorMessage);
      }
    } finally {
      setSigningOut(false);
    }
  }

  async function onSwitchAgency(agencyId: string) {
    if (switching || agencyId === currentMembership?.agency_id) {
      return;
    }
    setSwitching(true);
    setErrorMessage(null);
    try {
      await selectAgency(agencyId);
    } catch {
      setErrorMessage('Unable to switch agencies right now.');
    } finally {
      setSwitching(false);
    }
  }

  return (
    <PageContainer>
      <SectionLabel>More</SectionLabel>
      <EmptyState title="Account & resources." />

      <View style={styles.panel}>
        <AppText variant="title">{displayName}</AppText>
        {profile?.email ? (
          <AppText variant="caption" color="textMuted">
            {profile.email}
          </AppText>
        ) : null}

        {currentAgency ? (
          <AppText variant="body" color="textMuted">
            Agency: {currentAgency.name}
          </AppText>
        ) : null}

        {currentMembership ? (
          <>
            <AppText variant="body" color="textMuted">
              Role: {formatAgencyRole(currentMembership.role)}
            </AppText>
            {currentMembership.title ? (
              <AppText variant="body" color="textMuted">
                Title: {currentMembership.title}
              </AppText>
            ) : null}
            {currentMembership.unit ? (
              <AppText variant="body" color="textMuted">
                Unit: {currentMembership.unit}
              </AppText>
            ) : null}
            {currentMembership.badge_number ? (
              <AppText variant="body" color="textMuted">
                Badge: {currentMembership.badge_number}
              </AppText>
            ) : null}
          </>
        ) : null}

        {activeMemberships.length > 1 ? (
          <View style={styles.switchList}>
            <AppText variant="label" color="textSubtle">
              Switch agency
            </AppText>
            {activeMemberships.map((membership) => (
              <AppButton
                key={membership.id}
                label={membership.agency?.name ?? 'Agency'}
                variant={
                  membership.agency_id === currentMembership?.agency_id ? 'secondary' : 'ghost'
                }
                disabled={switching || membership.agency_id === currentMembership?.agency_id}
                onPress={() => onSwitchAgency(membership.agency_id)}
              />
            ))}
          </View>
        ) : null}

        {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}

        <AppButton
          label="Sign out"
          variant="ghost"
          onPress={onSignOut}
          loading={signingOut}
          disabled={signingOut || switching}
        />
      </View>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: spacing.md,
  },
  switchList: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
