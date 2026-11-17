import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { devUser, verifyInitData } from '../auth.js';
import { env, getSettings } from '../config.js';
import { q } from '../db.js';
import { events, full, isSuspended, summary, isReal } from '../engine/live.js';
import { SPORTS, SPORT_ORDER } from '../sports/index.js';
import { listAchievements } from '../services/achievements.js';
import { cashout, cashoutQuote, listBets, placeBets } from '../services/bets.js';
import {
  bonusStatus, claimBonus, leaderboard, publicUser, refill, refillStatus, updateUserSettings,
  upsertUser, userStats, type UserRow,
} from '../services/users.js';
import { AppError } from '../services/wallet.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow;
    isAdmin: boolean;
  }
}

const seen = new Map<number, number>();

/** Аутентификация по initData (или dev-пользователь при DEV_AUTH=true). */
export function authenticate(token: string | undefined, devHeader?: string): { user: UserRow; isAdmin: boolean } | null {
  let tg = null;
  let startParam: string | null = null;
  if (token) {
    const v = verifyInitData(token);
    if (v) {
      tg = v.user;
      startParam = v.startParam;
    }
  }
  if (!tg) tg = devUser(devHeader);
  if (!tg) return null;
  // обновляем профиль не чаще раза в 5 минут
  const last = seen.get(tg.id) ?? 0;
  let user: UserRow;
  if (Date.now() - last > 5 * 60e3) {
    user = upsertUser(tg, startParam).user;
    seen.set(tg.id, Date.now());
  } else {
    user = q.get<UserRow>('SELECT * FROM users WHERE tg_id=?', tg.id) ?? upsertUser(tg, startParam).user;
  }
  return { user, isAdmin: env.adminIds.includes(user.tg_id) };
}

export function sendError(reply: FastifyReply, e: unknown) {
  if (e instanceof AppError) return reply.code(e.status).send({ error: e.code, message: e.message, ...e.extra });
  if (e instanceof z.ZodError) return reply.code(400).send({ error: 'validation', message: 'Некорректные данные', issues: e.issues });
  console.error(e);
  return reply.code(500).send({ error: 'internal', message: 'Что-то пошло не так. Попробуйте ещё раз' });
}

// простой лимит запросов: N запросов в окне на пользователя
const hits = new Map<string, { n: number; t: number }>();
function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.t > windowMs) {
    hits.set(key, { n: 1, t: now });
    return;
  }
  h.n++;
  if (h.n > limit) throw new AppError('rate_limited', 'Слишком много запросов, подождите немного', 429);
}

