import { Redirect } from 'expo-router';

import { PERSONNEL_HREF } from '@/constants/navigation';

/** Legacy More tab — account and personnel live under /personnel. */
export default function MoreRedirectScreen() {
  return <Redirect href={PERSONNEL_HREF} />;
}
