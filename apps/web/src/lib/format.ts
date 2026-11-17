import type { SportId, UserSettings } from '../types';

const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function coins(n: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(n);
  const s = Number.isInteger(Math.round(abs * 100) / 100) ? nf0.format(abs) : nf2.format(abs);
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : '';
  return sign + s;
}

export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1).replace('.', ',')}M`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(0)}K`;
  return coins(n);
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

export function fmtOdds(o: number, f: UserSettings['oddsFormat'] = 'decimal'): string {
  if (f === 'american') {
    if (o >= 2) return `+${Math.round((o - 1) * 100)}`;
    return `${Math.round(-100 / (o - 1))}`;
  }
  if (f === 'fractional') {
    const v = o - 1;
    let best = { n: 1, d: 1, err: Infinity };
    for (const d of [1, 2, 3, 4, 5, 6, 8, 10, 11, 13, 20, 25, 40, 50, 100]) {
      const n = Math.round(v * d);
      const err = Math.abs(n / d - v);
      if (n > 0 && err < best.err - 1e-9) best = { n, d, err };
    }
    const g = gcd(best.n, best.d);
    return `${best.n / g}/${best.d / g}`;
  }
  return o.toFixed(2);
}

const timeFmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const weekdayFmt = new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });

export const time = (t: number) => timeFmt.format(t);

export function dayLabel(t: number): string {
  const d = new Date(t);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400e3);
  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  if (d.toDateString() === tomorrow.toDateString()) return 'Завтра';
  return weekdayFmt.format(d).replace('.', '');
}

export function startLabel(t: number, now = Date.now()): string {
  const diff = t - now;
  if (diff <= 0) return 'Скоро';
  if (diff < 60 * 60e3) return `через ${Math.max(1, Math.round(diff / 60e3))} мин`;
  const d = dayLabel(t);
  return d === 'Сегодня' ? time(t) : `${d === 'Завтра' ? 'Завтра' : dayFmt.format(t)}, ${time(t)}`;
}

export function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

export const SPORT_NAMES: Record<SportId, string> = {
  football: 'Футбол',
  hockey: 'Хоккей',
  basketball: 'Баскетбол',
  tennis: 'Теннис',
  cs2: 'CS2',
  dota2: 'Dota 2',
  mma: 'MMA',
  volleyball: 'Волейбол',
};
export const SPORT_ORDER: SportId[] = ['football', 'hockey', 'basketball', 'tennis', 'cs2', 'dota2', 'mma', 'volleyball'];

export const FLAGS: Record<string, string> = {
  ru: '🇷🇺',
  gb: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
  es: '🇪🇸',
  it: '🇮🇹',
  de: '🇩🇪',
  us: '🇺🇸',
  world: '🌐',
  eu: '🇪🇺',
};

export const isIndividual = (s: SportId) => s === 'tennis' || s === 'mma';
