import { clamp, normal, poisson, type Rng } from '../rng.js';
import { bool, fmtLine, halfLines, over, under } from './lines.js';
import type { Incident, MarketDef, SportModule } from './types.js';

type Pair = [number, number];

/* ---------- общие рынки серий (сеты/карты) ---------- */

interface SeriesR {
  winner: 0 | 1;
  won: Pair;
}

function scoreOutcomes(bestOf: number) {
  const need = Math.ceil(bestOf / 2);
  const res: { key: string; label: string; settle: (r: SeriesR) => ReturnType<typeof bool> }[] = [];
  for (let l = 0; l < need; l++) res.push({ key: `${need}-${l}`, label: `${need}:${l}`, settle: (r) => bool(r.won[0] === need && r.won[1] === l) });
  for (let l = need - 1; l >= 0; l--) res.push({ key: `${l}-${need}`, label: `${l}:${need}`, settle: (r) => bool(r.won[1] === need && r.won[0] === l) });
  return res;
}

function seriesMarket(key: string, bestOf: number, unit: { title: string; gen: string }): MarketDef<SeriesR> | null {
  const p = key.split(':');
  if (key === 'ml')
    return {
      key,
      title: 'Победитель',
      group: 'main',
      outcomes: [
        { key: '1', label: 'П1', settle: (r) => bool(r.winner === 0) },
        { key: '2', label: 'П2', settle: (r) => bool(r.winner === 1) },
      ],
    };
  if (key === 'score') return { key, title: `Счёт по ${unit.gen}`, group: 'score', layout: 'grid', outcomes: scoreOutcomes(bestOf) };
  if (p[0] === 'units' && p.length === 2) {
    const l = Number(p[1]);
    if (!Number.isFinite(l)) return null;
    return {
      key,
      title: `Тотал ${unit.gen}`,
      group: 'totals',
      outcomes: [
        { key: 'over', label: `Б ${l}`, settle: (r) => over(r.won[0] + r.won[1], l) },
        { key: 'under', label: `М ${l}`, settle: (r) => under(r.won[0] + r.won[1], l) },
      ],
    };
  }
  if (p[0] === 'uhcp' && p.length === 2) {
    const l = Number(p[1]);
    if (!Number.isFinite(l)) return null;
    return {
      key,
      title: `Фора по ${unit.gen}`,
      group: 'handicap',
      outcomes: [
        { key: '1', label: `Ф1 (${fmtLine(l)})`, settle: (r) => bool(r.won[0] + l > r.won[1]) },
        { key: '2', label: `Ф2 (${fmtLine(-l)})`, settle: (r) => bool(r.won[1] - l > r.won[0]) },
      ],
    };
  }
  return null;
}

function seriesOffer(bestOf: number, won: Pair, done: boolean): string[] {
  if (done) return [];
  const keys = ['ml', 'score'];
  const need = Math.ceil(bestOf / 2);
  for (let l = need + 0.5; l < bestOf; l++) if (l > won[0] + won[1]) keys.push(`units:${l}`);
  for (let l = 1.5; l < need; l++) {
    keys.push(`uhcp:${-l}`);
    keys.push(`uhcp:${l}`);
  }
  return keys;
}

function pushInc(arr: Incident[], out: Incident[], i: Incident) {
  arr.push(i);
  if (arr.length > 30) arr.shift();
  out.push(i);
}

const mmss = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/* ---------- гонка до N с разницей 2 (сет волейбола, сет тенниса без тай-брейка) ---------- */

/* ================= ТЕННИС ================= */

export interface TennisState {
  phase: 'pre' | 'play' | 'ft';
  sets: Pair[];
  cur: Pair;
  server: 0 | 1;
  t: number;
  gameLen: number;
  hold: Pair;
  inc: Incident[];
  aces: Pair;
}
export interface TennisResult extends SeriesR {
  sets: Pair[];
  games: number;
}

function tbProb(s: { hold: Pair }) {
  return clamp(0.5 + (s.hold[0] - s.hold[1]) * 1.4, 0.15, 0.85);
}

