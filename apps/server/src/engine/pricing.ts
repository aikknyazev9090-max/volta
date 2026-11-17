import { mulberry32 } from '../rng.js';
import type { MarketDef, Settle, SportModule } from '../sports/types.js';

export interface PricedOutcome {
  key: string;
  label: string;
  /** null — исход закрыт */
  odds: number | null;
}
export interface PricedMarket {
  key: string;
  title: string;
  group: MarketDef['group'];
  layout?: 'row' | 'grid';
  outcomes: PricedOutcome[];
}

/** Распределение исходов ставки: [win, lose, void, half_win, half_lose]. */
export type Dist = [number, number, number, number, number];
const IDX: Record<Settle, number> = { win: 0, lose: 1, void: 2, half_win: 3, half_lose: 4 };

export function roundOdds(o: number): number {
  if (o < 10) return Math.round(o * 100) / 100;
  if (o < 30) return Math.round(o * 10) / 10;
  return Math.round(o);
}

/** Монте-Карло: распределения для каждого исхода выбранных рынков. */
export function evaluate(sport: SportModule, state: unknown, keys: string[], seed: number, sims: number) {
  const defs = keys.map((k) => sport.market(k)).filter((d): d is MarketDef => !!d);
  const counts = defs.map((d) => d.outcomes.map(() => [0, 0, 0, 0, 0] as Dist));
  const rng = mulberry32(seed);
  for (let i = 0; i < sims; i++) {
    const r = sport.simulate(state, rng);
    for (let m = 0; m < defs.length; m++) {
      const os = defs[m].outcomes;
      for (let o = 0; o < os.length; o++) counts[m][o][IDX[os[o].settle(r)]]++;
    }
  }
  return defs.map((d, m) => ({
    def: d,
    dists: counts[m].map((c) => c.map((x) => x / sims) as Dist),
  }));
}

/** Справедливая вероятность (обратный справедливый коэффициент) с учётом возвратов. */
export function fairQ(d: Dist): number {
  const [w, , v, hw, hl] = d;
  const num = w + hw / 2;
  const den = 1 - v - hw / 2 - hl / 2;
  if (num <= 0) return 0;
  if (den <= 0) return 1;
  return Math.min(1, num / den);
}

/** Ожидаемый множитель выплаты для ставки с коэффициентом odds. */
export function expectedFactor(d: Dist, odds: number): number {
  const [w, , v, hw, hl] = d;
  return w * odds + v + (hw * (1 + odds)) / 2 + hl * 0.5;
}

const MIN_Q = 0.008; // исходы реже ~1:125 закрываем
const DECIDED_Q = 0.975;

export function price(
  sport: SportModule,
  state: unknown,
  seed: number,
  margin: number,
  overrides: Record<string, number> = {},
  sims = 2500,
): PricedMarket[] {
  const keys = sport.offer(state);
  const evals = evaluate(sport, state, keys, seed, sims);
  const out: PricedMarket[] = [];
  for (const { def, dists } of evals) {
    const qs = dists.map(fairQ);
    if (qs.some((x) => x >= DECIDED_Q)) continue;
    const sum = qs.reduce((a, b) => a + b, 0);
    if (sum <= 0) continue;
    // нормализуем и добавляем маржу; для многоисходных рынков (точный счёт) маржа выше
    const m = def.outcomes.length > 4 ? margin * 2 : margin;
    const outcomes: PricedOutcome[] = def.outcomes.map((o, i) => {
      const ov = overrides[`${def.key}|${o.key}`];
      if (ov) return { key: o.key, label: o.label, odds: ov };
      const q = qs[i];
      if (q < MIN_Q) return { key: o.key, label: o.label, odds: null };
      const implied = (q / sum) * (1 + m);
      const odds = Math.max(1.01, roundOdds(1 / implied));
      return { key: o.key, label: o.label, odds };
    });
    if (outcomes.filter((o) => o.odds !== null).length < 2) continue;
    out.push({ key: def.key, title: def.title, group: def.group, layout: def.layout, outcomes });
  }
  return out;
}
