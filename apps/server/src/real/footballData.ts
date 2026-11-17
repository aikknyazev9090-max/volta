// Реальные футбольные матчи с football-data.org (бесплатный тариф: 12 турниров, 10 запросов в минуту,
// счёт с задержкой). Ставки принимаются только до начала матча, расчёт — по итоговому счёту.
import type { Team } from '../sports/types.js';
import { cancelEvent, createRealEvent, events, finishReal, isReal, realOf, saveEvent, type LiveEvent } from '../engine/live.js';
import { bus } from '../bus.js';
import { findClub } from './clubs.js';
import { eloOf, eloToRating, refreshElo } from './elo.js';
import { REAL_LEAGUES, realLeagueByCode } from './leagues.js';
import { refreshStandings, standingRating } from './standings.js';

const API = 'https://api.football-data.org/v4';
const DAY = 86400_000;
/** Сколько дней вперёд показываем матчи (бесплатный тариф отдаёт окно до 10 дней). */
const AHEAD_DAYS = 6;
const BACK_DAYS = 3;
/** Не открываем ставки на матч, до которого осталось меньше 10 минут. */
const MIN_LEAD_MS = 10 * 60_000;

type Side = { home: number | null; away: number | null };
export interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  competition: { code: string; name: string };
  homeTeam: { id: number; name: string; shortName?: string; tla?: string };
  awayTeam: { id: number; name: string; shortName?: string; tla?: string };
  score: { winner: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null; duration?: string; fullTime: Side; halfTime: Side; regularTime?: Side };
}

const pair = (s?: Side | null): [number, number] | null => (s && s.home != null && s.away != null ? [s.home, s.away] : null);

/** Итог для расчёта ставок. null — данных пока не хватает (например, нет счёта первого тайма). */
export function resultFromScore(sc: FdMatch['score']): { reg: [number, number]; p1: [number, number]; winner: 0 | 1 | null; final: [number, number] } | null {
  const ft = pair(sc.fullTime);
  const ht = pair(sc.halfTime);
  // при доп. времени и пенальти в fullTime уже не основное время: тогда берём regularTime
  const reg = sc.duration && sc.duration !== 'REGULAR' ? pair(sc.regularTime) : ft;
  if (!ft || !ht || !reg) return null;
  const winner = sc.winner === 'HOME_TEAM' ? 0 : sc.winner === 'AWAY_TEAM' ? 1 : reg[0] > reg[1] ? 0 : reg[0] < reg[1] ? 1 : null;
  return { reg, p1: ht, winner, final: sc.duration && sc.duration !== 'REGULAR' ? ft : reg };
}

function team(t: FdMatch['homeTeam']): Team {
  const club = findClub(t.shortName, t.name);
  const elo = eloOf(club?.elo, t.shortName, t.name);
  const name = club?.ru ?? t.shortName ?? t.name;
  return {
    id: `fd-${t.id}`,
    name,
    short: club?.short ?? (t.tla || name.slice(0, 3)).toUpperCase(),
    colors: club?.colors ?? ['#64748B', '#FFFFFF'],
    // сила: рейтинг Эло, если clubelo доступен, иначе по турнирной таблице
    rating: elo ? eloToRating(elo) : standingRating(t.id) ?? 58,
  };
}

let lastError = '';
let lastOk = 0;
export const realStatus = () => ({ enabled: !!process.env.FOOTBALL_DATA_KEY, lastOk, lastError, count: [...events.values()].filter(isReal).length });

// бесплатный тариф: 10 запросов в минуту — держим паузу не меньше 7 секунд между запросами
let lastReq = 0;
async function fetchJson(path: string): Promise<any> {
  const wait = lastReq + 7000 - Date.now();
  if (wait > 0) await new Promise((res) => setTimeout(res, wait));
  lastReq = Date.now();
  const r = await fetch(API + path, { headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_KEY! }, signal: AbortSignal.timeout(20_000) });
  if (r.status === 429) throw new Error('лимит запросов, повторим позже');
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

