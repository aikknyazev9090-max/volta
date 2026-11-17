import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { bus, type UserNotice } from './bus.js';
import { events, full, summary, type LiveEvent } from './engine/live.js';
import { getBalance } from './services/wallet.js';
import { authenticate } from './routes/api.js';

interface Client {
  ws: WebSocket;
  userId: number;
  sub: string | null;
}

const clients = new Set<Client>();

function send(c: Client, msg: unknown) {
  if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
}

export async function wsRoutes(app: FastifyInstance) {
  app.get('/ws', { websocket: true }, (socket, req) => {
    const { token, dev } = req.query as { token?: string; dev?: string };
    const a = authenticate(token, dev);
    if (!a || a.user.blocked) {
      socket.close(4401, 'unauthorized');
      return;
    }
    const c: Client = { ws: socket, userId: a.user.id, sub: null };
    clients.add(c);
    socket.on('message', (raw: Buffer) => {
      try {
        const m = JSON.parse(String(raw));
        if (m.t === 'sub') {
          c.sub = typeof m.id === 'string' ? m.id : null;
          const ev = c.sub ? events.get(c.sub) : null;
          if (ev) send(c, { t: 'event', data: full(ev) });
        } else if (m.t === 'unsub') c.sub = null;
        else if (m.t === 'ping') send(c, { t: 'pong' });
      } catch {
        /* игнорируем мусор */
      }
    });
    socket.on('close', () => clients.delete(c));
    socket.on('error', () => clients.delete(c));
  });

  bus.on('event:update', (list: LiveEvent[]) => {
    if (!clients.size) return;
    const payload = JSON.stringify({ t: 'live', events: list.map(summary) });
    const byId = new Map(list.map((e) => [e.id, e]));
    const fullCache = new Map<string, string>();
    for (const c of clients) {
      if (c.ws.readyState !== 1) continue;
      c.ws.send(payload);
      if (c.sub && byId.has(c.sub)) {
        let f = fullCache.get(c.sub);
        if (!f) {
          f = JSON.stringify({ t: 'event', data: full(byId.get(c.sub)!) });
          fullCache.set(c.sub, f);
        }
        c.ws.send(f);
      }
    }
  });

  bus.on('user:notice', (n: UserNotice) => {
    for (const c of clients) {
      if (c.userId !== n.userId) continue;
      send(c, { t: 'notice', kind: n.kind, payload: n.payload, balance: getBalance(n.userId) / 100 });
    }
  });
}