export async function apiRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (req.url.startsWith('/api/public')) return;
    const h = req.headers.authorization ?? '';
    const token = h.startsWith('tma ') ? h.slice(4) : undefined;
    const a = authenticate(token, req.headers['x-dev-user'] as string | undefined);
    if (!a) return reply.code(401).send({ error: 'unauthorized', message: 'Откройте приложение через Telegram' });
    if (a.user.blocked) return reply.code(403).send({ error: 'blocked', message: 'Аккаунт заблокирован' });
    req.user = a.user;
    req.isAdmin = a.isAdmin;
    try {
      rateLimit(`u${a.user.id}`, 120, 10_000);
    } catch (e) {
      return sendError(reply, e);
    }
  });

  app.get('/api/public/config', async () => {
    const st = getSettings();
    return {
      sports: SPORT_ORDER.map((id) => ({ id, name: SPORTS[id].name })),
      limits: { minStake: st.minStake, maxStake: st.maxStake, maxWin: st.maxWin, maxSelections: st.maxSelections },
      devAuth: env.devAuth,
    };
  });

  app.get('/api/me', async (req) => {
    const favs = q.all<{ event_id: string }>('SELECT event_id FROM favorites WHERE user_id=?', req.user.id).map((r) => r.event_id);
    return { ...publicUser(req.user, req.isAdmin), bonus: bonusStatus(req.user.id), refill: refillStatus(req.user.id), favorites: favs };
  });

  app.post('/api/me/onboarded', async (req) => {
    q.run('UPDATE users SET onboarded=1 WHERE id=?', req.user.id);
    return { ok: true };
  });

  const settingsSchema = z
    .object({
      oddsFormat: z.enum(['decimal', 'fractional', 'american']),
      acceptChanges: z.enum(['any', 'up', 'none']),
      notifications: z.boolean(),
      sound: z.boolean(),
      haptics: z.boolean(),
      quickStakes: z.array(z.number().int().positive().max(1_000_000)).length(4),
      lang: z.enum(['ru', 'en']),
    })
    .partial();

  app.patch('/api/me/settings', async (req, reply) => {
    try {
      const { lang, ...rest } = settingsSchema.parse(req.body);
      if (lang) q.run('UPDATE users SET lang=? WHERE id=?', lang, req.user.id);
      return { settings: updateUserSettings(req.user, rest), lang: lang ?? req.user.lang };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  app.get('/api/sports', async () => {
    const res: Record<string, { live: number; upcoming: number }> = {};
    for (const id of SPORT_ORDER) res[id] = { live: 0, upcoming: 0 };
    for (const ev of events.values()) {
      if (isReal(ev)) continue;
      if (ev.status === 'live') res[ev.sport].live++;
      else if (ev.status === 'scheduled') res[ev.sport].upcoming++;
    }
    return res;
  });

  app.get('/api/events', async (req) => {
    const { status = 'all', sport } = req.query as { status?: string; sport?: string };
    let list = [...events.values()].filter((e) => e.status === 'live' || e.status === 'scheduled');
    if (status === 'live') list = list.filter((e) => e.status === 'live');
    if (status === 'upcoming') list = list.filter((e) => e.status === 'scheduled');
    if (sport) list = list.filter((e) => e.sport === sport);
    list.sort((a, b) => (a.status === b.status ? a.startAt - b.startAt : a.status === 'live' ? -1 : 1));
    return list.map(summary);
  });

  app.get('/api/events/:id', async (req, reply) => {
    const ev = events.get((req.params as { id: string }).id);
    if (!ev) {
      const row = q.get<any>('SELECT id, sport, home, away, status, result FROM events WHERE id=?', (req.params as { id: string }).id);
      if (row) return reply.code(410).send({ error: 'gone', message: 'Матч завершён', home: JSON.parse(row.home), away: JSON.parse(row.away) });
      return reply.code(404).send({ error: 'not_found', message: 'Матч не найден' });
    }
    return full(ev);
  });

  /** Текущие коэффициенты для исходов купона. */
  app.post('/api/odds', async (req, reply) => {
    try {
      const { selections } = z.object({ selections: z.array(z.object({ eventId: z.string(), market: z.string(), outcome: z.string() })).max(30) }).parse(req.body);
      return selections.map((s) => {
        const ev = events.get(s.eventId);
        const o = ev?.markets.find((m) => m.key === s.market)?.outcomes.find((x) => x.key === s.outcome);
        const status = !ev || (ev.status !== 'live' && ev.status !== 'scheduled') ? 'closed' : isSuspended(ev) ? 'suspended' : o?.odds ? 'open' : 'closed';
        return { ...s, odds: o?.odds ?? null, status, live: ev?.status === 'live' };
      });
    } catch (e) {
      return sendError(reply, e);
    }
  });

  app.get('/api/search', async (req) => {
    const term = String((req.query as { q?: string }).q ?? '').trim().toLowerCase();
    if (term.length < 2) return [];
    return [...events.values()]
      .filter((e) => e.status === 'live' || e.status === 'scheduled')
      .filter((e) => `${e.home.name} ${e.away.name} ${summary(e).league.name}`.toLowerCase().includes(term))
      .sort((a, b) => a.startAt - b.startAt)
      .slice(0, 30)
      .map(summary);
  });

  const betSchema = z.object({
    type: z.enum(['single', 'express']),
    stake: z.number().positive().max(10_000_000),
    accept: z.enum(['any', 'up', 'none']),
    selections: z
      .array(z.object({ eventId: z.string().max(64), market: z.string().max(64), outcome: z.string().max(32), odds: z.number().positive() }))
      .min(1)
      .max(30),
  });

  app.post('/api/bets', async (req, reply) => {
    try {
      rateLimit(`bet${req.user.id}`, 10, 5_000);
      const body = betSchema.parse(req.body);
      return placeBets(req.user.id, req.user.tg_id, body);
    } catch (e) {
      return sendError(reply, e);
    }
  });

  app.get('/api/bets', async (req) => {
    const { status = 'active', before } = req.query as { status?: string; before?: string };
    return listBets(req.user.id, status === 'settled' ? 'settled' : 'active', 30, before ? Number(before) : undefined);
  });

  app.get('/api/bets/:id/cashout', async (req) => cashoutQuote(Number((req.params as { id: string }).id), req.user.id));

  app.post('/api/bets/:id/cashout', async (req, reply) => {
    try {
      const { expected } = z.object({ expected: z.number().positive() }).parse(req.body);
      return cashout(Number((req.params as { id: string }).id), req.user.id, req.user.tg_id, expected);
    } catch (e) {
      return sendError(reply, e);
    }
  });

  app.get('/api/bonus', async (req) => bonusStatus(req.user.id));
  app.post('/api/bonus/claim', async (req, reply) => {
    try {
      return claimBonus(req.user.id);
    } catch (e) {
      return sendError(reply, e);
    }
  });

  app.post('/api/refill', async (req, reply) => {
    try {
      return { balance: refill(req.user.id) / 100, refill: refillStatus(req.user.id) };
    } catch (e) {
      return sendError(reply, e);
    }
  });

  app.get('/api/leaderboard', async (req) => {
    const p = (req.query as { period?: string }).period === 'all' ? 'all' : 'week';
    return leaderboard(p, req.user.id);
  });

  app.get('/api/profile', async (req) => {
    const invited = q.get<{ c: number }>('SELECT COUNT(*) c FROM users WHERE ref_by=?', req.user.id)?.c ?? 0;
    return { stats: userStats(req.user.id), achievements: listAchievements(req.user.id), referral: { code: `ref_${req.user.tg_id}`, invited, bonus: getSettings().referralBonus } };
  });

  app.post('/api/favorites/:id', async (req) => {
    const id = (req.params as { id: string }).id;
    const has = q.get('SELECT 1 FROM favorites WHERE user_id=? AND event_id=?', req.user.id, id);
    if (has) q.run('DELETE FROM favorites WHERE user_id=? AND event_id=?', req.user.id, id);
    else q.run('INSERT INTO favorites(user_id, event_id) VALUES(?,?)', req.user.id, id);
    return { favorite: !has };
  });
}
