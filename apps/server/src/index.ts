import cors from '@fastify/cors';
import fstatic from '@fastify/static';
import websocket from '@fastify/websocket';
import Fastify from 'fastify';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBackups } from './backup.js';
import { botUsername, handleWebhookUpdate, startBot, webhookSecret } from './bot.js';
import { env } from './config.js';
import { setFinishHandler, startEngine } from './engine/live.js';
import { adminRoutes } from './routes/admin.js';
import { apiRoutes } from './routes/api.js';
import { settleEvent } from './services/bets.js';
import { wsRoutes } from './ws.js';

const here = dirname(fileURLToPath(import.meta.url));
const webDist = resolve(here, '../../web/dist');

const app = Fastify({ logger: { level: 'warn' }, trustProxy: true });

await app.register(cors, { origin: env.devAuth ? true : false });
await app.register(websocket);

app.get('/api/public/bot', async () => ({ username: botUsername() }));
app.get('/health', async () => ({ ok: true }));

if (env.botMode === 'webhook') {
  app.post('/tg/webhook', async (req, reply) => {
    if (req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret()) return reply.code(401).send();
    // отвечаем сразу, обновление обрабатываем в фоне — Telegram не будет ждать и слать повторно
    handleWebhookUpdate(req.body).catch((e) => console.error('[bot] ошибка обработки обновления', e?.message ?? e));
    return { ok: true };
  });
}

// только для локальной разработки: сохранить сгенерированные в браузере картинки бота (обложка, аватар)
if (env.devAuth) {
  app.post('/api/dev/asset', { bodyLimit: 5 * 1024 * 1024 }, async (req, reply) => {
    const { name, data } = req.body as { name: string; data: string };
    if (!['cover.png', 'cover.jpg', 'avatar.jpg'].includes(name)) return reply.code(400).send({ error: 'bad name' });
    const dir = resolve(here, '../assets');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, name), Buffer.from(data, 'base64'));
    return { ok: true };
  });
}

await app.register(async (scope) => {
  await apiRoutes(scope);
  await adminRoutes(scope);
});
await app.register(wsRoutes);

if (existsSync(webDist)) {
  await app.register(fstatic, {
    root: webDist,
    wildcard: true, // файлы читаются с диска при каждом запросе: после пересборки фронтенда сервер не нужно перезапускать
    cacheControl: false,
    setHeaders: (res, path) => {
      // файлы с хэшем в имени кэшируем надолго, index.html — никогда
      res.setHeader('cache-control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/ws')) return reply.code(404).send({ error: 'not_found' });
    return reply.header('cache-control', 'no-cache').sendFile('index.html');
  });
}

setFinishHandler((ev) => settleEvent(ev));
startEngine();

await app.listen({ port: env.port, host: '0.0.0.0' });
console.log(`[api] http://localhost:${env.port}  (лайв ×${env.liveSpeed}, dev-вход: ${env.devAuth ? 'вкл' : 'выкл'})`);

void startBot().then(() => startBackups());
