import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common';
import { useIsWideLayout } from '@/hooks/use-is-wide-layout';
import { colors, radius, spacing } from '@/theme';
import {
  BRIEFING_QUICK_VIEW_LABELS,
  BRIEFING_QUICK_VIEWS,
  type BriefingQuickView,
} from '@/types/briefingQuickViews';

export type BriefingQuickViewsBarProps = {
  value: BriefingQuickView;
  onChange: (view: BriefingQuickView) => void;
};

export function BriefingQuickViewsBar({ value, onChange }: BriefingQuickViewsBarProps) {
  const isWide = useIsWideLayout();

  const chips = BRIEFING_QUICK_VIEWS.map((view) => {
    const selected = value === view;
    return (
      <Pressable
        key={view}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={BRIEFING_QUICK_VIEW_LABELS[view]}
        onPress={() => onChange(view)}
        style={[styles.chip, selected ? styles.chipSelected : null]}>
        <AppText variant="caption" color={selected ? 'text' : 'textMuted'}>
          {BRIEFING_QUICK_VIEW_LABELS[view]}
        </AppText>
        {selected ? (
          <AppText variant="caption" color="primary">
            Active
          </AppText>
        ) : null}
      </Pressable>
    );
  });

  return (
    <View style={styles.wrap}>
      <AppText variant="label" color="textSubtle">
        Quick view
      </AppText>
      {isWide ? (
        <View style={styles.wrapRow}>{chips}</View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          {chips}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  scrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    gap: 2,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
  },
});
