import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { ConversationThread } from '@/components/messages';
import { AppButton, EmptyState } from '@/components/common';
import { PageContainer } from '@/components/layout';
import { MESSAGES_HREF } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { spacing } from '@/theme';

export default function ConversationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
  const { user } = useAuth();
  const { currentAgency } = useAgency();

  if (!currentAgency || !user?.id || !conversationId) {
    return (
      <PageContainer>
        <EmptyState
          title="Conversation unavailable"
          description="Select an agency and open a conversation you belong to."
        />
        <AppButton label="Back to messages" variant="ghost" onPress={() => router.back()} />
      </PageContainer>
    );
  }

  return (
    <PageContainer scroll={false} contentStyle={styles.page}>
      <View style={styles.toolbar}>
        <AppButton
          label="Back"
          variant="ghost"
          onPress={() => router.replace(MESSAGES_HREF)}
          style={styles.back}
        />
      </View>
      <ConversationThread
        agencyId={currentAgency.id}
        conversationId={conversationId}
        currentUserId={user.id}
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
