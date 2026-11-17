import { q } from './db.js';

export const env = {
  botToken: process.env.BOT_TOKEN ?? '',
  adminIds: (process.env.ADMIN_IDS ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter(Boolean),
  // RENDER_EXTERNAL_URL Render подставляет сам
  publicUrl: (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, ''),
  port: Number(process.env.PORT ?? 3000),
  // вход без Telegram только для локальной разработки: при публичном адресе он всегда выключен,
  // иначе любой мог бы выдать себя за другого пользователя (в том числе за админа)
  devAuth: process.env.DEV_AUTH === 'true' && !process.env.PUBLIC_URL && !process.env.RENDER_EXTERNAL_URL,
  botMode: process.env.BOT_MODE === 'webhook' ? ('webhook' as const) : ('polling' as const),
  // резервная копия базы в чате бота с первым админом (для хостингов без постоянного диска)
  tgBackup: process.env.TG_BACKUP === 'true',
  liveSpeed: Number(process.env.LIVE_SPEED ?? 6),
  realMoney: process.env.REAL_MONEY_ENABLED === 'true',
};

if (env.realMoney) {
  throw new Error('REAL_MONEY_ENABLED=true не поддерживается в демо-версии');
}

/** 1 монета = 100 минимальных единиц. */
export const SCALE = 100;
export const CURRENCY = 'DEMO';

export interface Settings {
  margin: number;
  minStake: number;
  maxStake: number;
  maxWin: number;
  maxSelections: number;
  startBalance: number;
  refillAmount: number;
  referralBonus: number;
  bonusLadder: number[];
  cashoutMargin: number;
}

const DEFAULTS: Settings = {
  margin: 0.06,
  minStake: 10,
  maxStake: 50_000,
  maxWin: 1_000_000,
  maxSelections: 15,
  startBalance: 10_000,
  refillAmount: 10_000,
  referralBonus: 2_000,
  bonusLadder: [500, 750, 1000, 1500, 2000, 3000, 5000],
  cashoutMargin: 0.08,
};

let cache: Settings | null = null;

export function getSettings(): Settings {
  if (cache) return cache;
  const rows = q.all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const s: any = { ...DEFAULTS };
  for (const r of rows) {
    try {
      s[r.key] = JSON.parse(r.value);
    } catch {
      /* пропускаем битое значение */
    }
  }
  cache = s;
  return s;
}

export function updateSettings(patch: Partial<Settings>) {
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULTS)) continue;
    q.run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', k, JSON.stringify(v));
  }
  cache = null;
  return getSettings();
}