/** Сыграть один гейм; возвращает true, если сет завершён. */
function tennisGame(st: { sets: Pair[]; cur: Pair; server: 0 | 1; hold: Pair }, rng: Rng): { winner: 0 | 1; setDone: boolean; tb: boolean } {
  const tb = st.cur[0] === 6 && st.cur[1] === 6;
  let w: 0 | 1;
  if (tb) w = rng() < tbProb(st) ? 0 : 1;
  else {
    const holdP = st.hold[st.server];
    w = rng() < holdP ? st.server : ((1 - st.server) as 0 | 1);
  }
  st.cur[w] += 1;
  st.server = (1 - st.server) as 0 | 1;
  const [a, b] = st.cur;
  const setDone = tb || (a >= 6 && a - b >= 2) || (b >= 6 && b - a >= 2);
  if (setDone) {
    st.sets.push([a, b]);
    st.cur = [0, 0];
  }
  return { winner: w, setDone, tb };
}

const setsWon = (sets: Pair[]): Pair => sets.reduce<Pair>((acc, s) => (s[0] > s[1] ? [acc[0] + 1, acc[1]] : [acc[0], acc[1] + 1]), [0, 0]);

export const tennis: SportModule<TennisState, TennisResult> = {
  id: 'tennis',
  name: 'Теннис',
  speedFactor: 1.6,
  mainMarket: 'ml',
  create(home, away, rng) {
    const d = (home.rating - away.rating) / 100;
    const base = 0.74 + rng() * 0.08;
    return {
      phase: 'pre',
      sets: [],
      cur: [0, 0],
      server: rng() < 0.5 ? 0 : 1,
      t: 0,
      gameLen: 220,
      hold: [clamp(base + d * 0.5, 0.55, 0.93), clamp(base - d * 0.5, 0.55, 0.93)],
      inc: [],
      aces: [0, 0],
    };
  },
  start(s) {
    s.phase = 'play';
    const i: Incident = { type: 'start', text: 'Матч начался', clock: 'С1' };
    s.inc.push(i);
    return [i];
  },
  step(s, dt, rng) {
    const out: Incident[] = [];
    if (s.phase !== 'play') return out;
    s.t += dt;
    if (rng() < dt / 200) s.aces[s.server] += 1;
    if (s.t < s.gameLen) return out;
    s.t = 0;
    s.gameLen = 160 + rng() * 160;
    const server = s.server;
    const g = tennisGame(s, rng);
    const setNo = s.sets.length + (g.setDone ? 0 : 1);
    if (!g.setDone && g.winner !== server) pushInc(s.inc, out, { type: 'point', side: g.winner, text: 'Брейк', clock: `С${setNo}` });
    if (g.setDone) {
      const last = s.sets[s.sets.length - 1];
      pushInc(s.inc, out, { type: 'period', side: g.winner, text: `Сет ${s.sets.length}: ${last[0]}:${last[1]}${g.tb ? ' (тай-брейк)' : ''}`, clock: `С${s.sets.length}` });
      const w = setsWon(s.sets);
      if (w[0] === 2 || w[1] === 2) {
        s.phase = 'ft';
        pushInc(s.inc, out, { type: 'finish', text: `Матч завершён ${w[0]}:${w[1]}` });
      }
    }
    if (s.cur[0] === 6 && s.cur[1] === 6) s.gameLen = 480;
    return out;
  },
  finished: (s) => s.phase === 'ft',
  simulate(s, rng) {
    if (s.phase === 'ft') return tennis.result(s);
    const st = { sets: s.sets.map((x) => [...x] as Pair), cur: [...s.cur] as Pair, server: s.server, hold: s.hold };
    let w = setsWon(st.sets);
    let guard = 0;
    while (w[0] < 2 && w[1] < 2 && guard++ < 200) {
      const g = tennisGame(st, rng);
      if (g.setDone) w = setsWon(st.sets);
    }
    return { sets: st.sets, won: w, winner: w[0] > w[1] ? 0 : 1, games: st.sets.reduce((a, x) => a + x[0] + x[1], 0) };
  },
  result(s) {
    const w = setsWon(s.sets);
    return { sets: s.sets, won: w, winner: w[0] > w[1] ? 0 : 1, games: s.sets.reduce((a, x) => a + x[0] + x[1], 0) + s.cur[0] + s.cur[1] };
  },
  offer(s) {
    const w = setsWon(s.sets);
    const keys = seriesOffer(3, w, s.phase === 'ft');
    if (s.phase === 'ft') return keys;
    const played = s.sets.reduce((a, x) => a + x[0] + x[1], 0) + s.cur[0] + s.cur[1];
    const remSets = (w[0] + w[1] === 0 ? 2.4 : w[0] + w[1] === 1 ? 1.5 : 1) - (s.cur[0] + s.cur[1] > 0 ? 0 : 0);
    const center = played + Math.max(0, remSets * 9.8 - (s.cur[0] + s.cur[1]));
    for (const l of halfLines(center, 3, 1)) keys.push(`games:${l}`);
    const n = s.sets.length + 1;
    keys.push(`set:${n}`);
    return keys;
  },
  market(key) {
    const p = key.split(':');
    if (p[0] === 'games' && p.length === 2) {
      const l = Number(p[1]);
      if (!Number.isFinite(l)) return null;
      return {
        key,
        title: 'Тотал геймов',
        group: 'totals',
        outcomes: [
          { key: 'over', label: `Б ${l}`, settle: (r) => over(r.games, l) },
          { key: 'under', label: `М ${l}`, settle: (r) => under(r.games, l) },
        ],
      };
    }
    if (p[0] === 'set' && p.length === 2) {
      const n = Number(p[1]);
      if (!(n >= 1 && n <= 3)) return null;
      const vs = (r: TennisResult) => (r.sets[n - 1] ? null : ('void' as const));
      return {
        key,
        title: `Победитель ${n}-го сета`,
        group: 'period',
        outcomes: [
          { key: '1', label: 'П1', settle: (r) => vs(r) ?? bool(r.sets[n - 1][0] > r.sets[n - 1][1]) },
          { key: '2', label: 'П2', settle: (r) => vs(r) ?? bool(r.sets[n - 1][1] > r.sets[n - 1][0]) },
        ],
      } as MarketDef<TennisResult>;
    }
    return seriesMarket(key, 3, { title: 'сеты', gen: 'сетам' }) as MarketDef<TennisResult> | null;
  },
  scoreboard(s) {
    const w = setsWon(s.sets);
    const n = s.sets.length + 1;
    const games = [...s.sets.map((x) => `${x[0]}:${x[1]}`), ...(s.phase === 'play' ? [`${s.cur[0]}:${s.cur[1]}`] : [])].join(' ');
    return {
      score: w,
      clock: s.phase === 'play' ? `С${n}` : s.phase === 'ft' ? 'FT' : '',
      period: s.phase === 'pre' ? 'Скоро начало' : s.phase === 'ft' ? 'Завершён' : `${n}-й сет${s.cur[0] === 6 && s.cur[1] === 6 ? ' · тай-брейк' : ''}`,
      detail: s.phase === 'pre' ? undefined : games,
      serving: s.phase === 'play' ? s.server : undefined,
      stats: [
        { label: 'Эйсы', h: s.aces[0], a: s.aces[1] },
        { label: 'Геймы', h: s.sets.reduce((a, x) => a + x[0], 0) + s.cur[0], a: s.sets.reduce((a, x) => a + x[1], 0) + s.cur[1] },
      ],
      pressure: 0.5 + (s.hold[0] - s.hold[1]),
    };
  },
};

