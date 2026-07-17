import { Platform } from 'react-native';

import type { PersonnelListFilters, PersonnelMember } from '@/types/personnel';
import {
  formatMembershipStatus,
  formatPersonnelRole,
  personnelDisplayName,
} from '@/types/personnel';
import type { PrintRosterMode } from '@/types/personnelProfiles';
import { formatEmploymentType, isEmploymentType } from '@/types/personnelProfiles';

export type PrintRosterOptions = {
  agencyName: string;
  members: PersonnelMember[];
  filters: PersonnelListFilters;
  mode?: PrintRosterMode;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function filterSummary(filters: PersonnelListFilters): string {
  const parts: string[] = [];
  if (filters.search?.trim()) {
    parts.push(`Search: ${filters.search.trim()}`);
  }
  if (filters.role && filters.role !== 'all') {
    parts.push(`Role: ${formatPersonnelRole(filters.role)}`);
  }
  if (filters.unit && filters.unit !== 'all') {
    parts.push(`Unit: ${filters.unit}`);
  }
  if (filters.shift && filters.shift !== 'all') {
    parts.push(`Shift: ${filters.shift}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Active directory';
}

function modeLabel(mode: PrintRosterMode): string {
  switch (mode) {
    case 'contact':
      return 'Contact roster';
    case 'assignment':
      return 'Assignment roster';
    default:
      return 'Basic roster';
  }
}

/** Web-only printable roster. Never includes emergency contacts. */
export function printPersonnelRoster(options: PrintRosterOptions): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return;
  }

  const mode = options.mode ?? 'basic';
  const printedAt = new Date().toLocaleString();

  const headers =
    mode === 'contact'
      ? ['Name', 'Role', 'Unit', 'Work phone', 'Email', 'Status']
      : mode === 'assignment'
        ? ['Name', 'Rank/Title', 'Role', 'Unit', 'Shift', 'Badge', 'Callsign', 'Employment']
        : ['Name', 'Role', 'Unit', 'Shift', 'Badge', 'Status'];

  const rows = options.members
    .map((member) => {
      const name = escapeHtml(personnelDisplayName(member));
      if (mode === 'contact') {
        return `<tr>
          <td>${name}</td>
          <td>${escapeHtml(formatPersonnelRole(member.role))}</td>
          <td>${escapeHtml(member.unit ?? '—')}</td>
          <td>${escapeHtml(member.work_phone ?? '—')}</td>
          <td>${escapeHtml(member.email ?? '—')}</td>
          <td>${escapeHtml(formatMembershipStatus(member.status))}</td>
        </tr>`;
      }
      if (mode === 'assignment') {
        const employment =
          member.employment_type && isEmploymentType(member.employment_type)
            ? formatEmploymentType(member.employment_type)
            : (member.employment_type ?? '—');
        return `<tr>
          <td>${name}</td>
          <td>${escapeHtml(member.rank || member.title || '—')}</td>
          <td>${escapeHtml(formatPersonnelRole(member.role))}</td>
          <td>${escapeHtml(member.unit ?? '—')}</td>
          <td>${escapeHtml(member.shift_name ?? '—')}</td>
          <td>${escapeHtml(member.badge_number ?? '—')}</td>
          <td>${escapeHtml(member.callsign ?? '—')}</td>
          <td>${escapeHtml(employment)}</td>
        </tr>`;
      }
      return `<tr>
        <td>${name}</td>
        <td>${escapeHtml(formatPersonnelRole(member.role))}</td>
        <td>${escapeHtml(member.unit ?? '—')}</td>
        <td>${escapeHtml(member.shift_name ?? '—')}</td>
        <td>${escapeHtml(member.badge_number ?? '—')}</td>
        <td>${escapeHtml(formatMembershipStatus(member.status))}</td>
      </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(options.agencyName)} Personnel Directory</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; color: #102033; margin: 32px; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .meta { color: #4a5d73; font-size: 12px; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #d5dde8; padding: 8px 6px; text-align: left; vertical-align: top; }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #4a5d73; }
    @media print { body { margin: 0.4in; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(options.agencyName)} — ${escapeHtml(modeLabel(mode))}</h1>
  <div class="meta">Printed ${escapeHtml(printedAt)} · ${escapeHtml(filterSummary(options.filters))} · Emergency contacts excluded</div>
  <table>
    <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=960,height=720');
  if (!printWindow) {
    throw new Error('Unable to open the print window. Check your browser pop-up settings.');
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export function canPrintRoster(): boolean {
  return Platform.OS === 'web';
}
