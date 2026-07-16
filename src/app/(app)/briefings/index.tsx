import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { router } from 'expo-router';

import {
  BriefingCard,
  BriefingFiltersBar,
} from '@/components/briefings';
import {
  AppButton,
  AppText,
  EmptyState,
  InlineFormMessage,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import { BRIEFINGS_CREATE_HREF, briefingDetailHref } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import {
  BriefingServiceError,
  listBriefings,
} from '@/services/briefings';
import { colors, spacing } from '@/theme';
import type { BriefingFilters, BriefingWithMeta } from '@/types/briefings';

const DEFAULT_FILTERS: BriefingFilters = {
  search: '',
  priority: 'all',
  status: 'active',
  shift: 'all',
  category: 'all',
  pinnedOnly: false,
  acknowledgement: 'all',
};

function matchesFilters(item: BriefingWithMeta, filters: BriefingFilters): boolean {
  const search = filters.search?.trim().toLowerCase() ?? '';
  if (filters.priority && filters.priority !== 'all' && item.priority !== filters.priority) {
    return false;
  }
  if (filters.shift && filters.shift !== 'all') {
    if ((item.shift_name ?? '').toLowerCase() !== filters.shift.toLowerCase()) {
      return false;
    }
  }
  if (filters.category && filters.category !== 'all') {
    if ((item.category ?? '').toLowerCase() !== filters.category.toLowerCase()) {
      return false;
    }
  }
  if (filters.pinnedOnly && !item.is_pinned) {
    return false;
  }
  if (filters.acknowledgement === 'acknowledged' && !item.acknowledged_by_me) {
    return false;
  }
  if (filters.acknowledgement === 'unacknowledged') {
    if (!item.requires_acknowledgement || item.acknowledged_by_me || item.status !== 'active') {
      return false;
    }
  }
  if (search) {
    const haystack = [
      item.title,
      item.body,
      item.shift_name,
      item.category,
      item.case_number,
      item.location,
      ...item.tags,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(search)) {
      return false;
    }
  }
  return true;
}

export default function BriefingsListScreen() {
  const { user } = useAuth();
  const { currentAgency } = useAgency();
  const agencyId = currentAgency?.id ?? null;
  const userId = user?.id ?? null;

  const [filters, setFilters] = useState<BriefingFilters>(DEFAULT_FILTERS);
  const statusFilter = filters.status ?? 'active';
  const [sourceItems, setSourceItems] = useState<BriefingWithMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (!agencyId || !userId) {
        setSourceItems([]);
        setIsLoading(false);
        return;
      }

      if (mode === 'refresh') {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const rows = await listBriefings({
          agencyId,
          currentUserId: userId,
          filters: { status: statusFilter },
        });
        setSourceItems(rows);
      } catch (error) {
        const message =
          error instanceof BriefingServiceError
            ? error.message
            : 'Unable to load briefings.';
        setErrorMessage(message);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [agencyId, statusFilter, userId],
  );

  useEffect(() => {
    queueMicrotask(() => {
      void load('initial');
    });
  }, [load]);

  const items = useMemo(
    () => sourceItems.filter((item) => matchesFilters(item, filters)),
    [filters, sourceItems],
  );

  const shiftOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of sourceItems) {
      if (item.shift_name?.trim()) {
        values.add(item.shift_name.trim());
      }
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [sourceItems]);

  const categoryOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of sourceItems) {
      if (item.category?.trim()) {
        values.add(item.category.trim());
      }
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [sourceItems]);

  if (!currentAgency) {
    return (
      <PageContainer>
        <EmptyState
          title="Select an agency"
          description="Choose an agency membership before viewing briefings."
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer scroll={false} contentStyle={styles.page}>
      <View style={styles.header}>
        <View style={styles.headingBlock}>
          <AppText variant="display">Briefings</AppText>
          <AppText variant="body" color="textMuted">
            Searchable, acknowledged pass-ons for every watch.
          </AppText>
        </View>
        <AppButton
          label="New briefing"
          onPress={() => router.push(BRIEFINGS_CREATE_HREF)}
          style={styles.newButton}
        />
      </View>

      <BriefingFiltersBar
        filters={filters}
        shiftOptions={shiftOptions}
        categoryOptions={categoryOptions}
        onChange={setFilters}
      />

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption" color="textMuted">
            Loading briefings…
          </AppText>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => void load('refresh')}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <EmptyState
              title="No briefings match"
              description="Create a pass-on or adjust filters to see agency briefings."
            />
          }
          renderItem={({ item }) => (
            <BriefingCard
              briefing={item}
              onPress={() => router.push(briefingDetailHref(item.id))}
            />
          )}
        />
      )}
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.lg,
  },
  headingBlock: {
    gap: spacing.sm,
  },
  newButton: {
    alignSelf: 'flex-start',
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing['4xl'],
    flexGrow: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing['4xl'],
  },
});
