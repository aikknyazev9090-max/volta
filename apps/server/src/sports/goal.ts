import { clamp, poisson, type Rng } from '../rng.js';
import { bool, fmtLine, handicap, halfLines, over, under } from './lines.js';
import type { Incident, MarketDef, Scoreboard, SportId, SportModule, Team } from './types.js';

/** Модель для «голевых» видов спорта (футбол, хоккей): голы — пуассоновский процесс. */

type Pair = [number, number];

export interface GoalState {
  phase: 'pre' | 'play' | 'break' | 'ot' | 'so' | 'ft';
  p: number;
  t: number;
  ps: Pair[];
  otGoal: Pair;
  so: 0 | 1 | null;
  extra: number[];
  lh: number;
  la: number;
  stats: { shots: Pair; sot: Pair; corners: Pair; cards: Pair; poss: number; pressure: number };
  inc: Incident[];
}

export interface GoalResult {
  reg: Pair;
  p1: Pair;
  winner: 0 | 1 | null;
  final: Pair;
}

interface Cfg {
  id: SportId;
  name: string;
  periods: number;
  periodLen: number;
  breakLen: number;
  /** Ожидаемое число голов за основное время для равных команд. */
  baseTotal: number;
  homeAdv: number;
  ot: null | { len: number };
  periodName: (i: number) => string;
  p1Name: string;
  totalTitle: string;
  hcpTitle: string;
  winnerTitle: string;
  extraTime: boolean;
  csMax: number;
  /** Доля голов по периодам (сумма = числу периодов): во втором тайме забивают чаще. */
  weights?: number[];
}

const sum = (ps: Pair[]): Pair => ps.reduce<Pair>((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0]);

