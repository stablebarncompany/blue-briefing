import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import {
  BriefingCard,
  BriefingFiltersBar,
  BriefingQuickViewsBar,
} from '@/components/briefings';
import {
  AppButton,
  AppText,
  EmptyState,
  InlineFormMessage,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import {
  BRIEFINGS_CATEGORIES_HREF,
  BRIEFINGS_CREATE_HREF,
  BRIEFINGS_TEMPLATES_HREF,
  briefingDetailHref,
} from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { listBriefingCategories } from '@/services/briefing-categories';
import {
  BriefingServiceError,
  acknowledgeBriefing,
  listBriefings,
} from '@/services/briefings';
import { listAgencyShifts, listShiftAssignments } from '@/services/shifts';
import { colors, layout, radius, spacing } from '@/theme';
import {
  buildCategoryFilterOptions,
  canManageBriefingCatalog,
  categoriesMatch,
  resolveCategoryFilterKey,
  type BriefingCategory,
} from '@/types/briefingCategories';
import {
  DEFAULT_BRIEFING_FILTERS,
  hasActiveBriefingFilters,
  type BriefingFilters,
  type BriefingWithMeta,
} from '@/types/briefings';
import {
  filtersForQuickView,
  isBriefingQuickView,
  selectCriticalAndPinned,
  selectStartOfShiftBriefings,
  supportsBulkAcknowledge,
  visibleRequiredAcknowledgements,
  type BriefingQuickView,
} from '@/types/briefingQuickViews';
import {
  buildShiftFilterOptions,
  resolveShiftFilterKey,
  shiftsMatch,
  type AgencyShift,
} from '@/types/shifts';

function confirmAction(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(message)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Continue', onPress: onConfirm },
  ]);
}

