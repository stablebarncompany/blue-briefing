import { Platform } from 'react-native';

import type { BriefingAttachment } from '@/types/briefing-attachments';
import {
  formatAuthorName,
  formatBriefingDateTime,
  formatBriefingPriority,
  type BriefingWithMeta,
} from '@/types/briefings';

export function canPrintBriefing(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printBriefing(options: {
  agencyName: string;
  briefing: BriefingWithMeta;
  attachments?: BriefingAttachment[];
}): void {
  if (!canPrintBriefing()) {
    throw new Error('Printing is available on web in this MVP.');
  }

  const { briefing } = options;
  const printedAt = new Date().toLocaleString();
  const ackStatus = !briefing.requires_acknowledgement
    ? 'Not required'
    : briefing.acknowledged_by_me
      ? `Required · you acknowledged · ${briefing.acknowledgement_count} total`
      : `Required · awaiting your acknowledgement · ${briefing.acknowledgement_count} total`;

  const attachmentRows =
    (options.attachments ?? [])
      .map(
        (attachment) =>
          `<tr>
            <td>${escapeHtml(attachment.original_filename)}</td>
            <td>${escapeHtml(attachment.attachment_type)}</td>
            <td>${escapeHtml(attachment.mime_type)}</td>
            <td>${Math.round(attachment.size_bytes / 1024)} KB</td>
          </tr>`,
      )
      .join('') || '<tr><td colspan="4">No attachments.</td></tr>';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.agencyName)} — ${escapeHtml(briefing.title)}</title>
  <style>
    @page { margin: 0.75in; }
    body { font-family: Georgia, "Times New Roman", serif; color: #0b1c2c; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 18px; margin: 16px 0 8px; }
    .meta { font-size: 12px; color: #4a5d73; margin-bottom: 18px; line-height: 1.5; }
    .body { font-size: 14px; white-space: pre-wrap; line-height: 1.45; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #d5dde8; padding: 8px 6px; text-align: left; vertical-align: top; }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #4a5d73; }
    .priority { font-weight: bold; }
  </style>
</head>
<body>
  <h1>${escapeHtml(options.agencyName)}</h1>
  <h2>${escapeHtml(briefing.title)}</h2>
  <div class="meta">
    <span class="priority">Priority: ${escapeHtml(formatBriefingPriority(briefing.priority))}</span><br />
    Category: ${escapeHtml(briefing.category ?? '—')}<br />
    Shift: ${escapeHtml(briefing.shift_name ?? '—')}<br />
    Author: ${escapeHtml(formatAuthorName(briefing.author))}<br />
    Created: ${escapeHtml(formatBriefingDateTime(briefing.created_at))}<br />
    Acknowledgement: ${escapeHtml(ackStatus)}<br />
    Printed: ${escapeHtml(printedAt)}
  </div>
  <div class="body">${escapeHtml(briefing.body)}</div>
  <h2>Attachments</h2>
  <table>
    <thead>
      <tr>
        <th>Filename</th>
        <th>Type</th>
        <th>MIME</th>
        <th>Size</th>
      </tr>
    </thead>
    <tbody>
      ${attachmentRows}
    </tbody>
  </table>
</body>
</html>`;

  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720');
  if (!printWindow) {
    throw new Error('Unable to open print window. Allow pop-ups and try again.');
  }
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
