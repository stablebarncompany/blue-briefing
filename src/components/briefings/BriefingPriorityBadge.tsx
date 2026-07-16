import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common';
import { colors, radius, spacing, type ColorToken } from '@/theme';
import {
  formatBriefingPriority,
  type BriefingPriority,
} from '@/types/briefings';

const priorityColor: Record<BriefingPriority, ColorToken> = {
  critical: 'danger',
  high: 'warning',
  medium: 'primary',
  low: 'textMuted',
};

export type BriefingPriorityBadgeProps = {
  priority: BriefingPriority;
};

export function BriefingPriorityBadge({ priority }: BriefingPriorityBadgeProps) {
  const token = priorityColor[priority];
  return (
    <View
      style={[
        styles.badge,
        priority === 'critical' && styles.critical,
        { borderColor: colors[token] },
      ]}>
      <AppText variant="caption" color={token}>
        {formatBriefingPriority(priority)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.primarySoft,
  },
  critical: {
    backgroundColor: colors.surfaceRaised,
  },
});
