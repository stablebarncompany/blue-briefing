import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common';
import { colors, radius, spacing } from '@/theme';
import { formatBriefingPriority } from '@/types/briefings';
import type { BriefingTemplate } from '@/types/briefingTemplates';

export type TemplateSelectProps = {
  templates: BriefingTemplate[];
  selectedId: string | null;
  onSelect: (template: BriefingTemplate | null) => void;
  disabled?: boolean;
};

export function TemplateSelect({
  templates,
  selectedId,
  onSelect,
  disabled,
}: TemplateSelectProps) {
  if (templates.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <AppText variant="label" color="textSubtle">
        Template
      </AppText>
      <AppText variant="caption" color="textMuted">
        Optional. Selecting a template pre-fills fields you can still edit.
      </AppText>
      <View style={styles.chipRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: !selectedId }}
          disabled={disabled}
          onPress={() => onSelect(null)}
          style={[styles.chip, !selectedId ? styles.chipSelected : null]}>
          <AppText variant="caption" color={!selectedId ? 'text' : 'textMuted'}>
            None
          </AppText>
        </Pressable>
        {templates.map((template) => {
          const selected = selectedId === template.id;
          return (
            <Pressable
              key={template.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={disabled}
              onPress={() => onSelect(template)}
              style={[styles.chip, selected ? styles.chipSelected : null]}>
              <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
                {template.name}
              </AppText>
              <AppText variant="caption" color="textSubtle">
                {formatBriefingPriority(template.default_priority)}
                {template.category_name ? ` · ${template.category_name}` : ''}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
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
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
    maxWidth: '100%',
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
});
