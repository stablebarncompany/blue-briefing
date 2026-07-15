import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * Blue Briefing is a dark product surface. Prefer the platform scheme when available,
 * otherwise default to dark for SSR/static rendering.
 */
export function useColorScheme() {
  return useRNColorScheme() ?? 'dark';
}