// fix: tennis.result games уже включают текущий сет только при незавершённом матче
// (после завершения cur = [0,0]).

/* ================= ВОЛЕЙБОЛ ================= */

export interface VbState {
  phase: 'pre' | 'play' | 'break' | 'ft';
  sets: Pair[];
  cur: Pair;
  t: number;
  p: number; // вероятность розыгрыша хозяев
  inc: Incident[];
  blocks: Pair;
}
export interface VbResult extends SeriesR {
  sets: Pair[];
  points: number;
}

function vbSetTarget(n: number) {
  return n === 5 ? 15 : 25;
}
function vbRally(st: { sets: Pair[]; cur: Pair; p: number }, rng: Rng): boolean {
  const w = rng() < st.p ? 0 : 1;
  st.cur[w] += 1;
  const target = vbSetTarget(st.sets.length + 1);
  const [a, b] = st.cur;
  if ((a >= target && a - b >= 2) || (b >= target && b - a >= 2)) {
    st.sets.push([a, b]);
    st.cur = [0, 0];
    return true;
  }
  return false;
}

export const volleyball: SportModule<VbState, VbResult> = {
  id: 'volleyball',
  name: 'Волейбол',
  speedFactor: 1.4,
  mainMarket: 'ml',
  create(home, away) {
    const d = (home.rating - away.rating) / 100;
    return { phase: 'pre', sets: [], cur: [0, 0], t: 0, p: clamp(0.505 + d * 0.22, 0.38, 0.62), inc: [], blocks: [0, 0] };
  },
  start(s) {
    s.phase = 'play';
    const i: Incident = { type: 'start', text: 'Матч начался', clock: 'С1' };
    s.inc.push(i);
    return [i];
  },
  step(s, dt, rng) {
    const out: Incident[] = [];
    if (s.phase === 'pre' || s.phase === 'ft') return out;
    s.t += dt;
    if (s.phase === 'break') {
      if (s.t >= 180) {
        s.phase = 'play';
        s.t = 0;
      }
      return out;
    }
    const rallies = Math.floor(s.t / 24);
    s.t -= rallies * 24;
    for (let k = 0; k < rallies; k++) {
      if (rng() < 0.12) s.blocks[rng() < s.p ? 0 : 1] += 1;
      if (vbRally(s, rng)) {
        const last = s.sets[s.sets.length - 1];
        pushInc(s.inc, out, { type: 'period', side: last[0] > last[1] ? 0 : 1, text: `Сет ${s.sets.length}: ${last[0]}:${last[1]}`, clock: `С${s.sets.length}` });
        const w = setsWon(s.sets);
        if (w[0] === 3 || w[1] === 3) {
          s.phase = 'ft';
          pushInc(s.inc, out, { type: 'finish', text: `Матч завершён ${w[0]}:${w[1]}` });
        } else {
          s.phase = 'break';
          s.t = 0;
        }
        break;
      }
    }
    return out;
  },
  finished: (s) => s.phase === 'ft',
  simulate(s, rng) {
    if (s.phase === 'ft') return volleyball.result(s);
    const st = { sets: s.sets.map((x) => [...x] as Pair), cur: [...s.cur] as Pair, p: s.p };
    let w = setsWon(st.sets);
    let guard = 0;
    while (w[0] < 3 && w[1] < 3 && guard++ < 1000) if (vbRally(st, rng)) w = setsWon(st.sets);
    return { sets: st.sets, won: w, winner: w[0] > w[1] ? 0 : 1, points: st.sets.reduce((a, x) => a + x[0] + x[1], 0) };
  },
  result(s) {
    const w = setsWon(s.sets);
    return { sets: s.sets, won: w, winner: w[0] > w[1] ? 0 : 1, points: s.sets.reduce((a, x) => a + x[0] + x[1], 0) };
  },
  offer(s) {
    const w = setsWon(s.sets);
    const keys = seriesOffer(5, w, s.phase === 'ft');
    if (s.phase === 'ft') return keys;
    const n = s.sets.length + 1;
    keys.push(`set:${n}`);
    return keys;
  },
  market(key) {
    const p = key.split(':');
    if (p[0] === 'set' && p.length === 2) {
      const n = Number(p[1]);
      if (!(n >= 1 && n <= 5)) return null;
      const vs = (r: VbResult) => (r.sets[n - 1] ? null : 'void' as const);
      return {
        key,
        title: `Победитель ${n}-й партии`,
        group: 'period',
        outcomes: [
          { key: '1', label: 'П1', settle: (r) => vs(r) ?? bool(r.sets[n - 1][0] > r.sets[n - 1][1]) },
          { key: '2', label: 'П2', settle: (r) => vs(r) ?? bool(r.sets[n - 1][1] > r.sets[n - 1][0]) },
        ],
      } as MarketDef<VbResult>;
    }
    return seriesMarket(key, 5, { title: 'партии', gen: 'партиям' }) as MarketDef<VbResult> | null;
  },
  scoreboard(s) {
    const n = s.sets.length + 1;
    return {
      score: setsWon(s.sets),
      clock: s.phase === 'play' ? `П${n}` : s.phase === 'break' ? 'ПЕР' : s.phase === 'ft' ? 'FT' : '',
      period: s.phase === 'pre' ? 'Скоро начало' : s.phase === 'ft' ? 'Завершён' : s.phase === 'break' ? 'Перерыв' : `${n}-я партия`,
      detail: s.phase === 'pre' ? undefined : [...s.sets.map((x) => `${x[0]}:${x[1]}`), ...(s.phase === 'play' ? [`${s.cur[0]}:${s.cur[1]}`] : [])].join(' '),
      stats: [{ label: 'Блоки', h: s.blocks[0], a: s.blocks[1] }],
      pressure: s.p,
      isBreak: s.phase === 'break',
    };
  },
};

