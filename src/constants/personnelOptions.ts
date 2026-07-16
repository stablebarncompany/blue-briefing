/** Suggested agency unit / division labels (organizational, not authorization). */
export const COMMON_AGENCY_UNITS = [
  'Administration',
  'Patrol',
  'Investigations',
  'Criminal Investigations',
  'Narcotics',
  'Traffic',
  'K9',
  'SWAT',
  'Special Operations',
  'Community Policing',
  'School Resource Officers',
  'Training',
  'Internal Affairs',
  'Records',
  'Communications / Dispatch',
  'Evidence / Property',
  'Crime Analysis',
  'Professional Standards',
  'Court Security',
  'Animal Control',
  'Emergency Management',
  'Marine Patrol',
  'Aviation',
  'Reserve Unit',
  'Civil Process',
  'Detention / Corrections',
] as const;

export const UNIT_OTHER_VALUE = '__other__';

/** Suggested specialized titles / classifications (display only). */
export const SPECIALIZED_TITLE_EXAMPLES = [
  'Crime Analyst',
  'Records Specialist',
  'Telecommunicator',
  'Reserve Officer',
  'Chaplain',
  'Animal Control',
  'Code Enforcement',
  'IT Administrator',
  'Evidence Technician',
  'School Resource Officer',
  'Cadet',
  'Intern',
] as const;

export function normalizeOptionLabel(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeOptionKey(value: string): string {
  return normalizeOptionLabel(value).toLowerCase();
}

export function mergeUniqueLabels(...groups: (readonly string[] | string[])[]): string[] {
  const map = new Map<string, string>();
  for (const group of groups) {
    for (const raw of group) {
      const cleaned = normalizeOptionLabel(raw);
      if (!cleaned || normalizeOptionKey(cleaned) === 'other') {
        continue;
      }
      const key = normalizeOptionKey(cleaned);
      if (!map.has(key)) {
        map.set(key, cleaned);
      }
    }
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}
