import { bus } from '../bus.js';
import { env, getSettings } from '../config.js';
import { q } from '../db.js';
import { hashStr, mathRng, pick } from '../rng.js';
import { SPORTS, SPORT_ORDER, type Incident, type Scoreboard, type SportId, type Team } from '../sports/index.js';
import { LEAGUES, leagueById, type League } from '../teams.js';
import { price, type PricedMarket } from './pricing.js';

export type EventStatus = 'scheduled' | 'live' | 'finished' | 'cancelled';

export interface LiveEvent {
  id: string;
  sport: SportId;
  leagueId: string;
  home: Team;
  away: Team;
  startAt: number;
  status: EventStatus;
  state: any;
  result: any | null;
  markets: PricedMarket[];
  top: boolean;
  overrides: Record<string, number>;
  suspended: boolean; // приостановлено админом
  suspendUntil: number; // авто-пауза после опасного момента
  manual: boolean;
  finishedAt: number | null;
  dirty: boolean;
  lastPriced: number;
}

const TARGET_LIVE: Record<SportId, number> = { football: 4, hockey: 2, basketball: 2, tennis: 2, cs2: 1, dota2: 1, mma: 1, volleyball: 1 };
const TARGET_UPCOMING: Record<SportId, number> = { football: 16, hockey: 7, basketball: 7, tennis: 6, cs2: 5, dota2: 4, mma: 5, volleyball: 4 };
/** Типичная длительность матча в игровых секундах (для «перемотки» стартовых лайв-матчей). */
const TYPICAL: Record<SportId, number> = { football: 5900, hockey: 4500, basketball: 3600, tennis: 5200, cs2: 6000, dota2: 7800, mma: 1000, volleyball: 4800 };

const SUSPEND_MS = 7000;
const KEEP_FINISHED_MS = 40 * 60 * 1000;

export const events = new Map<string, LiveEvent>();

let onFinish: (ev: LiveEvent) => void = () => {};
export function setFinishHandler(fn: (ev: LiveEvent) => void) {
  onFinish = fn;
}

const seedOf = (ev: LiveEvent) => hashStr(ev.id);
const speedOf = (sport: SportId) => env.liveSpeed * SPORTS[sport].speedFactor;

export function isSuspended(ev: LiveEvent, now = Date.now()) {
  return ev.suspended || ev.suspendUntil > now || ev.status === 'finished' || ev.status === 'cancelled';
}

export function reprice(ev: LiveEvent, sims?: number) {
  const s = SPORTS[ev.sport];
  ev.markets = price(s, ev.state, seedOf(ev), getSettings().margin, ev.overrides, sims ?? (ev.status === 'live' ? 1800 : 3000));
  ev.lastPriced = Date.now();
}

function busyTeams(): Set<string> {
  const set = new Set<string>();
  for (const ev of events.values()) {
    if (ev.status === 'scheduled' || ev.status === 'live') {
      set.add(ev.home.id);
      set.add(ev.away.id);
    }
  }
  return set;
}

function pickLeague(sport: SportId): League {
  const ls = LEAGUES.filter((l) => l.sport === sport);
  const total = ls.reduce((a, l) => a + l.weight, 0);
  let r = mathRng() * total;
  for (const l of ls) {
    r -= l.weight;
    if (r <= 0) return l;
  }
  return ls[0];
}

export function createEvent(opts: { sport: SportId; startAt: number; leagueId?: string; homeId?: string; awayId?: string; top?: boolean; manual?: boolean }): LiveEvent | null {
  const league = opts.leagueId ? leagueById.get(opts.leagueId)! : pickLeague(opts.sport);
  const busy = busyTeams();
  const free = league.teams.filter((t) => !busy.has(t.id));
  let home = opts.homeId ? league.teams.find((t) => t.id === opts.homeId) : undefined;
  let away = opts.awayId ? league.teams.find((t) => t.id === opts.awayId) : undefined;
  if (!home || !away) {
    if (free.length < 2) return null;
    home = pick(free);
    const rest = free.filter((t) => t.id !== home!.id);
    away = pick(rest);
  }
  const sport = SPORTS[opts.sport];
  const id = `${opts.sport.slice(0, 3)}${Date.now().toString(36)}${Math.floor(mathRng() * 1e6).toString(36)}`;
  const ev: LiveEvent = {
    id,
    sport: opts.sport,
    leagueId: league.id,
    home,
    away,
    startAt: opts.startAt,
    status: 'scheduled',
    state: sport.create(home, away, mathRng),
    result: null,
    markets: [],
    top: opts.top ?? ((home.rating + away.rating) / 2 >= 85 || mathRng() < 0.12),
    overrides: {},
    suspended: false,
    suspendUntil: 0,
    manual: !!opts.manual,
    finishedAt: null,
    dirty: true,
    lastPriced: 0,
  };
  reprice(ev, 3000);
  events.set(id, ev);
  persist(ev, true);
  return ev;
}

