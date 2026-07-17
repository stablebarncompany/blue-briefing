import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { CategorySelect } from '@/components/briefings';
import {
  AppButton,
  AppCard,
  AppText,
  EmptyState,
  FormField,
  InlineFormMessage,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import { BRIEFINGS_HREF, BRIEFINGS_TEMPLATES_HREF } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { useIsWideLayout } from '@/hooks/use-is-wide-layout';
import {
  BriefingCategoryServiceError,
  createBriefingCategory,
  deactivateBriefingCategory,
  listBriefingCategories,
  reactivateBriefingCategory,
  reorderBriefingCategories,
  updateBriefingCategory,
} from '@/services/briefing-categories';
import { colors, layout, radius, spacing } from '@/theme';
import {
  CATEGORY_COLOR_KEYS,
  CATEGORY_ICON_KEYS,
  canManageBriefingCatalog,
  categoryAccentColor,
  formatCategoryIconLabel,
  type BriefingCategory,
  type CategoryColorKey,
  type CategoryIconKey,
} from '@/types/briefingCategories';

type EditDraft = {
  name: string;
  description: string;
  color: CategoryColorKey | '';
  icon: CategoryIconKey | '';
};

const EMPTY_CREATE = {
  name: '',
  description: '',
  color: 'primary' as CategoryColorKey,
  icon: 'flag' as CategoryIconKey,
};

function confirmDiscard(message: string, onConfirm: () => void) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(message)) {
      onConfirm();
    }
    return;
  }
  Alert.alert('Discard changes?', message, [
    { text: 'Keep editing', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: onConfirm },
  ]);
}

function draftFromCategory(category: BriefingCategory): EditDraft {
  return {
    name: category.name,
    description: category.description ?? '',
    color:
      category.color_key &&
      (CATEGORY_COLOR_KEYS as readonly string[]).includes(category.color_key)
        ? (category.color_key as CategoryColorKey)
        : '',
    icon:
      category.icon_key && (CATEGORY_ICON_KEYS as readonly string[]).includes(category.icon_key)
        ? (category.icon_key as CategoryIconKey)
        : '',
  };
}

