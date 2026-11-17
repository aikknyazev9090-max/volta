import { CURRENCY, SCALE, getSettings } from '../config.js';
import { q, tx } from '../db.js';
import { checkAchievements } from './achievements.js';
import { AppError, getBalance, move } from './wallet.js';

export interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  photo_url?: string;
  language_code?: string;
}

export interface UserSettings {
  oddsFormat: 'decimal' | 'fractional' | 'american';
  acceptChanges: 'any' | 'up' | 'none';
  notifications: boolean;
  sound: boolean;
  haptics: boolean;
  quickStakes: number[];
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  oddsFormat: 'decimal',
  acceptChanges: 'up',
  notifications: true,
  sound: true,
  haptics: true,
  quickStakes: [100, 500, 1000, 5000],
};

export interface UserRow {
  id: number;
  tg_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  lang: string;
  settings: string;
  ref_by: number | null;
  onboarded: number;
  blocked: number;
  created_at: number;
}

export function userByTg(tgId: number) {
  return q.get<UserRow>('SELECT * FROM users WHERE tg_id = ?', tgId);
}
export function userById(id: number) {
  return q.get<UserRow>('SELECT * FROM users WHERE id = ?', id);
}

/** Создать или обновить пользователя. Возвращает пользователя и флаг «новый». */
export function upsertUser(tg: TgUser, refParam?: string | null): { user: UserRow; isNew: boolean } {
  return tx(() => {
    const existing = userByTg(tg.id);
    if (existing) {
      q.run(
        'UPDATE users SET username=?, first_name=?, last_name=?, photo_url=COALESCE(?, photo_url), last_seen=? WHERE id=?',
        tg.username ?? null, tg.first_name ?? null, tg.last_name ?? null, tg.photo_url ?? null, Date.now(), existing.id,
      );
      return { user: userById(existing.id)!, isNew: false };
    }
    const lang = tg.language_code?.startsWith('ru') || !tg.language_code ? 'ru' : 'en';
    const r = q.run(
      'INSERT INTO users(tg_id, username, first_name, last_name, photo_url, lang, settings, created_at, last_seen) VALUES(?,?,?,?,?,?,?,?,?)',
      tg.id, tg.username ?? null, tg.first_name ?? null, tg.last_name ?? null, tg.photo_url ?? null, lang, JSON.stringify(DEFAULT_USER_SETTINGS), Date.now(), Date.now(),
    );
    const id = Number(r.lastInsertRowid);
    const st = getSettings();
    move(id, st.startBalance * SCALE, 'welcome', { note: 'Стартовый баланс' });

    // реферал: из параметра запуска или из /start бота
    let refTg: number | null = null;
    const m = refParam?.match(/^ref_?(\d+)$/);
    if (m) refTg = Number(m[1]);
    const pending = q.get<{ ref_tg: number }>('SELECT ref_tg FROM pending_refs WHERE tg_id=?', tg.id);
    if (!refTg && pending) refTg = pending.ref_tg;
    if (refTg && refTg !== tg.id) {
      const ref = userByTg(refTg);
      if (ref) {
        q.run('UPDATE users SET ref_by=? WHERE id=?', ref.id, id);
        move(id, st.referralBonus * SCALE, 'referral', { note: 'Бонус за приглашение' });
        move(ref.id, st.referralBonus * SCALE, 'referral', { note: `Пригласил друга` });
      }
    }
    q.run('DELETE FROM pending_refs WHERE tg_id=?', tg.id);
    return { user: userById(id)!, isNew: true };
  });
}