export function goalSport(cfg: Cfg): SportModule<GoalState, GoalResult> {
  const regLen = cfg.periods * cfg.periodLen;
  const w = (i: number) => cfg.weights?.[i] ?? 1;

  const current = (s: GoalState): Pair => {
    const r = sum(s.ps);
    return [r[0] + s.otGoal[0] + (s.so === 0 ? 1 : 0), r[1] + s.otGoal[1] + (s.so === 1 ? 1 : 0)];
  };

  const clockStr = (s: GoalState): string => {
    if (cfg.id === 'football') {
      const base = s.p * cfg.periodLen;
      if (s.t > cfg.periodLen) {
        const over = Math.ceil((s.t - cfg.periodLen) / 60);
        return `${(base + cfg.periodLen) / 60}+${Math.max(1, over)}'`;
      }
      return `${Math.floor((base + s.t) / 60) + 1}'`;
    }
    const m = Math.floor(s.t / 60);
    const sec = Math.floor(s.t % 60);
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const module: SportModule<GoalState, GoalResult> = {
    id: cfg.id,
    name: cfg.name,
    speedFactor: 1,
    mainMarket: '1x2',

    create(home: Team, away: Team, rng: Rng) {
      const d = (home.rating - away.rating) / 100;
      const share = clamp(0.5 + d * 0.9 + cfg.homeAdv, 0.12, 0.88);
      const total = cfg.baseTotal * (0.9 + rng() * 0.25);
      return {
        phase: 'pre',
        p: 0,
        t: 0,
        ps: Array.from({ length: cfg.periods }, () => [0, 0] as Pair),
        otGoal: [0, 0],
        so: null,
        extra: Array.from({ length: cfg.periods }, (_, i) =>
          cfg.extraTime ? (i === cfg.periods - 1 ? 120 + Math.floor(rng() * 300) : 60 + Math.floor(rng() * 180)) : 0,
        ),
        lh: total * share,
        la: total * (1 - share),
        stats: { shots: [0, 0], sot: [0, 0], corners: [0, 0], cards: [0, 0], poss: 0.5, pressure: 0.5 },
        inc: [],
      };
    },

    start(s) {
      s.phase = 'play';
      s.p = 0;
      s.t = 0;
      const i: Incident = { type: 'start', text: 'Матч начался', clock: clockStr(s) };
      s.inc.push(i);
      return [i];
    },

    step(s, dt, rng) {
      const out: Incident[] = [];
      const push = (i: Incident) => {
        i.clock ??= clockStr(s);
        s.inc.push(i);
        if (s.inc.length > 30) s.inc.shift();
        out.push(i);
      };
      if (s.phase === 'ft' || s.phase === 'pre') return out;

      if (s.phase === 'break') {
        s.t += dt;
        if (s.t >= cfg.breakLen) {
          s.p += 1;
          s.t = 0;
          s.phase = 'play';
          push({ type: 'period', text: `${cfg.periodName(s.p)} начался` });
        }
        return out;
      }

      if (s.phase === 'so') {
        s.t += dt;
        if (s.t >= 120) {
          const ph = clamp(0.5 + (s.lh - s.la) * 0.04, 0.35, 0.65);
          s.so = rng() < ph ? 0 : 1;
          s.phase = 'ft';
          push({ type: 'goal', side: s.so, text: 'Победный буллит' });
          push({ type: 'finish', text: 'Матч завершён' });
        }
        return out;
      }

      const isOt = s.phase === 'ot';
      const len = isOt ? cfg.ot!.len : cfg.periodLen + s.extra[s.p];
      const play = Math.min(dt, len - s.t);
      // давление — случайное блуждание со сносом к силе команды
      const bias = s.lh / (s.lh + s.la);
      s.stats.pressure = clamp(s.stats.pressure + (bias - s.stats.pressure) * 0.08 + (rng() - 0.5) * 0.12, 0.08, 0.92);
      s.stats.poss = clamp(s.stats.poss + (s.stats.pressure - s.stats.poss) * 0.03, 0.25, 0.75);

      for (const side of [0, 1] as const) {
        const lam = ((side === 0 ? s.lh : s.la) / regLen) * (isOt ? 1 : w(s.p));
        const shareP = side === 0 ? s.stats.pressure : 1 - s.stats.pressure;
        const goals = poisson(lam * play, rng);
        const shotRate = (cfg.id === 'football' ? 13 : 30) / regLen * 2 * shareP;
        const shots = poisson(shotRate * play, rng) + goals;
        if (shots) {
          s.stats.shots[side] += shots;
          s.stats.sot[side] += goals + (rng() < 0.35 ? Math.min(1, shots - goals) : 0);
        }
        if (cfg.id === 'football') {
          s.stats.corners[side] += poisson((5 / regLen) * 2 * shareP * play, rng);
          const c = poisson((1.8 / regLen) * play, rng);
          if (c) {
            s.stats.cards[side] += c;
            push({ type: 'card', side, text: 'Жёлтая карточка' });
          }
        } else {
          const pen = poisson((3.5 / regLen) * play, rng);
          if (pen) {
            s.stats.cards[side] += pen * 2;
            push({ type: 'card', side, text: 'Удаление на 2 минуты' });
          }
        }
        for (let g = 0; g < goals; g++) {
          if (isOt) s.otGoal[side] += 1;
          else s.ps[s.p][side] += 1;
          const sc = current(s);
          push({ type: 'goal', side, text: `Гол! ${sc[0]}:${sc[1]}` });
          s.stats.pressure = side === 0 ? 0.7 : 0.3;
        }
      }
      s.t += play;

      if (isOt && (s.otGoal[0] || s.otGoal[1])) {
        s.phase = 'ft';
        push({ type: 'finish', text: 'Матч завершён в овертайме' });
        return out;
      }

      if (s.t >= len) {
        if (isOt) {
          s.phase = 'so';
          s.t = 0;
          push({ type: 'period', text: 'Серия буллитов' });
        } else if (s.p < cfg.periods - 1) {
          s.phase = 'break';
          s.t = 0;
          push({ type: 'period', text: `${cfg.periodName(s.p)} завершён` });
        } else {
          const r = sum(s.ps);
          if (cfg.ot && r[0] === r[1]) {
            s.phase = 'ot';
            s.t = 0;
            push({ type: 'period', text: 'Овертайм' });
          } else {
            s.phase = 'ft';
            push({ type: 'finish', text: 'Матч завершён' });
          }
        }
      }
      return out;
    },

    finished: (s) => s.phase === 'ft',

    simulate(s, rng) {
      const ps = s.ps.map((x) => [x[0], x[1]] as Pair);
      const startIdx = s.phase === 'pre' ? 0 : s.phase === 'play' ? s.p : s.phase === 'break' ? s.p + 1 : cfg.periods;
      for (let i = startIdx; i < cfg.periods; i++) {
        const rem = i === s.p && s.phase === 'play' ? Math.max(0, cfg.periodLen - s.t) : cfg.periodLen;
        ps[i][0] += poisson((s.lh * rem * w(i)) / regLen, rng);
        ps[i][1] += poisson((s.la * rem * w(i)) / regLen, rng);
      }
      const reg = sum(ps);
      let winner: 0 | 1 | null = reg[0] > reg[1] ? 0 : reg[0] < reg[1] ? 1 : null;
      const final: Pair = [reg[0], reg[1]];
      if (s.phase === 'ft') {
        return module.result(s);
      }
      if (winner === null && cfg.ot) {
        const otRem = s.phase === 'ot' ? cfg.ot.len - s.t : s.phase === 'so' ? 0 : cfg.ot.len;
        const rate = ((s.lh + s.la) / regLen) * otRem;
        if (rng() < 1 - Math.exp(-rate)) {
          winner = rng() < s.lh / (s.lh + s.la) ? 0 : 1;
        } else {
          winner = rng() < clamp(0.5 + (s.lh - s.la) * 0.04, 0.35, 0.65) ? 0 : 1;
        }
        final[winner] += 1;
      }
      return { reg, p1: ps[0], winner, final };
    },

    result(s) {
      const reg = sum(s.ps);
      let winner: 0 | 1 | null = reg[0] > reg[1] ? 0 : reg[0] < reg[1] ? 1 : null;
      if (winner === null && cfg.ot) {
        if (s.otGoal[0]) winner = 0;
        else if (s.otGoal[1]) winner = 1;
        else if (s.so !== null) winner = s.so;
      }
      return { reg, p1: [...s.ps[0]] as Pair, winner, final: current(s) };
    },

    offer(s) {
      const keys = ['1x2', 'dc'];
      if (cfg.ot) keys.push('ml');
      else keys.push('dnb');
      keys.push('btts');
      const cur = sum(s.ps);
      const played = s.phase === 'pre' ? 0 : Math.min(regLen, s.p * cfg.periodLen + (s.phase === 'play' ? s.t : cfg.periodLen));
      const expRem = ((s.lh + s.la) * (regLen - played)) / regLen;
      const center = cur[0] + cur[1] + expRem;
      for (const l of halfLines(center, 5)) keys.push(`total:${l}`);
      const expH = cur[0] + (s.lh * (regLen - played)) / regLen;
      const expA = cur[1] + (s.la * (regLen - played)) / regLen;
      for (const l of halfLines(expH, 3)) keys.push(`it1:${l}`);
      for (const l of halfLines(expA, 3)) keys.push(`it2:${l}`);
      const diff = cur[0] - cur[1] + ((s.lh - s.la) * (regLen - played)) / regLen;
      const mainH = -Math.round(diff * 2) / 2;
      const hset = new Set<number>();
      for (const d of [-1, -0.5, 0, 0.5, 1]) {
        const l = Math.round((mainH + d) * 4) / 4;
        if (l !== 0 || !cfg.ot) hset.add(l);
      }
      for (const d of [-1.5, 1.5]) hset.add(Math.round(mainH) + d);
      for (const l of [...hset].sort((a, b) => a - b)) keys.push(`hcp:${l}`);
      if (s.phase === 'pre' || (s.p === 0 && s.phase === 'play')) {
        keys.push('p1:1x2');
        const c1 = s.ps[0][0] + s.ps[0][1] + ((s.lh + s.la) / cfg.periods) * Math.max(0, 1 - (s.phase === 'play' ? s.t / cfg.periodLen : 0));
        for (const l of halfLines(c1, 3)) keys.push(`p1:total:${l}`);
      }
      keys.push('oddeven');
      keys.push('cs');
      return keys;
    },

    market(key) {
      const parts = key.split(':');
      const R = (r: GoalResult) => r.reg;
      if (key === '1x2')
        return {
          key,
          title: cfg.id === 'football' ? 'Исход матча' : 'Исход (основное время)',
          group: 'main',
          outcomes: [
            { key: '1', label: 'П1', settle: (r) => bool(R(r)[0] > R(r)[1]) },
            { key: 'X', label: 'Х', settle: (r) => bool(R(r)[0] === R(r)[1]) },
            { key: '2', label: 'П2', settle: (r) => bool(R(r)[0] < R(r)[1]) },
          ],
        };
      if (key === 'ml')
        return {
          key,
          title: cfg.winnerTitle,
          group: 'main',
          outcomes: [
            { key: '1', label: 'П1', settle: (r) => bool(r.winner === 0) },
            { key: '2', label: 'П2', settle: (r) => bool(r.winner === 1) },
          ],
        };
      if (key === 'dc')
        return {
          key,
          title: 'Двойной шанс',
          group: 'main',
          outcomes: [
            { key: '1X', label: '1Х', settle: (r) => bool(R(r)[0] >= R(r)[1]) },
            { key: '12', label: '12', settle: (r) => bool(R(r)[0] !== R(r)[1]) },
            { key: 'X2', label: 'Х2', settle: (r) => bool(R(r)[0] <= R(r)[1]) },
          ],
        };
      if (key === 'dnb')
        return {
          key,
          title: 'Ничья — возврат',
          group: 'main',
          outcomes: [
            { key: '1', label: 'П1', settle: (r) => handicap(R(r)[0], R(r)[1], 0) },
            { key: '2', label: 'П2', settle: (r) => handicap(R(r)[1], R(r)[0], 0) },
          ],
        };
      if (key === 'btts')
        return {
          key,
          title: 'Обе забьют',
          group: 'main',
          outcomes: [
            { key: 'yes', label: 'Да', settle: (r) => bool(R(r)[0] > 0 && R(r)[1] > 0) },
            { key: 'no', label: 'Нет', settle: (r) => bool(!(R(r)[0] > 0 && R(r)[1] > 0)) },
          ],
        };
      if (key === 'oddeven')
        return {
          key,
          title: 'Чёт / нечет',
          group: 'totals',
          outcomes: [
            { key: 'even', label: 'Чёт', settle: (r) => bool((R(r)[0] + R(r)[1]) % 2 === 0) },
            { key: 'odd', label: 'Нечет', settle: (r) => bool((R(r)[0] + R(r)[1]) % 2 === 1) },
          ],
        };
      if (parts[0] === 'total' && parts.length === 2) {
        const l = Number(parts[1]);
        if (!Number.isFinite(l)) return null;
        return {
          key,
          title: cfg.totalTitle,
          group: 'totals',
          outcomes: [
            { key: 'over', label: `Б ${l}`, settle: (r) => over(R(r)[0] + R(r)[1], l) },
            { key: 'under', label: `М ${l}`, settle: (r) => under(R(r)[0] + R(r)[1], l) },
          ],
        };
      }
      if ((parts[0] === 'it1' || parts[0] === 'it2') && parts.length === 2) {
        const l = Number(parts[1]);
        if (!Number.isFinite(l)) return null;
        const side = parts[0] === 'it1' ? 0 : 1;
        return {
          key,
          title: side === 0 ? 'Индивидуальный тотал хозяев' : 'Индивидуальный тотал гостей',
          group: 'totals',
          outcomes: [
            { key: 'over', label: `Б ${l}`, settle: (r) => over(R(r)[side], l) },
            { key: 'under', label: `М ${l}`, settle: (r) => under(R(r)[side], l) },
          ],
        };
      }
      if (parts[0] === 'hcp' && parts.length === 2) {
        const l = Number(parts[1]);
        if (!Number.isFinite(l)) return null;
        return {
          key,
          title: cfg.hcpTitle,
          group: 'handicap',
          outcomes: [
            { key: '1', label: `Ф1 (${fmtLine(l)})`, settle: (r) => handicap(R(r)[0], R(r)[1], l) },
            { key: '2', label: `Ф2 (${fmtLine(-l)})`, settle: (r) => handicap(R(r)[1], R(r)[0], -l) },
          ],
        };
      }
      if (key === 'p1:1x2')
        return {
          key,
          title: `Исход: ${cfg.p1Name}`,
          group: 'period',
          outcomes: [
            { key: '1', label: 'П1', settle: (r) => bool(r.p1[0] > r.p1[1]) },
            { key: 'X', label: 'Х', settle: (r) => bool(r.p1[0] === r.p1[1]) },
            { key: '2', label: 'П2', settle: (r) => bool(r.p1[0] < r.p1[1]) },
          ],
        };
      if (parts[0] === 'p1' && parts[1] === 'total' && parts.length === 3) {
        const l = Number(parts[2]);
        if (!Number.isFinite(l)) return null;
        return {
          key,
          title: `Тотал: ${cfg.p1Name}`,
          group: 'period',
          outcomes: [
            { key: 'over', label: `Б ${l}`, settle: (r) => over(r.p1[0] + r.p1[1], l) },
            { key: 'under', label: `М ${l}`, settle: (r) => under(r.p1[0] + r.p1[1], l) },
          ],
        };
      }
      if (key === 'cs') {
        const m = cfg.csMax;
        const outcomes: MarketDef<GoalResult>['outcomes'] = [];
        for (let h = 0; h <= m; h++)
          for (let a = 0; a <= m; a++)
            outcomes.push({ key: `${h}-${a}`, label: `${h}:${a}`, settle: (r) => bool(R(r)[0] === h && R(r)[1] === a) });
        outcomes.push({ key: 'other', label: 'Другой', settle: (r) => bool(R(r)[0] > m || R(r)[1] > m) });
        return { key, title: cfg.id === 'football' ? 'Точный счёт' : 'Точный счёт (осн. время)', group: 'score', layout: 'grid', outcomes };
      }
      return null;
    },

    scoreboard(s): Scoreboard {
      const score = current(s);
      let period = '';
      let clock = '';
      let isBreak = false;
      switch (s.phase) {
        case 'pre':
          period = 'Скоро начало';
          break;
        case 'play':
          period = cfg.periodName(s.p);
          clock = clockStr(s);
          break;
        case 'break':
          period = cfg.id === 'football' ? 'Перерыв' : `Перерыв после ${s.p + 1}-го`;
          clock = cfg.id === 'football' ? 'HT' : 'ПЕР';
          isBreak = true;
          break;
        case 'ot':
          period = 'Овертайм';
          clock = clockStr(s);
          break;
        case 'so':
          period = 'Буллиты';
          clock = 'Б';
          break;
        case 'ft':
          period = 'Завершён';
          clock = 'FT';
          break;
      }
      const st = s.stats;
      const stats =
        cfg.id === 'football'
          ? [
              { label: 'Владение, %', h: Math.round(st.poss * 100), a: 100 - Math.round(st.poss * 100) },
              { label: 'Удары', h: st.shots[0], a: st.shots[1] },
              { label: 'В створ', h: st.sot[0], a: st.sot[1] },
              { label: 'Угловые', h: st.corners[0], a: st.corners[1] },
              { label: 'Жёлтые', h: st.cards[0], a: st.cards[1] },
            ]
          : [
              { label: 'Броски', h: st.shots[0], a: st.shots[1] },
              { label: 'В створ', h: st.sot[0], a: st.sot[1] },
              { label: 'Штраф, мин', h: st.cards[0], a: st.cards[1] },
            ];
      const detail = s.phase === 'pre' ? undefined : s.ps.slice(0, s.phase === 'play' ? s.p + 1 : s.ps.length).map((p) => `${p[0]}:${p[1]}`).join(' ');
      return { score, clock, period, detail: cfg.id === 'football' ? (s.p > 0 || s.phase === 'break' || s.phase === 'ft' ? `1-й тайм ${s.ps[0][0]}:${s.ps[0][1]}` : undefined) : detail, stats, pressure: st.pressure, isBreak };
    },
  };
  return module;
}

export const football = goalSport({
  id: 'football',
  name: 'Футбол',
  periods: 2,
  periodLen: 45 * 60,
  breakLen: 5 * 60,
  baseTotal: 2.65,
  homeAdv: 0.04,
  ot: null,
  periodName: (i) => (i === 0 ? '1-й тайм' : '2-й тайм'),
  p1Name: '1-й тайм',
  totalTitle: 'Тотал голов',
  hcpTitle: 'Фора',
  winnerTitle: 'Победитель',
  extraTime: true,
  csMax: 3,
  weights: [0.9, 1.1],
});

export const hockey = goalSport({
  id: 'hockey',
  name: 'Хоккей',
  periods: 3,
  periodLen: 20 * 60,
  breakLen: 4 * 60,
  baseTotal: 5.4,
  homeAdv: 0.03,
  ot: { len: 5 * 60 },
  periodName: (i) => `${i + 1}-й период`,
  p1Name: '1-й период',
  totalTitle: 'Тотал (осн. время)',
  hcpTitle: 'Фора (осн. время)',
  winnerTitle: 'Победитель (вкл. ОТ и буллиты)',
  extraTime: false,
  csMax: 4,
});
