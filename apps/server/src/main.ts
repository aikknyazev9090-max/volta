// Точка входа для хостинга: до открытия базы восстанавливает её из резервной копии в Telegram (если TG_BACKUP=true),
// затем запускает приложение. Локально можно запускать index.ts напрямую.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.DB_FILE ?? resolve(here, '../data/volta.db');

async function restore() {
  const token = process.env.BOT_TOKEN;
  const chat = (process.env.ADMIN_IDS ?? '').split(',')[0]?.trim();
  if (process.env.TG_BACKUP !== 'true' || !token || !chat) return;
  if (existsSync(dbFile)) {
    console.log('[restore] база уже есть на диске — восстановление не нужно');
    return;
  }
  const root = (process.env.TG_API_ROOT || 'https://api.telegram.org').replace(/\/$/, '');
  const call = async (method: string, body: object) => {
    const r = await fetch(`${root}/bot${token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    const j: any = await r.json();
    if (!j.ok) throw new Error(j.description);
    return j.result;
  };
  try {
    const info = await call('getChat', { chat_id: chat });
    const pin = info.pinned_message;
    if (!pin?.document || pin.document.file_name !== 'volta-backup.db') {
      console.log('[restore] резервной копии нет — начинаем с чистой базы');
      return;
    }
    const f = await call('getFile', { file_id: pin.document.file_id });
    const r = await fetch(`${root}/file/bot${token}/${f.file_path}`, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.subarray(0, 15).toString() !== 'SQLite format 3') throw new Error('файл не похож на базу SQLite');
    mkdirSync(dirname(dbFile), { recursive: true });
    writeFileSync(dbFile, buf);
    process.env.TG_BACKUP_MSG = String(pin.message_id);
    console.log(`[restore] база восстановлена из копии (${Math.round(buf.length / 1024)} КБ)`);
  } catch (e: any) {
    console.warn('[restore] не удалось восстановить базу:', e?.message ?? e, e?.cause?.code ?? '');
    // чтобы пустая база не затёрла хорошую копию, сохранение копий в этом запуске выключаем
    process.env.TG_BACKUP_BLOCKED = '1';
  }
}

// сеть на хостинге бывает не готова в первые секунды после старта — пробуем несколько раз
for (let attempt = 1; attempt <= 6; attempt++) {
  delete process.env.TG_BACKUP_BLOCKED;
  await restore();
  if (!process.env.TG_BACKUP_BLOCKED) break;
  if (attempt < 6) {
    console.log(`[restore] повтор через ${attempt * 3} с (попытка ${attempt + 1} из 6)`);
    await new Promise((r) => setTimeout(r, attempt * 3000));
  }
}
await import('./index.js');
