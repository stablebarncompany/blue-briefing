import { Platform } from 'react-native';

import type { AgencyShift, PersonnelShiftAssignment } from '@/types/shifts';
import {
  assignmentDisplayName,
  formatShiftAssignmentType,
  formatShiftHours,
} from '@/types/shifts';

export function canPrintShiftRoster(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function printShiftRoster(options: {
  agencyName: string;
  shift: AgencyShift;
  supervisors: string[];
  assignments: PersonnelShiftAssignment[];
}): void {
  if (!canPrintShiftRoster()) {
    throw new Error('Printing is available on web in this MVP.');
  }

  const printedAt = new Date().toLocaleString();
  const hours = formatShiftHours(options.shift.start_time, options.shift.end_time);
  const supervisors =
    options.supervisors.length > 0 ? options.supervisors.join(', ') : 'None assigned';

  const rows = options.assignments
    .map((assignment) => {
      const name = assignmentDisplayName(assignment);
      const rankTitle = [assignment.rank, assignment.title].filter(Boolean).join(' / ') || '—';
      return `<tr>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(rankTitle)}</td>
        <td>${escapeHtml(assignment.unit ?? '—')}</td>
        <td>${escapeHtml(assignment.badge_number ?? '—')}</td>
        <td>${escapeHtml(formatShiftAssignmentType(assignment.assignment_type))}</td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.agencyName)} — ${escapeHtml(options.shift.name)} Roster</title>
  <style>
    @page { margin: 0.75in; }
    body { font-family: Georgia, "Times New Roman", serif; color: #0b1c2c; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    h2 { font-size: 16px; margin: 0 0 12px; font-weight: normal; }
    .meta { font-size: 12px; color: #4a5d73; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border-bottom: 1px solid #d5dde8; padding: 8px 6px; text-align: left; vertical-align: top; }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #4a5d73; }
  </style>
</head>
<body>
  <h1>${escapeHtml(options.agencyName)}</h1>
  <h2>Shift Roster — ${escapeHtml(options.shift.name)}</h2>
  <div class="meta">
    Hours: ${escapeHtml(hours)}<br />
    Supervisors: ${escapeHtml(supervisors)}<br />
    Printed: ${escapeHtml(printedAt)}
  </div>
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Rank / Title</th>
        <th>Unit</th>
        <th>Badge</th>
        <th>Assignment</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5">No assigned personnel.</td></tr>'}
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
