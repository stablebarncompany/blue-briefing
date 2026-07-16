import type { Href } from 'expo-router';

export type NavItem = {
  name: 'home' | 'briefings' | 'groups' | 'messages' | 'more';
  href: Href;
  label: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    name: 'home',
    href: '/' as Href,
    label: 'Home',
  },
  {
    name: 'briefings',
    href: '/briefings' as Href,
    label: 'Briefings',
  },
  {
    name: 'groups',
    href: '/groups' as Href,
    label: 'Groups',
  },
  {
    name: 'messages',
    href: '/messages' as Href,
    label: 'Messages',
  },
  {
    name: 'more',
    href: '/more' as Href,
    label: 'More',
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

export function briefingDetailHref(id: string): Href {
  return `/briefings/${id}` as Href;
}

export function groupDetailHref(id: string): Href {
  return `/groups/${id}` as Href;
}

export function conversationDetailHref(id: string): Href {
  return `/messages/${id}` as Href;
}
