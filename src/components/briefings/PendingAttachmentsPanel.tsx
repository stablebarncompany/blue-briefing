import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppText } from '@/components/common';
import { colors, radius, spacing } from '@/theme';
import {
  ATTACHMENT_MAX_PER_BRIEFING,
  formatAttachmentSize,
  type PendingAttachment,
} from '@/types/briefing-attachments';

export type PendingAttachmentsPanelProps = {
  attachments: PendingAttachment[];
  disabled?: boolean;
  uploading?: boolean;
  uploadProgressLabel?: string | null;
  onAddPhotos: () => void;
  onAddDocuments: () => void;
  onRemove: (localId: string) => void;
};

export function PendingAttachmentsPanel({
  attachments,
  disabled,
  uploading,
  uploadProgressLabel,
  onAddPhotos,
  onAddDocuments,
  onRemove,
}: PendingAttachmentsPanelProps) {
  const remaining = ATTACHMENT_MAX_PER_BRIEFING - attachments.length;

  return (
    <View style={styles.wrap}>
      <AppText variant="title">Operational attachments</AppText>
      <AppText variant="caption" color="textSubtle">
        Follow your agency’s policy before uploading sensitive or evidentiary material.
      </AppText>
      <AppText variant="caption" color="textMuted">
        {attachments.length}/{ATTACHMENT_MAX_PER_BRIEFING} selected
        {remaining > 0 ? ` · ${remaining} remaining` : ' · limit reached'}
      </AppText>

      <View style={styles.actions}>
        <AppButton
          label="Add Photos"
          variant="secondary"
          disabled={disabled || uploading || remaining <= 0}
          onPress={onAddPhotos}
        />
        <AppButton
          label="Add Documents"
          variant="secondary"
          disabled={disabled || uploading || remaining <= 0}
          onPress={onAddDocuments}
        />
      </View>

      {uploadProgressLabel ? (
        <AppText variant="caption" color="primary">
          {uploadProgressLabel}
        </AppText>
      ) : null}

      {attachments.length === 0 ? (
        <AppText variant="caption" color="textSubtle">
          No attachments selected.
        </AppText>
      ) : (
        <View style={styles.list}>
          {attachments.map((item) => (
            <View key={item.localId} style={styles.row}>
              {item.attachmentType === 'image' ? (
                <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" />
              ) : (
                <View style={styles.docIcon}>
                  <AppText variant="caption" color="textMuted">
                    DOC
                  </AppText>
                </View>
              )}
              <View style={styles.meta}>
                <AppText variant="body" numberOfLines={1}>
                  {item.originalFilename}
                </AppText>
                <AppText variant="caption" color="textSubtle">
                  {item.attachmentType === 'image' ? 'Image' : 'Document'} ·{' '}
                  {formatAttachmentSize(item.sizeBytes)}
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={disabled || uploading}
                onPress={() => onRemove(item.localId)}
                style={styles.remove}>
                <AppText variant="caption" color="danger">
                  Remove
                </AppText>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  docIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  meta: {
    flex: 1,
    gap: spacing.xxs,
  },
  remove: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
});
