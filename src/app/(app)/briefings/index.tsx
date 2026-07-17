import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

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
import { listAgencyShifts } from '@/services/shifts';
import { colors, layout, spacing } from '@/theme';
import {
  DEFAULT_BRIEFING_FILTERS,
  hasActiveBriefingFilters,
  type BriefingFilters,
  type BriefingWithMeta,
} from '@/types/briefings';
import {
  buildShiftFilterOptions,
  resolveShiftFilterKey,
  type AgencyShift,
} from '@/types/shifts';

export default function BriefingsListScreen() {
  const { user } = useAuth();
  const { currentAgency, isLoading: agencyLoading } = useAgency();
  const params = useLocalSearchParams<{ shift?: string | string[] }>();
  const agencyId = currentAgency?.id ?? null;
  const userId = user?.id ?? null;
  const shiftParam =
    typeof params.shift === 'string' ? params.shift : params.shift?.[0] ?? '';

  const [filters, setFilters] = useState<BriefingFilters>(() =>
    shiftParam
      ? { ...DEFAULT_BRIEFING_FILTERS, shift: shiftParam }
      : DEFAULT_BRIEFING_FILTERS,
  );
  const [items, setItems] = useState<BriefingWithMeta[]>([]);
  const [optionSource, setOptionSource] = useState<BriefingWithMeta[]>([]);
  const [agencyShifts, setAgencyShifts] = useState<AgencyShift[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  const filtersActive = hasActiveBriefingFilters(filters);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (agencyLoading) {
        return;
      }

      if (!agencyId || !userId) {
        setItems([]);
        setOptionSource([]);
        setIsLoading(false);
        setHasLoadedOnce(true);
        hasLoadedOnceRef.current = true;
        if (__DEV__) {
          console.log('[briefings] skip list load — agency or user unavailable', {
            agencyIdPresent: !!agencyId,
            userIdPresent: !!userId,
          });
        }
        return;
      }

      if (mode === 'refresh') {
        setIsRefreshing(true);
      } else if (!hasLoadedOnceRef.current) {
        setIsLoading(true);
      }
      setErrorMessage(null);

      if (__DEV__) {
        console.log('[briefings] loading list', {
          agencyIdPresent: true,
          filters: {
            search: filters.search?.trim() ? '[set]' : '',
            priority: filters.priority ?? 'all',
            status: filters.status ?? 'all',
            shift: filters.shift ?? 'all',
            category: filters.category ?? 'all',
            pinnedOnly: !!filters.pinnedOnly,
            acknowledgement: filters.acknowledgement ?? 'all',
          },
        });
      }

      try {
        const filteredRows = await listBriefings({
          agencyId,
          currentUserId: userId,
          filters,
        });
        setItems(filteredRows);

        if (hasActiveBriefingFilters(filters)) {
          const allRows = await listBriefings({
            agencyId,
            currentUserId: userId,
            filters: DEFAULT_BRIEFING_FILTERS,
          });
          setOptionSource(allRows);
        } else {
          setOptionSource(filteredRows);
        }
      } catch (error) {
        const message =
          error instanceof BriefingServiceError
            ? error.message
            : 'Unable to load briefings.';
        if (__DEV__) {
          console.warn('[briefings] list load failed', { message });
        }
        setErrorMessage(message);
        if (!hasLoadedOnceRef.current) {
          setItems([]);
        }
      } finally {
        hasLoadedOnceRef.current = true;
        setHasLoadedOnce(true);
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [agencyId, agencyLoading, filters, userId],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          void load(hasLoadedOnceRef.current ? 'refresh' : 'initial');
          if (agencyId) {
            void listAgencyShifts({ agencyId, includeInactive: false })
              .then((rows) => {
                if (!cancelled) {
                  setAgencyShifts(rows);
                }
              })
              .catch(() => {
                if (!cancelled) {
                  setAgencyShifts([]);
                }
              });
          } else {
            setAgencyShifts([]);
          }
        }
      });
      return () => {
        cancelled = true;
      };
    }, [agencyId, load]),
  );

  const shiftFilterOptions = useMemo(
    () =>
      buildShiftFilterOptions({
        agencyShifts,
        historicalNames: optionSource.map((item) => item.shift_name),
      }),
    [agencyShifts, optionSource],
  );

  const shiftOptions = useMemo(
    () => shiftFilterOptions.map((option) => option.label),
    [shiftFilterOptions],
  );

  // Keep URL/query/filter selection matched to a canonical label when possible.
  const normalizedShiftFilter = useMemo(() => {
    const key = resolveShiftFilterKey(filters.shift, shiftFilterOptions);
    if (key === 'all') {
      return 'all';
    }
    return shiftFilterOptions.find((option) => option.key === key)?.label ?? filters.shift ?? 'all';
  }, [filters.shift, shiftFilterOptions]);

  const categoryOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of optionSource) {
      if (item.category?.trim()) {
        values.add(item.category.trim());
      }
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }, [optionSource]);

  const showAgencyLoading = agencyLoading || (!currentAgency && !hasLoadedOnce && !errorMessage);

  if (showAgencyLoading) {
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

  if (!currentAgency) {
    return (
      <PageContainer scroll={false} contentStyle={styles.page}>
        <EmptyState
          title="Select an agency"
          description="Choose an agency membership before viewing briefings."
        />
      </PageContainer>
    );
  }

  const listHeader = (
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

      <BriefingFiltersBar
        filters={{ ...filters, shift: normalizedShiftFilter }}
        shiftOptions={shiftOptions}
        categoryOptions={categoryOptions}
        onChange={(next) => {
          const key = resolveShiftFilterKey(next.shift, shiftFilterOptions);
          const label =
            key === 'all'
              ? 'all'
              : (shiftFilterOptions.find((option) => option.key === key)?.label ?? next.shift);
          setFilters({ ...next, shift: label });
        }}
      />

      {filtersActive ? (
        <AppButton
          label="Clear filters"
          variant="ghost"
          onPress={() => setFilters(DEFAULT_BRIEFING_FILTERS)}
          style={styles.clearButton}
        />
      ) : null}

      {__DEV__ && hasLoadedOnce && !errorMessage ? (
        <AppText variant="caption" color="textSubtle">
          {items.length} briefing{items.length === 1 ? '' : 's'}
        </AppText>
      ) : null}

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}

      {isLoading && !isRefreshing ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption" color="textMuted">
            Loading briefings…
          </AppText>
        </View>
      ) : null}
    </View>
  );

  return (
    <PageContainer scroll={false} contentStyle={styles.page}>
      <FlatList
        style={styles.list}
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
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          isLoading || errorMessage ? null : (
            <EmptyState
              title="No briefings yet"
              description="Create a pass-on or adjust filters to see agency briefings."
            />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <BriefingCard
              briefing={item}
              onPress={() => router.push(briefingDetailHref(item.id))}
            />
          </View>
        )}
      />
    </PageContainer>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
    gap: 0,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: layout.bottomNavHeight + spacing['3xl'],
  },
  header: {
    gap: spacing.lg,
    paddingBottom: spacing.lg,
  },
  headingBlock: {
    gap: spacing.sm,
  },
  newButton: {
    alignSelf: 'flex-start',
  },
  clearButton: {
    alignSelf: 'flex-start',
  },
  cardWrap: {
    marginBottom: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing['4xl'],
  },
  inlineLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
});