/** Создать матч, который уже идёт (для наполнения лайва при старте). */
function createLiveInProgress(sport: SportId): LiveEvent | null {
  const ev = createEvent({ sport, startAt: Date.now() });
  if (!ev) return null;
  const s = SPORTS[sport];
  s.start(ev.state);
  const target = TYPICAL[sport] * (0.08 + mathRng() * 0.6);
  let t = 0;
  while (t < target && !s.finished(ev.state)) {
    s.step(ev.state, 10, mathRng);
    t += 10;
  }
  if (s.finished(ev.state)) {
    events.delete(ev.id);
    q.run('DELETE FROM events WHERE id = ?', ev.id);
    return null;
  }
  ev.status = 'live';
  ev.startAt = Date.now() - (t / speedOf(sport)) * 1000;
  reprice(ev);
  persist(ev, true);
  return ev;
}

function persist(ev: LiveEvent, full = false) {
  if (full) {
    q.run(
      `INSERT INTO events(id, sport, league_id, home, away, start_at, status, state, result, top, overrides, suspended, manual, created_at, finished_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET start_at=excluded.start_at, status=excluded.status, state=excluded.state, result=excluded.result,
         top=excluded.top, overrides=excluded.overrides, suspended=excluded.suspended, finished_at=excluded.finished_at`,
      ev.id, ev.sport, ev.leagueId, JSON.stringify(ev.home), JSON.stringify(ev.away), ev.startAt, ev.status,
      JSON.stringify(ev.state), ev.result ? JSON.stringify(ev.result) : null, ev.top ? 1 : 0, JSON.stringify(ev.overrides),
      ev.suspended ? 1 : 0, ev.manual ? 1 : 0, Date.now(), ev.finishedAt,
    );
  } else {
    q.run(
      'UPDATE events SET status=?, state=?, result=?, top=?, overrides=?, suspended=?, start_at=?, finished_at=? WHERE id=?',
      ev.status, JSON.stringify(ev.state), ev.result ? JSON.stringify(ev.result) : null, ev.top ? 1 : 0,
      JSON.stringify(ev.overrides), ev.suspended ? 1 : 0, ev.startAt, ev.finishedAt, ev.id,
    );
  }
  ev.dirty = false;
}

export function saveEvent(ev: LiveEvent) {
  persist(ev);
}

function loadFromDb() {
  const rows = q.all<any>("SELECT * FROM events WHERE status IN ('scheduled','live') OR finished_at > ?", Date.now() - KEEP_FINISHED_MS);
  for (const r of rows) {
    if (!SPORTS[r.sport as SportId]) continue;
    const ev: LiveEvent = {
      id: r.id,
      sport: r.sport,
      leagueId: r.league_id,
      home: JSON.parse(r.home),
      away: JSON.parse(r.away),
      startAt: r.start_at,
      status: r.status,
      state: JSON.parse(r.state),
      result: r.result ? JSON.parse(r.result) : null,
      markets: [],
      top: !!r.top,
      overrides: JSON.parse(r.overrides || '{}'),
      suspended: !!r.suspended,
      suspendUntil: 0,
      manual: !!r.manual,
      finishedAt: r.finished_at,
      dirty: false,
      lastPriced: 0,
    };
    if (ev.status !== 'finished' && ev.status !== 'cancelled') reprice(ev);
    events.set(ev.id, ev);
  }
}

function finish(ev: LiveEvent) {
  const s = SPORTS[ev.sport];
  ev.status = 'finished';
  ev.result = s.result(ev.state);
  ev.finishedAt = Date.now();
  ev.markets = [];
  persist(ev);
  try {
    onFinish(ev);
  } catch (e) {
    console.error('Ошибка расчёта события', ev.id, e);
  }
}

/** Принудительно доиграть матч (админка). */
export function forceFinish(ev: LiveEvent) {
  const s = SPORTS[ev.sport];
  if (ev.status === 'scheduled') {
    s.start(ev.state);
    ev.status = 'live';
  }
  let guard = 0;
  while (!s.finished(ev.state) && guard++ < 100000) s.step(ev.state, 15, mathRng);
  finish(ev);
  bus.emit('event:update', [ev]);
}

export function cancelEvent(ev: LiveEvent) {
  ev.status = 'cancelled';
  ev.finishedAt = Date.now();
  ev.markets = [];
  ev.result = null;
  persist(ev);
  try {
    onFinish(ev);
  } catch (e) {
    console.error(e);
  }
  bus.emit('event:update', [ev]);
}

let lastTick = Date.now();

