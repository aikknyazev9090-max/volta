import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bus, type UserNotice } from './bus.js';
import { env, getSettings } from './config.js';
import { q } from './db.js';
import type { LiveEvent } from './engine/live.js';
import { bonusStatus, upsertUser, userByTg, userSettings } from './services/users.js';
import { getBalance } from './services/wallet.js';

const here = dirname(fileURLToPath(import.meta.url));
const COVER = resolve(here, '../assets/cover.jpg');

const fmt = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

export let bot: Bot | null = null;
let username = '';
let profileOk = false;

function appUrl(path = '') {
  return env.publicUrl ? `${env.publicUrl}${path}` : '';
}

function openKb(text = '⚡ Открыть VOLTA', path = '') {
  const url = appUrl(path);
  return url ? new InlineKeyboard().webApp(text, url) : undefined;
}

// лимит уведомлений: не больше 25 в сутки на пользователя
const sentToday = new Map<number, { day: string; n: number }>();
function canNotify(tgId: number) {
  const day = new Date().toISOString().slice(0, 10);
  const r = sentToday.get(tgId);
  if (!r || r.day !== day) {
    sentToday.set(tgId, { day, n: 1 });
    return true;
  }
  if (r.n >= 25) return false;
  r.n++;
  return true;
}

async function notify(tgId: number, html: string, path = '') {
  if (!bot) return;
  const u = userByTg(tgId);
  if (!u || !userSettings(u).notifications || !canNotify(tgId)) return;
  try {
    await bot.api.sendMessage(tgId, html, { parse_mode: 'HTML', reply_markup: openKb('Открыть', path), link_preview_options: { is_disabled: true } });
  } catch (e: any) {
    if (e?.error_code !== 403) console.warn('[bot] не удалось отправить уведомление', e?.description ?? e);
  }
}

