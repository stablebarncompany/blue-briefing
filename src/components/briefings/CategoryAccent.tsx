import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common';
import { colors, radius, spacing } from '@/theme';
import {
  categoriesMatch,
  categoryAccentColor,
  formatCategoryIconLabel,
  type BriefingCategory,
} from '@/types/briefingCategories';

export type CategoryAccentProps = {
  categoryName: string | null | undefined;
  catalog?: BriefingCategory[];
  compact?: boolean;
};

export function CategoryAccent({ categoryName, catalog = [], compact }: CategoryAccentProps) {
  const label = categoryName?.trim();
  if (!label) {
    return null;
  }

  const match = catalog.find((category) => categoriesMatch(category.name, label));
  const accentToken = categoryAccentColor(match?.color_key);
  const accent = colors[accentToken];
  const iconLabel = formatCategoryIconLabel(match?.icon_key);

  return (
    <View
      style={[styles.wrap, compact ? styles.compact : null]}
      accessibilityLabel={`Category ${label}`}>
      <View style={[styles.bar, { backgroundColor: accent }]} />
      <AppText variant="caption" color="textMuted">
        {iconLabel ? `${iconLabel} · ${label}` : label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compact: {
    gap: spacing.xs,
  },
  bar: {
    width: 3,
    alignSelf: 'stretch',
    minHeight: 12,
    borderRadius: radius.sm,
  },
});
