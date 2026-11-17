import { beforeAll, describe, expect, it } from 'vitest';
import { events, isSuspended, setFinishHandler, summary } from '../src/engine/live.js';
import { applyMatches, resultFromScore, type FdMatch } from '../src/real/footballData.js';
import { eloToRating, parseEloCsv, setEloTable } from '../src/real/elo.js';
import { findClub } from '../src/real/clubs.js';
import { listBets, placeBets, settleEvent, cashoutQuote } from '../src/services/bets.js';
import { upsertUser } from '../src/services/users.js';
import { auditWallet, getBalance } from '../src/services/wallet.js';

let uid = 0;
beforeAll(() => {
  setFinishHandler((ev) => settleEvent(ev));
  uid = upsertUser({ id: 991, first_name: 'Реал' }).user.id;
  setEloTable(parseEloCsv('Rank,Club,Country,Level,Elo,From,To\n1,Arsenal,ENG,1,2010,2026-11-01,2026-11-20\n9,Brighton,ENG,1,1800,2026-11-01,2026-11-20\n'));
});

const match = (over: Partial<FdMatch> & { id: number }): FdMatch => ({
  utcDate: new Date(Date.now() + 2 * 3600e3).toISOString(),
  status: 'TIMED',
  competition: { code: 'PL', name: 'Premier League' },
  homeTeam: { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS' },
  awayTeam: { id: 397, name: 'Brighton & Hove Albion FC', shortName: 'Brighton Hove', tla: 'BHA' },
  score: { winner: null, duration: 'REGULAR', fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
  ...over,
});

describe('реальные матчи: разбор данных', () => {
  it('итог основного времени', () => {
    const r = resultFromScore({ winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home: 2, away: 1 }, halfTime: { home: 0, away: 1 } });
    expect(r).toEqual({ reg: [2, 1], p1: [0, 1], winner: 0, final: [2, 1] });
  });

  it('доп. время и пенальти: исход 1X2 по основному времени', () => {
    const r = resultFromScore({
      winner: 'AWAY_TEAM',
      duration: 'PENALTY_SHOOTOUT',
      fullTime: { home: 5, away: 6 },
      halfTime: { home: 1, away: 0 },
      regularTime: { home: 1, away: 1 },
    });
    expect(r?.reg).toEqual([1, 1]);
    expect(r?.winner).toBe(1);
  });

  it('без счёта первого тайма расчёт откладывается', () => {
    expect(resultFromScore({ winner: 'DRAW', duration: 'REGULAR', fullTime: { home: 0, away: 0 }, halfTime: { home: null, away: null } })).toBeNull();
  });

  it('клубы и рейтинг', () => {
    expect(findClub('Brighton Hove')?.ru).toBe('Брайтон');
    expect(findClub('FC Bayern München')?.ru).toBe('Бавария');
    expect(eloToRating(1600)).toBe(50);
    expect(eloToRating(2000)).toBe(83);
  });
});

describe('реальные матчи: ставки', () => {
  it('матч появляется с коэффициентами, фаворит по Эло', () => {
    applyMatches([match({ id: 1001 })]);
    const ev = events.get('real-1001')!;
    expect(ev).toBeTruthy();
    expect(ev.home.name).toBe('Арсенал');
    const s = summary(ev);
    expect(s.real).toBe(true);
    expect(s.league.name).toBe('Англия. Премьер-лига');
    const m = ev.markets.find((x) => x.key === '1x2')!;
    const o1 = m.outcomes.find((o) => o.key === '1')!.odds!;
    const o2 = m.outcomes.find((o) => o.key === '2')!.odds!;
    expect(o1).toBeLessThan(o2);
  });

  it('повторная загрузка не дублирует матч, старт скоро — не добавляем', () => {
    const n = events.size;
    applyMatches([match({ id: 1001 }), match({ id: 1002, utcDate: new Date(Date.now() + 3 * 60e3).toISOString() })]);
    expect(events.size).toBe(n);
  });

  it('после начала ставок нет, расчёт по итоговому счёту', () => {
    const ev = events.get('real-1001')!;
    const m = ev.markets.find((x) => x.key === '1x2')!;
    const o = m.outcomes.find((x) => x.key === '1')!;
    const bal0 = getBalance(uid);
    placeBets(uid, 991, { type: 'single', stake: 100, accept: 'any', selections: [{ eventId: ev.id, market: '1x2', outcome: '1', odds: o.odds! }] });

    // стартовый свисток (имитируем наступление времени начала)
    ev.startAt = Date.now() - 1000;
    applyMatches([match({ id: 1001, utcDate: new Date(ev.startAt).toISOString(), status: 'IN_PLAY', score: { winner: null, fullTime: { home: 1, away: 0 }, halfTime: { home: 1, away: 0 } } })]);
    ev.status = 'live';
    ev.markets = [];
    expect(isSuspended(ev)).toBe(true);
    expect(summary(ev).sb.score).toEqual([1, 0]);
    expect(cashoutQuote(listBets(uid, 'active')[0].id, uid).available).toBe(false);
    expect(() => placeBets(uid, 991, { type: 'single', stake: 100, accept: 'any', selections: [{ eventId: ev.id, market: '1x2', outcome: '1', odds: o.odds! }] })).toThrow();

    applyMatches([match({ id: 1001, status: 'FINISHED', score: { winner: 'HOME_TEAM', duration: 'REGULAR', fullTime: { home: 2, away: 0 }, halfTime: { home: 1, away: 0 } } })]);
    expect(ev.status).toBe('finished');
    expect(summary(ev).sb.score).toEqual([2, 0]);
    const bet = listBets(uid, 'settled')[0];
    expect(bet.status).toBe('won');
    expect(getBalance(uid)).toBe(bal0 - 10_000 + Math.floor(10_000 * o.odds!));
    expect(auditWallet(uid).ok).toBe(true);
  });

  it('перенос матча — возврат ставки', () => {
    applyMatches([match({ id: 1003 })]);
    const ev = events.get('real-1003')!;
    const o = ev.markets.find((x) => x.key === '1x2')!.outcomes.find((x) => x.key === 'X')!;
    const bal0 = getBalance(uid);
    placeBets(uid, 991, { type: 'single', stake: 50, accept: 'any', selections: [{ eventId: ev.id, market: '1x2', outcome: 'X', odds: o.odds! }] });
    applyMatches([match({ id: 1003, status: 'POSTPONED' })]);
    expect(ev.status).toBe('cancelled');
    expect(getBalance(uid)).toBe(bal0);
  });
});

describe('сила по турнирной таблице', async () => {
  const { ratingFromRow } = await import('../src/real/standings.js');
  it('лидер сильнее аутсайдера, в начале сезона ближе к среднему', () => {
    const top = ratingFromRow({ team: { id: 1 }, playedGames: 12, points: 29, goalDifference: 16 });
    const low = ratingFromRow({ team: { id: 2 }, playedGames: 12, points: 7, goalDifference: -14 });
    const early = ratingFromRow({ team: { id: 3 }, playedGames: 1, points: 3, goalDifference: 3 });
    expect(top).toBeGreaterThan(78);
    expect(low).toBeLessThan(48);
    expect(early).toBeLessThanOrEqual(66);
  });
});
