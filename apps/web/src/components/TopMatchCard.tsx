import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { haptic } from '../lib/tg';
import { useEvent } from '../store';
import { SportIcon } from './icons';
import { MatchClock } from './MatchCard';
import { OddsButton } from './OddsButton';
import { TeamBadge } from './TeamBadge';

/** Крупная карточка в карусели «Топ-матчи». */
export function TopMatchCard({ id, index }: { id: string; index: number }) {
  const ev = useEvent(id);
  const nav = useNavigate();
  if (!ev || (ev.status !== 'live' && ev.status !== 'scheduled')) return null;
  const [c1] = ev.home.colors;
  const [c2] = ev.away.colors;
  const live = ev.status === 'live';
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 260, damping: 28 }}
      className="relative w-[84%] max-w-[340px] shrink-0 snap-center lg:w-auto lg:max-w-none overflow-hidden rounded-[22px] border border-line bg-surface"
    >
      {/* цветовое сияние команд */}
      <div className="pointer-events-none absolute -left-10 -top-16 h-44 w-44 rounded-full opacity-30 blur-3xl" style={{ background: c1 }} />
      <div className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full opacity-25 blur-3xl" style={{ background: c2 }} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface" />

      <button
        className="relative block w-full px-4 pb-3 pt-3.5 text-left"
        onClick={() => {
          haptic.tap('light');
          nav(`/event/${ev.id}`);
        }}
      >
        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted">
          <SportIcon sport={ev.sport} size={13} />
          <span className="truncate">{ev.league.name}</span>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <div className="flex min-w-0 flex-col items-center gap-2">
            <TeamBadge team={ev.home} sport={ev.sport} size={46} />
            <span className="w-full truncate text-center text-[13px] font-bold">{ev.home.name}</span>
          </div>
          <div className="flex flex-col items-center">
            {live ? (
              <span className="num font-display text-[26px] font-bold leading-none tracking-tight">
                {ev.sb.score[0]}
                <span className="mx-1 text-muted">:</span>
                {ev.sb.score[1]}
              </span>
            ) : (
              <span className="font-display text-[15px] font-semibold text-muted">vs</span>
            )}
            <MatchClock ev={ev} className="mt-1.5 !text-[11px] [&>span:last-child]:hidden" />
          </div>
          <div className="flex min-w-0 flex-col items-center gap-2">
            <TeamBadge team={ev.away} sport={ev.sport} size={46} />
            <span className="w-full truncate text-center text-[13px] font-bold">{ev.away.name}</span>
          </div>
        </div>
      </button>
      {ev.main && (
        <div className={`relative grid gap-1.5 px-3 pb-3 ${ev.main.outcomes.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {ev.main.outcomes.map((o) => (
            <OddsButton key={o.key} ev={ev} market={ev.main!} outcome={o} variant="stack" />
          ))}
        </div>
      )}
    </motion.div>
  );
}
