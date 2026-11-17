import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SCALE, getSettings, updateSettings } from '../config.js';
import { q } from '../db.js';
import { cancelEvent, createEvent, events, forceFinish, reprice, saveEvent, summary } from '../engine/live.js';
import { SPORT_ORDER, type SportId } from '../sports/index.js';
import { listBets } from '../services/bets.js';
import { publicUser, type UserRow } from '../services/users.js';
import { auditWallet, move } from '../services/wallet.js';
import { LEAGUES } from '../teams.js';
import { sendError } from './api.js';
import { bus } from '../bus.js';

function log(adminTg: number, action: string, payload: unknown) {
  q.run('INSERT INTO admin_log(admin_tg, action, payload, created_at) VALUES(?,?,?,?)', adminTg, action, JSON.stringify(payload), Date.now());
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    if (req.url.startsWith('/api/admin') && !req.isAdmin) return reply.code(403).send({ error: 'forbidden', message: 'Нет доступа' });
  });

  app.get('/api/admin/dashboard', async () => {
    const dayAgo = Date.now() - 86400e3;
    const users = q.get<any>('SELECT COUNT(*) total, SUM(CASE WHEN last_seen > ? THEN 1 ELSE 0 END) dau, SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) newToday FROM users', dayAgo, dayAgo);
    const bets = q.get<any>(
      `SELECT COUNT(*) n, COALESCE(SUM(stake),0) turnover,
              COALESCE(SUM(CASE WHEN status<>'pending' THEN stake - payout ELSE 0 END),0) ggr,
              SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,
              SUM(CASE WHEN live=1 THEN 1 ELSE 0 END) live
         FROM bets WHERE created_at > ?`,
      dayAgo,
    );
    const top = q.all<any>(
      `SELECT s.event_id, s.event_name, s.sport, COUNT(*) n, SUM(b.stake) volume
         FROM bet_selections s JOIN bets b ON b.id=s.bet_id WHERE b.created_at > ?
        GROUP BY s.event_id ORDER BY volume DESC LIMIT 8`,
      dayAgo,
    );
    const hours = q.all<any>(
      `SELECT CAST((created_at - ?) / 3600000 AS INTEGER) h, COUNT(*) n, SUM(stake) v FROM bets WHERE created_at > ? GROUP BY h ORDER BY h`,
      dayAgo, dayAgo,
    );
    const liveEvents = [...events.values()].filter((e) => e.status === 'live').length;
    return {
      users: { total: users.total ?? 0, dau: users.dau ?? 0, newToday: users.newToday ?? 0 },
      bets: { count: bets.n ?? 0, turnover: bets.turnover / SCALE, ggr: bets.ggr / SCALE, pending: bets.pending ?? 0, live: bets.live ?? 0 },
      events: { live: liveEvents, upcoming: [...events.values()].filter((e) => e.status === 'scheduled').length },
      topEvents: top.map((t) => ({ ...t, volume: t.volume / SCALE })),
      hourly: Array.from({ length: 24 }, (_, i) => {
        const r = hours.find((x) => x.h === i);
        return { h: i, count: r?.n ?? 0, volume: (r?.v ?? 0) / SCALE };
      }),
    };
  });

  app.get('/api/admin/leagues', async () => LEAGUES.map((l) => ({ id: l.id, sport: l.sport, name: l.name, teams: l.teams })));

  app.get('/api/admin/events', async (req) => {
    const { status } = req.query as { status?: string };
    let list = [...events.values()];
    if (status) list = list.filter((e) => e.status === status);
    list.sort((a, b) => a.startAt - b.startAt);
    return list.map((e) => {
      const exposure = q.get<{ n: number; v: number }>("SELECT COUNT(*) n, COALESCE(SUM(b.stake),0) v FROM bet_selections s JOIN bets b ON b.id=s.bet_id WHERE s.event_id=? AND b.status='pending'", e.id)!;
      return { ...summary(e), adminSuspended: e.suspended, manual: e.manual, markets: e.markets, overrides: e.overrides, exposure: { bets: exposure.n, volume: exposure.v / SCALE } };
    });
  });

  app.post('/api/admin/events', async (req, reply) => {
    try {
      const b = z.object({ sport: z.enum(SPORT_ORDER as [SportId, ...SportId[]]), leagueId: z.string(), homeId: z.string(), awayId: z.string(), startInMin: z.number().min(0).max(60 * 24 * 14), top: z.boolean() }).parse(req.body);
      if (b.homeId === b.awayId) return reply.code(400).send({ error: 'same_team', message: 'Выберите разные команды' });
      const ev = createEvent({ sport: b.sport, leagueId: b.leagueId, homeId: b.homeId, awayId: b.awayId, startAt: Date.now() + b.startInMin * 60e3, top: b.top, manual: true });
      if (!ev) return reply.code(409).send({ error: 'busy', message: 'Команды заняты в других матчах' });
      log(req.user.tg_id, 'event.create', { id: ev.id, ...b });
      return summary(ev);
    } catch (e) {
      return sendError(reply, e);
    }
  });

  const getEv = (id: string) => {
    const ev = events.get(id);
    if (!ev) throw Object.assign(new Error('not found'), { statusCode: 404 });
    return ev;
  };

  app.post('/api/admin/events/:id/suspend', async (req) => {
    const ev = getEv((req.params as any).id);
    const { suspended } = z.object({ suspended: z.boolean() }).parse(req.body);
    ev.suspended = suspended;
    saveEvent(ev);
    bus.emit('event:update', [ev]);
    log(req.user.tg_id, 'event.suspend', { id: ev.id, suspended });
    return summary(ev);
  });

  app.post('/api/admin/events/:id/top', async (req) => {
    const ev = getEv((req.params as any).id);
    ev.top = z.object({ top: z.boolean() }).parse(req.body).top;
    saveEvent(ev);
    log(req.user.tg_id, 'event.top', { id: ev.id, top: ev.top });
    return summary(ev);
  });

  app.post('/api/admin/events/:id/odds', async (req) => {
    const ev = getEv((req.params as any).id);
    const b = z.object({ market: z.string(), outcome: z.string(), odds: z.number().min(1.01).max(1000).nullable() }).parse(req.body);
    const k = `${b.market}|${b.outcome}`;
    if (b.odds === null) delete ev.overrides[k];
    else ev.overrides[k] = Math.round(b.odds * 100) / 100;
    reprice(ev);
    saveEvent(ev);
    bus.emit('event:update', [ev]);
    log(req.user.tg_id, 'event.odds', { id: ev.id, ...b });
    return { overrides: ev.overrides, markets: ev.markets };
  });

  app.post('/api/admin/events/:id/finish', async (req) => {
    const ev = getEv((req.params as any).id);
    forceFinish(ev);
    log(req.user.tg_id, 'event.finish', { id: ev.id, result: ev.result });
    return summary(ev);
  });

  app.post('/api/admin/events/:id/cancel', async (req) => {
    const ev = getEv((req.params as any).id);
    cancelEvent(ev);
    log(req.user.tg_id, 'event.cancel', { id: ev.id });
    return summary(ev);
  });

  app.get('/api/admin/settings', async () => getSettings());
  app.put('/api/admin/settings', async (req, reply) => {
    try {
      const patch = z
        .object({
          margin: z.number().min(0).max(0.3),
          minStake: z.number().int().min(1),
          maxStake: z.number().int().min(1),
          maxWin: z.number().int().min(1),
          maxSelections: z.number().int().min(2).max(30),
          startBalance: z.number().int().min(0),
          refillAmount: z.number().int().min(0),
          referralBonus: z.number().int().min(0),
          bonusLadder: z.array(z.number().int().min(0)).length(7),
          cashoutMargin: z.number().min(0).max(0.5),
        })
        .partial()
        .parse(req.body);
      const s = updateSettings(patch);
      log(req.user.tg_id, 'settings.update', patch);
      return s;
    } catch (e) {
      return sendError(reply, e);
    }
  });

  app.get('/api/admin/users', async (req) => {
    const term = String((req.query as any).q ?? '').trim();
    const rows = term
      ? q.all<UserRow>("SELECT * FROM users WHERE username LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR CAST(tg_id AS TEXT) = ? ORDER BY id DESC LIMIT 50", `%${term}%`, `%${term}%`, `%${term}%`, term)
      : q.all<UserRow>('SELECT * FROM users ORDER BY last_seen DESC LIMIT 50');
    return rows.map((u) => ({ ...publicUser(u, false), blocked: !!u.blocked, lastSeen: (u as any).last_seen }));
  });

  app.get('/api/admin/users/:id', async (req, reply) => {
    const u = q.get<UserRow>('SELECT * FROM users WHERE id=?', Number((req.params as any).id));
    if (!u) return reply.code(404).send({ error: 'not_found', message: 'Пользователь не найден' });
    const ledger = q.all<any>('SELECT * FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 50', u.id).map((l) => ({ ...l, amount: l.amount / SCALE, balance_after: l.balance_after / SCALE }));
    return { user: { ...publicUser(u, false), blocked: !!u.blocked }, audit: auditWallet(u.id), active: listBets(u.id, 'active', 20), settled: listBets(u.id, 'settled', 20), ledger };
  });

  app.post('/api/admin/users/:id/balance', async (req, reply) => {
    try {
      const id = Number((req.params as any).id);
      const b = z.object({ amount: z.number().refine((x) => x !== 0), reason: z.string().min(2).max(200) }).parse(req.body);
      const bal = move(id, Math.round(b.amount * SCALE), 'admin_adjust', { note: b.reason });
      log(req.user.tg_id, 'user.balance', { id, ...b });
      bus.emit('user:notice', { userId: id, kind: 'balance', payload: { balance: bal / SCALE } });
      return { balance: bal / SCALE };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  app.post('/api/admin/users/:id/block', async (req) => {
    const id = Number((req.params as any).id);
    const { blocked } = z.object({ blocked: z.boolean() }).parse(req.body);
    q.run('UPDATE users SET blocked=? WHERE id=?', blocked ? 1 : 0, id);
    log(req.user.tg_id, 'user.block', { id, blocked });
    return { blocked };
  });

  app.get('/api/admin/log', async () => q.all<any>('SELECT * FROM admin_log ORDER BY id DESC LIMIT 100').map((r) => ({ ...r, payload: JSON.parse(r.payload ?? 'null') })));
}
