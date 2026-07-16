/**
 * Briefing attachment domain types (hand-maintained; aligned to SQL migration).
 */

import type { AgencyRole } from '@/types/agency';
import { canSuperviseBriefings } from '@/types/briefings';

export const BRIEFING_ATTACHMENT_TYPES = ['image', 'document'] as const;
export type BriefingAttachmentType = (typeof BRIEFING_ATTACHMENT_TYPES)[number];

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

export type AllowedAttachmentMimeType = (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];

export const ATTACHMENT_MAX_BYTES = 6 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_BRIEFING = 10;
export const ATTACHMENT_SIGNED_URL_SECONDS = 10 * 60;
export const BRIEFING_ATTACHMENTS_BUCKET = 'briefing-attachments';

export const IMAGE_MIME_TYPES: readonly AllowedAttachmentMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];

export const DOCUMENT_MIME_TYPES: readonly AllowedAttachmentMimeType[] = [
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export type BriefingAttachment = {
  id: string;
  briefing_id: string;
  agency_id: string;
  uploaded_by: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  attachment_type: BriefingAttachmentType;
  created_at: string;
};

export type PendingAttachment = {
  localId: string;
  uri: string;
  originalFilename: string;
  mimeType: AllowedAttachmentMimeType;
  sizeBytes: number;
  attachmentType: BriefingAttachmentType;
};

export type UploadAttachmentInput = {
  agencyId: string;
  briefingId: string;
  uploadedBy: string;
  pending: PendingAttachment;
};

export function isAllowedAttachmentMimeType(value: string): value is AllowedAttachmentMimeType {
  return (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(value);
}

export function attachmentTypeForMime(mimeType: string): BriefingAttachmentType | null {
  if ((IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return 'image';
  }
  if ((DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return 'document';
  }
  return null;
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function canDeleteBriefingAttachment(options: {
  role: AgencyRole | null | undefined;
  uploadedBy: string;
  currentUserId: string | null | undefined;
  briefingStatus: string;
}): boolean {
  if (!options.currentUserId) {
    return false;
  }
  if (canSuperviseBriefings(options.role)) {
    return true;
  }
  return options.uploadedBy === options.currentUserId && options.briefingStatus === 'active';
}
