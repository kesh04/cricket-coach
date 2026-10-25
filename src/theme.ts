// Design tokens. The palette comes from the game itself: outfield green,
// cricket whites, the red leather ball and the willow of the bat.
export const C = {
  bg: '#F2F5F1',
  surface: '#FFFFFF',
  ink: '#10231B',
  inkSoft: '#51615A',
  inkMute: '#8A9790',
  line: '#D5DDD7',
  outfield: '#0B5D3B',
  outfieldDeep: '#083F29',
  outfieldTint: '#E3EFE8',
  ball: '#B3202A',
  ballTint: '#F8E4E5',
  willow: '#E0BE7C',
  willowDeep: '#B98F45',
  pitch: '#EADFB8',
  good: '#1E7F4F',
  warn: '#A86400',
  warnTint: '#FBEFD6',
  bad: '#B3202A',
  night: '#0A1612',
} as const;

export const F = {
  display: 'BarlowCondensed_600SemiBold',
  displayBold: 'BarlowCondensed_700Bold',
} as const;

export const R = { sm: 8, md: 14, lg: 22, pill: 999 } as const;

/** Spacing on a 4pt grid. */
export const sp = (n: number) => n * 4;

export type Status = 'good' | 'fair' | 'poor';

export const statusColor: Record<Status, string> = {
  good: C.good,
  fair: C.warn,
  poor: C.bad,
};

export const statusLabel: Record<Status, string> = {
  good: 'Good',
  fair: 'Nearly',
  poor: 'Fix this',
};

export const statusIcon: Record<Status, 'checkmark-circle' | 'alert-circle' | 'close-circle'> = {
  good: 'checkmark-circle',
  fair: 'alert-circle',
  poor: 'close-circle',
};
