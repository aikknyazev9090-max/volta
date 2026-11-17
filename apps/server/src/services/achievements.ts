import { bus } from '../bus.js';
import { SCALE } from '../config.js';
import { q } from '../db.js';

export interface AchievementDef {
  code: string;
  title: string;
  desc: string;
  icon: string; // имя иконки на фронте
  check: (userId: number) => boolean;
}

const count = (sql: string, ...p: any[]) => q.get<{ c: number }>(sql, ...p)?.c ?? 0;

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'first_bet', title: 'Первый шаг', desc: 'Сделайте первую ставку', icon: 'ticket', check: (u) => count('SELECT COUNT(*) c FROM bets WHERE user_id=?', u) >= 1 },
  { code: 'first_win', title: 'В яблочко', desc: 'Выиграйте первую ставку', icon: 'target', check: (u) => count("SELECT COUNT(*) c FROM bets WHERE user_id=? AND status='won'", u) >= 1 },
  { code: 'express5', title: 'Архитектор', desc: 'Соберите экспресс из 5+ событий', icon: 'layers', check: (u) => count("SELECT COUNT(*) c FROM bets b WHERE user_id=? AND type='express' AND (SELECT COUNT(*) FROM bet_selections s WHERE s.bet_id=b.id) >= 5", u) >= 1 },
  { code: 'big_odds', title: 'Против всех', desc: 'Выиграйте с коэффициентом 5.00+', icon: 'rocket', check: (u) => count("SELECT COUNT(*) c FROM bets WHERE user_id=? AND status='won' AND odds >= 5", u) >= 1 },
  {
    code: 'streak3',
    title: 'Серия',
    desc: 'Три выигранные ставки подряд',
    icon: 'flame',
    check: (u) => {
      const last = q.all<{ status: string }>("SELECT status FROM bets WHERE user_id=? AND status IN ('won','lost') ORDER BY settled_at DESC LIMIT 3", u);
      return last.length === 3 && last.every((b) => b.status === 'won');
    },
  },
  { code: 'high_roller', title: 'Хайроллер', desc: 'Поставьте 10 000 монет за раз', icon: 'gem', check: (u) => count('SELECT COUNT(*) c FROM bets WHERE user_id=? AND stake >= ?', u, 10_000 * SCALE) >= 1 },
  { code: 'live10', title: 'В ритме лайва', desc: '10 ставок по ходу матча', icon: 'zap', check: (u) => count('SELECT COUNT(*) c FROM bets WHERE user_id=? AND live=1', u) >= 10 },
  { code: 'sports5', title: 'Универсал', desc: 'Ставки на 5 разных видов спорта', icon: 'globe', check: (u) => count('SELECT COUNT(DISTINCT s.sport) c FROM bet_selections s JOIN bets b ON b.id=s.bet_id WHERE b.user_id=?', u) >= 5 },
  { code: 'cashout', title: 'Холодный расчёт', desc: 'Продайте ставку досрочно', icon: 'hand-coins', check: (u) => count("SELECT COUNT(*) c FROM bets WHERE user_id=? AND status='cashed_out'", u) >= 1 },
  { code: 'bonus7', title: 'Неделя заряда', desc: 'Заберите бонус 7 дней подряд', icon: 'calendar', check: (u) => (q.get<{ streak: number }>('SELECT streak FROM daily_bonus WHERE user_id=?', u)?.streak ?? 0) >= 7 },
  {
    code: 'profit10k',
    title: 'Капитал',
    desc: 'Чистая прибыль 10 000 монет',
    icon: 'trophy',
    check: (u) => (q.get<{ p: number }>("SELECT COALESCE(SUM(payout - stake),0) p FROM bets WHERE user_id=? AND status <> 'pending'", u)?.p ?? 0) >= 10_000 * SCALE,
  },
];

export function checkAchievements(userId: number, tgId?: number): AchievementDef[] {
  const have = new Set(q.all<{ code: string }>('SELECT code FROM achievements WHERE user_id=?', userId).map((r) => r.code));
  const got: AchievementDef[] = [];
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.code)) continue;
    if (a.check(userId)) {
      q.run('INSERT OR IGNORE INTO achievements(user_id, code, created_at) VALUES(?,?,?)', userId, a.code, Date.now());
      got.push(a);
    }
  }
  for (const a of got) bus.emit('user:notice', { userId, tgId, kind: 'achievement', payload: { code: a.code, title: a.title, desc: a.desc, icon: a.icon } });
  return got;
}

export function listAchievements(userId: number) {
  const have = new Map(q.all<{ code: string; created_at: number }>('SELECT code, created_at FROM achievements WHERE user_id=?', userId).map((r) => [r.code, r.created_at]));
  return ACHIEVEMENTS.map((a) => ({ code: a.code, title: a.title, desc: a.desc, icon: a.icon, unlockedAt: have.get(a.code) ?? null }));
}
