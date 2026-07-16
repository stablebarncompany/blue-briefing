import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { StyleSheet } from 'react-native';

import { AppShell } from '@/components/layout';
import { NotificationRealtimeHost } from '@/components/notifications/NotificationRealtimeHost';
import { PushNotificationBootstrap } from '@/components/notifications/PushNotificationBootstrap';
import { MORE_HREF, NAV_ITEMS, NOTIFICATIONS_HREF } from '@/constants/navigation';
import { colors } from '@/theme';

export default function AppLayout() {
  return (
    <Tabs>
      <NotificationRealtimeHost />
      <PushNotificationBootstrap />
      <AppShell>
        <TabSlot style={styles.slot} />
      </AppShell>
      <TabList style={styles.hiddenTabList}>
        {NAV_ITEMS.map((item) => (
          <TabTrigger key={item.name} name={item.name} href={item.href} />
        ))}
        {/* Reachable from TopBar bell; not shown in primary nav. */}
        <TabTrigger name="notifications" href={NOTIFICATIONS_HREF} />
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
