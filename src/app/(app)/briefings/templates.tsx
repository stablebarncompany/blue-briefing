import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import {
  AppButton,
  AppCard,
  AppText,
  EmptyState,
  FormField,
  InlineFormMessage,
} from '@/components/common';
import { PageContainer } from '@/components/layout';
import { BRIEFINGS_CATEGORIES_HREF, BRIEFINGS_HREF } from '@/constants/navigation';
import { useAgency } from '@/hooks/use-agency';
import { useAuth } from '@/hooks/use-auth';
import { useIsWideLayout } from '@/hooks/use-is-wide-layout';
import {
  BriefingCategoryServiceError,
  listBriefingCategories,
} from '@/services/briefing-categories';
import {
  BriefingTemplateServiceError,
  createBriefingTemplate,
  deactivateBriefingTemplate,
  duplicateBriefingTemplate,
  listBriefingTemplates,
  reactivateBriefingTemplate,
  updateBriefingTemplate,
} from '@/services/briefing-templates';
import { colors, layout, radius, spacing } from '@/theme';
import { canManageBriefingCatalog, type BriefingCategory } from '@/types/briefingCategories';
import {
  BRIEFING_PRIORITIES,
  formatBriefingPriority,
  type BriefingPriority,
} from '@/types/briefings';
import {
  EXAMPLE_TEMPLATE_PRESETS,
  type BriefingTemplate,
} from '@/types/briefingTemplates';

type TemplateDraft = {
  name: string;
  title_template: string;
  body_template: string;
  category_id: string;
  default_priority: BriefingPriority;
  requires_acknowledgement: boolean;
};

