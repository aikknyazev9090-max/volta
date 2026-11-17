import { clamp, normal, poisson, type Rng } from '../rng.js';
import { bool, fmtLine, handicap, halfLines, over, under } from './lines.js';
import type { Incident, SportModule } from './types.js';

type Pair = [number, number];

export interface BbState {
  phase: 'pre' | 'play' | 'break' | 'ft';
  q: number; // 0..3 — четверти, 4+ — овертаймы
  t: number;
  qLen: number;
  qs: Pair[];
  ph: number;
  pa: number;
  inc: Incident[];
  run: number; // для полосы давления
  stats: { threes: Pair; fouls: Pair; reb: Pair };
}

export interface BbResult {
  final: Pair;
  reg: Pair;
  h1: Pair;
}

const OT = 300;
const sum = (ps: Pair[]): Pair => ps.reduce<Pair>((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]);

function segLen(s: BbState, q: number) {
  return q < 4 ? s.qLen : OT;
}

function addPoints(mean: number, rng: Rng): number {
  if (mean <= 0) return 0;
  return Math.max(0, Math.round(mean + Math.sqrt(1.4 * mean) * normal(rng)));
}

export const basketball: SportModule<BbState, BbResult> = {
  id: 'basketball',
  name: 'Баскетбол',
  speedFactor: 1,
  mainMarket: 'ml',

  create(home, away, rng) {
    const nba = rng() < 0.5;
    const qLen = nba ? 720 : 600;
    const base = (nba ? 226 : 162) * (0.94 + rng() * 0.1);
    const d = (home.rating - away.rating) / 100;
    const margin = d * (nba ? 28 : 22) + 2.5;
    return {
      phase: 'pre',
      q: 0,
      t: 0,
      qLen,
      qs: [[0, 0], [0, 0], [0, 0], [0, 0]],
      ph: base / 2 + margin / 2,
      pa: base / 2 - margin / 2,
      inc: [],
      run: 0.5,
      stats: { threes: [0, 0], fouls: [0, 0], reb: [0, 0] },
    };
  },

  start(s) {
    s.phase = 'play';
    const i: Incident = { type: 'start', text: 'Матч начался', clock: '1Ч' };
    s.inc.push(i);
    return [i];
  },

  step(s, dt, rng) {
    const out: Incident[] = [];
    const push = (i: Incident) => {
      i.clock ??= `${s.q < 4 ? `${s.q + 1}Ч` : 'ОТ'}`;
      s.inc.push(i);
      if (s.inc.length > 30) s.inc.shift();
      out.push(i);
    };
    if (s.phase === 'pre' || s.phase === 'ft') return out;
    if (s.phase === 'break') {
      s.t += dt;
      const br = s.q === 1 ? 300 : 90;
      if (s.t >= br) {
        s.q += 1;
        s.t = 0;
        s.phase = 'play';
        if (s.q >= s.qs.length) s.qs.push([0, 0]);
        push({ type: 'period', text: s.q < 4 ? `${s.q + 1}-я четверть` : 'Овертайм' });
      }
      return out;
    }
    const len = segLen(s, s.q);
    const play = Math.min(dt, len - s.t);
    const regLen = s.qLen * 4;
    for (const side of [0, 1] as const) {
      const pts = side === 0 ? s.ph : s.pa;
      const n = poisson((pts / 2.2 / regLen) * play, rng);
      for (let k = 0; k < n; k++) {
        const r = rng();
        const v = r < 0.6 ? 2 : r < 0.9 ? 3 : 1;
        s.qs[s.q][side] += v;
        if (v === 3) s.stats.threes[side] += 1;
        s.run = clamp(s.run + (side === 0 ? 0.06 : -0.06), 0.1, 0.9);
      }
      s.stats.reb[side] += poisson((44 / regLen) * play, rng);
      s.stats.fouls[side] += poisson((19 / regLen) * play, rng);
    }
    s.run += (0.5 - s.run) * 0.05;
    s.t += play;
    if (s.t >= len) {
      const tot = sum(s.qs);
      if (s.q >= 3 && tot[0] !== tot[1]) {
        s.phase = 'ft';
        push({ type: 'finish', text: `Матч завершён ${tot[0]}:${tot[1]}` });
      } else {
        s.phase = 'break';
        s.t = 0;
        push({ type: 'period', text: s.q < 4 ? `${s.q + 1}-я четверть завершена` : 'Овертайм завершён' });
      }
    }
    return out;
  },

  finished: (s) => s.phase === 'ft',

  simulate(s, rng) {
    if (s.phase === 'ft') return basketball.result(s);
    const regLen = s.qLen * 4;
    const qs = s.qs.map((p) => [p[0], p[1]] as Pair);
    const start = s.phase === 'pre' ? 0 : s.phase === 'play' ? s.q : s.q + 1;
    for (let q = start; q < 4; q++) {
      const rem = q === s.q && s.phase === 'play' ? Math.max(0, s.qLen - s.t) : s.qLen;
      qs[q][0] += addPoints((s.ph * rem) / regLen, rng);
      qs[q][1] += addPoints((s.pa * rem) / regLen, rng);
    }
    const reg = sum(qs.slice(0, 4));
    const h1: Pair = [qs[0][0] + qs[1][0], qs[0][1] + qs[1][1]];
    const final: Pair = sum(qs);
    // текущий овертайм
    if (s.q >= 4 && s.phase === 'play') {
      const rem = Math.max(0, OT - s.t);
      final[0] += addPoints((s.ph * rem) / regLen, rng);
      final[1] += addPoints((s.pa * rem) / regLen, rng);
    }
    let guard = 0;
    while (final[0] === final[1] && guard++ < 10) {
      final[0] += addPoints((s.ph * OT) / regLen, rng);
      final[1] += addPoints((s.pa * OT) / regLen, rng);
    }
    if (final[0] === final[1]) final[rng() < 0.5 ? 0 : 1] += 1;
    return { final, reg, h1 };
  },

  result(s) {
    const reg = sum(s.qs.slice(0, 4));
    return { final: sum(s.qs), reg, h1: [s.qs[0][0] + s.qs[1][0], s.qs[0][1] + s.qs[1][1]] };
  },

  offer(s) {
    const regLen = s.qLen * 4;
    const cur = sum(s.qs);
    const played = s.phase === 'pre' ? 0 : Math.min(regLen, (Math.min(s.q, 4)) * s.qLen + (s.phase === 'play' && s.q < 4 ? s.t : s.phase === 'break' ? s.qLen : 0));
    const remFrac = Math.max(0, (regLen - played) / regLen);
    const expMargin = cur[0] - cur[1] + (s.ph - s.pa) * remFrac;
    const expTotal = cur[0] + cur[1] + (s.ph + s.pa) * remFrac;
    const keys = ['ml', 'reg1x2'];
    const main = -Math.round(expMargin) - 0.5;
    for (const d of [-4, -2, 0, 2, 4]) keys.push(`hcp:${main + d}`);
    for (const l of halfLines(expTotal, 5, 3)) keys.push(`total:${l}`);
    const eh = cur[0] + s.ph * remFrac;
    const ea = cur[1] + s.pa * remFrac;
    for (const l of halfLines(eh, 3, 2)) keys.push(`it1:${l}`);
    for (const l of halfLines(ea, 3, 2)) keys.push(`it2:${l}`);
    if (s.phase === 'pre' || (s.q < 2 && !(s.q === 1 && s.phase === 'break'))) {
      keys.push('h1:ml');
      const h1 = s.qs[0][0] + s.qs[0][1] + s.qs[1][0] + s.qs[1][1];
      const halfPlayed = Math.min(1, played / (regLen / 2));
      for (const l of halfLines(h1 + ((s.ph + s.pa) / 2) * (1 - halfPlayed), 3, 3)) keys.push(`h1:total:${l}`);
    }
    keys.push('oddeven');
    return keys;
  },

  market(key) {
    const p = key.split(':');
    if (key === 'ml')
      return {
        key,
        title: 'Победитель (вкл. ОТ)',
        group: 'main',
        outcomes: [
          { key: '1', label: 'П1', settle: (r) => bool(r.final[0] > r.final[1]) },
          { key: '2', label: 'П2', settle: (r) => bool(r.final[0] < r.final[1]) },
        ],
      };
    if (key === 'reg1x2')
      return {
        key,
        title: 'Исход (осн. время)',
        group: 'main',
        outcomes: [
          { key: '1', label: 'П1', settle: (r) => bool(r.reg[0] > r.reg[1]) },
          { key: 'X', label: 'Х', settle: (r) => bool(r.reg[0] === r.reg[1]) },
          { key: '2', label: 'П2', settle: (r) => bool(r.reg[0] < r.reg[1]) },
        ],
      };
    if (key === 'oddeven')
      return {
        key,
        title: 'Чёт / нечет',
        group: 'totals',
        outcomes: [
          { key: 'even', label: 'Чёт', settle: (r) => bool((r.final[0] + r.final[1]) % 2 === 0) },
          { key: 'odd', label: 'Нечет', settle: (r) => bool((r.final[0] + r.final[1]) % 2 === 1) },
        ],
      };
    if (key === 'h1:ml')
      return {
        key,
        title: 'Исход 1-й половины',
        group: 'period',
        outcomes: [
          { key: '1', label: 'П1', settle: (r) => bool(r.h1[0] > r.h1[1]) },
          { key: 'X', label: 'Х', settle: (r) => bool(r.h1[0] === r.h1[1]) },
          { key: '2', label: 'П2', settle: (r) => bool(r.h1[0] < r.h1[1]) },
        ],
      };
    if (p[0] === 'h1' && p[1] === 'total') {
      const l = Number(p[2]);
      if (!Number.isFinite(l)) return null;
      return {
        key,
        title: 'Тотал 1-й половины',
        group: 'period',
        outcomes: [
          { key: 'over', label: `Б ${l}`, settle: (r) => over(r.h1[0] + r.h1[1], l) },
          { key: 'under', label: `М ${l}`, settle: (r) => under(r.h1[0] + r.h1[1], l) },
        ],
      };
    }
    const l = Number(p[1]);
    if (p.length !== 2 || !Number.isFinite(l)) return null;
    if (p[0] === 'hcp')
      return {
        key,
        title: 'Фора (вкл. ОТ)',
        group: 'handicap',
        outcomes: [
          { key: '1', label: `Ф1 (${fmtLine(l)})`, settle: (r) => handicap(r.final[0], r.final[1], l) },
          { key: '2', label: `Ф2 (${fmtLine(-l)})`, settle: (r) => handicap(r.final[1], r.final[0], -l) },
        ],
      };
    if (p[0] === 'total')
      return {
        key,
        title: 'Тотал очков (вкл. ОТ)',
        group: 'totals',
        outcomes: [
          { key: 'over', label: `Б ${l}`, settle: (r) => over(r.final[0] + r.final[1], l) },
          { key: 'under', label: `М ${l}`, settle: (r) => under(r.final[0] + r.final[1], l) },
        ],
      };
    if (p[0] === 'it1' || p[0] === 'it2') {
      const side = p[0] === 'it1' ? 0 : 1;
      return {
        key,
        title: side === 0 ? 'Индивидуальный тотал хозяев' : 'Индивидуальный тотал гостей',
        group: 'totals',
        outcomes: [
          { key: 'over', label: `Б ${l}`, settle: (r) => over(r.final[side], l) },
          { key: 'under', label: `М ${l}`, settle: (r) => under(r.final[side], l) },
        ],
      };
    }
    return null;
  },

  scoreboard(s) {
    const score = sum(s.qs);
    const rem = Math.max(0, segLen(s, s.q) - s.t);
    const mm = String(Math.floor(rem / 60)).padStart(2, '0');
    const ss = String(Math.floor(rem % 60)).padStart(2, '0');
    const qName = s.q < 4 ? `${s.q + 1}-я четверть` : s.q === 4 ? 'Овертайм' : `Овертайм ${s.q - 3}`;
    let period = qName;
    let clock = `${mm}:${ss}`;
    if (s.phase === 'pre') {
      period = 'Скоро начало';
      clock = '';
    } else if (s.phase === 'break') {
      period = s.q === 1 ? 'Большой перерыв' : 'Перерыв';
      clock = 'ПЕР';
    } else if (s.phase === 'ft') {
      period = 'Завершён';
      clock = 'FT';
    }
    return {
      score,
      clock,
      period,
      detail: s.phase === 'pre' ? undefined : s.qs.slice(0, s.phase === 'ft' ? s.qs.length : s.q + 1).map((q) => `${q[0]}:${q[1]}`).join(' '),
      stats: [
        { label: 'Трёхочковые', h: s.stats.threes[0], a: s.stats.threes[1] },
        { label: 'Подборы', h: s.stats.reb[0], a: s.stats.reb[1] },
        { label: 'Фолы', h: s.stats.fouls[0], a: s.stats.fouls[1] },
      ],
      pressure: s.run,
      isBreak: s.phase === 'break',
    };
  },
};
