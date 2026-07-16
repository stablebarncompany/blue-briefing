import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import {
  AppButton,
  AppText,
  EmptyState,
  FormField,
  InlineFormMessage,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import { conversationDetailHref } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { listActiveAgencyPersonnel, type AgencyPersonnel } from '@/services/agency';
import { MessageServiceError, startConversation } from '@/services/messages';
import { colors, radius, spacing } from '@/theme';
import { formatMessageAuthorName } from '@/types/messages';

export default function NewConversationScreen() {
  const { user } = useAuth();
  const { currentAgency } = useAgency();
  const agencyId = currentAgency?.id ?? null;
  const userId = user?.id ?? null;

  const [personnel, setPersonnel] = useState<AgencyPersonnel[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadPeople = useCallback(async () => {
    if (!agencyId || !userId) {
      setPersonnel([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const rows = await listActiveAgencyPersonnel(agencyId);
      setPersonnel(rows.filter((row) => row.user_id !== userId));
    } catch {
      setErrorMessage('Unable to load agency personnel.');
      setPersonnel([]);
    } finally {
      setIsLoading(false);
    }
  }, [agencyId, userId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadPeople();
    });
  }, [loadPeople]);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return personnel;
    }
    return personnel.filter((person) => {
      const haystack = [
        person.profile?.display_name,
        person.profile?.first_name,
        person.profile?.last_name,
        person.profile?.email,
        person.unit,
        person.title,
        person.role,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [personnel, search]);

  async function onStart() {
    if (submitting || !agencyId || !selectedUserId) {
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const conversationId = await startConversation({
        agencyId,
        otherUserId: selectedUserId,
      });
      router.replace(conversationDetailHref(conversationId));
    } catch (error) {
      setErrorMessage(
        error instanceof MessageServiceError
          ? error.message
          : 'Unable to start conversation.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!currentAgency || !userId) {
    return (
      <PageContainer>
        <EmptyState
          title="Agency required"
          description="Select an agency before starting a conversation."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer scroll={false} contentStyle={styles.page}>
      <View style={styles.header}>
        <AppButton label="Back" variant="ghost" onPress={() => router.back()} style={styles.back} />
        <AppText variant="display">New conversation</AppText>
        <AppText variant="body" color="textMuted">
          Message one active member of your selected agency.
        </AppText>
        <FormField
          label="Search personnel"
          value={search}
          onChangeText={setSearch}
          placeholder="Name, unit, or role…"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption" color="textMuted">
            Loading personnel…
          </AppText>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={filtered}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              title="No matching personnel"
              description="Only active members of this agency can be messaged."
            />
          }
          renderItem={({ item }) => {
            const selected = selectedUserId === item.user_id;
            const label = formatMessageAuthorName({
              id: item.user_id,
              display_name: item.profile?.display_name ?? null,
              first_name: item.profile?.first_name ?? null,
              last_name: item.profile?.last_name ?? null,
            });
            const meta = [item.role, item.unit, item.title].filter(Boolean).join(' · ');
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Select ${label}`}
                onPress={() => setSelectedUserId(item.user_id)}
                style={[styles.person, selected ? styles.personSelected : null]}>
                <AppText variant="body">{label}</AppText>
                {meta ? (
                  <AppText variant="caption" color="textSubtle">
                    {meta}
                  </AppText>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}

      <AppButton
        label="Start conversation"
        onPress={() => void onStart()}
        loading={submitting}
        disabled={!selectedUserId || submitting}
        style={styles.startButton}
      />
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.md,
  },
  back: {
    alignSelf: 'flex-start',
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing['3xl'],
  },
  person: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  personSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  startButton: {
    alignSelf: 'stretch',
    marginBottom: spacing['2xl'],
  },
});
