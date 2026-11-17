import type { Rng } from '../rng.js';

export type SportId =
  | 'football'
  | 'hockey'
  | 'basketball'
  | 'tennis'
  | 'cs2'
  | 'dota2'
  | 'volleyball'
  | 'mma';

/** Результат исхода при расчёте. */
export type Settle = 'win' | 'lose' | 'void' | 'half_win' | 'half_lose';

export interface Team {
  id: string;
  name: string;
  short: string;
  colors: [string, string];
  rating: number; // 0..100
}

export interface OutcomeDef<R = any> {
  key: string;
  label: string;
  settle: (r: R) => Settle;
}

export interface MarketDef<R = any> {
  key: string;
  /** Заголовок карточки рынка. Рынки с одинаковым title показываются одной карточкой (линии). */
  title: string;
  /** Вкладка на странице матча. */
  group: 'main' | 'totals' | 'handicap' | 'period' | 'score' | 'other';
  layout?: 'row' | 'grid';
  outcomes: OutcomeDef<R>[];
}

export interface Incident {
  type: 'goal' | 'period' | 'start' | 'finish' | 'point' | 'card' | 'info';
  side?: 0 | 1;
  text: string;
  clock?: string;
  at?: number;
}

export interface Scoreboard {
  score: [number, number];
  clock: string; // например «67'» или «Сет 2»
  period: string; // например «2-й тайм»
  detail?: string; // например «6:4 3:2»
  serving?: 0 | 1;
  stats?: { label: string; h: number; a: number }[];
  /** Доля давления хозяев 0..1 для полосы атак. */
  pressure?: number;
  isBreak?: boolean;
}

export interface SportModule<S = any, R = any> {
  id: SportId;
  name: string;
  /** Множитель скорости лайва относительно LIVE_SPEED (1 = как настроено). */
  speedFactor: number;
  mainMarket: string;
  create(home: Team, away: Team, rng: Rng): S;
  /** Перевести матч в игру. */
  start(s: S): Incident[];
  /** Продвинуть матч на dt игровых секунд. */
  step(s: S, dt: number, rng: Rng): Incident[];
  finished(s: S): boolean;
  /** Досимулировать матч до конца из текущего состояния (без изменения s). */
  simulate(s: S, rng: Rng): R;
  /** Итог завершённого матча. */
  result(s: S): R;
  /** Ключи рынков, предлагаемых в текущем состоянии. */
  offer(s: S): string[];
  /** Описание рынка по ключу (используется и для цены, и для расчёта). */
  market(key: string): MarketDef<R> | null;
  scoreboard(s: S): Scoreboard;
}
