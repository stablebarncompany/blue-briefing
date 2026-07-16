import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '@/services/supabase';
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_PER_BRIEFING,
  ATTACHMENT_SIGNED_URL_SECONDS,
  BRIEFING_ATTACHMENTS_BUCKET,
  DOCUMENT_MIME_TYPES,
  IMAGE_MIME_TYPES,
  attachmentTypeForMime,
  isAllowedAttachmentMimeType,
  type AllowedAttachmentMimeType,
  type BriefingAttachment,
  type PendingAttachment,
  type UploadAttachmentInput,
} from '@/types/briefing-attachments';

export class BriefingAttachmentServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BriefingAttachmentServiceError';
  }
}

const EXT_BY_MIME: Record<AllowedAttachmentMimeType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

const MIME_BY_EXT: Record<string, AllowedAttachmentMimeType> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  txt: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

function requireAgencyId(agencyId: string | null | undefined): string {
  if (!agencyId) {
    throw new BriefingAttachmentServiceError('No agency is selected. Choose an agency to continue.');
  }
  return agencyId;
}

function createLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extensionFromFilename(filename: string): string {
  const parts = filename.trim().toLowerCase().split('.');
  if (parts.length < 2) {
    return '';
  }
  return parts[parts.length - 1] ?? '';
}

function normalizeMimeType(mimeType: string | null | undefined, filename: string): string {
  const trimmed = mimeType?.trim().toLowerCase() ?? '';
  if (trimmed && trimmed !== 'application/octet-stream') {
    return trimmed;
  }
  const ext = extensionFromFilename(filename);
  return MIME_BY_EXT[ext] ?? trimmed;
}

function mapAttachment(row: Record<string, unknown>): BriefingAttachment {
  const attachmentType = String(row.attachment_type);
  if (attachmentType !== 'image' && attachmentType !== 'document') {
    throw new BriefingAttachmentServiceError('Received an invalid attachment record.');
  }
  return {
    id: String(row.id),
    briefing_id: String(row.briefing_id),
    agency_id: String(row.agency_id),
    uploaded_by: String(row.uploaded_by),
    storage_path: String(row.storage_path),
    original_filename: String(row.original_filename),
    mime_type: String(row.mime_type),
    size_bytes: Number(row.size_bytes),
    attachment_type: attachmentType,
    created_at: String(row.created_at),
  };
}

