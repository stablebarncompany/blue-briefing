import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { AppButton, AppText, InlineFormMessage } from '@/components/common';
import {
  BriefingAttachmentServiceError,
  createSignedAttachmentUrl,
  deleteBriefingAttachment,
  listBriefingAttachments,
} from '@/services/briefing-attachments';
import { colors, radius, spacing } from '@/theme';
import type { AgencyRole } from '@/types/agency';
import {
  canDeleteBriefingAttachment,
  formatAttachmentSize,
  type BriefingAttachment,
} from '@/types/briefing-attachments';

export type BriefingAttachmentsSectionProps = {
  agencyId: string;
  briefingId: string;
  briefingStatus: string;
  currentUserId: string | null;
  role: AgencyRole | null | undefined;
  refreshKey?: number;
};

export function BriefingAttachmentsSection({
  agencyId,
  briefingId,
  briefingStatus,
  currentUserId,
  role,
  refreshKey = 0,
}: BriefingAttachmentsSectionProps) {
  const [attachments, setAttachments] = useState<BriefingAttachment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const rows = await listBriefingAttachments({ agencyId, briefingId });
      setAttachments(rows);
    } catch (error) {
      const message =
        error instanceof BriefingAttachmentServiceError
          ? error.message
          : 'Unable to load attachments.';
      setErrorMessage(message);
      setAttachments([]);
    } finally {
      setIsLoading(false);
    }
  }, [agencyId, briefingId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load, refreshKey]);

  async function openAttachment(attachment: BriefingAttachment) {
    setBusyId(attachment.id);
    setErrorMessage(null);
    try {
      const signedUrl = await createSignedAttachmentUrl({
        agencyId,
        storagePath: attachment.storage_path,
      });

      if (attachment.attachment_type === 'image') {
        setPreviewTitle(attachment.original_filename);
        setPreviewUri(signedUrl);
        return;
      }

      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          window.open(signedUrl, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      // Expo Go-friendly: open the short-lived signed HTTPS URL in an in-app browser.
      await WebBrowser.openBrowserAsync(signedUrl);
    } catch (error) {
      const message =
        error instanceof BriefingAttachmentServiceError
          ? error.message
          : 'Unable to open attachment.';
      setErrorMessage(message);
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(attachment: BriefingAttachment) {
    const runDelete = async () => {
      setBusyId(attachment.id);
      setErrorMessage(null);
      try {
        await deleteBriefingAttachment({ agencyId, attachment });
        await load();
      } catch (error) {
        const message =
          error instanceof BriefingAttachmentServiceError
            ? error.message
            : 'Unable to delete attachment.';
        setErrorMessage(message);
      } finally {
        setBusyId(null);
      }
    };

    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined' &&
        window.confirm(`Remove “${attachment.original_filename}” from this briefing?`);
      if (confirmed) {
        void runDelete();
      }
      return;
    }

    Alert.alert('Remove attachment', `Remove “${attachment.original_filename}” from this briefing?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void runDelete() },
    ]);
  }

  const images = attachments.filter((item) => item.attachment_type === 'image');
  const documents = attachments.filter((item) => item.attachment_type === 'document');

  return (
    <View style={styles.wrap}>
      <AppText variant="title">Attachments</AppText>
      <AppText variant="caption" color="textSubtle">
        Operational attachments for this briefing. Not an evidence chain of custody.
      </AppText>

      {errorMessage ? <InlineFormMessage message={errorMessage} /> : null}

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="caption" color="textMuted">
            Loading attachments…
          </AppText>
        </View>
      ) : null}

      {!isLoading && attachments.length === 0 && !errorMessage ? (
        <AppText variant="caption" color="textSubtle">
          No attachments on this briefing.
        </AppText>
      ) : null}

      {!isLoading && images.length > 0 ? (
        <View style={styles.block}>
          <AppText variant="label" color="textMuted">
            Images
          </AppText>
          <View style={styles.gallery}>
            {images.map((attachment) => {
              const canDelete = canDeleteBriefingAttachment({
                role,
                uploadedBy: attachment.uploaded_by,
                currentUserId,
                briefingStatus,
              });
              return (
                <View key={attachment.id} style={styles.imageItem}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open image ${attachment.original_filename}`}
                    onPress={() => void openAttachment(attachment)}
                    style={styles.thumbPress}>
                    <AttachmentThumb
                      agencyId={agencyId}
                      attachment={attachment}
                      busy={busyId === attachment.id}
                    />
                  </Pressable>
                  {canDelete ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove image ${attachment.original_filename}`}
                      onPress={() => confirmDelete(attachment)}
                      style={styles.deleteChip}>
                      <AppText variant="caption" color="danger">
                        Remove
                      </AppText>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {!isLoading && documents.length > 0 ? (
        <View style={styles.block}>
          <AppText variant="label" color="textMuted">
            Documents
          </AppText>
          {documents.map((attachment) => {
            const canDelete = canDeleteBriefingAttachment({
              role,
              uploadedBy: attachment.uploaded_by,
              currentUserId,
              briefingStatus,
            });
            return (
              <View key={attachment.id} style={styles.docRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open document ${attachment.original_filename}`}
                  onPress={() => void openAttachment(attachment)}
                  style={styles.docOpenArea}
                  disabled={!!busyId}>
                  <View style={styles.docIcon}>
                    <AppText variant="caption" color="textMuted">
                      DOC
                    </AppText>
                  </View>
                  <View style={styles.docMeta}>
                    <AppText variant="body" numberOfLines={1}>
                      {attachment.original_filename}
                    </AppText>
                    <AppText variant="caption" color="textSubtle">
                      {attachment.mime_type} · {formatAttachmentSize(attachment.size_bytes)}
                    </AppText>
                  </View>
                </Pressable>
                <AppButton
                  label={Platform.OS === 'web' ? 'Open' : 'Open link'}
                  variant="ghost"
                  loading={busyId === attachment.id}
                  disabled={!!busyId}
                  onPress={() => void openAttachment(attachment)}
                  style={styles.docButton}
                  accessibilityLabel={`Open document ${attachment.original_filename}`}
                />
                {canDelete ? (
                  <AppButton
                    label="Remove"
                    variant="ghost"
                    disabled={!!busyId}
                    onPress={() => confirmDelete(attachment)}
                    style={styles.docButton}
                    accessibilityLabel={`Remove document ${attachment.original_filename}`}
                  />
                ) : null}
              </View>
            );
          })}
          {Platform.OS !== 'web' ? (
            <AppText variant="caption" color="textSubtle">
              Documents open via a short-lived secure link. Direct in-app viewers may be limited in
              Expo Go.
            </AppText>
          ) : null}
        </View>
      ) : null}

      <Modal
        visible={!!previewUri}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setPreviewUri(null);
          setPreviewTitle(null);
        }}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <AppText variant="title" numberOfLines={1}>
              {previewTitle ?? 'Image'}
            </AppText>
            {previewUri ? (
              <Image source={{ uri: previewUri }} style={styles.previewImage} contentFit="contain" />
            ) : null}
            <View style={styles.modalActions}>
              {previewUri && Platform.OS === 'web' ? (
                <AppButton
                  label="Open in new tab"
                  variant="secondary"
                  onPress={() => {
                    if (typeof window !== 'undefined' && previewUri) {
                      window.open(previewUri, '_blank', 'noopener,noreferrer');
                    }
                  }}
                />
              ) : null}
              {previewUri && Platform.OS !== 'web' ? (
                <AppButton
                  label="Open link"
                  variant="secondary"
                  onPress={() => {
                    if (previewUri) {
                      void Linking.openURL(previewUri);
                    }
                  }}
                />
              ) : null}
              <AppButton
                label="Close"
                variant="ghost"
                onPress={() => {
                  setPreviewUri(null);
                  setPreviewTitle(null);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function AttachmentThumb({
  agencyId,
  attachment,
  busy,
}: {
  agencyId: string;
  attachment: BriefingAttachment;
  busy: boolean;
}) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      void (async () => {
        try {
          const signed = await createSignedAttachmentUrl({
            agencyId,
            storagePath: attachment.storage_path,
          });
          if (!cancelled) {
            setUri(signed);
          }
        } catch {
          if (!cancelled) {
            setUri(null);
          }
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [agencyId, attachment.storage_path]);

  return (
    <View style={styles.thumbWrap}>
      {uri ? (
        <Image source={{ uri }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]}>
          {busy ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.md,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  block: {
    gap: spacing.sm,
  },
  gallery: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  imageItem: {
    gap: spacing.xs,
  },
  thumbPress: {
    alignSelf: 'flex-start',
  },
  thumbWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  thumb: {
    width: 96,
    height: 96,
    backgroundColor: colors.surfaceRaised,
  },
  thumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  deleteChip: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.xs,
  },
  docRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
  docOpenArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flex: 1,
    minWidth: 160,
  },
  docIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primarySoft,
  },
  docMeta: {
    flex: 1,
    minWidth: 120,
    gap: spacing.xxs,
  },
  docButton: {
    alignSelf: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing['2xl'],
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing['2xl'],
    gap: spacing.lg,
    maxHeight: '90%',
  },
  previewImage: {
    width: '100%',
    height: 360,
    backgroundColor: colors.surfaceRaised,
  },
  modalActions: {
    gap: spacing.sm,
  },
});
