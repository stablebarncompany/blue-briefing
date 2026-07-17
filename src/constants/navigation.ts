import type { Href } from 'expo-router';

export type NavItem = {
  name: 'home' | 'briefings' | 'groups' | 'messages' | 'personnel';
  href: Href;
  label: string;
  icon?: 'home' | 'briefings' | 'groups' | 'messages' | 'personnel';
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    name: 'home',
    href: '/' as Href,
    label: 'Home',
    icon: 'home',
  },
  {
    name: 'briefings',
    href: '/briefings' as Href,
    label: 'Briefings',
    icon: 'briefings',
  },
  {
    name: 'groups',
    href: '/groups' as Href,
    label: 'Groups',
    icon: 'groups',
  },
  {
    name: 'messages',
    href: '/messages' as Href,
    label: 'Messages',
    icon: 'messages',
  },
  {
    name: 'personnel',
    href: '/personnel' as Href,
    label: 'Personnel',
    icon: 'personnel',
  },
];

export const PRODUCT_NAME = 'Blue Briefing';
export const APP_HOME_HREF = '/' as Href;
export const BRIEFINGS_HREF = '/briefings' as Href;
export const BRIEFINGS_CREATE_HREF = '/briefings/create' as Href;
export const GROUPS_HREF = '/groups' as Href;
export const GROUPS_CREATE_HREF = '/groups/create' as Href;
export const MESSAGES_HREF = '/messages' as Href;
export const MESSAGES_NEW_HREF = '/messages/new' as Href;
export const MORE_HREF = '/more' as Href;
export const PERSONNEL_HREF = '/personnel' as Href;
export const PERSONNEL_INVITE_HREF = '/personnel/invite' as Href;
export const NOTIFICATIONS_HREF = '/notifications' as Href;
export const ACCEPT_INVITE_HREF = '/accept-invite' as Href;
export const SIGN_IN_HREF = '/sign-in' as Href;
export const SIGN_UP_HREF = '/sign-up' as Href;
export const WELCOME_HREF = '/welcome' as Href;
export const PENDING_ACCESS_HREF = '/pending-access' as Href;
export const SELECT_AGENCY_HREF = '/select-agency' as Href;

export function briefingDetailHref(id: string): Href {
  return `/briefings/${id}` as Href;
}

export function groupDetailHref(id: string): Href {
  return `/groups/${id}` as Href;
}

export function conversationDetailHref(id: string): Href {
  return `/messages/${id}` as Href;
}

/** Profile route keyed by agency member user id. */
export function personnelMemberHref(userId: string): Href {
  return `/personnel/${userId}` as Href;
}

export function personnelProfileHref(userId: string): Href {
  return personnelMemberHref(userId);
}