/* ================= CS2 ================= */

export interface CsState {
  phase: 'pre' | 'play' | 'break' | 'ft';
  maps: Pair[]; // завершённые карты (раунды)
  cur: Pair;
  t: number;
  p: number;
  mapNames: string[];
  inc: Incident[];
}
export interface MapsResult extends SeriesR {
  maps: Pair[];
}

const CS_MAPS = ['Mirage', 'Inferno', 'Nuke', 'Ancient', 'Anubis', 'Dust II', 'Train'];

function csRound(st: { maps: Pair[]; cur: Pair; p: number }, rng: Rng): boolean {
  const w = rng() < st.p ? 0 : 1;
  st.cur[w] += 1;
  const [a, b] = st.cur;
  let done = false;
  if (a + b <= 24) done = a === 13 || b === 13;
  else {
    // овертаймы MR3: до 4 побед в блоке из 6
    const extra = a + b - 24;
    const block = Math.floor((extra - 1) / 6);
    const base = 12 + block * 3;
    done = (a - base >= 4 || b - base >= 4) && Math.abs(a - b) >= 2;
  }
  if (done) {
    st.maps.push([a, b]);
    st.cur = [0, 0];
  }
  return done;
}
const mapsWon = (maps: Pair[]): Pair => setsWon(maps);

