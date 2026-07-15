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
    href: '/briefings',
    label: 'Briefings',
  },
  {
    name: 'groups',
    href: '/groups',
    label: 'Groups',
  },
  {
    name: 'messages',
    href: '/messages',
    label: 'Messages',
  },
  {
    name: 'more',
    href: '/more',
    label: 'More',
  },
];

export const PRODUCT_NAME = 'Blue Briefing';
export const APP_HOME_HREF = '/' as Href;