function tick() {
  const now = Date.now();
  const dtReal = Math.min(5, (now - lastTick) / 1000);
  lastTick = now;
  const changed: LiveEvent[] = [];
  for (const ev of events.values()) {
    const s = SPORTS[ev.sport];
    if (ev.status === 'scheduled' && ev.startAt <= now) {
      ev.status = 'live';
      s.start(ev.state);
      reprice(ev);
      persist(ev);
      changed.push(ev);
      bus.emit('event:started', ev);
      continue;
    }
    if (ev.status !== 'live') continue;
    const inc: Incident[] = s.step(ev.state, dtReal * speedOf(ev.sport), mathRng);
    if (inc.some((i) => i.type === 'goal' || (i.type === 'period' && i.side !== undefined) || i.type === 'finish')) {
      ev.suspendUntil = now + SUSPEND_MS;
    }
    for (const i of inc) {
      i.at = now;
      if (i.type === 'goal') bus.emit('event:incident', ev, i);
    }
    if (s.finished(ev.state)) {
      finish(ev);
    } else if (inc.length || now - ev.lastPriced > 3500) {
      reprice(ev);
    }
    ev.dirty = true;
    changed.push(ev);
  }
  if (changed.length) bus.emit('event:update', changed);
}

function maintain() {
  const now = Date.now();
  for (const [id, ev] of events) {
    if ((ev.status === 'finished' || ev.status === 'cancelled') && ev.finishedAt && now - ev.finishedAt > KEEP_FINISHED_MS) events.delete(id);
  }
  for (const sport of SPORT_ORDER) {
    const list = [...events.values()].filter((e) => e.sport === sport);
    const live = list.filter((e) => e.status === 'live').length;
    const sched = list.filter((e) => e.status === 'scheduled');
    const soon = sched.filter((e) => e.startAt - now < 6 * 60 * 1000).length;
    // поддерживаем поток лайва: если матчей мало и ничего не стартует в ближайшие минуты — ставим матч «скоро»
    if (live + soon < TARGET_LIVE[sport]) {
      createEvent({ sport, startAt: now + (60 + mathRng() * 240) * 1000 });
    }
    for (let i = sched.length; i < TARGET_UPCOMING[sport]; i++) {
      const r = mathRng();
      const ahead = r < 0.3 ? 8 * 60e3 + mathRng() * 50 * 60e3 : r < 0.7 ? 1 * 3600e3 + mathRng() * 8 * 3600e3 : 9 * 3600e3 + mathRng() * 30 * 3600e3;
      let at = now + ahead;
      if (ahead > 3600e3) at = Math.round(at / (15 * 60e3)) * 15 * 60e3;
      if (!createEvent({ sport, startAt: at })) break;
    }
  }
}

export function flush() {
  for (const ev of events.values()) if (ev.dirty) persist(ev);
}

export function startEngine() {
  loadFromDb();
  const liveNow = [...events.values()].filter((e) => e.status === 'live').length;
  if (liveNow === 0) {
    for (const sport of SPORT_ORDER) for (let i = 0; i < TARGET_LIVE[sport]; i++) createLiveInProgress(sport);
  }
  maintain();
  lastTick = Date.now();
  setInterval(tick, 1000);
  setInterval(maintain, 20_000);
  setInterval(flush, 5_000);
}

/* ---------- представление для API ---------- */

export function leagueInfo(id: string) {
  const l = leagueById.get(id);
  return l ? { id: l.id, name: l.name, country: l.country } : { id, name: id, country: 'world' };
}

export interface EventSummary {
  id: string;
  sport: SportId;
  league: { id: string; name: string; country: string };
  home: Team;
  away: Team;
  startAt: number;
  status: EventStatus;
  top: boolean;
  suspended: boolean;
  sb: Omit<Scoreboard, 'stats'>;
  main: PricedMarket | null;
  marketsCount: number;
}

export function summary(ev: LiveEvent): EventSummary {
  const s = SPORTS[ev.sport];
  const { stats: _stats, ...sb } = s.scoreboard(ev.state);
  return {
    id: ev.id,
    sport: ev.sport,
    league: leagueInfo(ev.leagueId),
    home: ev.home,
    away: ev.away,
    startAt: ev.startAt,
    status: ev.status,
    top: ev.top,
    suspended: isSuspended(ev),
    sb,
    // если основной рынок уже решён (например, 0:3 на 80-й минуте) — показываем следующий доступный
    main:
      ev.markets.find((m) => m.key === s.mainMarket) ??
      ev.markets.find((m) => m.group === 'main' && m.outcomes.length <= 3 && m.outcomes.every((o) => o.odds)) ??
      ev.markets.find((m) => m.outcomes.length <= 3 && m.outcomes.every((o) => o.odds)) ??
      null,
    marketsCount: ev.markets.reduce((a, m) => a + m.outcomes.filter((o) => o.odds).length, 0),
  };
}

export function full(ev: LiveEvent) {
  const s = SPORTS[ev.sport];
  const sb = s.scoreboard(ev.state);
  return {
    ...summary(ev),
    stats: sb.stats ?? [],
    markets: ev.markets,
    incidents: (ev.state.inc ?? []).slice(-20).reverse(),
  };
}
