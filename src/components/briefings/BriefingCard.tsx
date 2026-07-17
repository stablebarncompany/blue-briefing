import { Pressable, StyleSheet, View } from 'react-native';

import { AppCard, AppText } from '@/components/common';
import { BriefingPriorityBadge } from '@/components/briefings/BriefingPriorityBadge';
import { CategoryAccent } from '@/components/briefings/CategoryAccent';
import { colors, spacing } from '@/theme';
import type { BriefingCategory } from '@/types/briefingCategories';
import {
  formatAuthorAssignment,
  formatAuthorName,
  formatBriefingDateTime,
  previewBriefingBody,
  type BriefingWithMeta,
} from '@/types/briefings';

export type BriefingCardProps = {
  briefing: BriefingWithMeta;
  onPress?: () => void;
  categories?: BriefingCategory[];
};

export function BriefingCard({ briefing, onPress, categories = [] }: BriefingCardProps) {
  const isCritical = briefing.priority === 'critical' && briefing.status === 'active';

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [pressed && onPress ? styles.pressed : null]}>
      <AppCard
        raised
        style={[styles.card, isCritical ? styles.criticalCard : null]}
        accessibilityLabel={`Briefing ${briefing.title}`}>
        <View style={styles.metaRow}>
          <BriefingPriorityBadge priority={briefing.priority} />
          {briefing.shift_name ? (
            <AppText variant="caption" color="textMuted">
              {briefing.shift_name}
            </AppText>
          ) : null}
          <AppText variant="caption" color="textSubtle" style={styles.date}>
            {formatBriefingDateTime(briefing.created_at)}
          </AppText>
        </View>

        <View style={styles.titleRow}>
          <AppText variant="title" style={styles.title}>
            {briefing.title}
          </AppText>
          {briefing.is_pinned ? (
            <AppText variant="caption" color="warning">
              Pinned
            </AppText>
          ) : null}
        </View>

        <AppText variant="caption" color="textMuted">
          {[formatAuthorName(briefing.author), formatAuthorAssignment(briefing.author)]
            .filter(Boolean)
            .join(' · ')}
        </AppText>

        <CategoryAccent
          categoryName={briefing.category}
          catalog={categories}
          compact
        />

        <AppText variant="body" color="textMuted" numberOfLines={3}>
          {previewBriefingBody(briefing.body)}
        </AppText>

        {briefing.location || briefing.case_number ? (
          <AppText variant="caption" color="textSubtle">
            {[briefing.case_number ? `Case ${briefing.case_number}` : null, briefing.location]
              .filter(Boolean)
              .join(' · ')}
          </AppText>
        ) : null}

        {briefing.tags.length > 0 ? (
          <View style={styles.tags}>
            {briefing.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <AppText variant="caption" color="textMuted">
                  {tag}
                </AppText>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.footer}>
          <AppText variant="caption" color="textSubtle">
            {briefing.acknowledgement_count} acknowledged
            {briefing.attachment_count > 0
              ? ` · ${briefing.attachment_count} attachment${briefing.attachment_count === 1 ? '' : 's'}`
              : ''}
          </AppText>
          {briefing.requires_acknowledgement ? (
            <AppText
              variant="caption"
              color={briefing.acknowledged_by_me ? 'success' : 'warning'}>
              {briefing.acknowledged_by_me ? 'You acknowledged' : 'Needs your acknowledgement'}
            </AppText>
          ) : null}
        </View>
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.92,
  },
  card: {
    gap: spacing.md,
  },
  criticalCard: {
    borderColor: colors.danger,
    borderWidth: 1.5,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  date: {
    marginLeft: 'auto',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tag: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