export default function BriefingCategoriesScreen() {
  const { user } = useAuth();
  const { currentAgency, currentMembership } = useAgency();
  const isWide = useIsWideLayout();
  const agencyId = currentAgency?.id ?? null;
  const canManage = canManageBriefingCatalog(currentMembership?.role);

  const [categories, setCategories] = useState<BriefingCategory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [createDraft, setCreateDraft] = useState(EMPTY_CREATE);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [baselineEdit, setBaselineEdit] = useState<EditDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!agencyId) {
      setCategories([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const rows = await listBriefingCategories({
        agencyId,
        includeInactive: showInactive || canManage,
        includeUsage: true,
      });
      setCategories(rows);
      setSelectedId((current) => {
        if (current && rows.some((row) => row.id === current)) {
          return current;
        }
        return null;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof BriefingCategoryServiceError
          ? error.message
          : 'Unable to load categories.',
      );
    } finally {
      setIsLoading(false);
    }
  }, [agencyId, canManage, showInactive]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      queueMicrotask(() => {
        if (!cancelled) {
          void load();
        }
      });
      return () => {
        cancelled = true;
      };
    }, [load]),
  );

  const visible = useMemo(
    () => categories.filter((category) => showInactive || category.is_active),
    [categories, showInactive],
  );

  const selected = categories.find((category) => category.id === selectedId) ?? null;

  const createDirty =
    createDraft.name.trim().length > 0 ||
    createDraft.description.trim().length > 0 ||
    createDraft.color !== EMPTY_CREATE.color ||
    createDraft.icon !== EMPTY_CREATE.icon;

  const editDirty =
    !!editDraft &&
    !!baselineEdit &&
    (editDraft.name !== baselineEdit.name ||
      editDraft.description !== baselineEdit.description ||
      editDraft.color !== baselineEdit.color ||
      editDraft.icon !== baselineEdit.icon);

  function resetCreate() {
    setIsCreating(false);
    setCreateDraft(EMPTY_CREATE);
    setFormError(null);
  }

  function resetEdit() {
    setSelectedId(null);
    setEditDraft(null);
    setBaselineEdit(null);
    setFormError(null);
  }

  function openCreate() {
    const start = () => {
      resetEdit();
      setIsCreating(true);
      setCreateDraft(EMPTY_CREATE);
      setFormError(null);
    };
    if (editDirty) {
      confirmDiscard('You have unsaved category edits. Discard them and create a new category?', start);
      return;
    }
    start();
  }

  function closeCreate() {
    const finish = () => resetCreate();
    if (createDirty) {
      confirmDiscard('Discard this new category?', finish);
      return;
    }
    finish();
  }

  function openEdit(category: BriefingCategory) {
    if (selectedId === category.id) {
      closeEdit();
      return;
    }
    const start = () => {
      resetCreate();
      const draft = draftFromCategory(category);
      setSelectedId(category.id);
      setEditDraft(draft);
      setBaselineEdit(draft);
      setFormError(null);
    };
    if (isCreating && createDirty) {
      confirmDiscard('Discard the new category and open this one?', start);
      return;
    }
    if (editDirty && selectedId && selectedId !== category.id) {
      confirmDiscard('You have unsaved changes. Discard them and switch categories?', start);
      return;
    }
    start();
  }

  function closeEdit() {
    const finish = () => resetEdit();
    if (editDirty) {
      confirmDiscard('Discard unsaved changes to this category?', finish);
      return;
    }
    finish();
  }

  async function onCreate() {
    if (!agencyId || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      await createBriefingCategory({
        agencyId,
        input: {
          name: createDraft.name,
          description: createDraft.description,
          color_key: createDraft.color,
          icon_key: createDraft.icon,
        },
      });
      resetCreate();
      await load();
    } catch (error) {
      setFormError(
        error instanceof BriefingCategoryServiceError
          ? error.message
          : 'Unable to create category.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit() {
    if (!selected || !editDraft || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const updated = await updateBriefingCategory({
        categoryId: selected.id,
        input: {
          name: editDraft.name,
          description: editDraft.description,
          clear_description: !editDraft.description.trim(),
          color_key: editDraft.color || null,
          clear_color_key: !editDraft.color,
          icon_key: editDraft.icon || null,
          clear_icon_key: !editDraft.icon,
        },
      });
      const next = draftFromCategory(updated);
      setEditDraft(next);
      setBaselineEdit(next);
      await load();
    } catch (error) {
      setFormError(
        error instanceof BriefingCategoryServiceError
          ? error.message
          : 'Unable to update category.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onToggleActive() {
    if (!selected || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      if (selected.is_active) {
        await deactivateBriefingCategory(selected.id);
      } else {
        await reactivateBriefingCategory(selected.id);
      }
      await load();
    } catch (error) {
      setFormError(
        error instanceof BriefingCategoryServiceError
          ? error.message
          : 'Unable to update category status.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onMove(direction: -1 | 1) {
    if (!agencyId || !selected || busy) return;
    const ordered = [...visible].sort((a, b) => a.sort_order - b.sort_order);
    const index = ordered.findIndex((row) => row.id === selected.id);
    const swapIndex = index + direction;
    if (index < 0 || swapIndex < 0 || swapIndex >= ordered.length) {
      return;
    }
    const next = [...ordered];
    const current = next[index];
    const other = next[swapIndex];
    if (!current || !other) return;
    next[index] = other;
    next[swapIndex] = current;
    setBusy(true);
    setFormError(null);
    try {
      await reorderBriefingCategories({
        agencyId,
        categoryIds: next.map((row) => row.id),
      });
      await load();
    } catch (error) {
      setFormError(
        error instanceof BriefingCategoryServiceError
          ? error.message
          : 'Unable to reorder categories.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!currentAgency || !user?.id) {
    return (
      <PageContainer>
        <EmptyState
          title="Select an agency"
          description="Choose an agency membership before managing categories."
        />
      </PageContainer>
    );
  }

  if (!canManage) {
    return (
      <PageContainer>
        <EmptyState
          title="Managers only"
          description="Agency Admin or Command Staff can manage briefing categories."
        />
        <AppButton label="Back to Briefings" variant="ghost" onPress={() => router.push(BRIEFINGS_HREF)} />
      </PageContainer>
    );
  }

  const createForm = (
    <AppCard raised style={styles.panel} accessibilityLabel="Create category form">
      <AppText variant="title">Create category</AppText>
      <CategorySelect
        label="Suggested category"
        agencyCategories={[]}
        value={createDraft.name}
        customValue={createDraft.name}
        createMode
        allowNone={false}
        onChange={(next) => setCreateDraft((current) => ({ ...current, name: next.name }))}
      />
      <FormField
        label="Description (optional)"
        value={createDraft.description}
        onChangeText={(description) => setCreateDraft((current) => ({ ...current, description }))}
        placeholder="When to use this category"
      />
      <ChipPicker
        label="Color accent"
        options={CATEGORY_COLOR_KEYS.map((key) => ({
          key,
          label: key,
          selected: createDraft.color === key,
        }))}
        onSelect={(key) =>
          setCreateDraft((current) => ({ ...current, color: key as CategoryColorKey }))
        }
      />
      <ChipPicker
        label="Icon"
        options={CATEGORY_ICON_KEYS.map((key) => ({
          key,
          label: formatCategoryIconLabel(key),
          selected: createDraft.icon === key,
        }))}
        onSelect={(key) =>
          setCreateDraft((current) => ({ ...current, icon: key as CategoryIconKey }))
        }
      />
      {formError ? <InlineFormMessage message={formError} /> : null}
      <View style={styles.actions}>
        <AppButton
          label="Save category"
          loading={busy}
          disabled={
            busy || !createDraft.name.trim() || createDraft.name.trim().toLowerCase() === 'other'
          }
          onPress={() => void onCreate()}
        />
        <AppButton label="Cancel" variant="ghost" disabled={busy} onPress={closeCreate} />
      </View>
    </AppCard>
  );

  const editForm =
    selected && editDraft ? (
      <AppCard raised style={styles.panel} accessibilityLabel={`Edit category ${selected.name}`}>
        <AppText variant="title">Edit category</AppText>
        <AppText variant="caption" color="textSubtle">
          {selected.is_active ? 'Active' : 'Inactive'}
          {typeof selected.usage_count === 'number'
            ? ` · ${selected.usage_count} briefing${selected.usage_count === 1 ? '' : 's'}`
            : ''}
        </AppText>
        <FormField
          label="Name"
          value={editDraft.name}
          onChangeText={(name) => setEditDraft((current) => (current ? { ...current, name } : current))}
        />
        <FormField
          label="Description"
          value={editDraft.description}
          onChangeText={(description) =>
            setEditDraft((current) => (current ? { ...current, description } : current))
          }
          placeholder="Optional description"
        />
        <ChipPicker
          label="Color accent"
          options={[
            { key: '', label: 'None', selected: !editDraft.color },
            ...CATEGORY_COLOR_KEYS.map((key) => ({
              key,
              label: key,
              selected: editDraft.color === key,
            })),
          ]}
          onSelect={(key) =>
            setEditDraft((current) =>
              current ? { ...current, color: key as CategoryColorKey | '' } : current,
            )
          }
        />
        <ChipPicker
          label="Icon"
          options={[
            { key: '', label: 'None', selected: !editDraft.icon },
            ...CATEGORY_ICON_KEYS.map((key) => ({
              key,
              label: formatCategoryIconLabel(key),
              selected: editDraft.icon === key,
            })),
          ]}
          onSelect={(key) =>
            setEditDraft((current) =>
              current ? { ...current, icon: key as CategoryIconKey | '' } : current,
            )
          }
        />
        {formError ? <InlineFormMessage message={formError} /> : null}
        <View style={styles.actions}>
          <AppButton
            label="Save changes"
            loading={busy}
            disabled={busy}
            onPress={() => void onSaveEdit()}
          />
          <AppButton label="Close" variant="ghost" disabled={busy} onPress={closeEdit} />
          <AppButton
            label="Move up"
            variant="ghost"
            disabled={busy}
            onPress={() => void onMove(-1)}
          />
          <AppButton
            label="Move down"
            variant="ghost"
            disabled={busy}
            onPress={() => void onMove(1)}
          />
          <AppButton
            label={selected.is_active ? 'Deactivate' : 'Reactivate'}
            variant="ghost"
            disabled={busy}
            onPress={() => void onToggleActive()}
          />
        </View>
      </AppCard>
    ) : null;

  const listPane = (
    <View style={styles.list}>
      {visible.map((category) => {
        const selectedRow = category.id === selectedId && !isCreating;
        const accent = colors[categoryAccentColor(category.color_key)];
        const description = category.description?.trim();
        return (
          <Pressable
            key={category.id}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedRow }}
            accessibilityLabel={`${category.name}${selectedRow ? ', selected' : ''}`}
            onPress={() => openEdit(category)}
            style={[styles.listItem, selectedRow ? styles.listItemSelected : null]}>
            <View style={[styles.accent, { backgroundColor: accent }]} />
            <View style={styles.listCopy}>
              <View style={styles.listTitleRow}>
                <AppText variant="label" color="text" style={styles.listTitle}>
                  {category.name}
                </AppText>
                {selectedRow ? (
                  <AppText variant="caption" color="primary">
                    Selected
                  </AppText>
                ) : null}
              </View>
              <AppText variant="caption" color="textSubtle" numberOfLines={2}>
                {[
                  !category.is_active ? 'Inactive' : null,
                  description || null,
                  typeof category.usage_count === 'number'
                    ? `${category.usage_count} briefing${category.usage_count === 1 ? '' : 's'}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'No description'}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <PageContainer contentStyle={styles.page}>
      <View style={styles.heading}>
        <AppText variant="display">Briefing categories</AppText>
        <AppText variant="body" color="textMuted">
          Configure agency category labels used on new briefings and filters.
        </AppText>
      </View>

      <View style={styles.toolbar}>
        <AppButton label="Back" variant="ghost" onPress={() => router.push(BRIEFINGS_HREF)} />
        <AppButton
          label="Templates"
          variant="ghost"
          onPress={() => router.push(BRIEFINGS_TEMPLATES_HREF)}
        />
        <AppButton
          label={isCreating ? 'Creating…' : 'Create category'}
          variant={isCreating ? 'secondary' : 'primary'}
          disabled={isCreating}
          onPress={openCreate}
        />
        <AppButton
          label={showInactive ? 'Hide inactive' : 'Show inactive'}
          variant="ghost"
          onPress={() => setShowInactive((value) => !value)}
        />
      </View>

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}
      {isCreating ? createForm : null}

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : visible.length === 0 && !isCreating ? (
        <EmptyState
          title="No categories yet"
          description="Create agency categories or use Other / Custom when writing briefings."
        />
      ) : visible.length > 0 ? (
        <View style={[styles.split, isWide && editForm && !isCreating ? styles.splitWide : null]}>
          <View style={isWide && editForm && !isCreating ? styles.listPane : undefined}>
            {listPane}
          </View>
          {!isCreating && editForm ? (
            <View style={isWide ? styles.formPane : styles.formStack}>{editForm}</View>
          ) : null}
        </View>
      ) : null}
    </PageContainer>
  );
}

function ChipPicker(props: {
  label: string;
  options: { key: string; label: string; selected: boolean }[];
  onSelect: (key: string) => void;
}) {
  return (
    <View style={styles.chipBlock}>
      <AppText variant="label" color="textSubtle">
        {props.label}
      </AppText>
      <View style={styles.chipRow}>
        {props.options.map((option) => (
          <Pressable
            key={option.key || 'none'}
            accessibilityRole="button"
            accessibilityState={{ selected: option.selected }}
            onPress={() => props.onSelect(option.key)}
            style={[styles.chip, option.selected ? styles.chipSelected : null]}>
            <AppText variant="caption" color={option.selected ? 'text' : 'textMuted'}>
              {option.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    paddingBottom: layout.bottomNavHeight + spacing['3xl'],
  },
  heading: {
    gap: spacing.sm,
  },
  toolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  panel: {
    gap: spacing.md,
  },
  split: {
    gap: spacing.lg,
  },
  splitWide: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  listPane: {
    flex: 1,
    minWidth: 0,
  },
  formPane: {
    flex: 1.2,
    minWidth: 0,
  },
  formStack: {
    width: '100%',
  },
  list: {
    gap: spacing.sm,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  listItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
  },
  accent: {
    width: 3,
    borderRadius: radius.sm,
  },
  listCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  listTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  listTitle: {
    flex: 1,
  },
  actions: {
    gap: spacing.sm,
  },
  chipBlock: {
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
});
