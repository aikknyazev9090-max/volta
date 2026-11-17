import clsx from 'clsx';
import { motion } from 'framer-motion';
import { ChevronRight, Lock } from 'lucide-react';
import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { startLabel, time } from '../lib/format';
import { haptic } from '../lib/tg';
import { useEvent } from '../store';
import type { EventSummary } from '../types';
import { Flag, SportIcon } from './icons';
import { OddsButton } from './OddsButton';
import { TeamBadge } from './TeamBadge';
import { LiveDot } from './ui';

export function MatchClock({ ev, className }: { ev: EventSummary; className?: string }) {
  if (ev.status === 'live') {
    return (
      <span className={clsx('inline-flex items-center gap-1.5 text-[11.5px] font-bold', ev.sb.isBreak ? 'text-gold' : 'text-live', className)}>
        {!ev.sb.isBreak && <LiveDot className="!h-1.5 !w-1.5" />}
        <span className="num">{ev.sb.clock || 'LIVE'}</span>
        <span className="font-semibold text-muted">· {ev.sb.period}</span>
      </span>
    );
  }
  const soon = ev.startAt - Date.now() < 60 * 60e3;
  return <span className={clsx('num text-[11.5px] font-semibold', soon ? 'text-accent' : 'text-muted', className)}>{soon ? startLabel(ev.startAt) : time(ev.startAt)}</span>;
}

function Row({ ev, side }: { ev: EventSummary; side: 0 | 1 }) {
  const team = side === 0 ? ev.home : ev.away;
  const live = ev.status === 'live';
  const lead = live && ev.sb.score[side] > ev.sb.score[1 - side];
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <TeamBadge team={team} sport={ev.sport} size={22} />
      <span className={clsx('min-w-0 flex-1 truncate text-[14px]', lead ? 'font-extrabold' : 'font-semibold')}>{team.name}</span>
      {ev.sb.serving === side && live && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
      {live && <span className={clsx('num w-6 text-right font-display text-[15px] font-bold', lead ? 'text-ink' : 'text-ink/70')}>{ev.sb.score[side]}</span>}
    </div>
  );
}

/** Строка матча в списке: команды, счёт, основные коэффициенты. */
export const MatchCard = memo(function MatchCard({ id, showLeague = false }: { id: string; showLeague?: boolean }) {
  const ev = useEvent(id);
  const nav = useNavigate();
  if (!ev || (ev.status !== 'live' && ev.status !== 'scheduled')) return null;
  const main = ev.main;
  const open = () => {
    haptic.tap('light');
    nav(`/event/${ev.id}`);
  };
  return (
    <motion.div layout="position" className="px-3.5 py-3">
      <button onClick={open} className="flex w-full items-center gap-2 text-left">
        <MatchClock ev={ev} className="min-w-0 truncate" />
        {showLeague && <span className="truncate text-[11.5px] font-medium text-faint">· {ev.league.name}</span>}
        {ev.sb.detail && ev.status === 'live' && <span className="num ml-auto truncate pl-2 text-[11px] font-semibold text-faint">{ev.sb.detail}</span>}
        <span className={clsx('flex shrink-0 items-center text-[11.5px] font-bold text-faint', !(ev.sb.detail && ev.status === 'live') && 'ml-auto')}>
          +{ev.marketsCount}
          <ChevronRight size={14} />
        </span>
      </button>
      <button onClick={open} className="mt-2 flex w-full flex-col gap-1.5 text-left">
        <Row ev={ev} side={0} />
        <Row ev={ev} side={1} />
      </button>
      <div className={clsx('mt-2.5 grid gap-1.5', main?.outcomes.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
        {main ? (
          main.outcomes.map((o) => <OddsButton key={o.key} ev={ev} market={main} outcome={o} variant="inline" />)
        ) : (
          <div className="col-span-3 flex h-[46px] items-center justify-center gap-2 rounded-[13px] bg-surface2 text-[12.5px] font-semibold text-muted">
            <Lock size={13} /> Приём ставок приостановлен
          </div>
        )}
      </div>
    </motion.div>
  );
});

/** Группа матчей одной лиги. */
export function LeagueGroup({ league, sport, ids, index = 0 }: { league: EventSummary['league']; sport: EventSummary['sport']; ids: string[]; index?: number }) {
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3), duration: 0.3 }} className="card mx-3 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <SportIcon sport={sport} size={15} className="text-muted" />
        <Flag code={league.country} className="text-muted" />
        <span className="truncate text-[12.5px] font-bold text-ink/85">{league.name}</span>
        <span className="ml-auto text-[11.5px] font-bold text-faint">{ids.length}</span>
      </div>
      <div className="divide-y divide-line">
        {ids.map((id) => (
          <MatchCard key={id} id={id} />
        ))}
      </div>
    </motion.section>
  );
}

export function MatchListSkeleton({ groups = 2 }: { groups?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: groups }).map((_, g) => (
        <div key={g} className="card mx-3 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-line px-3.5 py-3">
            <div className="h-3 w-40 rounded bg-surface2" />
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2.5 px-3.5 py-3">
              <div className="h-2.5 w-20 rounded bg-surface2" />
              <div className="flex items-center gap-2.5">
                <div className="h-[22px] w-[22px] rounded-full bg-surface2" />
                <div className="h-3 w-32 rounded bg-surface2" />
              </div>
              <div className="flex items-center gap-2.5">
                <div className="h-[22px] w-[22px] rounded-full bg-surface2" />
                <div className="h-3 w-24 rounded bg-surface2" />
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {[0, 1, 2].map((k) => (
                  <div key={k} className="relative h-[46px] overflow-hidden rounded-[13px] bg-surface2">
                    <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.05] to-transparent" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Сгруппировать события по лиге с сохранением порядка. */
export function groupByLeague(list: EventSummary[]) {
  const map = new Map<string, { league: EventSummary['league']; sport: EventSummary['sport']; ids: string[] }>();
  for (const e of list) {
    const k = e.league.id;
    if (!map.has(k)) map.set(k, { league: e.league, sport: e.sport, ids: [] });
    map.get(k)!.ids.push(e.id);
  }
  return [...map.values()];
}
