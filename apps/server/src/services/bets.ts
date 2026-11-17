import { bus } from '../bus.js';
import { SCALE, getSettings } from '../config.js';
import { q, tx } from '../db.js';
import { events, isSuspended, type LiveEvent } from '../engine/live.js';
import { evaluate, expectedFactor } from '../engine/pricing.js';
import { hashStr } from '../rng.js';
import { payoutFactor } from '../sports/lines.js';
import { SPORTS, type Settle } from '../sports/index.js';
import { checkAchievements } from './achievements.js';
import { AppError, move } from './wallet.js';

export interface SelectionInput {
  eventId: string;
  market: string;
  outcome: string;
  odds: number;
}

export interface PlaceInput {
  type: 'single' | 'express';
  stake: number; // монеты
  selections: SelectionInput[];
  accept: 'any' | 'up' | 'none';
}

interface Resolved {
  ev: LiveEvent;
  input: SelectionInput;
  odds: number;
  marketTitle: string;
  label: string;
}

function resolve(sel: SelectionInput): Resolved {
  const ev = events.get(sel.eventId);
  if (!ev || (ev.status !== 'live' && ev.status !== 'scheduled')) throw new AppError('event_closed', 'Событие уже недоступно для ставок', 409, { eventId: sel.eventId });
  if (isSuspended(ev)) throw new AppError('suspended', 'Приём ставок на событие приостановлен', 409, { eventId: sel.eventId });
  const m = ev.markets.find((x) => x.key === sel.market);
  const o = m?.outcomes.find((x) => x.key === sel.outcome);
  if (!m || !o || !o.odds) throw new AppError('market_closed', 'Рынок закрыт', 409, { eventId: sel.eventId, market: sel.market });
  return { ev, input: sel, odds: o.odds, marketTitle: m.title, label: o.label };
}

const eventName = (ev: LiveEvent) => `${ev.home.name} — ${ev.away.name}`;

export function placeBets(userId: number, tgId: number, inp: PlaceInput) {
  const st = getSettings();
  if (!Number.isFinite(inp.stake) || inp.stake < st.minStake) throw new AppError('min_stake', `Минимальная ставка — ${st.minStake} монет`);
  if (inp.stake > st.maxStake) throw new AppError('max_stake', `Максимальная ставка — ${st.maxStake.toLocaleString('ru-RU')} монет`);
  if (!inp.selections.length) throw new AppError('empty', 'Купон пуст');
  if (inp.type === 'express') {
    if (inp.selections.length < 2) throw new AppError('express_min', 'В экспрессе должно быть минимум 2 события');
    if (inp.selections.length > st.maxSelections) throw new AppError('express_max', `Максимум ${st.maxSelections} событий в экспрессе`);
    const ids = new Set(inp.selections.map((s) => s.eventId));
    if (ids.size !== inp.selections.length) throw new AppError('express_same_event', 'В экспресс нельзя добавить два исхода одного матча');
  }

  const resolved = inp.selections.map(resolve);

  // проверка изменения коэффициентов
  const changes = resolved
    .filter((r) => Math.abs(r.odds - r.input.odds) > 1e-9)
    .filter((r) => inp.accept === 'none' || (inp.accept === 'up' && r.odds < r.input.odds))
    .map((r) => ({ eventId: r.input.eventId, market: r.input.market, outcome: r.input.outcome, odds: r.odds }));
  if (changes.length) throw new AppError('odds_changed', 'Коэффициенты изменились', 409, { changes });

  const stakeMinor = Math.round(inp.stake * SCALE);
  const groups: Resolved[][] = inp.type === 'express' ? [resolved] : resolved.map((r) => [r]);

  return tx(() => {
    const ids: number[] = [];
    for (const g of groups) {
      const odds = Math.round(g.reduce((a, r) => a * r.odds, 1) * 100) / 100;
      const potential = Math.floor(stakeMinor * odds);
      if (potential > st.maxWin * SCALE) throw new AppError('max_win', `Максимальный выигрыш — ${st.maxWin.toLocaleString('ru-RU')} монет`);
      const live = g.some((r) => r.ev.status === 'live') ? 1 : 0;
      const res = q.run(
        'INSERT INTO bets(user_id, type, stake, odds, potential, status, live, created_at) VALUES(?,?,?,?,?,?,?,?)',
        userId, g.length > 1 ? 'express' : 'single', stakeMinor, odds, potential, 'pending', live, Date.now(),
      );
      const betId = Number(res.lastInsertRowid);
      for (const r of g) {
        q.run(
          'INSERT INTO bet_selections(bet_id, event_id, sport, event_name, market, market_title, outcome, label, odds) VALUES(?,?,?,?,?,?,?,?,?)',
          betId, r.ev.id, r.ev.sport, eventName(r.ev), r.input.market, r.marketTitle, r.input.outcome, r.label, r.odds,
        );
      }
      move(userId, -stakeMinor, 'bet_stake', { betId });
      ids.push(betId);
    }
    const achievements = checkAchievements(userId, tgId);
    const balance = q.get<{ balance: number }>("SELECT balance FROM wallets WHERE user_id=? AND currency='DEMO'", userId)!.balance / SCALE;
    return { bets: ids.map((id) => getBet(id, userId)!), balance, achievements: achievements.map((a) => a.code) };
  });
}