async function fetchMatches(): Promise<FdMatch[]> {
  const day = (t: number) => new Date(t).toISOString().slice(0, 10);
  const now = Date.now();
  const comps = REAL_LEAGUES.map((l) => l.code).join(',');
  const j = await fetchJson(`/matches?competitions=${comps}&dateFrom=${day(now - BACK_DAYS * DAY)}&dateTo=${day(now + AHEAD_DAYS * DAY)}`);
  return j.matches ?? [];
}

/** Применить свежее расписание и результаты к событиям движка. Вынесено отдельно для тестов. */
export function applyMatches(list: FdMatch[], now = Date.now()) {
  const changed: LiveEvent[] = [];
  for (const m of list) {
    const league = realLeagueByCode.get(m.competition?.code);
    if (!league) continue;
    const id = `real-${m.id}`;
    const startAt = Date.parse(m.utcDate);
    const ev = events.get(id);

    if (!ev) {
      // новый матч: только будущие и с известными командами
      if (!['SCHEDULED', 'TIMED'].includes(m.status) || !m.homeTeam?.id || !m.awayTeam?.id) continue;
      if (startAt - now < MIN_LEAD_MS) continue;
      const home = team(m.homeTeam);
      const away = team(m.awayTeam);
      const top = league.prestige >= 3 ? (home.rating + away.rating) / 2 >= 70 : (home.rating + away.rating) / 2 >= 80;
      createRealEvent({ id, leagueId: league.id, home, away, startAt, top, real: { mid: m.id, comp: league.code, status: m.status, score: null } });
      continue;
    }

    const info = realOf(ev);
    if (!info || ev.status === 'finished' || ev.status === 'cancelled') continue;
    let dirty = false;
    if (info.status !== m.status) {
      info.status = m.status;
      dirty = true;
    }
    const live = pair(m.score?.fullTime);
    if (live && (!info.score || live[0] !== info.score[0] || live[1] !== info.score[1])) {
      info.score = live;
      dirty = true;
    }
    // перенесли время начала, а ставки ещё открыты
    if (ev.status === 'scheduled' && Number.isFinite(startAt) && startAt !== ev.startAt && ['SCHEDULED', 'TIMED'].includes(m.status)) {
      ev.startAt = startAt;
      dirty = true;
    }

    if (m.status === 'FINISHED') {
      const res = resultFromScore(m.score);
      if (res) {
        finishReal(ev, res);
        continue;
      }
    } else if (['POSTPONED', 'CANCELLED', 'AWARDED'].includes(m.status)) {
      cancelEvent(ev);
      continue;
    }
    if (dirty) {
      saveEvent(ev);
      changed.push(ev);
    }
  }

  // матч давно должен был закончиться, а итога так и нет — возвращаем ставки
  for (const ev of events.values()) {
    if (isReal(ev) && (ev.status === 'live' || ev.status === 'scheduled') && now - ev.startAt > 36 * 3600_000) cancelEvent(ev);
  }
  if (changed.length) bus.emit('event:update', changed);
}

async function poll() {
  try {
    await refreshElo();
    await refreshStandings(fetchJson);
    const list = await fetchMatches();
    applyMatches(list);
    lastOk = Date.now();
    lastError = '';
  } catch (e: any) {
    lastError = e?.message ?? String(e);
    console.warn('[real] football-data.org:', lastError);
  }
}

export function startRealMatches() {
  if (!process.env.FOOTBALL_DATA_KEY) {
    console.log('[real] FOOTBALL_DATA_KEY не задан — реальные матчи выключены');
    return;
  }
  const loop = async () => {
    await poll();
    // пока идут реальные матчи, проверяем чаще; лимит бесплатного тарифа — 10 запросов в минуту
    const busy = [...events.values()].some((e) => isReal(e) && e.status === 'live');
    setTimeout(loop, busy ? 2 * 60_000 : 10 * 60_000);
  };
  void loop();
}
