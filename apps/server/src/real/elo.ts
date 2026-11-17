// Сила клубов по бесплатному рейтингу Эло с clubelo.com (CSV без ключа, обновляем раз в 12 часов).
import { norm } from './clubs.js';

const TTL = 12 * 3600_000;
let table = new Map<string, number>();
let loadedAt = 0;
let loading: Promise<void> | null = null;

/** Эло → рейтинг 0..100 движка. 1600 ≈ 50, 2000 ≈ 83. Разница 200 Эло даёт фавориту ~65% голов. */
export function eloToRating(elo: number): number {
  return Math.round(Math.max(30, Math.min(99, 50 + (elo - 1600) / 12)));
}

export function parseEloCsv(csv: string): Map<string, number> {
  const out = new Map<string, number>();
  const lines = csv.trim().split(/\r?\n/);
  const head = lines.shift()?.split(',') ?? [];
  const iClub = head.indexOf('Club');
  const iElo = head.indexOf('Elo');
  if (iClub < 0 || iElo < 0) return out;
  for (const line of lines) {
    const cols = line.split(',');
    const elo = Number(cols[iElo]);
    if (cols[iClub] && Number.isFinite(elo)) out.set(norm(cols[iClub]), elo);
  }
  return out;
}

export async function refreshElo(force = false) {
  if (!force && Date.now() - loadedAt < TTL && table.size) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      const day = new Date().toISOString().slice(0, 10);
      const r = await fetch(`http://api.clubelo.com/${day}`, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const t = parseEloCsv(await r.text());
      if (t.size > 100) {
        table = t;
        loadedAt = Date.now();
        console.log(`[real] рейтинг Эло загружен: ${t.size} клубов`);
      }
    } catch (e: any) {
      console.warn('[real] не удалось загрузить рейтинг Эло:', e?.message ?? e);
      loadedAt = Date.now() - TTL + 30 * 60_000; // повторим через полчаса
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/** Эло клуба по любому из названий или null. */
export function eloOf(...names: (string | undefined | null)[]): number | null {
  for (const n of names) {
    if (!n) continue;
    const v = table.get(norm(n));
    if (v) return v;
  }
  return null;
}

export function setEloTable(t: Map<string, number>) {
  table = t;
  loadedAt = Date.now();
}
