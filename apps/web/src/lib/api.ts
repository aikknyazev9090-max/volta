import { devUserId, tg } from './tg';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public data: any) {
    super(message);
  }
}

function authHeaders(): Record<string, string> {
  if (tg?.initData) return { authorization: `tma ${tg.initData}` };
  return { 'x-dev-user': devUserId() };
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      headers: { ...(opts.body ? { 'content-type': 'application/json' } : {}), ...authHeaders() },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Нет соединения с сервером', null);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* не JSON */
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? 'Ошибка сервера', data);
  return data as T;
}

/* ---------- WebSocket с переподключением ---------- */

type Handler = (msg: any) => void;
const handlers = new Set<Handler>();
let ws: WebSocket | null = null;
let sub: string | null = null;
let retry = 0;
let connected = false;
const statusHandlers = new Set<(c: boolean) => void>();

function setConnected(c: boolean) {
  connected = c;
  statusHandlers.forEach((h) => h(c));
}

export function connectWs() {
  if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const params = tg?.initData ? `token=${encodeURIComponent(tg.initData)}` : `dev=${devUserId()}`;
  ws = new WebSocket(`${proto}://${location.host}/ws?${params}`);
  ws.onopen = () => {
    retry = 0;
    setConnected(true);
    if (sub) ws!.send(JSON.stringify({ t: 'sub', id: sub }));
  };
  ws.onmessage = (e) => {
    try {
      const m = JSON.parse(e.data);
      handlers.forEach((h) => h(m));
    } catch {
      /* ignore */
    }
  };
  ws.onclose = () => {
    setConnected(false);
    ws = null;
    const delay = Math.min(10_000, 500 * 2 ** retry++);
    setTimeout(connectWs, delay);
  };
  ws.onerror = () => ws?.close();
}

export function onWs(h: Handler) {
  handlers.add(h);
  return () => {
    handlers.delete(h);
  };
}

export function onWsStatus(h: (c: boolean) => void) {
  statusHandlers.add(h);
  h(connected);
  return () => {
    statusHandlers.delete(h);
  };
}

export function subscribeEvent(id: string | null) {
  sub = id;
  if (ws?.readyState === 1) ws.send(JSON.stringify(id ? { t: 'sub', id } : { t: 'unsub' }));
}

// при возвращении в приложение — переподключаемся сразу
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') connectWs();
  });
}
