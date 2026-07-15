export type AppRouteHref = '/' | '/briefings' | '/groups' | '/messages' | '/more';

export type NavItem = {
  name: 'home' | 'briefings' | 'groups' | 'messages' | 'more';
  href: AppRouteHref;
  label: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
  {
    name: 'home',
    href: '/',
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
