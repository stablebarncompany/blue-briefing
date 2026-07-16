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

export function briefingDetailHref(id: string): Href {
  return `/briefings/${id}` as Href;
}
