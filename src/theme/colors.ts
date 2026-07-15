export const colors = {
  background: '#07111F',
  sidebar: '#091423',
  surface: '#0E1C2E',
  surfaceRaised: '#142338',
  border: '#263750',
  primary: '#2F6FED',
  primarySoft: '#102A55',
  text: '#F7F9FC',
  textMuted: '#8092AD',
  textSubtle: '#566B89',
  success: '#26D6A1',
  warning: '#F5B942',
  danger: '#FF6470',
  transparent: 'transparent',
  overlay: 'rgba(7, 17, 31, 0.72)',
} as const;

export type ColorToken = keyof typeof colors;
