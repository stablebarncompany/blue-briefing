import { use } from 'react';

import { AgencyContext, type AgencyContextValue } from '@/services/agency/AgencyProvider';

export function useAgency(): AgencyContextValue {
  const value = use(AgencyContext);
  if (!value) {
    throw new Error('useAgency must be used within an AgencyProvider.');
  }
  return value;
}
