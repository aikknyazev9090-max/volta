import { clamp, type Rng } from '../rng.js';
import { bool } from './lines.js';
import type { Incident, SportModule } from './types.js';

type Pair = [number, number];
type Method = 'ko' | 'sub' | 'dec';

export interface MmaState {
  phase: 'pre' | 'play' | 'break' | 'ft';
  round: number; // 0..2
  t: number;
  hazard: number; // шанс досрочной победы в секунду
  pFin: number; // доля досрочных побед хозяина
  pRound: number; // шанс хозяина выиграть раунд
  rounds: (0 | 1)[];
  fin: null | { winner: 0 | 1; method: Method; round: number; time: number };
  strikes: Pair;
  takedowns: Pair;
  inc: Incident[];
}
export interface MmaResult {
  winner: 0 | 1;
  method: Method;
  /** Общее время боя в секундах. */
  time: number;
}

const ROUND = 300;
const ROUNDS = 3;
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function finishMethod(rng: Rng): Method {
  return rng() < 0.64 ? 'ko' : 'sub';
}

function decision(rounds: (0 | 1)[]): 0 | 1 {
  const h = rounds.filter((r) => r === 0).length;
  return h * 2 > rounds.length ? 0 : 1;
}

export const mma: SportModule<MmaState, MmaResult> = {
  id: 'mma',
  name: 'MMA',
  speedFactor: 0.6,
  mainMarket: 'ml',
  create(home, away, rng) {
    const d = (home.rating - away.rating) / 100;
    const finRate = 0.35 + rng() * 0.35; // доля боёв, закончившихся досрочно
    return {
      phase: 'pre',
      round: 0,
      t: 0,
      hazard: -Math.log(1 - finRate) / (ROUND * ROUNDS),
      pFin: clamp(0.5 + d * 1.1, 0.15, 0.85),
      pRound: clamp(0.5 + d * 0.9, 0.2, 0.8),
      rounds: [],
      fin: null,
      strikes: [0, 0],
      takedowns: [0, 0],
      inc: [],
    };
  },
  start(s) {
    s.phase = 'play';
    const i: Incident = { type: 'start', text: 'Бой начался', clock: 'R1' };
    s.inc.push(i);
    return [i];
  },
  step(s, dt, rng) {
    const out: Incident[] = [];
    const push = (i: Incident) => {
      i.clock ??= `R${s.round + 1} ${mmss(s.t)}`;
      s.inc.push(i);
      out.push(i);
    };
    if (s.phase === 'pre' || s.phase === 'ft') return out;
    if (s.phase === 'break') {
      s.t += dt;
      if (s.t >= 60) {
        s.round += 1;
        s.t = 0;
        s.phase = 'play';
        push({ type: 'period', text: `Раунд ${s.round + 1}` });
      }
      return out;
    }
    const play = Math.min(dt, ROUND - s.t);
    for (let i = 0; i < Math.round(play / 4); i++) {
      if (rng() < 0.55) s.strikes[rng() < s.pRound ? 0 : 1] += 1;
    }
    if (rng() < play / 240) s.takedowns[rng() < s.pRound ? 0 : 1] += 1;
    if (rng() < 1 - Math.exp(-s.hazard * play)) {
      const winner = rng() < s.pFin ? 0 : 1;
      const method = finishMethod(rng);
      s.t += rng() * play;
      s.fin = { winner, method, round: s.round + 1, time: s.round * ROUND + s.t };
      s.phase = 'ft';
      push({ type: 'finish', side: winner, text: method === 'ko' ? 'Нокаут!' : 'Болевой приём — сдача' });
      return out;
    }
    s.t += play;
    if (s.t >= ROUND) {
      const w: 0 | 1 = rng() < s.pRound ? 0 : 1;
      s.rounds.push(w);
      push({ type: 'period', side: w, text: `Раунд ${s.round + 1} за ${w === 0 ? 'красным углом' : 'синим углом'}` });
      if (s.round >= ROUNDS - 1) {
        const winner = decision(s.rounds);
        s.fin = { winner, method: 'dec', round: ROUNDS, time: ROUND * ROUNDS };
        s.phase = 'ft';
        push({ type: 'finish', side: winner, text: 'Победа решением судей' });
      } else {
        s.phase = 'break';
        s.t = 0;
      }
    }
    return out;
  },
  finished: (s) => s.phase === 'ft',
  simulate(s, rng) {
    if (s.fin) return { winner: s.fin.winner, method: s.fin.method, time: s.fin.time };
    const rounds = [...s.rounds];
    let r = s.phase === 'break' ? s.round + 1 : s.round;
    let t = s.phase === 'play' ? s.t : 0;
    for (; r < ROUNDS; r++) {
      const rem = ROUND - t;
      // время до досрочной победы — экспоненциальное
      const ttf = -Math.log(1 - rng()) / s.hazard;
      if (ttf < rem) {
        return { winner: rng() < s.pFin ? 0 : 1, method: finishMethod(rng), time: r * ROUND + t + ttf };
      }
      rounds.push(rng() < s.pRound ? 0 : 1);
      t = 0;
    }
    return { winner: decision(rounds), method: 'dec', time: ROUND * ROUNDS };
  },
  result(s) {
    const f = s.fin!;
    return { winner: f.winner, method: f.method, time: f.time };
  },
  offer(s) {
    if (s.phase === 'ft') return [];
    const elapsed = (s.phase === 'break' ? s.round + 1 : s.round) * ROUND + (s.phase === 'play' ? s.t : 0);
    const keys = ['ml', 'method', 'wm', 'distance'];
    if (elapsed < 450) keys.push('rounds:1.5');
    if (elapsed < 750) keys.push('rounds:2.5');
    return keys;
  },
  market(key) {
    if (key === 'ml')
      return {
        key,
        title: 'Победитель боя',
        group: 'main',
        outcomes: [
          { key: '1', label: 'П1', settle: (r) => bool(r.winner === 0) },
          { key: '2', label: 'П2', settle: (r) => bool(r.winner === 1) },
        ],
      };
    if (key === 'method')
      return {
        key,
        title: 'Способ победы',
        group: 'other',
        outcomes: [
          { key: 'ko', label: 'KO / TKO', settle: (r) => bool(r.method === 'ko') },
          { key: 'sub', label: 'Сабмишн', settle: (r) => bool(r.method === 'sub') },
          { key: 'dec', label: 'Решение', settle: (r) => bool(r.method === 'dec') },
        ],
      };
    if (key === 'wm') {
      const names: Record<Method, string> = { ko: 'KO', sub: 'сабмишн', dec: 'решение' };
      const outcomes = ([0, 1] as const).flatMap((w) =>
        (['ko', 'sub', 'dec'] as Method[]).map((m) => ({
          key: `${w + 1}-${m}`,
          label: `П${w + 1} · ${names[m]}`,
          settle: (r: MmaResult) => bool(r.winner === w && r.method === m),
        })),
      );
      return { key, title: 'Победитель и способ', group: 'other', layout: 'grid', outcomes };
    }
    if (key === 'distance')
      return {
        key,
        title: 'Бой пройдёт всю дистанцию',
        group: 'main',
        outcomes: [
          { key: 'yes', label: 'Да', settle: (r) => bool(r.method === 'dec') },
          { key: 'no', label: 'Нет', settle: (r) => bool(r.method !== 'dec') },
        ],
      };
    const p = key.split(':');
    if (p[0] === 'rounds' && p.length === 2) {
      const l = Number(p[1]);
      if (l !== 1.5 && l !== 2.5) return null;
      const cut = l * ROUND;
      return {
        key,
        title: 'Тотал раундов',
        group: 'totals',
        outcomes: [
          { key: 'over', label: `Б ${l}`, settle: (r) => bool(r.time > cut) },
          { key: 'under', label: `М ${l}`, settle: (r) => bool(r.time <= cut) },
        ],
      };
    }
    return null;
  },
  scoreboard(s) {
    const won: Pair = [s.rounds.filter((r) => r === 0).length, s.rounds.filter((r) => r === 1).length];
    let period = `Раунд ${s.round + 1} из ${ROUNDS}`;
    let clock = `R${s.round + 1} ${mmss(s.t)}`;
    let detail: string | undefined = s.rounds.length ? `Раунды по оценке: ${won[0]}:${won[1]}` : undefined;
    if (s.phase === 'pre') {
      period = 'Скоро начало';
      clock = '';
    } else if (s.phase === 'break') {
      period = 'Перерыв между раундами';
      clock = 'ПЕР';
    } else if (s.phase === 'ft' && s.fin) {
      period = 'Завершён';
      clock = 'FT';
      const m = s.fin.method === 'ko' ? 'KO/TKO' : s.fin.method === 'sub' ? 'сабмишн' : 'решение';
      detail = `${m}${s.fin.method !== 'dec' ? `, ${s.fin.round}-й раунд` : ''}`;
    }
    const score: Pair = s.fin ? (s.fin.winner === 0 ? [1, 0] : [0, 1]) : won;
    return {
      score,
      clock,
      period,
      detail,
      stats: [
        { label: 'Значимые удары', h: s.strikes[0], a: s.strikes[1] },
        { label: 'Тейкдауны', h: s.takedowns[0], a: s.takedowns[1] },
      ],
      pressure: s.strikes[0] + s.strikes[1] > 0 ? s.strikes[0] / (s.strikes[0] + s.strikes[1]) : 0.5,
      isBreak: s.phase === 'break',
    };
  },
};