export const cs2: SportModule<CsState, MapsResult> = {
  id: 'cs2',
  name: 'Counter-Strike 2',
  speedFactor: 1.8,
  mainMarket: 'ml',
  create(home, away, rng) {
    const d = (home.rating - away.rating) / 100;
    const names = [...CS_MAPS].sort(() => rng() - 0.5).slice(0, 3);
    return { phase: 'pre', maps: [], cur: [0, 0], t: 0, p: clamp(0.5 + d * 0.3, 0.36, 0.64), mapNames: names, inc: [] };
  },
  start(s) {
    s.phase = 'play';
    const i: Incident = { type: 'start', text: `Карта 1: ${s.mapNames[0]}`, clock: 'К1' };
    s.inc.push(i);
    return [i];
  },
  step(s, dt, rng) {
    const out: Incident[] = [];
    if (s.phase === 'pre' || s.phase === 'ft') return out;
    s.t += dt;
    if (s.phase === 'break') {
      if (s.t >= 240) {
        s.phase = 'play';
        s.t = 0;
        pushInc(s.inc, out, { type: 'period', text: `Карта ${s.maps.length + 1}: ${s.mapNames[s.maps.length]}`, clock: `К${s.maps.length + 1}` });
      }
      return out;
    }
    if (s.t < 100) return out;
    s.t = 0;
    if (csRound(s, rng)) {
      const last = s.maps[s.maps.length - 1];
      pushInc(s.inc, out, { type: 'period', side: last[0] > last[1] ? 0 : 1, text: `${s.mapNames[s.maps.length - 1]}: ${last[0]}:${last[1]}`, clock: `К${s.maps.length}` });
      const w = mapsWon(s.maps);
      if (w[0] === 2 || w[1] === 2) {
        s.phase = 'ft';
        pushInc(s.inc, out, { type: 'finish', text: `Матч завершён ${w[0]}:${w[1]}` });
      } else {
        s.phase = 'break';
        s.t = 0;
      }
    }
    return out;
  },
  finished: (s) => s.phase === 'ft',
  simulate(s, rng) {
    if (s.phase === 'ft') return cs2.result(s);
    const st = { maps: s.maps.map((x) => [...x] as Pair), cur: [...s.cur] as Pair, p: s.p };
    let w = mapsWon(st.maps);
    let guard = 0;
    while (w[0] < 2 && w[1] < 2 && guard++ < 500) if (csRound(st, rng)) w = mapsWon(st.maps);
    return { maps: st.maps, won: w, winner: w[0] > w[1] ? 0 : 1 };
  },
  result(s) {
    const w = mapsWon(s.maps);
    return { maps: s.maps, won: w, winner: w[0] > w[1] ? 0 : 1 };
  },
  offer(s) {
    const w = mapsWon(s.maps);
    const keys = seriesOffer(3, w, s.phase === 'ft');
    if (s.phase === 'ft') return keys;
    const n = s.maps.length + 1;
    keys.push(`map:${n}`);
    const played = s.phase === 'play' ? s.cur[0] + s.cur[1] : 0;
    for (const l of halfLines(Math.max(21, played + 4), 3, 2)) if (l > played) keys.push(`map:${n}:total:${l}`);
    return keys;
  },
  market(key) {
    const p = key.split(':');
    if (p[0] === 'map') {
      const n = Number(p[1]);
      if (!(n >= 1 && n <= 3)) return null;
      const vs = (r: MapsResult) => (r.maps[n - 1] ? null : ('void' as const));
      if (p.length === 2)
        return {
          key,
          title: `Победитель ${n}-й карты`,
          group: 'period',
          outcomes: [
            { key: '1', label: 'П1', settle: (r) => vs(r) ?? bool(r.maps[n - 1][0] > r.maps[n - 1][1]) },
            { key: '2', label: 'П2', settle: (r) => vs(r) ?? bool(r.maps[n - 1][1] > r.maps[n - 1][0]) },
          ],
        } as MarketDef<MapsResult>;
      if (p[2] === 'total' && p.length === 4) {
        const l = Number(p[3]);
        if (!Number.isFinite(l)) return null;
        return {
          key,
          title: `Тотал раундов, ${n}-я карта`,
          group: 'totals',
          outcomes: [
            { key: 'over', label: `Б ${l}`, settle: (r) => vs(r) ?? over(r.maps[n - 1][0] + r.maps[n - 1][1], l) },
            { key: 'under', label: `М ${l}`, settle: (r) => vs(r) ?? under(r.maps[n - 1][0] + r.maps[n - 1][1], l) },
          ],
        } as MarketDef<MapsResult>;
      }
      return null;
    }
    return seriesMarket(key, 3, { title: 'карты', gen: 'картам' }) as MarketDef<MapsResult> | null;
  },
  scoreboard(s) {
    const n = s.maps.length + 1;
    return {
      score: mapsWon(s.maps),
      clock: s.phase === 'play' ? `К${n}` : s.phase === 'break' ? 'ПЕР' : s.phase === 'ft' ? 'FT' : '',
      period: s.phase === 'pre' ? `Bo3 · ${s.mapNames.join(', ')}` : s.phase === 'ft' ? 'Завершён' : s.phase === 'break' ? 'Пауза между картами' : `Карта ${n} · ${s.mapNames[n - 1]}`,
      detail: s.phase === 'pre' ? undefined : [...s.maps.map((x) => `${x[0]}:${x[1]}`), ...(s.phase === 'play' ? [`${s.cur[0]}:${s.cur[1]}`] : [])].join(' '),
      stats: [{ label: 'Раунды', h: s.maps.reduce((a, x) => a + x[0], 0) + s.cur[0], a: s.maps.reduce((a, x) => a + x[1], 0) + s.cur[1] }],
      pressure: s.p,
      isBreak: s.phase === 'break',
    };
  },
};

