import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppButton, EmptyState } from '@/components/common';
import { PageContainer } from '@/components/layout';
import { ShiftDetailPanel } from '@/components/shifts';
import { PERSONNEL_SHIFTS_HREF } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { spacing } from '@/theme';

export default function PersonnelShiftDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const shiftId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
  const { user } = useAuth();
  const { currentAgency, currentMembership } = useAgency();

  if (!currentAgency || !user?.id || !shiftId) {
    return (
      <PageContainer>
        <EmptyState
          title="Shift unavailable"
          description="Select an agency and open a shift you can view."
        />
        <AppButton
          label="Back to shifts"
          variant="ghost"
          onPress={() => router.replace(PERSONNEL_SHIFTS_HREF)}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer contentStyle={styles.page}>
      <View style={styles.toolbar}>
        <AppButton
          label="Back"
          variant="ghost"
          onPress={() => router.replace(PERSONNEL_SHIFTS_HREF)}
          style={styles.back}
        />
      </View>
      <ShiftDetailPanel
        agencyId={currentAgency.id}
        shiftId={shiftId}
        agencyName={currentAgency.name}
        role={currentMembership?.role}
        currentUserId={user.id}
      />
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  page: {
    gap: spacing.md,
    maxWidth: 800,
  },
  toolbar: {
    gap: spacing.sm,
  },
  back: {
    alignSelf: 'flex-start',
  },
});
