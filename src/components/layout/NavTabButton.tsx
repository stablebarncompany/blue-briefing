import { SymbolView } from 'expo-symbols';
import { type TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { type NavItem } from '@/constants/navigation';
import { colors, radius, spacing } from '@/theme';

export type NavTabButtonProps = TabTriggerSlotProps & {
  item: NavItem;
  compact?: boolean;
};

const NAV_ICONS = {
  home: { ios: 'house.fill', android: 'home', web: 'home' },
  briefings: { ios: 'doc.text.fill', android: 'description', web: 'description' },
  groups: { ios: 'person.3.fill', android: 'groups', web: 'groups' },
  messages: { ios: 'bubble.left.and.bubble.right.fill', android: 'chat', web: 'chat' },
  personnel: { ios: 'person.2.fill', android: 'group', web: 'group' },
} as const;

export function NavTabButton({
  item,
  isFocused,
  compact = false,
  style,
  ...props
}: NavTabButtonProps) {
  const icon = item.icon ? NAV_ICONS[item.icon] : null;
  const tint = isFocused ? colors.text : colors.textMuted;

  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      style={(state) => [
        styles.base,
        compact ? styles.compact : styles.expanded,
        isFocused && styles.focused,
        state.pressed && styles.pressed,
        typeof style === 'function' ? style(state) : style,
      ]}>
      {icon ? (
        <SymbolView name={icon as never} size={compact ? 18 : 20} tintColor={tint} />
      ) : (
        <View style={[styles.indicator, isFocused && styles.indicatorFocused]} />
      )}
      <AppText variant={compact ? 'caption' : 'label'} color={isFocused ? 'text' : 'textMuted'}>
        {item.label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.transparent,
  },
  expanded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  compact: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  focused: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.border,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.textSubtle,
  },
  indicatorFocused: {
    backgroundColor: colors.primary,
  },
  pressed: {
    opacity: 0.88,
  },
});