/* ================= DOTA 2 ================= */

export interface DotaState {
  phase: 'pre' | 'play' | 'break' | 'ft';
  maps: (0 | 1)[];
  kills: Pair[];
  cur: { t: number; dur: number; gold: number; kills: Pair };
  edge: number; // снос преимущества в золоте в секунду
  inc: Incident[];
  t: number;
}
export interface DotaResult extends SeriesR {
  maps: (0 | 1)[];
  kills: Pair[];
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const GOLD_SD = 55; // волатильность золота за √сек
const KILL_RATE = 0.95 / 60;

function newDotaMap(rng: Rng) {
  return { t: 0, dur: (30 + rng() * 18) * 60, gold: 0, kills: [0, 0] as Pair };
}

function dotaFinishMap(cur: DotaState['cur'], edge: number, rng: Rng): { winner: 0 | 1; kills: Pair } {
  const rem = Math.max(0, cur.dur - cur.t);
  const g = cur.gold + edge * rem + GOLD_SD * Math.sqrt(rem) * normal(rng);
  const winner = rng() < sigmoid(g / 3500) ? 0 : 1;
  const k = poisson(KILL_RATE * rem, rng);
  const share = sigmoid(g / 6000);
  let kh = 0;
  for (let i = 0; i < k; i++) if (rng() < share) kh++;
  return { winner, kills: [cur.kills[0] + kh, cur.kills[1] + k - kh] };
}

export const dota2: SportModule<DotaState, DotaResult> = {
  id: 'dota2',
  name: 'Dota 2',
  speedFactor: 2,
  mainMarket: 'ml',
  create(home, away, rng) {
    const d = (home.rating - away.rating) / 100;
    return { phase: 'pre', maps: [], kills: [], cur: newDotaMap(rng), edge: d * 6, inc: [], t: 0 };
  },
  start(s) {
    s.phase = 'play';
    const i: Incident = { type: 'start', text: 'Карта 1 началась', clock: 'К1' };
    s.inc.push(i);
    return [i];
  },
  step(s, dt, rng) {
    const out: Incident[] = [];
    if (s.phase === 'pre' || s.phase === 'ft') return out;
    if (s.phase === 'break') {
      s.t += dt;
      if (s.t >= 300) {
        s.phase = 'play';
        s.t = 0;
        s.cur = newDotaMap(rng);
        pushInc(s.inc, out, { type: 'period', text: `Карта ${s.maps.length + 1} началась`, clock: `К${s.maps.length + 1}` });
      }
      return out;
    }
    const c = s.cur;
    const play = Math.min(dt, c.dur - c.t);
    c.gold += s.edge * play + GOLD_SD * Math.sqrt(play) * normal(rng);
    const k = poisson(KILL_RATE * play, rng);
    for (let i = 0; i < k; i++) {
      const side = rng() < sigmoid(c.gold / 6000) ? 0 : 1;
      c.kills[side] += 1;
      c.gold += side === 0 ? 250 : -250;
    }
    c.t += play;
    if (c.t >= c.dur) {
      const winner = rng() < sigmoid(c.gold / 3500) ? 0 : 1;
      s.maps.push(winner);
      s.kills.push([...c.kills] as Pair);
      const n = s.maps.length;
      pushInc(s.inc, out, { type: 'period', side: winner, text: `Карта ${n}: победа ${winner === 0 ? 'хозяев' : 'гостей'} (${mmss(c.dur)})`, clock: `К${n}` });
      const w: Pair = [s.maps.filter((x) => x === 0).length, s.maps.filter((x) => x === 1).length];
      if (w[0] === 2 || w[1] === 2) {
        s.phase = 'ft';
        pushInc(s.inc, out, { type: 'finish', text: `Матч завершён ${w[0]}:${w[1]}` });
      } else {
        s.phase = 'break';
        s.t = 0;
      }
    }
    return out;
  },
  finished: (s) => s.phase === 'ft',
  simulate(s, rng) {
    if (s.phase === 'ft') return dota2.result(s);
    const maps = [...s.maps];
    const kills = s.kills.map((k) => [...k] as Pair);
    const won = (): Pair => [maps.filter((x) => x === 0).length, maps.filter((x) => x === 1).length];
    if (s.phase === 'play' || s.phase === 'pre') {
      const r = dotaFinishMap(s.phase === 'pre' ? newDotaMap(rng) : s.cur, s.edge, rng);
      maps.push(r.winner);
      kills.push(r.kills);
    }
    let w = won();
    while (w[0] < 2 && w[1] < 2) {
      const r = dotaFinishMap(newDotaMap(rng), s.edge, rng);
      maps.push(r.winner);
      kills.push(r.kills);
      w = won();
    }
    return { maps, kills, won: w, winner: w[0] > w[1] ? 0 : 1 };
  },
  result(s) {
    const w: Pair = [s.maps.filter((x) => x === 0).length, s.maps.filter((x) => x === 1).length];
    return { maps: s.maps, kills: s.kills, won: w, winner: w[0] > w[1] ? 0 : 1 };
  },
  offer(s) {
    const w: Pair = [s.maps.filter((x) => x === 0).length, s.maps.filter((x) => x === 1).length];
    const keys = seriesOffer(3, w, s.phase === 'ft');
    if (s.phase === 'ft') return keys;
    const n = s.maps.length + 1;
    keys.push(`map:${n}`);
    const curK = s.phase === 'play' ? s.cur.kills[0] + s.cur.kills[1] : 0;
    const remT = s.phase === 'play' ? Math.max(0, 39 * 60 - s.cur.t) : 39 * 60;
    for (const l of halfLines(curK + KILL_RATE * remT, 3, 4)) if (l > curK) keys.push(`map:${n}:kills:${l}`);
    return keys;
  },
  market(key) {
    const p = key.split(':');
    if (p[0] === 'map') {
      const n = Number(p[1]);
      if (!(n >= 1 && n <= 3)) return null;
      const vs = (r: DotaResult) => (r.maps[n - 1] === undefined ? ('void' as const) : null);
      if (p.length === 2)
        return {
          key,
          title: `Победитель ${n}-й карты`,
          group: 'period',
          outcomes: [
            { key: '1', label: 'П1', settle: (r) => vs(r) ?? bool(r.maps[n - 1] === 0) },
            { key: '2', label: 'П2', settle: (r) => vs(r) ?? bool(r.maps[n - 1] === 1) },
          ],
        } as MarketDef<DotaResult>;
      if (p[2] === 'kills' && p.length === 4) {
        const l = Number(p[3]);
        if (!Number.isFinite(l)) return null;
        return {
          key,
          title: `Тотал убийств, ${n}-я карта`,
          group: 'totals',
          outcomes: [
            { key: 'over', label: `Б ${l}`, settle: (r) => vs(r) ?? over(r.kills[n - 1][0] + r.kills[n - 1][1], l) },
            { key: 'under', label: `М ${l}`, settle: (r) => vs(r) ?? under(r.kills[n - 1][0] + r.kills[n - 1][1], l) },
          ],
        } as MarketDef<DotaResult>;
      }
      return null;
    }
    return seriesMarket(key, 3, { title: 'карты', gen: 'картам' }) as MarketDef<DotaResult> | null;
  },
  scoreboard(s) {
    const w: Pair = [s.maps.filter((x) => x === 0).length, s.maps.filter((x) => x === 1).length];
    const n = s.maps.length + 1;
    const c = s.cur;
    return {
      score: w,
      clock: s.phase === 'play' ? mmss(c.t) : s.phase === 'break' ? 'ПЕР' : s.phase === 'ft' ? 'FT' : '',
      period: s.phase === 'pre' ? 'Bo3' : s.phase === 'ft' ? 'Завершён' : s.phase === 'break' ? 'Пауза между картами' : `Карта ${n}`,
      detail: s.phase === 'play' ? `Убийства ${c.kills[0]}:${c.kills[1]} · золото ${c.gold >= 0 ? '+' : '−'}${Math.abs(Math.round(c.gold / 100) / 10)}k` : undefined,
      stats:
        s.phase === 'play'
          ? [
              { label: 'Убийства', h: c.kills[0], a: c.kills[1] },
              { label: 'Золото, k', h: Math.max(0, Math.round(c.gold / 100) / 10), a: Math.max(0, Math.round(-c.gold / 100) / 10) },
            ]
          : [],
      pressure: s.phase === 'play' ? clamp(sigmoid(c.gold / 5000), 0.08, 0.92) : 0.5,
      isBreak: s.phase === 'break',
    };
  },
};