export async function startBot() {
  if (!env.botToken) {
    console.warn('[bot] BOT_TOKEN не задан — бот не запущен');
    return;
  }
  const proxy = process.env.TG_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || '';
  // TG_API_ROOT — свой адрес вместо api.telegram.org (пересыльщик на Cloudflare Workers, если хостинг не пускает к Telegram)
  const apiRoot = (process.env.TG_API_ROOT ?? '').replace(/\/$/, '') || undefined;
  bot = new Bot(env.botToken, {
    client: {
      ...(apiRoot ? { apiRoot } : {}),
      ...(proxy ? { baseFetchConfig: { agent: new HttpsProxyAgent(proxy), compress: true } } : {}),
    },
  });
  if (proxy) console.log(`[bot] Telegram API через прокси ${proxy.replace(/\/\/[^@]*@/, '//***@')}`);
  if (apiRoot) console.log(`[bot] Telegram API через ${apiRoot}`);

  bot.command('start', async (ctx) => {
    const from = ctx.from!;
    const param = ctx.match?.trim();
    const m = param?.match(/^ref_?(\d+)$/);
    if (m && Number(m[1]) !== from.id && !userByTg(from.id)) {
      q.run('INSERT OR REPLACE INTO pending_refs(tg_id, ref_tg) VALUES(?,?)', from.id, Number(m[1]));
    }
    const { isNew } = upsertUser({ id: from.id, username: from.username, first_name: from.first_name, last_name: from.last_name, language_code: from.language_code });
    const st = getSettings();
    const name = esc(from.first_name ?? 'игрок');
    const text = isNew
      ? `⚡ <b>${name}, добро пожаловать в VOLTA!</b>\n\nСтавки на футбол, хоккей, баскетбол, теннис, киберспорт и MMA — в лайве и до начала матча.\n\n🎁 На вашем балансе <b>${fmt(st.startBalance)} монет</b> — можно сразу делать ставки.\n\n<i>Демо-режим: ставки на виртуальные монеты, без реальных денег. 18+</i>`
      : `⚡ <b>С возвращением, ${name}!</b>\n\nБаланс: <b>${fmt(getBalance(userByTg(from.id)!.id) / 100)} монет</b>\nВ лайве уже идут матчи — заходите.`;
    const kb = openKb();
    const extra = { parse_mode: 'HTML' as const, reply_markup: kb };
    if (!kb) {
      await ctx.reply(`${text}\n\n🛠 Приложение запускается, кнопка появится чуть позже.`, extra);
      return;
    }
    if (existsSync(COVER)) await ctx.replyWithPhoto(new InputFile(COVER), { caption: text, ...extra });
    else await ctx.reply(text, extra);
  });

  bot.command('balance', async (ctx) => {
    const u = userByTg(ctx.from!.id);
    if (!u) return ctx.reply('Нажмите /start, чтобы начать.');
    const b = bonusStatus(u.id);
    await ctx.reply(`💰 Баланс: <b>${fmt(getBalance(u.id) / 100)} монет</b>${b.available ? `\n🎁 Доступен ежедневный бонус: +${fmt(b.nextAmount)}` : ''}`, {
      parse_mode: 'HTML',
      reply_markup: openKb(b.available ? '🎁 Забрать бонус' : 'Открыть', b.available ? '/?bonus=1' : ''),
    });
  });

  bot.command('bonus', async (ctx) => {
    const u = userByTg(ctx.from!.id);
    if (!u) return ctx.reply('Нажмите /start, чтобы начать.');
    const b = bonusStatus(u.id);
    await ctx.reply(b.available ? `🎁 Бонус дня ${b.nextDay}: <b>+${fmt(b.nextAmount)} монет</b>. Заберите в приложении.` : `✅ Сегодняшний бонус уже получен. Серия: ${b.streak} дн. Возвращайтесь завтра!`, {
      parse_mode: 'HTML',
      reply_markup: openKb('Открыть', '/?bonus=1'),
    });
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(
      [
        '<b>VOLTA — ставки на спорт (демо)</b>',
        '',
        '• Выберите матч и нажмите на коэффициент — исход попадёт в купон.',
        '• <b>Ординар</b> — ставка на один исход. <b>Экспресс</b> — несколько исходов из разных матчей, коэффициенты перемножаются, выиграть должны все.',
        '• Каждый день забирайте бонус — чем дольше серия, тем больше монет.',
        '• Монеты виртуальные: их нельзя купить или вывести.',
        '',
        '/balance — баланс\n/bonus — ежедневный бонус\n/help — помощь',
      ].join('\n'),
      { parse_mode: 'HTML', reply_markup: openKb() },
    );
  });

  bot.on('message', async (ctx) => {
    await ctx.reply('Все ставки — в приложении 👇', { reply_markup: openKb() });
  });

  bot.catch((err) => console.error('[bot] ошибка', err.error));

  try {
    const me = await bot.api.getMe();
    username = me.username;
    await setupProfile();
    profileOk = true;
  } catch (e: any) {
    console.warn('[bot] не удалось настроить профиль:', e?.description ?? e?.message);
  }

  bus.on('user:notice', (n: UserNotice) => {
    if (!n.tgId) return;
    if (n.kind === 'bet_settled') {
      const b = n.payload;
      if (!b) return;
      const title = b.type === 'express' ? `Экспресс из ${b.selections.length}` : `${esc(b.selections[0].eventName)}`;
      const pick = b.type === 'express' ? '' : `\n${esc(b.selections[0].marketTitle)}: <b>${esc(b.selections[0].label)}</b>`;
      let head = '';
      if (b.status === 'won') head = `🏆 <b>Ставка сыграла! +${fmt(b.payout)} монет</b>`;
      else if (b.status === 'void') head = `↩️ <b>Возврат ставки: ${fmt(b.payout)} монет</b>`;
      else head = b.payout > 0 ? `↩️ <b>Частичный возврат: ${fmt(b.payout)} монет</b>` : `❌ <b>Ставка не сыграла</b>`;
      void notify(n.tgId, `${head}\n\n${title}${pick}\nКоэффициент ${b.odds.toFixed(2)} · ставка ${fmt(b.stake)}`, '/bets');
    } else if (n.kind === 'achievement') {
      void notify(n.tgId, `🏅 <b>Новое достижение: ${esc(n.payload.title)}</b>\n${esc(n.payload.desc)}`, '/profile');
    }
  });

  bus.on('event:started', (ev: LiveEvent) => {
    const rows = q.all<{ user_id: number; tg_id: number }>(
      'SELECT f.user_id, u.tg_id FROM favorites f JOIN users u ON u.id=f.user_id WHERE f.event_id=? AND f.notified=0',
      ev.id,
    );
    for (const r of rows) {
      q.run('UPDATE favorites SET notified=1 WHERE user_id=? AND event_id=?', r.user_id, ev.id);
      void notify(r.tg_id, `🔴 <b>Матч начался!</b>\n${esc(ev.home.name)} — ${esc(ev.away.name)}\nСтавки в лайве уже принимаются.`, `/event/${ev.id}`);
    }
  });

  if (env.botMode === 'webhook' && env.publicUrl) {
    // на хостингах, которые засыпают (Render free), Telegram сам будит сервер запросом на вебхук
    for (let attempt = 1; attempt <= 6; attempt++) {
      try {
        await bot.init();
        username = bot.botInfo.username;
        await bot.api.setWebhook(`${env.publicUrl}/tg/webhook`, { secret_token: webhookSecret(), allowed_updates: ['message'] });
        console.log(`[bot] @${username} запущен (вебхук)`);
        readyResolve();
        if (!profileOk) void setupProfile().catch(() => {});
        return;
      } catch (e: any) {
        console.error(`[bot] вебхук не установлен (попытка ${attempt}):`, e?.description ?? e?.message);
        await new Promise((r) => setTimeout(r, attempt * 5000));
      }
    }
    return;
  }
  bot.start({ drop_pending_updates: true, onStart: () => console.log(`[bot] @${username} запущен`) }).catch((e) => console.error('[bot] остановлен:', e?.message ?? e));
}

