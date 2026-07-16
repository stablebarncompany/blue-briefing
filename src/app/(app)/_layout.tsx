import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { StyleSheet } from 'react-native';

import { AppShell } from '@/components/layout';
import { MORE_HREF, NAV_ITEMS } from '@/constants/navigation';
import { colors } from '@/theme';

export default function AppLayout() {
  return (
    <Tabs>
      <AppShell>
        <TabSlot style={styles.slot} />
      </AppShell>
      <TabList style={styles.hiddenTabList}>
        {NAV_ITEMS.map((item) => (
          <TabTrigger key={item.name} name={item.name} href={item.href} />
        ))}
        {/* Legacy /more path remains reachable and redirects into Personnel. */}
        <TabTrigger name="more" href={MORE_HREF} />
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    height: '100%',
    backgroundColor: colors.background,
  },
  hiddenTabList: {
    display: 'none',
  },
});
