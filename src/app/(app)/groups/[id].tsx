import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { GroupDetailPanel } from '@/components/groups';
import { AppButton, EmptyState } from '@/components/common';
import { PageContainer } from '@/components/layout';
import { GROUPS_HREF } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { spacing } from '@/theme';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const groupId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
  const { user } = useAuth();
  const { currentAgency, currentMembership } = useAgency();

  if (!currentAgency || !user?.id || !groupId) {
    return (
      <PageContainer>
        <EmptyState
          title="Group unavailable"
          description="Select an agency and open a group you belong to."
        />
        <AppButton label="Back to groups" variant="ghost" onPress={() => router.back()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer scroll={false} contentStyle={styles.page}>
      <View style={styles.toolbar}>
        <AppButton label="Back" variant="ghost" onPress={() => router.back()} style={styles.back} />
      </View>
      <GroupDetailPanel
        agencyId={currentAgency.id}
        groupId={groupId}
        currentUserId={user.id}
        role={currentMembership?.role}
        onArchived={() => router.replace(GROUPS_HREF)}
      />
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
    gap: spacing.sm,
  },
  toolbar: {
    gap: spacing.sm,
  },
  back: {
    alignSelf: 'flex-start',
  },
});
