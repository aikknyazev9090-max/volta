import type { Settle } from './types.js';

/** Знак разницы → исход. */
export function sign(v: number): Settle {
  if (v > 1e-9) return 'win';
  if (v < -1e-9) return 'lose';
  return 'void';
}

function combine(a: Settle, b: Settle): Settle {
  if (a === b) return a;
  const set = new Set([a, b]);
  if (set.has('win') && set.has('void')) return 'half_win';
  if (set.has('lose') && set.has('void')) return 'half_lose';
  // теоретически недостижимо для соседних половинных линий
  return 'void';
}

/**
 * Азиатская линия: f(l) — «запас» ставки для линии l (>0 — выигрыш).
 * Четвертные линии (x.25 / x.75) делятся на две половины.
 */
export function asian(line: number, f: (l: number) => number): Settle {
  const q = Math.round(line * 4);
  if (Math.abs(q % 2) === 1) {
    return combine(sign(f(line - 0.25)), sign(f(line + 0.25)));
  }
  return sign(f(line));
}

export const over = (total: number, line: number) => asian(line, (l) => total - l);
export const under = (total: number, line: number) => asian(line, (l) => l - total);
/** Фора для стороны с результатом mine против opp. */
export const handicap = (mine: number, opp: number, line: number) =>
  asian(line, (l) => mine + l - opp);

export const bool = (x: boolean): Settle => (x ? 'win' : 'lose');

export function fmtLine(n: number): string {
  const s = Number.isInteger(n) ? n.toFixed(0) : String(n);
  return n > 0 ? `+${s}` : s;
}

/** Множитель выплаты для исхода. */
export function payoutFactor(s: Settle, odds: number): number {
  switch (s) {
    case 'win':
      return odds;
    case 'lose':
      return 0;
    case 'void':
      return 1;
    case 'half_win':
      return (1 + odds) / 2;
    case 'half_lose':
      return 0.5;
  }
}

/** Линии вида x.5 вокруг центра. */
export function halfLines(center: number, count: number, step = 1, min = 0.5): number[] {
  const c = Math.floor(center) + 0.5;
  const res: number[] = [];
  const half = Math.floor(count / 2);
  for (let i = -half; i <= half; i++) {
    const v = c + i * step;
    if (v >= min) res.push(v);
  }
  return res;
}