/* ---------- чтение ---------- */

export function getBet(id: number, userId?: number) {
  const b = q.get<any>(userId ? 'SELECT * FROM bets WHERE id=? AND user_id=?' : 'SELECT * FROM bets WHERE id=?', ...(userId ? [id, userId] : [id]));
  if (!b) return null;
  const sels = q.all<any>('SELECT * FROM bet_selections WHERE bet_id=? ORDER BY id', id);
  return formatBet(b, sels);
}

function formatBet(b: any, sels: any[]) {
  return {
    id: b.id,
    type: b.type,
    stake: b.stake / SCALE,
    odds: b.odds,
    potential: b.potential / SCALE,
    status: b.status as 'pending' | 'won' | 'lost' | 'void' | 'cashed_out',
    payout: b.payout / SCALE,
    live: !!b.live,
    createdAt: b.created_at,
    settledAt: b.settled_at,
    selections: sels.map((s) => {
      const ev = events.get(s.event_id);
      return {
        eventId: s.event_id,
        sport: s.sport,
        eventName: s.event_name,
        market: s.market,
        marketTitle: s.market_title,
        outcome: s.outcome,
        label: s.label,
        odds: s.odds,
        result: s.result as Settle | null,
        event: ev
          ? {
              status: ev.status,
              startAt: ev.startAt,
              score: SPORTS[ev.sport].scoreboard(ev.state).score,
              clock: SPORTS[ev.sport].scoreboard(ev.state).clock,
              home: ev.home,
              away: ev.away,
            }
          : null,
      };
    }),
  };
}

export function listBets(userId: number, status: 'active' | 'settled', limit = 50, before?: number) {
  const cond = status === 'active' ? "status='pending'" : "status<>'pending'";
  const rows = q.all<any>(
    `SELECT * FROM bets WHERE user_id=? AND ${cond} ${before ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`,
    ...(before ? [userId, before, limit] : [userId, limit]),
  );
  if (!rows.length) return [];
  const sels = q.all<any>(`SELECT * FROM bet_selections WHERE bet_id IN (${rows.map(() => '?').join(',')}) ORDER BY id`, ...rows.map((r) => r.id));
  return rows.map((b) => formatBet(b, sels.filter((s) => s.bet_id === b.id)));
}

/* ---------- досрочный выкуп ---------- */

export function cashoutQuote(betId: number, userId: number): { available: boolean; amount: number; reason?: string } {
  const b = q.get<any>("SELECT * FROM bets WHERE id=? AND user_id=? AND status='pending'", betId, userId);
  if (!b) return { available: false, amount: 0, reason: 'Ставка уже рассчитана' };
  const sels = q.all<any>('SELECT * FROM bet_selections WHERE bet_id=?', betId);
  let factor = 1;
  for (const s of sels) {
    if (s.result) {
      factor *= payoutFactor(s.result, s.odds);
      continue;
    }
    const ev = events.get(s.event_id);
    if (!ev || isSuspended(ev)) return { available: false, amount: 0, reason: 'Выкуп временно недоступен' };
    const sport = SPORTS[ev.sport];
    const [e] = evaluate(sport, ev.state, [s.market], hashStr(ev.id), 1500);
    const idx = e?.def.outcomes.findIndex((o) => o.key === s.outcome) ?? -1;
    if (!e || idx < 0) return { available: false, amount: 0, reason: 'Выкуп недоступен' };
    factor *= expectedFactor(e.dists[idx], s.odds);
  }
  if (factor <= 0) return { available: false, amount: 0, reason: 'Выкуп недоступен' };
  const amount = Math.floor(b.stake * factor * (1 - getSettings().cashoutMargin));
  if (amount < 1 * SCALE) return { available: false, amount: 0, reason: 'Сумма выкупа слишком мала' };
  return { available: true, amount: amount / SCALE };
}

