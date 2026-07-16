import { Platform, Share, StyleSheet, View } from 'react-native';

import { AppButton, AppText, InlineFormMessage } from '@/components/common';
import { spacing } from '@/theme';

export type InviteSuccessPanelProps = {
  inviteUrl: string;
  email: string;
  onDone: () => void;
};

async function copyInviteLink(inviteUrl: string): Promise<void> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(inviteUrl);
    return;
  }
  await Share.share({ message: inviteUrl });
}

export function InviteSuccessPanel({ inviteUrl, email, onDone }: InviteSuccessPanelProps) {
  return (
    <View style={styles.wrap}>
      <AppText variant="title">Invitation ready</AppText>
      <AppText variant="body" color="textMuted">
        Share this link only with {email}. The invitation code is shown once and cannot be retrieved
        again after you leave this screen.
      </AppText>

      <InlineFormMessage
        tone="info"
        message="Email delivery is not automated in this MVP. Copy the invitation link and share it manually."
      />

      <View style={styles.linkBox}>
        <AppText variant="caption" color="textSubtle">
          Invitation link
        </AppText>
        <AppText variant="body" selectable>
          {inviteUrl}
        </AppText>
      </View>

      <AppButton
        label="Copy invitation link"
        onPress={() => {
          void copyInviteLink(inviteUrl);
        }}
      />
      <AppButton label="Done" variant="secondary" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  linkBox: {
    gap: spacing.sm,
  },
});