let readyResolve: () => void = () => {};
const ready = new Promise<void>((r) => (readyResolve = r));

/** Секрет для заголовка X-Telegram-Bot-Api-Secret-Token: выводится из токена, хранить отдельно не нужно. */
export function webhookSecret() {
  return createHash('sha256').update(`volta-webhook:${env.botToken}`).digest('hex').slice(0, 48);
}

/** Обработка входящего обновления от Telegram (режим вебхука). */
export async function handleWebhookUpdate(update: any) {
  await Promise.race([ready, new Promise((_, rej) => setTimeout(() => rej(new Error('bot not ready')), 30_000))]);
  await bot!.handleUpdate(update);
}

async function setupProfile() {
  if (!bot) return;
  const api = bot.api;
  await api.setMyCommands([
    { command: 'start', description: 'Открыть VOLTA' },
    { command: 'balance', description: 'Мой баланс' },
    { command: 'bonus', description: 'Ежедневный бонус' },
    { command: 'help', description: 'Как делать ставки' },
  ]);
  const name = 'VOLTA · Ставки на спорт';
  try {
    const cur = await api.getMyName();
    if (cur.name !== name) await api.setMyName(name);
  } catch (e: any) {
    console.warn('[bot] имя не обновлено:', e?.description);
  }
  try {
    await api.setMyShortDescription('Ставки на спорт в Telegram: лайв, экспрессы, бонусы каждый день. Демо на виртуальные монеты. 18+');
    await api.setMyDescription(
      '⚡ VOLTA — ставки на спорт прямо в Telegram.\n\n• Футбол, хоккей, баскетбол, теннис, CS2, Dota 2, MMA, волейбол\n• Лайв с обновлением коэффициентов в реальном времени\n• Ординары, экспрессы, досрочный выкуп\n• Ежедневные бонусы, рейтинг игроков и достижения\n\nДемо-режим: виртуальные монеты, без реальных денег. 18+',
    );
  } catch (e: any) {
    console.warn('[bot] описание не обновлено:', e?.description);
  }
  if (env.publicUrl) {
    await api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Играть', web_app: { url: env.publicUrl } } });
  } else {
    await api.setChatMenuButton({ menu_button: { type: 'commands' } });
  }
}

export function botUsername() {
  return username;
}
