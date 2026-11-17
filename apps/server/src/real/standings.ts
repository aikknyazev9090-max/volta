// Запасная оценка силы клубов по турнирным таблицам football-data.org (если clubelo.com недоступен).
// Очки и разница мячей за игру → рейтинг 0..100; в начале сезона подмешиваем средний рейтинг.

const TTL = 12 * 3600_000;
/** Поправка на уровень чемпионата: середняк АПЛ сильнее середняка Эредивизи. */
const LEVEL: Record<string, number> = { PL: 0, PD: 0, SA: -1, BL1: -1, FL1: -3, DED: -6, PPL: -6 };
const PRIOR = 60;

const ratings = new Map<number, number>();
const loadedAt = new Map<string, number>();

export interface TableRow {
  team: { id: number };
  playedGames: number;
  points: number;
  goalDifference: number;
}

export function ratingFromRow(r: TableRow, level = 0): number {
  if (!r.playedGames) return PRIOR + level;
  const ppg = r.points / r.playedGames;
  const gd = r.goalDifference / r.playedGames;
  const form = 62 + 10 * (ppg - 1.37) + 8 * gd;
  const w = Math.min(1, r.playedGames / 8);
  return Math.round(Math.max(35, Math.min(92, PRIOR + (form - PRIOR) * w + level)));
}

export function applyTable(code: string, rows: TableRow[]) {
  for (const r of rows) if (r.team?.id) ratings.set(r.team.id, ratingFromRow(r, LEVEL[code] ?? -4));
  loadedAt.set(code, Date.now());
}

export const standingRating = (teamId: number): number | null => ratings.get(teamId) ?? null;

/** Обновить устаревшие таблицы. fetchJson сам соблюдает лимит запросов. */
export async function refreshStandings(fetchJson: (path: string) => Promise<any>) {
  for (const code of Object.keys(LEVEL)) {
    if (Date.now() - (loadedAt.get(code) ?? 0) < TTL) continue;
    try {
      const j = await fetchJson(`/competitions/${code}/standings`);
      const total = (j.standings ?? []).find((s: any) => s.type === 'TOTAL') ?? j.standings?.[0];
      if (total?.table?.length) applyTable(code, total.table);
      else loadedAt.set(code, Date.now());
    } catch (e: any) {
      console.warn(`[real] таблица ${code}:`, e?.message ?? e);
      loadedAt.set(code, Date.now() - TTL + 30 * 60_000);
    }
  }
}
