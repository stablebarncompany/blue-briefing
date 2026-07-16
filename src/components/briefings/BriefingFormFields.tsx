import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText, FormField } from '@/components/common';
import { colors, radius, spacing } from '@/theme';
import {
  BRIEFING_PRIORITIES,
  BODY_MAX_LENGTH,
  CASE_MAX_LENGTH,
  CATEGORY_MAX_LENGTH,
  LOCATION_MAX_LENGTH,
  SHIFT_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  formatBriefingPriority,
  type BriefingPriority,
  type CreateBriefingInput,
} from '@/types/briefings';

export type BriefingFormValues = {
  title: string;
  body: string;
  shift_name: string;
  category: string;
  priority: BriefingPriority;
  case_number: string;
  location: string;
  tagsText: string;
  requires_acknowledgement: boolean;
};

export const EMPTY_BRIEFING_FORM: BriefingFormValues = {
  title: '',
  body: '',
  shift_name: '',
  category: '',
  priority: 'medium',
  case_number: '',
  location: '',
  tagsText: '',
  requires_acknowledgement: true,
};

export function briefingFormToInput(values: BriefingFormValues): CreateBriefingInput {
  return {
    title: values.title,
    body: values.body,
    shift_name: values.shift_name,
    category: values.category,
    priority: values.priority,
    case_number: values.case_number,
    location: values.location,
    tags: values.tagsText
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    requires_acknowledgement: values.requires_acknowledgement,
  };
}

export type BriefingFormFieldsProps = {
  values: BriefingFormValues;
  onChange: (next: BriefingFormValues) => void;
  fieldErrors?: Partial<Record<keyof BriefingFormValues, string>>;
  disabled?: boolean;
};

export function BriefingFormFields({
  values,
  onChange,
  fieldErrors,
  disabled,
}: BriefingFormFieldsProps) {
  function setField<K extends keyof BriefingFormValues>(key: K, value: BriefingFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  function appendBullet() {
    const next = values.body.trim().length === 0 ? '• ' : `${values.body.replace(/\s+$/, '')}\n• `;
    setField('body', next);
  }

  return (
    <View style={styles.wrap}>
      <FormField
        label="Title"
        value={values.title}
        onChangeText={(title) => setField('title', title)}
        placeholder="Briefing title"
        autoCapitalize="sentences"
        autoCorrect
        maxLength={TITLE_MAX_LENGTH}
        editable={!disabled}
        error={fieldErrors?.title}
      />

      <View style={styles.bodyBlock}>
        <FormField
          label="Body"
          value={values.body}
          onChangeText={(body) => setField('body', body)}
          placeholder="Pass-on details. Use bullets for clarity."
          autoCapitalize="sentences"
          autoCorrect
          multiline
          textAlignVertical="top"
          style={styles.bodyInput}
          maxLength={BODY_MAX_LENGTH}
          editable={!disabled}
          error={fieldErrors?.body}
        />
        <Pressable
          accessibilityRole="button"
          disabled={disabled}
          onPress={appendBullet}
          style={styles.bulletButton}>
          <AppText variant="caption" color="primary">
            Add bullet
          </AppText>
        </Pressable>
      </View>

      <FormField
        label="Shift name"
        value={values.shift_name}
        onChangeText={(shift_name) => setField('shift_name', shift_name)}
        placeholder="Day / Evening / Night"
        autoCapitalize="words"
        maxLength={SHIFT_MAX_LENGTH}
        editable={!disabled}
        error={fieldErrors?.shift_name}
      />

      <View style={styles.priorityBlock}>
        <AppText variant="label" color="textMuted">
          Priority
        </AppText>
        <View style={styles.priorityRow}>
          {BRIEFING_PRIORITIES.map((priority) => {
            const selected = values.priority === priority;
            return (
              <Pressable
                key={priority}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => setField('priority', priority)}
                style={[styles.priorityChip, selected ? styles.prioritySelected : null]}>
                <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
                  {formatBriefingPriority(priority)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </View>

      <FormField
        label="Category"
        value={values.category}
        onChangeText={(category) => setField('category', category)}
        placeholder="Patrol, Investigations, …"
        autoCapitalize="words"
        maxLength={CATEGORY_MAX_LENGTH}
        editable={!disabled}
        error={fieldErrors?.category}
      />

      <FormField
        label="Case number (optional)"
        value={values.case_number}
        onChangeText={(case_number) => setField('case_number', case_number)}
        placeholder="Case / incident number"
        autoCapitalize="characters"
        maxLength={CASE_MAX_LENGTH}
        editable={!disabled}
        error={fieldErrors?.case_number}
      />

      <FormField
        label="Location (optional)"
        value={values.location}
        onChangeText={(location) => setField('location', location)}
        placeholder="Address or area"
        autoCapitalize="words"
        maxLength={LOCATION_MAX_LENGTH}
        editable={!disabled}
        error={fieldErrors?.location}
      />

      <FormField
        label="Tags (optional, comma-separated)"
        value={values.tagsText}
        onChangeText={(tagsText) => setField('tagsText', tagsText)}
        placeholder="bolo, traffic, downtown"
        autoCapitalize="none"
        editable={!disabled}
        error={fieldErrors?.tagsText}
      />

      <View style={styles.toggleRow}>
        <View style={styles.toggleCopy}>
          <AppText variant="label" color="textMuted">
            Requires acknowledgement
          </AppText>
          <AppText variant="caption" color="textSubtle">
            Personnel must confirm they have read this briefing.
          </AppText>
        </View>
        <Switch
          value={values.requires_acknowledgement}
          onValueChange={(requires_acknowledgement) =>
            setField('requires_acknowledgement', requires_acknowledgement)
          }
          disabled={disabled}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.text}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.lg,
  },
  bodyBlock: {
    gap: spacing.sm,
  },
  bodyInput: {
    minHeight: 160,
    paddingTop: spacing.md,
  },
  bulletButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  priorityBlock: {
    gap: spacing.sm,
  },
  priorityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  priorityChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
  },
  prioritySelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  toggleCopy: {
    flex: 1,
    gap: spacing.xs,
  },
});