function buildStoragePath(options: {
  agencyId: string;
  briefingId: string;
  mimeType: AllowedAttachmentMimeType;
}): string {
  const ext = EXT_BY_MIME[options.mimeType];
  const generated = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${options.agencyId}/${options.briefingId}/${generated}.${ext}`;
}

async function readUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new BriefingAttachmentServiceError('Unable to read the selected file.');
    }
    return response.arrayBuffer();
  }

  try {
    const file = new ExpoFile(uri);
    return await file.arrayBuffer();
  } catch {
    throw new BriefingAttachmentServiceError('Unable to read the selected file on this device.');
  }
}

async function resolveFileSize(uri: string, reported: number | null | undefined): Promise<number> {
  if (reported && reported > 0) {
    return reported;
  }
  const bytes = await readUriAsArrayBuffer(uri);
  return bytes.byteLength;
}

export function validateAttachment(input: {
  originalFilename: string;
  mimeType: string | null | undefined;
  sizeBytes: number | null | undefined;
}): { ok: true; pendingBase: Omit<PendingAttachment, 'localId' | 'uri'> } | { ok: false; error: string } {
  const originalFilename = input.originalFilename?.trim() || 'attachment';
  const mimeType = normalizeMimeType(input.mimeType, originalFilename);
  const sizeBytes = input.sizeBytes ?? 0;
  const actualExt = extensionFromFilename(originalFilename);

  if (!isAllowedAttachmentMimeType(mimeType)) {
    return {
      ok: false,
      error: 'That file type is not allowed. Use JPEG, PNG, WebP, PDF, TXT, DOCX, or XLSX.',
    };
  }

  if (actualExt) {
    const mimeFromExt = MIME_BY_EXT[actualExt];
    if (!mimeFromExt) {
      return {
        ok: false,
        error: `Unsupported file extension .${actualExt}.`,
      };
    }
    if (mimeFromExt !== mimeType) {
      return {
        ok: false,
        error: 'File extension does not match the detected file type.',
      };
    }
  }

  if (!sizeBytes || sizeBytes <= 0) {
    return { ok: false, error: 'Unable to determine file size.' };
  }
  if (sizeBytes > ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: 'Each attachment must be 6 MB or smaller.' };
  }

  const attachmentType = attachmentTypeForMime(mimeType);
  if (!attachmentType) {
    return { ok: false, error: 'That file type is not allowed.' };
  }

  return {
    ok: true,
    pendingBase: {
      originalFilename,
      mimeType,
      sizeBytes,
      attachmentType,
    },
  };
}

export async function pickBriefingImages(options: {
  remainingSlots: number;
}): Promise<PendingAttachment[]> {
  if (options.remainingSlots <= 0) {
    throw new BriefingAttachmentServiceError(
      `A briefing may include at most ${ATTACHMENT_MAX_PER_BRIEFING} attachments.`,
    );
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new BriefingAttachmentServiceError(
      'Photo library access is required to attach images.',
    );
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: options.remainingSlots,
    quality: 0.85,
    exif: false,
  });

  if (result.canceled) {
    return [];
  }

  const pending: PendingAttachment[] = [];
  for (const asset of result.assets) {
    const filename =
      asset.fileName?.trim() ||
      `photo.${asset.mimeType === 'image/png' ? 'png' : asset.mimeType === 'image/webp' ? 'webp' : 'jpg'}`;
    const sizeBytes = await resolveFileSize(asset.uri, asset.fileSize);
    const validated = validateAttachment({
      originalFilename: filename,
      mimeType: asset.mimeType ?? 'image/jpeg',
      sizeBytes,
    });
    if (!validated.ok) {
      throw new BriefingAttachmentServiceError(validated.error);
    }
    if (!(IMAGE_MIME_TYPES as readonly string[]).includes(validated.pendingBase.mimeType)) {
      throw new BriefingAttachmentServiceError('Only image files can be added with Add Photos.');
    }
    pending.push({
      localId: createLocalId(),
      uri: asset.uri,
      ...validated.pendingBase,
    });
  }
  return pending;
}

export async function pickBriefingDocuments(options: {
  remainingSlots: number;
}): Promise<PendingAttachment[]> {
  if (options.remainingSlots <= 0) {
    throw new BriefingAttachmentServiceError(
      `A briefing may include at most ${ATTACHMENT_MAX_PER_BRIEFING} attachments.`,
    );
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: [...DOCUMENT_MIME_TYPES],
    multiple: true,
    copyToCacheDirectory: true,
  });

  if (result.canceled) {
    return [];
  }

  const assets = result.assets.slice(0, options.remainingSlots);
  const pending: PendingAttachment[] = [];
  for (const asset of assets) {
    const sizeBytes = await resolveFileSize(asset.uri, asset.size);
    const validated = validateAttachment({
      originalFilename: asset.name,
      mimeType: asset.mimeType,
      sizeBytes,
    });
    if (!validated.ok) {
      throw new BriefingAttachmentServiceError(validated.error);
    }
    if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(validated.pendingBase.mimeType)) {
      throw new BriefingAttachmentServiceError('Only document files can be added with Add Documents.');
    }
    pending.push({
      localId: createLocalId(),
      uri: asset.uri,
      ...validated.pendingBase,
    });
  }
  return pending;
}

export async function listBriefingAttachments(options: {
  agencyId: string;
  briefingId: string;
}): Promise<BriefingAttachment[]> {
  const agencyId = requireAgencyId(options.agencyId);
  const { data, error } = await supabase
    .from('briefing_attachments')
    .select(
      'id, briefing_id, agency_id, uploaded_by, storage_path, original_filename, mime_type, size_bytes, attachment_type, created_at',
    )
    .eq('agency_id', agencyId)
    .eq('briefing_id', options.briefingId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new BriefingAttachmentServiceError(error.message || 'Unable to load attachments.');
  }

  return (data ?? []).map((row) => mapAttachment(row as Record<string, unknown>));
}

export async function createSignedAttachmentUrl(options: {
  agencyId: string;
  storagePath: string;
}): Promise<string> {
  requireAgencyId(options.agencyId);
  if (!options.storagePath.startsWith(`${options.agencyId}/`)) {
    throw new BriefingAttachmentServiceError('Attachment path does not match the selected agency.');
  }

  const { data, error } = await supabase.storage
    .from(BRIEFING_ATTACHMENTS_BUCKET)
    .createSignedUrl(options.storagePath, ATTACHMENT_SIGNED_URL_SECONDS);

  if (error || !data?.signedUrl) {
    throw new BriefingAttachmentServiceError(error?.message || 'Unable to open attachment.');
  }
  return data.signedUrl;
}

export async function uploadBriefingAttachment(
  input: UploadAttachmentInput,
): Promise<BriefingAttachment> {
  const agencyId = requireAgencyId(input.agencyId);
  const validated = validateAttachment({
    originalFilename: input.pending.originalFilename,
    mimeType: input.pending.mimeType,
    sizeBytes: input.pending.sizeBytes,
  });
  if (!validated.ok) {
    throw new BriefingAttachmentServiceError(validated.error);
  }

  const existing = await listBriefingAttachments({
    agencyId,
    briefingId: input.briefingId,
  });
  if (existing.length >= ATTACHMENT_MAX_PER_BRIEFING) {
    throw new BriefingAttachmentServiceError(
      `A briefing may include at most ${ATTACHMENT_MAX_PER_BRIEFING} attachments.`,
    );
  }

  const storagePath = buildStoragePath({
    agencyId,
    briefingId: input.briefingId,
    mimeType: validated.pendingBase.mimeType,
  });

  const bytes = await readUriAsArrayBuffer(input.pending.uri);
  if (bytes.byteLength > ATTACHMENT_MAX_BYTES) {
    throw new BriefingAttachmentServiceError('Each attachment must be 6 MB or smaller.');
  }

  const { error: uploadError } = await supabase.storage
    .from(BRIEFING_ATTACHMENTS_BUCKET)
    .upload(storagePath, bytes, {
      contentType: validated.pendingBase.mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new BriefingAttachmentServiceError(uploadError.message || 'Unable to upload attachment.');
  }

  const { data, error: insertError } = await supabase
    .from('briefing_attachments')
    .insert({
      briefing_id: input.briefingId,
      agency_id: agencyId,
      uploaded_by: input.uploadedBy,
      storage_path: storagePath,
      original_filename: validated.pendingBase.originalFilename,
      mime_type: validated.pendingBase.mimeType,
      size_bytes: validated.pendingBase.sizeBytes,
      attachment_type: validated.pendingBase.attachmentType,
    })
    .select(
      'id, briefing_id, agency_id, uploaded_by, storage_path, original_filename, mime_type, size_bytes, attachment_type, created_at',
    )
    .single();

  if (insertError || !data) {
    await supabase.storage.from(BRIEFING_ATTACHMENTS_BUCKET).remove([storagePath]);
    throw new BriefingAttachmentServiceError(
      insertError?.message || 'Unable to save attachment metadata.',
    );
  }

  return mapAttachment(data as Record<string, unknown>);
}

export async function deleteBriefingAttachment(options: {
  agencyId: string;
  attachment: BriefingAttachment;
}): Promise<void> {
  const agencyId = requireAgencyId(options.agencyId);
  if (options.attachment.agency_id !== agencyId) {
    throw new BriefingAttachmentServiceError('Attachment does not belong to the selected agency.');
  }

  const { error: deleteMetaError } = await supabase
    .from('briefing_attachments')
    .delete()
    .eq('agency_id', agencyId)
    .eq('id', options.attachment.id);

  if (deleteMetaError) {
    throw new BriefingAttachmentServiceError(
      deleteMetaError.message || 'Unable to delete attachment.',
    );
  }

  const { error: storageError } = await supabase.storage
    .from(BRIEFING_ATTACHMENTS_BUCKET)
    .remove([options.attachment.storage_path]);

  if (storageError) {
    throw new BriefingAttachmentServiceError(
      storageError.message || 'Attachment record removed, but storage cleanup failed.',
    );
  }
}
