import { beforeAll, describe, expect, it } from 'vitest';
import { q } from '../src/db.js';
import { createEvent, events, forceFinish, cancelEvent, setFinishHandler } from '../src/engine/live.js';
import { placeBets, settleEvent, listBets, cashoutQuote } from '../src/services/bets.js';
import { upsertUser, claimBonus } from '../src/services/users.js';
import { auditWallet, getBalance } from '../src/services/wallet.js';

let uid = 0;
beforeAll(() => {
  setFinishHandler((ev) => settleEvent(ev));
  uid = upsertUser({ id: 777, first_name: 'Тест' }).user.id;
});

const pickMain = (evId: string, outcome = '1') => {
  const ev = events.get(evId)!;
  const m = ev.markets.find((x) => x.key === '1x2' || x.key === 'ml')!;
  const o = m.outcomes.find((x) => x.key === outcome && x.odds) ?? m.outcomes.find((x) => x.odds)!;
  return { eventId: evId, market: m.key, outcome: o.key, odds: o.odds! };
};

describe('ставки и расчёт', () => {
  it('стартовый баланс 10 000', () => {
    expect(getBalance(uid)).toBe(10_000 * 100);
  });

  it('ординар списывает ставку и рассчитывается', () => {
    const ev = createEvent({ sport: 'football', startAt: Date.now() + 3600e3 })!;
    const sel = pickMain(ev.id);
    const r = placeBets(uid, 777, { type: 'single', stake: 100, accept: 'any', selections: [sel] });
    expect(r.balance).toBe(9_900);
    forceFinish(ev);
    const bet = listBets(uid, 'settled')[0];
    expect(['won', 'lost']).toContain(bet.status);
    if (bet.status === 'won') expect(bet.payout).toBeCloseTo(Math.floor(100 * sel.odds * 100) / 100, 2);
    expect(auditWallet(uid).ok).toBe(true);
  });

  it('повторный расчёт не начисляет дважды', () => {
    const before = getBalance(uid);
    const ev = [...events.values()].find((e) => e.status === 'finished')!;
    settleEvent(ev);
    settleEvent(ev);
    expect(getBalance(uid)).toBe(before);
  });

  it('экспресс: нельзя два исхода одного матча', () => {
    const ev = createEvent({ sport: 'hockey', startAt: Date.now() + 3600e3 })!;
    const a = pickMain(ev.id, '1');
    const b = pickMain(ev.id, '2');
    expect(() => placeBets(uid, 777, { type: 'express', stake: 50, accept: 'any', selections: [a, b] })).toThrow(/одного матча/);
  });

  it('экспресс и отмена событий = возврат', () => {
    const e1 = createEvent({ sport: 'basketball', startAt: Date.now() + 3600e3 })!;
    const e2 = createEvent({ sport: 'tennis', startAt: Date.now() + 3600e3 })!;
    const bal0 = getBalance(uid);
    placeBets(uid, 777, { type: 'express', stake: 200, accept: 'any', selections: [pickMain(e1.id), pickMain(e2.id)] });
    expect(getBalance(uid)).toBe(bal0 - 20_000);
    cancelEvent(e1);
    cancelEvent(e2);
    const bet = listBets(uid, 'settled')[0];
    expect(bet.status).toBe('void');
    expect(getBalance(uid)).toBe(bal0);
    expect(auditWallet(uid).ok).toBe(true);
  });

  it('изменение коэффициента и режимы принятия', () => {
    const ev = createEvent({ sport: 'football', startAt: Date.now() + 3600e3 })!;
    const sel = pickMain(ev.id);
    expect(() => placeBets(uid, 777, { type: 'single', stake: 100, accept: 'none', selections: [{ ...sel, odds: sel.odds + 0.5 }] })).toThrow(/изменились/);
    expect(() => placeBets(uid, 777, { type: 'single', stake: 100, accept: 'up', selections: [{ ...sel, odds: sel.odds + 0.5 }] })).toThrow();
    expect(placeBets(uid, 777, { type: 'single', stake: 100, accept: 'up', selections: [{ ...sel, odds: sel.odds - 0.1 }] }).bets.length).toBe(1);
  });

  it('недостаточно средств и лимиты', () => {
    const ev = createEvent({ sport: 'mma', startAt: Date.now() + 3600e3 })!;
    const sel = pickMain(ev.id);
    expect(() => placeBets(uid, 777, { type: 'single', stake: 5, accept: 'any', selections: [sel] })).toThrow(/Минимальная/);
    expect(() => placeBets(uid, 777, { type: 'single', stake: 49_000, accept: 'any', selections: [sel] })).toThrow(/Недостаточно/);
  });

  it('досрочный выкуп доступен для активной ставки', () => {
    const ev = createEvent({ sport: 'football', startAt: Date.now() + 3600e3 })!;
    const r = placeBets(uid, 777, { type: 'single', stake: 100, accept: 'any', selections: [pickMain(ev.id)] });
    const qt = cashoutQuote(r.bets[0].id, uid);
    expect(qt.available).toBe(true);
    expect(qt.amount).toBeGreaterThan(70);
    expect(qt.amount).toBeLessThan(100);
  });

  it('ежедневный бонус один раз в день', () => {
    const r = claimBonus(uid);
    expect(r.amount).toBe(500);
    expect(() => claimBonus(uid)).toThrow(/уже получен/);
    expect(auditWallet(uid).ok).toBe(true);
  });

  it('журнал сходится с балансом у всех', () => {
    const rows = q.all<{ id: number }>('SELECT id FROM users');
    for (const r of rows) expect(auditWallet(r.id).ok).toBe(true);
  });
});