export function cashout(betId: number, userId: number, tgId: number, expected: number) {
  return tx(() => {
    const qt = cashoutQuote(betId, userId);
    if (!qt.available) throw new AppError('cashout_unavailable', qt.reason ?? 'Выкуп недоступен', 409);
    if (qt.amount < expected * 0.97) throw new AppError('cashout_changed', 'Сумма выкупа изменилась', 409, { amount: qt.amount });
    const amountMinor = Math.round(qt.amount * SCALE);
    const r = q.run("UPDATE bets SET status='cashed_out', payout=?, settled_at=? WHERE id=? AND status='pending'", amountMinor, Date.now(), betId);
    if (Number(r.changes) === 0) throw new AppError('already_settled', 'Ставка уже рассчитана', 409);
    const balance = move(userId, amountMinor, 'cashout', { betId }) / SCALE;
    checkAchievements(userId, tgId);
    return { amount: qt.amount, balance, bet: getBet(betId, userId) };
  });
}

/* ---------- расчёт ---------- */

/** Рассчитать все ставки по завершённому или отменённому событию. Идемпотентно. */
export function settleEvent(ev: LiveEvent) {
  const sport = SPORTS[ev.sport];
  const sels = q.all<any>('SELECT * FROM bet_selections WHERE event_id=? AND result IS NULL', ev.id);
  if (!sels.length) return [];
  const touched = new Set<number>();
  tx(() => {
    for (const s of sels) {
      let res: Settle = 'void';
      if (ev.status === 'finished' && ev.result) {
        const def = sport.market(s.market);
        const o = def?.outcomes.find((x) => x.key === s.outcome);
        res = o ? o.settle(ev.result) : 'void';
      }
      q.run('UPDATE bet_selections SET result=? WHERE id=? AND result IS NULL', res, s.id);
      touched.add(s.bet_id);
    }
  });
  const settled: number[] = [];
  for (const betId of touched) if (settleBet(betId)) settled.push(betId);
  return settled;
}

/** Если все исходы ставки рассчитаны — рассчитать ставку. */
export function settleBet(betId: number): boolean {
  const done = tx(() => {
    const b = q.get<any>("SELECT * FROM bets WHERE id=? AND status='pending'", betId);
    if (!b) return null;
    const sels = q.all<any>('SELECT result, odds FROM bet_selections WHERE bet_id=?', betId);
    if (sels.some((s) => !s.result)) {
      // в экспрессе проигрыш одного события = проигрыш ставки сразу
      if (b.type === 'express' && sels.some((s) => s.result === 'lose')) {
        /* рассчитываем досрочно */
      } else return null;
    }
    const lost = sels.some((s) => s.result === 'lose');
    const factor = lost ? 0 : sels.reduce((a, s) => a * payoutFactor(s.result, s.odds), 1);
    const st = getSettings();
    const payout = Math.min(Math.floor(b.stake * factor), st.maxWin * SCALE);
    const status = payout > b.stake ? 'won' : payout === b.stake ? 'void' : 'lost';
    const r = q.run("UPDATE bets SET status=?, payout=?, settled_at=? WHERE id=? AND status='pending'", status, payout, Date.now(), betId);
    if (Number(r.changes) === 0) return null;
    if (payout > 0) move(b.user_id, payout, 'bet_win', { betId });
    return { userId: b.user_id as number, status, payout };
  });
  if (!done) return false;
  const u = q.get<{ tg_id: number }>('SELECT tg_id FROM users WHERE id=?', done.userId);
  checkAchievements(done.userId, u?.tg_id);
  bus.emit('user:notice', { userId: done.userId, tgId: u?.tg_id, kind: 'bet_settled', payload: getBet(betId) });
  return true;
}
