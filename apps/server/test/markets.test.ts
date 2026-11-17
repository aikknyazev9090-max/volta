import { describe, expect, it } from 'vitest';
import { SPORTS, SPORT_ORDER } from '../src/sports/index.js';
import { LEAGUES } from '../src/teams.js';
import { mulberry32 } from '../src/rng.js';
import { price, evaluate, fairQ } from '../src/engine/pricing.js';

const st = (r: any) => r;

describe('рынки футбола', () => {
  const fb = SPORTS.football;
  const res = st({ reg: [2, 1], p1: [0, 1], winner: 0, final: [2, 1] });
  const s = (m: string, o: string) => fb.market(m)!.outcomes.find((x) => x.key === o)!.settle(res);
  it('исходы', () => {
    expect(s('1x2', '1')).toBe('win');
    expect(s('1x2', 'X')).toBe('lose');
    expect(s('dc', '1X')).toBe('win');
    expect(s('dc', 'X2')).toBe('lose');
    expect(s('btts', 'yes')).toBe('win');
    expect(s('total:2.5', 'over')).toBe('win');
    expect(s('total:3.5', 'under')).toBe('win');
    expect(s('hcp:-1.5', '1')).toBe('lose');
    expect(s('hcp:-1.5', '2')).toBe('win');
    expect(s('hcp:-1', '1')).toBe('void');
    expect(s('p1:1x2', '2')).toBe('win');
    expect(s('cs', '2-1')).toBe('win');
    expect(s('cs', '1-1')).toBe('lose');
    expect(s('it1:1.5', 'over')).toBe('win');
    expect(s('oddeven', 'odd')).toBe('win');
    expect(s('dnb', '1')).toBe('win');
  });
  it('ничья: фора 0 — возврат', () => {
    const d = st({ reg: [1, 1], p1: [0, 0], winner: null, final: [1, 1] });
    expect(fb.market('dnb')!.outcomes[0].settle(d)).toBe('void');
    expect(fb.market('cs')!.outcomes.find((o) => o.key === '1-1')!.settle(d)).toBe('win');
  });
});

describe('хоккей и серии', () => {
  it('хоккей: победа в ОТ не влияет на 1X2 основного времени', () => {
    const r = st({ reg: [2, 2], p1: [1, 0], winner: 1, final: [2, 3] });
    expect(SPORTS.hockey.market('1x2')!.outcomes[1].settle(r)).toBe('win');
    expect(SPORTS.hockey.market('ml')!.outcomes[1].settle(r)).toBe('win');
  });
  it('теннис: счёт по сетам и фора', () => {
    const r = st({ sets: [[6, 4], [3, 6], [7, 6]], won: [2, 1], winner: 0, games: 32 });
    const t = SPORTS.tennis;
    expect(t.market('score')!.outcomes.find((o) => o.key === '2-1')!.settle(r)).toBe('win');
    expect(t.market('uhcp:-1.5')!.outcomes[0].settle(r)).toBe('lose');
    expect(t.market('units:2.5')!.outcomes[0].settle(r)).toBe('win');
    expect(t.market('games:22.5')!.outcomes[0].settle(r)).toBe('win');
    expect(t.market('set:2')!.outcomes[1].settle(r)).toBe('win');
  });
  it('несыгранная карта — возврат', () => {
    const r = st({ maps: [[13, 5], [13, 9]], won: [2, 0], winner: 0 });
    expect(SPORTS.cs2.market('map:3')!.outcomes[0].settle(r)).toBe('void');
  });
  it('MMA', () => {
    const r = st({ winner: 1, method: 'sub', time: 400 });
    const m = SPORTS.mma;
    expect(m.market('ml')!.outcomes[1].settle(r)).toBe('win');
    expect(m.market('rounds:1.5')!.outcomes[1].settle(r)).toBe('win');
    expect(m.market('wm')!.outcomes.find((o) => o.key === '2-sub')!.settle(r)).toBe('win');
    expect(m.market('distance')!.outcomes[1].settle(r)).toBe('win');
  });
});

describe('симуляция всех видов спорта', () => {
  for (const id of SPORT_ORDER) {
    it(`${id}: матч доигрывается, рынки рассчитываются, коэффициенты адекватны`, () => {
      const sp = SPORTS[id];
      const lg = LEAGUES.find((l) => l.sport === id)!;
      const rng = mulberry32(42);
      const s = sp.create(lg.teams[0], lg.teams[1], rng);
      const markets = price(sp, s, 1, 0.06, {}, 1500);
      expect(markets.length).toBeGreaterThan(2);
      const main = markets.find((m) => m.key === sp.mainMarket)!;
      expect(main).toBeTruthy();
      const margin = main.outcomes.reduce((a, o) => a + 1 / o.odds!, 0);
      expect(margin).toBeGreaterThan(1.02);
      expect(margin).toBeLessThan(1.1);
      sp.start(s);
      let guard = 0;
      while (!sp.finished(s) && guard++ < 100000) sp.step(s, 7, rng);
      expect(sp.finished(s)).toBe(true);
      const r = sp.result(s);
      for (const k of sp.offer(sp.create(lg.teams[0], lg.teams[1], rng))) {
        const def = sp.market(k)!;
        expect(def, k).toBeTruthy();
        for (const o of def.outcomes) expect(['win', 'lose', 'void', 'half_win', 'half_lose']).toContain(o.settle(r));
      }
      expect(JSON.stringify(sp.simulate(s, rng))).toBe(JSON.stringify(r));
    });
  }
  it('фаворит имеет меньший коэффициент', () => {
    const lg = LEAGUES.find((l) => l.id === 'epl')!;
    const strong = { ...lg.teams[0], rating: 95 };
    const weak = { ...lg.teams[1], rating: 55 };
    const s = SPORTS.football.create(strong, weak, mulberry32(1));
    const [e] = evaluate(SPORTS.football, s, ['1x2'], 7, 4000);
    expect(fairQ(e.dists[0])).toBeGreaterThan(fairQ(e.dists[2]) * 2);
  });
});
