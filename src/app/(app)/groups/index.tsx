import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { GroupDetailPanel, GroupListItem } from '@/components/groups';
import {
  AppButton,
  AppText,
  EmptyState,
  FormField,
  InlineFormMessage,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import { GROUPS_CREATE_HREF, groupDetailHref } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { useIsWideLayout } from '@/hooks/use-is-wide-layout';
import { GroupServiceError, listMyGroups } from '@/services/groups';
import { colors, layout, spacing } from '@/theme';
import { canCreateGroups, type GroupWithMeta } from '@/types/groups';

export default function GroupsListScreen() {
  const { user } = useAuth();
  const { currentAgency, currentMembership, isLoading: agencyLoading } = useAgency();
  const isWide = useIsWideLayout();
  const agencyId = currentAgency?.id ?? null;
  const userId = user?.id ?? null;
  const role = currentMembership?.role;

  const [search, setSearch] = useState('');
  const [groups, setGroups] = useState<GroupWithMeta[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const canCreate = canCreateGroups(role);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (agencyLoading) {
        return;
      }
      if (!agencyId || !userId) {
        setGroups([]);
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
        const rows = await listMyGroups({
          agencyId,
          currentUserId: userId,
          search,
        });
        setGroups(rows);
        setSelectedGroupId((current) => {
          if (current && rows.some((row) => row.id === current)) {
            return current;
          }
          return rows[0]?.id ?? null;
        });
      } catch (error) {
        setErrorMessage(
          error instanceof GroupServiceError ? error.message : 'Unable to load groups.',
        );
        if (!hasLoadedOnce) {
          setGroups([]);
        }
      } finally {
        setHasLoadedOnce(true);
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [agencyId, agencyLoading, hasLoadedOnce, search, userId],
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

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
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
          description="Choose an agency membership before viewing groups."
        />
      </PageContainer>
    );
  }

  const listControls = (
    <View style={styles.listHeader}>
      <View style={styles.headingBlock}>
        <AppText variant="display">Groups</AppText>
        <AppText variant="body" color="textMuted">
          Invite-only agency channels.
        </AppText>
      </View>
      {canCreate ? (
        <AppButton
          label="Create Group"
          onPress={() => router.push(GROUPS_CREATE_HREF)}
          style={styles.createButton}
        />
      ) : null}
      <FormField
        label="Search groups"
        value={search}
        onChangeText={setSearch}
        placeholder="Search by name or description…"
        autoCapitalize="none"
        autoCorrect={false}
      />
      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}
      {isLoading && !isRefreshing ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption" color="textMuted">
            Loading groups…
          </AppText>
        </View>
      ) : null}
    </View>
  );

  const groupItems = (
    <View style={styles.groupList}>
      {groups.length === 0 && !isLoading && !errorMessage ? (
        <EmptyState
          title="No groups yet"
          description={
            canCreate
              ? 'Create an invite-only channel for your agency watch.'
              : 'Ask a supervisor or administrator to add you to a group.'
          }
        />
      ) : (
        groups.map((item) => (
          <GroupListItem
            key={item.id}
            group={item}
            selected={isWide && item.id === selectedGroupId}
            onPress={() => {
              if (isWide) {
                setSelectedGroupId(item.id);
                return;
              }
              router.push(groupDetailHref(item.id));
            }}
          />
        ))
      )}
    </View>
  );

  if (isWide) {
    return (
      <PageContainer contentStyle={styles.widePage}>
        <View style={styles.split}>
          <View style={styles.leftPane}>
            {listControls}
            {groupItems}
          </View>
          <View style={styles.rightPane}>
            {selectedGroup ? (
              <GroupDetailPanel
                agencyId={currentAgency.id}
                groupId={selectedGroup.id}
                currentUserId={userId}
                role={role}
                embedInPageScroll
                onArchived={() => void load('refresh')}
              />
            ) : (
              <EmptyState
                title="Select a group"
                description="Choose a channel from the list to view the feed."
              />
            )}
          </View>
        </View>
      </PageContainer>
    );
  }

  return (
    <PageContainer scroll={false} contentStyle={styles.page}>
      <ScrollView
        style={styles.mobileScroll}
        contentContainerStyle={styles.mobileScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => void load('refresh')}
            tintColor={colors.primary}
          />
        }>
        {listControls}
        {groupItems}
      </ScrollView>
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
    gap: 0,
    maxWidth: undefined,
  },
  widePage: {
    maxWidth: 1200,
    gap: 0,
    paddingBottom: spacing['4xl'],
  },
  split: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing['2xl'],
  },
  leftPane: {
    width: 360,
    maxWidth: '34%',
    minWidth: 300,
    gap: spacing.lg,
  },
  rightPane: {
    flex: 1,
    minWidth: 0,
    gap: spacing.lg,
    paddingLeft: spacing.lg,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  listHeader: {
    gap: spacing.md,
  },
  headingBlock: {
    gap: spacing.xs,
  },
  createButton: {
    alignSelf: 'flex-start',
  },
  groupList: {
    gap: spacing.sm,
  },
  mobileScroll: {
    flex: 1,
    minHeight: 0,
  },
  mobileScrollContent: {
    gap: spacing.lg,
    paddingBottom: layout.bottomNavHeight + spacing['3xl'],
    ...(Platform.OS === 'web' ? ({ flexGrow: 1 } as const) : null),
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
