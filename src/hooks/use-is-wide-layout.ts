import { useWindowDimensions } from 'react-native';

import { layout } from '@/theme';

/** True for desktop and tablet widths that should use the sidebar shell. */
export function useIsWideLayout() {
  const { width } = useWindowDimensions();
  return width >= layout.wideBreakpoint;
}