const EMPTY_DRAFT: TemplateDraft = {
  name: '',
  title_template: '',
  body_template: '',
  category_id: '',
  default_priority: 'medium',
  requires_acknowledgement: true,
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

function draftFromTemplate(template: BriefingTemplate): TemplateDraft {
  return {
    name: template.name,
    title_template: template.title_template ?? '',
    body_template: template.body_template,
    category_id: template.category_id ?? '',
    default_priority: template.default_priority,
    requires_acknowledgement: template.requires_acknowledgement,
  };
}

function draftsEqual(left: TemplateDraft, right: TemplateDraft): boolean {
  return (
    left.name === right.name &&
    left.title_template === right.title_template &&
    left.body_template === right.body_template &&
    left.category_id === right.category_id &&
    left.default_priority === right.default_priority &&
    left.requires_acknowledgement === right.requires_acknowledgement
  );
}

export default function BriefingTemplatesScreen() {
  const { user } = useAuth();
  const { currentAgency, currentMembership } = useAgency();
  const isWide = useIsWideLayout();
  const agencyId = currentAgency?.id ?? null;
  const canManage = canManageBriefingCatalog(currentMembership?.role);

  const [templates, setTemplates] = useState<BriefingTemplate[]>([]);
  const [categories, setCategories] = useState<BriefingCategory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft>(EMPTY_DRAFT);
  const [baselineDraft, setBaselineDraft] = useState<TemplateDraft>(EMPTY_DRAFT);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!agencyId) {
      setTemplates([]);
      setCategories([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [templateRows, categoryRows] = await Promise.all([
        listBriefingTemplates({
          agencyId,
          includeInactive: showInactive || canManage,
        }),
        listBriefingCategories({ agencyId, includeInactive: false }),
      ]);
      setTemplates(templateRows);
      setCategories(categoryRows);
      setSelectedId((current) => {
        if (current && templateRows.some((row) => row.id === current)) {
          return current;
        }
        return null;
      });
    } catch (error) {
      setErrorMessage(
        error instanceof BriefingTemplateServiceError ||
          error instanceof BriefingCategoryServiceError
          ? error.message
          : 'Unable to load templates.',
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
    () => templates.filter((template) => showInactive || template.is_active),
    [showInactive, templates],
  );

  const selected = templates.find((template) => template.id === selectedId) ?? null;
  const isDirty = !draftsEqual(draft, baselineDraft);

  function resetCreate() {
    setIsCreating(false);
    setDraft(EMPTY_DRAFT);
    setBaselineDraft(EMPTY_DRAFT);
    setPreviewing(false);
    setFormError(null);
  }

  function resetEdit() {
    setSelectedId(null);
    setDraft(EMPTY_DRAFT);
    setBaselineDraft(EMPTY_DRAFT);
    setPreviewing(false);
    setFormError(null);
  }

  function openCreate() {
    const start = () => {
      resetEdit();
      setIsCreating(true);
      setDraft(EMPTY_DRAFT);
      setBaselineDraft(EMPTY_DRAFT);
      setPreviewing(false);
      setFormError(null);
    };
    if (!isCreating && isDirty && selectedId) {
      confirmDiscard('You have unsaved template edits. Discard them and create a new template?', start);
      return;
    }
    start();
  }

  function closeCreate() {
    const finish = () => resetCreate();
    if (isCreating && isDirty) {
      confirmDiscard('Discard this new template?', finish);
      return;
    }
    finish();
  }

  function openEdit(template: BriefingTemplate) {
    if (selectedId === template.id && !isCreating) {
      closeEdit();
      return;
    }
    const start = () => {
      setIsCreating(false);
      const next = draftFromTemplate(template);
      setSelectedId(template.id);
      setDraft(next);
      setBaselineDraft(next);
      setPreviewing(false);
      setFormError(null);
    };
    if (isCreating && isDirty) {
      confirmDiscard('Discard the new template and open this one?', start);
      return;
    }
    if (!isCreating && isDirty && selectedId && selectedId !== template.id) {
      confirmDiscard('You have unsaved changes. Discard them and switch templates?', start);
      return;
    }
    start();
  }

  function closeEdit() {
    const finish = () => resetEdit();
    if (!isCreating && isDirty) {
      confirmDiscard('Discard unsaved changes to this template?', finish);
      return;
    }
    finish();
  }

  function applyPreset(name: string) {
    const preset = EXAMPLE_TEMPLATE_PRESETS.find((row) => row.name === name);
    if (!preset) {
      setDraft((current) => ({ ...current, name }));
      return;
    }
    const category = categories.find(
      (row) => row.name.toLowerCase() === preset.suggested_category.toLowerCase(),
    );
    setDraft({
      name: preset.name,
      title_template: preset.title_template,
      body_template: preset.body_template,
      category_id: category?.id ?? '',
      default_priority: preset.default_priority,
      requires_acknowledgement: preset.requires_acknowledgement,
    });
  }

  async function onCreate() {
    if (!agencyId || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      await createBriefingTemplate({
        agencyId,
        input: {
          name: draft.name,
          title_template: draft.title_template,
          body_template: draft.body_template,
          category_id: draft.category_id || null,
          default_priority: draft.default_priority,
          requires_acknowledgement: draft.requires_acknowledgement,
        },
      });
      resetCreate();
      await load();
    } catch (error) {
      setFormError(
        error instanceof BriefingTemplateServiceError
          ? error.message
          : 'Unable to create template.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onSaveEdit() {
    if (!selected || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const updated = await updateBriefingTemplate({
        templateId: selected.id,
        input: {
          name: draft.name,
          title_template: draft.title_template,
          clear_title_template: !draft.title_template.trim(),
          body_template: draft.body_template,
          category_id: draft.category_id || null,
          clear_category: !draft.category_id,
          default_priority: draft.default_priority,
          requires_acknowledgement: draft.requires_acknowledgement,
        },
      });
      const next = draftFromTemplate(updated);
      setDraft(next);
      setBaselineDraft(next);
      await load();
    } catch (error) {
      setFormError(
        error instanceof BriefingTemplateServiceError
          ? error.message
          : 'Unable to update template.',
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
        await deactivateBriefingTemplate(selected.id);
      } else {
        await reactivateBriefingTemplate(selected.id);
      }
      await load();
    } catch (error) {
      setFormError(
        error instanceof BriefingTemplateServiceError
          ? error.message
          : 'Unable to update template status.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function onDuplicate() {
    if (!selected || busy) return;
    setBusy(true);
    setFormError(null);
    try {
      const created = await duplicateBriefingTemplate({ templateId: selected.id });
      await load();
      const next = draftFromTemplate(created);
      setSelectedId(created.id);
      setDraft(next);
      setBaselineDraft(next);
      setIsCreating(false);
      setPreviewing(false);
      setFormError(null);
    } catch (error) {
      setFormError(
        error instanceof BriefingTemplateServiceError
          ? error.message
          : 'Unable to duplicate template.',
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
          description="Choose an agency membership before managing templates."
        />
      </PageContainer>
    );
  }

  if (!canManage) {
    return (
      <PageContainer>
        <EmptyState
          title="Managers only"
          description="Agency Admin or Command Staff can manage briefing templates."
        />
        <AppButton label="Back to Briefings" variant="ghost" onPress={() => router.push(BRIEFINGS_HREF)} />
      </PageContainer>
    );
  }

  const form = (
    <AppCard
      raised
      style={styles.panel}
      accessibilityLabel={isCreating ? 'Create template form' : 'Edit template form'}>
      <AppText variant="title">{isCreating ? 'Create template' : 'Edit template'}</AppText>
      {isCreating ? (
        <AppText variant="caption" color="textMuted">
          Optional examples fill the form. Nothing is saved until you choose Save template.
        </AppText>
      ) : selected ? (
        <AppText variant="caption" color="textSubtle">
          {selected.is_active ? 'Active' : 'Inactive'}
          {selected.category_name ? ` · ${selected.category_name}` : ''}
        </AppText>
      ) : null}

      {isCreating ? (
        <View style={styles.chipRow}>
          {EXAMPLE_TEMPLATE_PRESETS.map((preset) => (
            <Pressable
              key={preset.name}
              accessibilityRole="button"
              onPress={() => applyPreset(preset.name)}
              style={styles.chip}>
              <AppText variant="caption" color="textMuted">
                {preset.name}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}

      <FormField
        label="Template name"
        value={draft.name}
        onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
        placeholder="End-of-Shift Report"
      />
      <FormField
        label="Default title"
        value={draft.title_template}
        onChangeText={(title_template) => setDraft((current) => ({ ...current, title_template }))}
        placeholder="Optional title prefix"
      />
      <FormField
        label="Default body"
        value={draft.body_template}
        onChangeText={(body_template) => setDraft((current) => ({ ...current, body_template }))}
        placeholder="Bullet outline for the briefing"
        multiline
        textAlignVertical="top"
        style={styles.bodyInput}
      />

      <View style={styles.chipBlock}>
        <AppText variant="label" color="textSubtle">
          Category
        </AppText>
        <View style={styles.chipRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !draft.category_id }}
            onPress={() => setDraft((current) => ({ ...current, category_id: '' }))}
            style={[styles.chip, !draft.category_id ? styles.chipSelected : null]}>
            <AppText variant="caption" color={!draft.category_id ? 'text' : 'textMuted'}>
              None
            </AppText>
          </Pressable>
          {categories.map((category) => {
            const selectedCategory = draft.category_id === category.id;
            return (
              <Pressable
                key={category.id}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedCategory }}
                onPress={() =>
                  setDraft((current) => ({ ...current, category_id: category.id }))
                }
                style={[styles.chip, selectedCategory ? styles.chipSelected : null]}>
                <AppText variant="caption" color={selectedCategory ? 'text' : 'textMuted'}>
                  {category.name}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.chipBlock}>
        <AppText variant="label" color="textSubtle">
          Default priority
        </AppText>
        <View style={styles.chipRow}>
          {BRIEFING_PRIORITIES.map((priority) => {
            const selectedPriority = draft.default_priority === priority;
            return (
              <Pressable
                key={priority}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedPriority }}
                onPress={() =>
                  setDraft((current) => ({ ...current, default_priority: priority }))
                }
                style={[styles.chip, selectedPriority ? styles.chipSelected : null]}>
                <AppText variant="caption" color={selectedPriority ? 'text' : 'textMuted'}>
                  {formatBriefingPriority(priority)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.toggleRow}>
        <View style={styles.toggleCopy}>
          <AppText variant="label" color="textMuted">
            Requires acknowledgement
          </AppText>
        </View>
        <Switch
          value={draft.requires_acknowledgement}
          onValueChange={(requires_acknowledgement) =>
            setDraft((current) => ({ ...current, requires_acknowledgement }))
          }
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.text}
        />
      </View>

      {previewing ? (
        <View style={styles.preview}>
          <AppText variant="label" color="textSubtle">
            Preview
          </AppText>
          <AppText variant="title">{draft.title_template || draft.name || 'Untitled'}</AppText>
          <AppText variant="caption" color="textMuted">
            {formatBriefingPriority(draft.default_priority)}
            {draft.category_id
              ? ` · ${categories.find((row) => row.id === draft.category_id)?.name ?? 'Category'}`
              : ''}
            {draft.requires_acknowledgement ? ' · Ack required' : ' · Ack optional'}
          </AppText>
          <AppText variant="body" color="textMuted">
            {draft.body_template || 'No body content.'}
          </AppText>
        </View>
      ) : null}

      {formError ? <InlineFormMessage message={formError} /> : null}

      <View style={styles.actions}>
        {isCreating ? (
          <AppButton
            label="Save template"
            loading={busy}
            disabled={busy || !draft.name.trim() || !draft.body_template.trim()}
            onPress={() => void onCreate()}
          />
        ) : (
          <AppButton
            label="Save changes"
            loading={busy}
            disabled={busy || !selected}
            onPress={() => void onSaveEdit()}
          />
        )}
        <AppButton
          label="Close"
          variant="ghost"
          disabled={busy}
          onPress={isCreating ? closeCreate : closeEdit}
        />
        <AppButton
          label={previewing ? 'Hide preview' : 'Preview'}
          variant="ghost"
          onPress={() => setPreviewing((value) => !value)}
        />
        {!isCreating && selected ? (
          <>
            <AppButton
              label="Duplicate"
              variant="ghost"
              disabled={busy}
              onPress={() => void onDuplicate()}
            />
            <AppButton
              label={selected.is_active ? 'Deactivate' : 'Reactivate'}
              variant="ghost"
              disabled={busy}
              onPress={() => void onToggleActive()}
            />
          </>
        ) : null}
      </View>
    </AppCard>
  );

  const listPane = (
    <View style={styles.list}>
      {visible.map((template) => {
        const selectedRow = template.id === selectedId && !isCreating;
        return (
          <Pressable
            key={template.id}
            accessibilityRole="button"
            accessibilityState={{ selected: selectedRow }}
            accessibilityLabel={`${template.name}${selectedRow ? ', selected' : ''}`}
            onPress={() => openEdit(template)}
            style={[styles.listItem, selectedRow ? styles.listItemSelected : null]}>
            <View style={styles.listTitleRow}>
              <AppText variant="label" color="text" style={styles.listTitle}>
                {template.name}
              </AppText>
              {selectedRow ? (
                <AppText variant="caption" color="primary">
                  Selected
                </AppText>
              ) : null}
            </View>
            <AppText variant="caption" color="textSubtle">
              {[
                !template.is_active ? 'Inactive' : null,
                formatBriefingPriority(template.default_priority),
                template.category_name || null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <PageContainer contentStyle={styles.page}>
      <View style={styles.heading}>
        <AppText variant="display">Briefing templates</AppText>
        <AppText variant="body" color="textMuted">
          Reusable outlines for common pass-ons. Examples stay in the UI until you save them.
        </AppText>
      </View>

      <View style={styles.toolbar}>
        <AppButton label="Back" variant="ghost" onPress={() => router.push(BRIEFINGS_HREF)} />
        <AppButton
          label="Categories"
          variant="ghost"
          onPress={() => router.push(BRIEFINGS_CATEGORIES_HREF)}
        />
        <AppButton
          label={isCreating ? 'Creating…' : 'Create template'}
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
      {isCreating ? form : null}

      {isLoading ? (
        <ActivityIndicator color={colors.primary} />
      ) : visible.length === 0 && !isCreating ? (
        <EmptyState
          title="No templates yet"
          description="Create a template or start from an example outline."
        />
      ) : visible.length > 0 ? (
        <View style={[styles.split, isWide && selected && !isCreating ? styles.splitWide : null]}>
          <View style={isWide && selected && !isCreating ? styles.listPane : undefined}>
            {listPane}
          </View>
          {!isCreating && selected ? (
            <View style={isWide ? styles.formPane : styles.formStack}>{form}</View>
          ) : null}
        </View>
      ) : null}
    </PageContainer>
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
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.xs,
  },
  listItemSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
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
  bodyInput: {
    minHeight: 140,
    paddingTop: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  toggleCopy: {
    flex: 1,
  },
  preview: {
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
});