export default function BriefingsListScreen() {
  const { user } = useAuth();
  const { currentAgency, currentMembership, isLoading: agencyLoading } = useAgency();
  const params = useLocalSearchParams<{
    shift?: string | string[];
    view?: string | string[];
  }>();
  const agencyId = currentAgency?.id ?? null;
  const userId = user?.id ?? null;
  const canManageCatalog = canManageBriefingCatalog(currentMembership?.role);

  const shiftParam =
    typeof params.shift === 'string' ? params.shift : params.shift?.[0] ?? '';
  const viewParam = typeof params.view === 'string' ? params.view : params.view?.[0] ?? '';

  const initialQuickView: BriefingQuickView = isBriefingQuickView(viewParam)
    ? viewParam
    : shiftParam
      ? 'my_shift'
      : 'all';

  const [quickView, setQuickView] = useState<BriefingQuickView>(initialQuickView);
  const [filters, setFilters] = useState<BriefingFilters>(() =>
    filtersForQuickView(initialQuickView, {
      myShiftName: shiftParam || null,
      preserved: {},
    }),
  );
  const [primaryShiftName, setPrimaryShiftName] = useState<string | null>(null);
  const [temporaryShiftName, setTemporaryShiftName] = useState<string | null>(
    shiftParam || null,
  );
  const [items, setItems] = useState<BriefingWithMeta[]>([]);
  const [optionSource, setOptionSource] = useState<BriefingWithMeta[]>([]);
  const [agencyShifts, setAgencyShifts] = useState<AgencyShift[]>([]);
  const [agencyCategories, setAgencyCategories] = useState<BriefingCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [ackMessage, setAckMessage] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const hasLoadedOnceRef = useRef(false);

  const effectiveShiftName = primaryShiftName ?? temporaryShiftName;
  const needsTemporaryShift =
    (quickView === 'my_shift' || quickView === 'start_of_shift') && !primaryShiftName;
  const filtersActive = hasActiveBriefingFilters(filters);
  const quickViewActive = quickView !== 'all';

  const listFilters = useMemo((): BriefingFilters => {
    if (quickView === 'all') {
      return filters;
    }
    const base = filtersForQuickView(quickView, {
      myShiftName: effectiveShiftName,
      preserved: {
        search: filters.search,
        category: filters.category,
      },
    });
    // Keep user-adjusted detailed filters that do not fight the quick view.
    if (quickView === 'my_shift') {
      return {
        ...base,
        shift: effectiveShiftName ?? 'all',
        priority: filters.priority,
        category: filters.category,
        search: filters.search,
      };
    }
    if (quickView === 'required_review') {
      return {
        ...base,
        priority: filters.priority,
        shift: filters.shift,
        category: filters.category,
        search: filters.search,
      };
    }
    return {
      ...base,
      priority: filters.priority,
      shift: filters.shift,
      category: filters.category,
      search: filters.search,
      pinnedOnly: filters.pinnedOnly,
      acknowledgement: filters.acknowledgement,
    };
  }, [effectiveShiftName, filters, quickView]);

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
        return;
      }

      if (mode === 'refresh') {
        setIsRefreshing(true);
      } else if (!hasLoadedOnceRef.current) {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        if (
          (quickView === 'my_shift' || quickView === 'start_of_shift') &&
          !effectiveShiftName &&
          quickView === 'my_shift'
        ) {
          // My Shift with no selection: load options but keep the list empty.
          const allRows = await listBriefings({
            agencyId,
            currentUserId: userId,
            filters: DEFAULT_BRIEFING_FILTERS,
          });
          setOptionSource(allRows);
          setItems([]);
          return;
        }

        const queryFilters: BriefingFilters =
          quickView === 'critical_pinned' || quickView === 'start_of_shift'
            ? {
                ...listFilters,
                // Fetch active set; OR-selection happens client-side.
                priority: 'all',
                shift: 'all',
                pinnedOnly: false,
                acknowledgement: 'all',
              }
            : listFilters;

        const filteredRows = await listBriefings({
          agencyId,
          currentUserId: userId,
          filters: queryFilters,
        });

        let nextItems = filteredRows;
        if (quickView === 'critical_pinned') {
          nextItems = selectCriticalAndPinned(filteredRows);
        } else if (quickView === 'start_of_shift') {
          nextItems = selectStartOfShiftBriefings(filteredRows, effectiveShiftName);
        }

        // Re-apply search/category/priority when the quick view used a broader fetch.
        if (quickView === 'critical_pinned' || quickView === 'start_of_shift') {
          const search = listFilters.search?.trim().toLowerCase() ?? '';
          const category = listFilters.category ?? 'all';
          const priority = listFilters.priority ?? 'all';
          nextItems = nextItems.filter((item) => {
            if (priority !== 'all' && item.priority !== priority) {
              return false;
            }
            if (category !== 'all' && !categoriesMatch(item.category, category)) {
              return false;
            }
            if (search) {
              const haystack = [
                item.title,
                item.body,
                item.shift_name,
                item.category,
                item.case_number,
                item.location,
                ...(item.tags ?? []),
              ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
              if (!haystack.includes(search)) {
                return false;
              }
            }
            return true;
          });
        }

        setItems(nextItems);

        if (hasActiveBriefingFilters(listFilters) || quickViewActive) {
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
    [
      agencyId,
      agencyLoading,
      effectiveShiftName,
      listFilters,
      quickView,
      quickViewActive,
      userId,
    ],
  );

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          void load(hasLoadedOnceRef.current ? 'refresh' : 'initial');
          if (agencyId && userId) {
            void Promise.all([
              listAgencyShifts({ agencyId, includeInactive: false }).catch(
                () => [] as AgencyShift[],
              ),
              listBriefingCategories({ agencyId, includeInactive: false }).catch(
                () => [] as BriefingCategory[],
              ),
              listShiftAssignments({ agencyId, userId, activeOnly: true }).catch(() => []),
            ]).then(([shifts, categories, assignments]) => {
              if (cancelled) {
                return;
              }
              setAgencyShifts(shifts);
              setAgencyCategories(categories);
              const primary = assignments.find((row) => row.assignment_type === 'primary');
              const primaryName = primary?.shift_name?.trim() || null;
              setPrimaryShiftName(primaryName);
              if (primaryName) {
                setTemporaryShiftName((current) => current ?? primaryName);
              } else if (shiftParam) {
                setTemporaryShiftName((current) => current ?? shiftParam);
              }
            });
          } else {
            setAgencyShifts([]);
            setAgencyCategories([]);
            setPrimaryShiftName(null);
          }
        }
      });
      return () => {
        cancelled = true;
      };
    }, [agencyId, load, shiftParam, userId]),
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

  const normalizedShiftFilter = useMemo(() => {
    const key = resolveShiftFilterKey(filters.shift, shiftFilterOptions);
    if (key === 'all') {
      return 'all';
    }
    return shiftFilterOptions.find((option) => option.key === key)?.label ?? filters.shift ?? 'all';
  }, [filters.shift, shiftFilterOptions]);

  const categoryFilterOptions = useMemo(
    () =>
      buildCategoryFilterOptions({
        agencyCategories,
        historicalNames: optionSource.map((item) => item.category),
      }),
    [agencyCategories, optionSource],
  );

  const categoryOptions = useMemo(
    () => categoryFilterOptions.map((option) => option.label),
    [categoryFilterOptions],
  );

  const normalizedCategoryFilter = useMemo(() => {
    const key = resolveCategoryFilterKey(filters.category, categoryFilterOptions);
    if (key === 'all') {
      return 'all';
    }
    return (
      categoryFilterOptions.find((option) => option.key === key)?.label ??
      filters.category ??
      'all'
    );
  }, [categoryFilterOptions, filters.category]);

  const requiredVisible = useMemo(() => visibleRequiredAcknowledgements(items), [items]);

  function onSelectQuickView(view: BriefingQuickView) {
    setAckMessage(null);
    setQuickView(view);
    setFilters(
      filtersForQuickView(view, {
        myShiftName: effectiveShiftName,
        preserved: {
          search: '',
          category: 'all',
        },
      }),
    );
  }

  function clearQuickView() {
    onSelectQuickView('all');
  }

  function clearFilters() {
    setFilters(
      filtersForQuickView(quickView, {
        myShiftName: effectiveShiftName,
        preserved: {},
      }),
    );
  }

  function onBulkAcknowledge() {
    if (!agencyId || !userId || bulkBusy) {
      return;
    }
    const targets = visibleRequiredAcknowledgements(items);
    if (targets.length === 0) {
      setAckMessage('No visible required briefings need acknowledgement.');
      return;
    }

    confirmAction(
      'Acknowledge briefings',
      `Acknowledge ${targets.length} visible required briefing${targets.length === 1 ? '' : 's'} as you? This only covers items currently loaded in this view.`,
      () => {
        void (async () => {
          setBulkBusy(true);
          setAckMessage(null);
          setErrorMessage(null);
          let succeeded = 0;
          let failed = 0;
          for (const briefing of targets) {
            try {
              await acknowledgeBriefing({
                agencyId,
                briefingId: briefing.id,
                userId,
              });
              succeeded += 1;
            } catch {
              failed += 1;
            }
          }
          await load('refresh');
          if (failed > 0) {
            setErrorMessage(
              `Acknowledged ${succeeded}; ${failed} could not be saved. Hidden or failed items were not marked.`,
            );
          } else {
            setAckMessage(
              `Acknowledged ${succeeded} briefing${succeeded === 1 ? '' : 's'} for you.`,
            );
          }
          setBulkBusy(false);
        })();
      },
    );
  }

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
          Searchable archive and start-of-shift review in one place.
        </AppText>
      </View>

      <View style={styles.toolbar}>
        <AppButton
          label="New briefing"
          onPress={() => router.push(BRIEFINGS_CREATE_HREF)}
          style={styles.newButton}
        />
        {canManageCatalog ? (
          <>
            <AppButton
              label="Manage categories"
              variant="ghost"
              onPress={() => router.push(BRIEFINGS_CATEGORIES_HREF)}
            />
            <AppButton
              label="Templates"
              variant="ghost"
              onPress={() => router.push(BRIEFINGS_TEMPLATES_HREF)}
            />
          </>
        ) : null}
      </View>

      <BriefingQuickViewsBar value={quickView} onChange={onSelectQuickView} />

      {quickView === 'start_of_shift' ? (
        <View style={styles.banner}>
          <AppText variant="label" color="text">
            Start-of-Shift View
          </AppText>
          <AppText variant="body" color="textMuted">
            This view gathers the briefings most relevant at the start of your shift.
          </AppText>
          <AppButton
            label="Exit Start-of-Shift View"
            variant="ghost"
            onPress={clearQuickView}
            style={styles.clearButton}
          />
        </View>
      ) : null}

      {quickView === 'my_shift' || quickView === 'start_of_shift' ? (
        <View style={styles.shiftContext}>
          <AppText variant="label" color="textSubtle">
            Shift focus
          </AppText>
          {primaryShiftName ? (
            <AppText variant="body" color="textMuted">
              Primary assignment: {primaryShiftName}
            </AppText>
          ) : (
            <AppText variant="body" color="textMuted">
              No primary shift assigned. Choose a temporary shift for this review only — it does
              not change your assignment.
            </AppText>
          )}
          {needsTemporaryShift || !primaryShiftName ? (
            <View style={styles.tempShiftRow}>
              {shiftOptions.map((shift) => {
                const selected = !!effectiveShiftName && shiftsMatch(effectiveShiftName, shift);
                return (
                  <Pressable
                    key={shift}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => {
                      setTemporaryShiftName(shift);
                      if (quickView === 'my_shift') {
                        setFilters((current) => ({ ...current, shift, status: 'active' }));
                      }
                    }}
                    style={[styles.tempChip, selected ? styles.tempChipSelected : null]}>
                    <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
                      {shift}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {effectiveShiftName ? (
            <AppText variant="caption" color="primary">
              Showing: {effectiveShiftName}
              {!primaryShiftName ? ' (temporary)' : ''}
            </AppText>
          ) : null}
        </View>
      ) : null}

      {supportsBulkAcknowledge(quickView) ? (
        <AppButton
          label={`Acknowledge visible required briefings${
            requiredVisible.length > 0 ? ` (${requiredVisible.length})` : ''
          }`}
          variant="secondary"
          loading={bulkBusy}
          disabled={bulkBusy || requiredVisible.length === 0}
          onPress={onBulkAcknowledge}
        />
      ) : null}

      <BriefingFiltersBar
        filters={{
          ...filters,
          shift: normalizedShiftFilter,
          category: normalizedCategoryFilter,
        }}
        shiftOptions={shiftOptions}
        categoryOptions={categoryOptions}
        onChange={(next) => {
          const shiftKey = resolveShiftFilterKey(next.shift, shiftFilterOptions);
          const shiftLabel =
            shiftKey === 'all'
              ? 'all'
              : (shiftFilterOptions.find((option) => option.key === shiftKey)?.label ??
                next.shift);
          const categoryKey = resolveCategoryFilterKey(next.category, categoryFilterOptions);
          const categoryLabel =
            categoryKey === 'all'
              ? 'all'
              : (categoryFilterOptions.find((option) => option.key === categoryKey)?.label ??
                next.category);
          setFilters({
            ...next,
            shift: shiftLabel ?? 'all',
            category: categoryLabel ?? 'all',
          });
          if (quickView === 'my_shift' && shiftLabel && shiftLabel !== 'all') {
            setTemporaryShiftName(shiftLabel);
          }
        }}
      />

      <View style={styles.clearRow}>
        {quickViewActive && quickView !== 'start_of_shift' ? (
          <AppButton
            label="Clear quick view"
            variant="ghost"
            onPress={clearQuickView}
            style={styles.clearButton}
          />
        ) : null}
        {filtersActive ? (
          <AppButton
            label="Clear filters"
            variant="ghost"
            onPress={clearFilters}
            style={styles.clearButton}
          />
        ) : null}
      </View>

      {ackMessage ? <InlineFormMessage message={ackMessage} tone="info" /> : null}
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

  const emptyDescription =
    quickView === 'my_shift' && !effectiveShiftName
      ? 'Select a temporary shift above to review active briefings for that watch.'
      : quickView === 'start_of_shift'
        ? 'No critical, pinned, unacknowledged, shift, or department-wide briefings match right now.'
        : quickView === 'required_review'
          ? 'You have no active briefings awaiting your acknowledgement.'
          : 'Create a pass-on or adjust filters to see agency briefings.';

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
            <EmptyState title="No briefings in this view" description={emptyDescription} />
          )
        }
        renderItem={({ item }) => (
          <View style={styles.cardWrap}>
            <BriefingCard
              briefing={item}
              categories={agencyCategories}
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
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    alignItems: 'center',
  },
  newButton: {
    alignSelf: 'flex-start',
  },
  clearButton: {
    alignSelf: 'flex-start',
  },
  clearRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  banner: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  shiftContext: {
    gap: spacing.sm,
  },
  tempShiftRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tempChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  tempChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
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
