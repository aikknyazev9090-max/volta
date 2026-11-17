import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './config.js';
import type { TgUser } from './services/users.js';

const MAX_AGE_SEC = 48 * 3600;

function check(params: URLSearchParams, exclude: string[], hash: string): boolean {
  const pairs: string[] = [];
  for (const [k, v] of params) if (!exclude.includes(k)) pairs.push(`${k}=${v}`);
  pairs.sort();
  const secret = createHmac('sha256', 'WebAppData').update(env.botToken).digest();
  const calc = createHmac('sha256', secret).update(pairs.join('\n')).digest('hex');
  const a = Buffer.from(calc, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Проверка подписи initData Telegram Mini App. */
export function verifyInitData(initData: string): { user: TgUser; startParam: string | null } | null {
  if (!initData || !env.botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  if (!check(params, ['hash'], hash) && !check(params, ['hash', 'signature'], hash)) return null;
  const authDate = Number(params.get('auth_date') ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SEC) return null;
  try {
    const user = JSON.parse(params.get('user') ?? 'null') as TgUser | null;
    if (!user?.id) return null;
    return { user, startParam: params.get('start_param') };
  } catch {
    return null;
  }
}

/** Для разработки вне Telegram: заголовок x-dev-user=<id>. */
export function devUser(raw: string | undefined): TgUser | null {
  if (!env.devAuth || !raw) return null;
  const id = Number(raw);
  if (!id) return null;
  return { id, first_name: id === 1 ? 'Демо' : `Игрок ${id}`, username: `demo${id}`, language_code: 'ru' };
}
