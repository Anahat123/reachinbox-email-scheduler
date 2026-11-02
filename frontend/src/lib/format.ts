// The Figma uses US-style 12h times ("9:15:12 AM") regardless of browser locale.
const LOCALE = 'en-US';

/** "Tue 9:15:12 AM" — the badge format used in the Figma list rows. */
export function formatBadgeTime(iso: string) {
  const d = new Date(iso);
  const day = d.toLocaleDateString(LOCALE, { weekday: 'short' });
  const time = d.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  return `${day} ${time}`;
}

/** "Nov 3, 10:23 AM" — used for sent times and the detail header. */
export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(LOCALE, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Value for <input type="datetime-local"> in the user's local time zone. */
export function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function pluralize(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
}
