import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { DesktopSidebar } from '@/components/layout/DesktopSidebar';
import { MobileBottomNav } from '@/components/layout/MobileBottomNav';
import { TopBar } from '@/components/layout/TopBar';
import { useIsWideLayout } from '@/hooks/use-is-wide-layout';
import { colors } from '@/theme';

export type AppShellProps = {
  children: ReactNode;
  title?: string;
};

export function AppShell({ children, title }: AppShellProps) {
  const isWide = useIsWideLayout();

  return (
    <View style={styles.root}>
      {isWide ? <DesktopSidebar /> : null}
      <View style={styles.main}>
        <TopBar title={title} />
        <View style={styles.content}>{children}</View>
        {!isWide ? <MobileBottomNav /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.background,
  },
  main: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
});
