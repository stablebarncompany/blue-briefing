import '@/global.css';

import { DarkTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { StyleSheet, View } from 'react-native';

import { AppShell } from '@/components/layout';
import { NAV_ITEMS } from '@/constants/navigation';
import { colors } from '@/theme';

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.background,
    card: colors.surface,
    border: colors.border,
    primary: colors.primary,
    text: colors.text,
  },
};

export default function RootLayout() {
  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style="light" />
      <View style={styles.root}>
        <Tabs>
          <AppShell>
            <TabSlot style={styles.slot} />
          </AppShell>
          <TabList style={styles.hiddenTabList}>
            {NAV_ITEMS.map((item) => (
              <TabTrigger key={item.name} name={item.name} href={item.href} />
            ))}
          </TabList>
        </Tabs>
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  slot: {
    flex: 1,
    height: '100%',
    backgroundColor: colors.background,
  },
  hiddenTabList: {
    display: 'none',
  },
});
