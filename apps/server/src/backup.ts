// Резервная копия базы в чате бота с первым админом.
// Нужна на бесплатных хостингах без постоянного диска (Render free): файлы там стираются при засыпании.
// Копия — одно закреплённое сообщение с файлом, бот его перезаписывает. Восстановление при старте — restore.ts.
import { InputFile } from 'grammy';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bot } from './bot.js';
import { env } from './config.js';
import { db } from './db.js';
import { flush } from './engine/live.js';

export const BACKUP_NAME = 'volta-backup.db';
const EVERY = 3 * 60_000;

let messageId = Number(process.env.TG_BACKUP_MSG ?? 0) || 0;
let running = false;

export async function backupNow(reason = 'timer') {
  if (!bot || running) return;
  const chat = env.adminIds[0];
  if (!chat) return;
  running = true;
  const tmp = join(tmpdir(), `volta-snap-${Date.now()}.db`);
  try {
    flush();
    db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    const file = new InputFile(readFileSync(tmp), BACKUP_NAME);
    const caption = `💾 Резервная копия базы VOLTA (${reason}), ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК.\nНе удаляйте и не открепляйте это сообщение.`;
    if (messageId) {
      try {
        await bot.api.editMessageMedia(chat, messageId, { type: 'document', media: file, caption });
        return;
      } catch (e: any) {
        if (!/not found|can't be edited|MESSAGE_ID_INVALID/i.test(e?.description ?? '')) throw e;
        messageId = 0; // сообщение удалили — отправим новое
      }
    }
    const m = await bot.api.sendDocument(chat, new InputFile(readFileSync(tmp), BACKUP_NAME), { caption, disable_notification: true });
    messageId = m.message_id;
    await bot.api.pinChatMessage(chat, messageId, { disable_notification: true }).catch(() => {});
  } catch (e: any) {
    console.warn('[backup] не удалось сохранить копию:', e?.description ?? e?.message ?? e);
  } finally {
    running = false;
    rmSync(tmp, { force: true });
  }
}

export function startBackups() {
  if (!env.tgBackup || !bot) return;
  if (process.env.TG_BACKUP_BLOCKED) {
    console.warn('[backup] копия не восстановилась — сохранение выключено до перезапуска, чтобы не затереть её');
    return;
  }
  console.log('[backup] копия базы в Telegram каждые 3 мин и перед остановкой');
  setTimeout(() => void backupNow('старт'), Number(process.env.TG_BACKUP_FIRST_MS ?? 60_000));
  setInterval(() => void backupNow(), EVERY);
  let stopping = false;
  const stop = async (sig: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[backup] ${sig}: сохраняю копию перед остановкой`);
    await Promise.race([backupNow('остановка'), new Promise((r) => setTimeout(r, 20_000))]);
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop('SIGTERM'));
  process.on('SIGINT', () => void stop('SIGINT'));
}
