import { Platform, ViewStyle } from 'react-native';

import { colors } from './colors';

const webShadow = (value: string): ViewStyle =>
  Platform.OS === 'web' ? ({ boxShadow: value } as ViewStyle) : {};

export const shadows = {
  none: {} as ViewStyle,
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: colors.background,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
    },
    android: {
      elevation: 4,
    },
    default: webShadow('0 10px 30px rgba(0, 0, 0, 0.28)'),
  })!,
  raised: Platform.select<ViewStyle>({
    ios: {
      shadowColor: colors.background,
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.4,
      shadowRadius: 24,
    },
    android: {
      elevation: 8,
    },
    default: webShadow('0 16px 40px rgba(0, 0, 0, 0.35)'),
  })!,
} as const;

export type ShadowToken = keyof typeof shadows;
