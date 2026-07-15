import { colors, type ColorToken } from './colors';
import { spacing, type SpacingToken } from './spacing';
import { typography, fontFamilies, type TypographyVariant } from './typography';
import { radius, type RadiusToken } from './radius';
import { shadows, type ShadowToken } from './shadows';

export { colors, type ColorToken };
export { spacing, type SpacingToken };
export { typography, fontFamilies, type TypographyVariant };
export { radius, type RadiusToken };
export { shadows, type ShadowToken };

export const layout = {
  sidebarWidth: 248,
  topBarHeight: 64,
  bottomNavHeight: 72,
  maxContentWidth: 960,
  wideBreakpoint: 768,
} as const;

export const theme = {
  colors,
  spacing,
  typography,
  radius,
  shadows,
  layout,
} as const;

export type Theme = typeof theme;
