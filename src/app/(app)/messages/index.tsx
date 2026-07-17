import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { ConversationListItem, ConversationThread } from '@/components/messages';
import {
  AppButton,
  AppText,
  EmptyState,
  FormField,
  InlineFormMessage,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import { MESSAGES_NEW_HREF, conversationDetailHref } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { useIsWideLayout } from '@/hooks/use-is-wide-layout';
import { MessageServiceError, listConversations } from '@/services/messages';
import { colors, layout, spacing } from '@/theme';
import type { ConversationSummary } from '@/types/messages';

export default function MessagesListScreen() {
  const { user } = useAuth();
  const { currentAgency, isLoading: agencyLoading } = useAgency();
  const isWide = useIsWideLayout();
  const agencyId = currentAgency?.id ?? null;
  const userId = user?.id ?? null;

  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (agencyLoading) {
        return;
      }
      if (!agencyId || !userId) {
        setConversations([]);
        setIsLoading(false);
        setHasLoadedOnce(true);
        return;
      }

      if (mode === 'refresh') {
        setIsRefreshing(true);
      } else if (!hasLoadedOnce) {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const rows = await listConversations({
          agencyId,
          currentUserId: userId,
          search,
          includeArchived: showArchived,
        });
        setConversations(rows);
        setSelectedId((current) => {
          if (current && rows.some((row) => row.conversation.id === current)) {
            return current;
          }
          return rows[0]?.conversation.id ?? null;
        });
      } catch (error) {
        setErrorMessage(
          error instanceof MessageServiceError
            ? error.message
            : 'Unable to load conversations.',
        );
        if (!hasLoadedOnce) {
          setConversations([]);
        }
      } finally {
        setHasLoadedOnce(true);
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [agencyId, agencyLoading, hasLoadedOnce, search, showArchived, userId],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          void load(hasLoadedOnce ? 'refresh' : 'initial');
        }
      });
      return () => {
        cancelled = true;
      };
    }, [hasLoadedOnce, load]),
  );

  const selected = useMemo(
    () => conversations.find((item) => item.conversation.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  if (agencyLoading || (!currentAgency && !hasLoadedOnce && !errorMessage)) {
    return (
      <PageContainer scroll={false} contentStyle={styles.page}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption" color="textMuted">
            Loading agency context…
          </AppText>
        </View>
      </PageContainer>
    );
  }

  if (!currentAgency || !userId) {
    return (
      <PageContainer contentStyle={styles.page}>
        <EmptyState
          title="Select an agency"
          description="Choose an agency membership before viewing messages."
        />
      </PageContainer>
    );
  }

  const listHeader = (
    <View style={styles.listHeader}>
      <View style={styles.headingBlock}>
        <AppText variant="display">Messages</AppText>
        <AppText variant="body" color="textMuted">
          Member-restricted one-to-one.
        </AppText>
      </View>
      <AppButton
        label="New conversation"
        onPress={() => router.push(MESSAGES_NEW_HREF)}
        style={styles.newButton}
      />
      <FormField
        label="Search"
        value={search}
        onChangeText={setSearch}
        placeholder="Search by member name…"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <AppButton
        label={showArchived ? 'Hide archived' : 'Show archived'}
        variant="ghost"
        onPress={() => setShowArchived((value) => !value)}
        style={styles.archiveToggle}
      />
      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}
      {isLoading && !isRefreshing ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption" color="textMuted">
            Loading conversations…
          </AppText>
        </View>
      ) : null}
    </View>
  );

  const listPane = (
    <FlatList
      style={styles.list}
      data={conversations}
      keyExtractor={(item) => item.conversation.id}
      contentContainerStyle={styles.listContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => void load('refresh')}
          tintColor={colors.primary}
        />
      }
      ListHeaderComponent={listHeader}
      ListEmptyComponent={
        isLoading || errorMessage ? null : (
          <EmptyState
            title="No conversations yet"
            description="Start a one-to-one conversation with active agency personnel."
          />
        )
      }
      renderItem={({ item }) => (
        <ConversationListItem
          summary={item}
          selected={isWide && item.conversation.id === selectedId}
          onPress={() => {
            if (isWide) {
              setSelectedId(item.conversation.id);
              return;
            }
            router.push(conversationDetailHref(item.conversation.id));
          }}
        />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
    />
  );

  return (
    <PageContainer scroll={false} contentStyle={styles.page}>
      {isWide ? (
        <View style={styles.split}>
          <View style={styles.leftPane}>{listPane}</View>
          <View style={styles.rightPane}>
            {selected ? (
              <ConversationThread
                agencyId={currentAgency.id}
                conversationId={selected.conversation.id}
                currentUserId={userId}
                includeBottomNavInset={false}
                onMembershipChanged={() => void load('refresh')}
              />
            ) : (
              <EmptyState
                title="Select a conversation"
                description="Choose a message thread from the list."
              />
            )}
          </View>
        </View>
      ) : (
        listPane
      )}
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
    gap: 0,
    maxWidth: 1200,
  },
  split: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    gap: 0,
  },
  leftPane: {
    width: 360,
    maxWidth: '38%',
    minWidth: 300,
    minHeight: 0,
    paddingRight: spacing.lg,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },
  rightPane: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    paddingLeft: spacing.lg,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: layout.bottomNavHeight + spacing['3xl'],
  },
  listHeader: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  headingBlock: {
    gap: spacing.xs,
  },
  newButton: {
    alignSelf: 'flex-start',
  },
  archiveToggle: {
    alignSelf: 'flex-start',
  },
  separator: {
    height: spacing.sm,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