export function userSettings(u: UserRow): UserSettings {
  try {
    return { ...DEFAULT_USER_SETTINGS, ...JSON.parse(u.settings || '{}') };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function updateUserSettings(u: UserRow, patch: Partial<UserSettings>) {
  const next = { ...userSettings(u), ...patch };
  q.run('UPDATE users SET settings=? WHERE id=?', JSON.stringify(next), u.id);
  return next;
}

/* ---------- ежедневный бонус ---------- */

const MSK = 3 * 3600e3;
export const dayKey = (t = Date.now()) => new Date(t + MSK).toISOString().slice(0, 10);

export function bonusStatus(userId: number) {
  const st = getSettings();
  const row = q.get<{ streak: number; last_day: string }>('SELECT streak, last_day FROM daily_bonus WHERE user_id=?', userId);
  const today = dayKey();
  const yesterday = dayKey(Date.now() - 86400e3);
  let streak = 0;
  let available = true;
  if (row) {
    if (row.last_day === today) {
      streak = row.streak;
      available = false;
    } else if (row.last_day === yesterday) streak = row.streak;
  }
  const nextDay = available ? (streak % 7) + 1 : (streak % 7) + 1;
  // время до следующего бонуса (полночь МСК)
  const now = Date.now();
  const nextMidnight = Date.parse(`${dayKey(now + 86400e3)}T00:00:00Z`) - MSK;
  return {
    available,
    streak, // сколько дней подряд уже забрано
    nextDay,
    nextAmount: st.bonusLadder[nextDay - 1],
    ladder: st.bonusLadder,
    nextAt: available ? now : nextMidnight,
  };
}

export function claimBonus(userId: number) {
  return tx(() => {
    const s = bonusStatus(userId);
    if (!s.available) throw new AppError('bonus_taken', 'Бонус уже получен сегодня');
    const day = s.nextDay;
    const amount = s.ladder[day - 1];
    const streak = s.streak >= 7 ? 1 : s.streak + 1;
    q.run(
      'INSERT INTO daily_bonus(user_id, streak, last_day) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET streak=excluded.streak, last_day=excluded.last_day',
      userId, streak, dayKey(),
    );
    const balance = move(userId, amount * SCALE, 'bonus', { note: `Ежедневный бонус, день ${day}` });
    checkAchievements(userId);
    return { amount, day, balance, status: bonusStatus(userId) };
  });
}

/* ---------- пополнение демо-баланса ---------- */

export function refillStatus(userId: number) {
  const last = q.get<{ last_at: number }>('SELECT last_at FROM refills WHERE user_id=?', userId)?.last_at ?? 0;
  const bal = getBalance(userId);
  const st = getSettings();
  const nextAt = last + 86400e3;
  return { available: bal < st.minStake * SCALE && Date.now() >= nextAt, nextAt: Math.max(Date.now(), nextAt), amount: st.refillAmount, eligible: bal < st.minStake * SCALE };
}

export function refill(userId: number) {
  return tx(() => {
    const s = refillStatus(userId);
    if (!s.eligible) throw new AppError('refill_not_needed', 'Пополнение доступно, когда на балансе меньше минимальной ставки');
    if (!s.available) throw new AppError('refill_cooldown', 'Пополнить можно раз в сутки');
    const bal = getBalance(userId);
    q.run('INSERT INTO refills(user_id, last_at) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET last_at=excluded.last_at', userId, Date.now());
    return move(userId, s.amount * SCALE - bal, 'refill', { note: 'Пополнение демо-баланса' });
  });
}

/* ---------- статистика и рейтинг ---------- */

export function userStats(userId: number) {
  const r = q.get<any>(
    `SELECT COUNT(*) total,
            SUM(CASE WHEN status<>'pending' THEN 1 ELSE 0 END) settled,
            SUM(CASE WHEN status='won' THEN 1 ELSE 0 END) won,
            SUM(CASE WHEN status='lost' THEN 1 ELSE 0 END) lost,
            COALESCE(SUM(CASE WHEN status<>'pending' THEN stake ELSE 0 END),0) staked,
            COALESCE(SUM(CASE WHEN status<>'pending' THEN payout ELSE 0 END),0) returned,
            COALESCE(MAX(CASE WHEN status IN ('won','cashed_out') THEN payout - stake ELSE 0 END),0) biggest,
            COALESCE(MAX(CASE WHEN status='won' THEN odds ELSE 0 END),0) maxOdds
       FROM bets WHERE user_id=?`,
    userId,
  );
  const fav = q.get<{ sport: string; c: number }>(
    'SELECT s.sport, COUNT(*) c FROM bet_selections s JOIN bets b ON b.id=s.bet_id WHERE b.user_id=? GROUP BY s.sport ORDER BY c DESC LIMIT 1',
    userId,
  );
  const profit = (r.returned - r.staked) / SCALE;
  const decided = (r.won ?? 0) + (r.lost ?? 0);
  return {
    total: r.total ?? 0,
    settled: r.settled ?? 0,
    won: r.won ?? 0,
    lost: r.lost ?? 0,
    winRate: decided ? (r.won / decided) : 0,
    profit,
    roi: r.staked ? (r.returned - r.staked) / r.staked : 0,
    biggestWin: r.biggest / SCALE,
    maxOdds: r.maxOdds,
    favoriteSport: fav?.sport ?? null,
  };
}

export function weekStart(now = Date.now()) {
  const d = new Date(now + MSK);
  const day = (d.getUTCDay() + 6) % 7; // понедельник = 0
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - day * 86400e3 - MSK;
}

export function leaderboard(period: 'week' | 'all', meId: number) {
  const since = period === 'week' ? weekStart() : 0;
  const rows = q.all<any>(
    `SELECT u.id, u.first_name, u.last_name, u.username, u.photo_url,
            SUM(b.payout - b.stake) profit, COUNT(*) bets,
            SUM(CASE WHEN b.status='won' THEN 1 ELSE 0 END) won
       FROM bets b JOIN users u ON u.id=b.user_id
      WHERE b.status <> 'pending' AND b.settled_at >= ? AND u.blocked = 0
      GROUP BY u.id ORDER BY profit DESC LIMIT 200`,
    since,
  );
  const list = rows.map((r, i) => ({
    rank: i + 1,
    userId: r.id,
    name: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.username || 'Игрок',
    photo: r.photo_url,
    profit: r.profit / SCALE,
    bets: r.bets,
    winRate: r.bets ? r.won / r.bets : 0,
    me: r.id === meId,
  }));
  const me = list.find((x) => x.me) ?? null;
  return { period, since, top: list.slice(0, 50), me };
}

export function publicUser(u: UserRow, isAdmin: boolean) {
  return {
    id: u.id,
    tgId: u.tg_id,
    name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || 'Игрок',
    username: u.username,
    photo: u.photo_url,
    lang: u.lang,
    onboarded: !!u.onboarded,
    settings: userSettings(u),
    balance: getBalance(u.id) / SCALE,
    currency: CURRENCY,
    isAdmin,
    createdAt: u.created_at,
  };
}
