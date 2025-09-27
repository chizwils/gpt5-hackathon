const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1]
];

export const formatRelativeTime = (iso: string | number | Date) => {
  const delta = (new Date(iso).getTime() - Date.now()) / 1000;

  for (const [unit, secondsInUnit] of units) {
    const value = delta / secondsInUnit;
    if (Math.abs(value) > 1) {
      return rtf.format(Math.round(value), unit);
    }
  }

  return 'just now';
};
