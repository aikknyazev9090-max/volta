import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Lock } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { fmtOdds } from '../lib/format';
import { useMe } from '../lib/queries';
import { haptic } from '../lib/tg';
import { isSelected, toast, useSlip } from '../store';
import type { EventSummary, Market, Outcome } from '../types';

export function useOddsFormat() {
  return useMe().data?.settings.oddsFormat ?? 'decimal';
}

interface Props {
  ev: Pick<EventSummary, 'id' | 'sport' | 'home' | 'away' | 'status' | 'suspended'>;
  market: Pick<Market, 'key' | 'title'>;
  outcome: Outcome;
  variant?: 'stack' | 'inline' | 'compact';
  className?: string;
}

export const OddsButton = memo(function OddsButton({ ev, market, outcome, variant = 'stack', className }: Props) {
  const fmt = useOddsFormat();
  const selected = useSlip((s) => isSelected(s.items, ev.id, market.key, outcome.key));
  const toggle = useSlip((s) => s.toggle);
  const prev = useRef(outcome.odds);
  const [dir, setDir] = useState<0 | 1 | -1>(0);

  useEffect(() => {
    const p = prev.current;
    prev.current = outcome.odds;
    if (p && outcome.odds && p !== outcome.odds) {
      setDir(outcome.odds > p ? 1 : -1);
      const t = setTimeout(() => setDir(0), 2200);
      return () => clearTimeout(t);
    }
  }, [outcome.odds]);

  const locked = ev.suspended || !outcome.odds;

  const onClick = () => {
    if (locked || !outcome.odds) {
      haptic.notify('warning');
      return;
    }
    haptic.tap('light');
    const r = toggle({
      eventId: ev.id,
      market: market.key,
      outcome: outcome.key,
      odds: outcome.odds,
      label: outcome.label,
      marketTitle: market.title,
      sport: ev.sport,
      home: ev.home,
      away: ev.away,
      live: ev.status === 'live',
    });
    if (r === 'added' && useSlip.getState().items.length === 1) toast({ kind: 'info', title: 'Добавлено в купон', text: `${outcome.label} · ${fmtOdds(outcome.odds, fmt)}` });
  };

  return (
    <motion.button
      whileTap={locked ? undefined : { scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${market.title}: ${outcome.label}${locked ? ', закрыто' : `, коэффициент ${fmtOdds(outcome.odds!, fmt)}`}`}
      className={clsx(
        'relative flex min-w-0 select-none items-center overflow-hidden rounded-[13px] transition-colors duration-200',
        variant === 'stack' && 'h-[50px] flex-col justify-center gap-[1px] px-1',
        variant === 'inline' && 'h-[46px] justify-between gap-2 px-3',
        variant === 'compact' && 'h-[40px] flex-col justify-center px-1',
        selected ? 'bg-accent text-accentInk shadow-[0_6px_20px_-8px_rgb(var(--accent)/0.7)]' : 'bg-surface2 text-ink',
        locked && 'opacity-50',
        className,
      )}
    >
      {!selected && dir !== 0 && <motion.span initial={{ opacity: 0.55 }} animate={{ opacity: 0 }} transition={{ duration: 2 }} className={clsx('absolute inset-0', dir > 0 ? 'bg-up/30' : 'bg-down/30')} />}
      {variant !== 'compact' && (
        <span className={clsx('relative truncate text-[11.5px] font-semibold leading-tight', selected ? 'text-accentInk/70' : 'text-muted', variant === 'inline' && 'text-[12.5px]')}>{outcome.label}</span>
      )}
      <span className="relative flex items-center gap-1">
        {locked ? (
          <Lock size={14} className="text-muted" />
        ) : (
          <span className={clsx('num font-extrabold', variant === 'compact' ? 'text-[14px]' : 'text-[15px]')}>{fmtOdds(outcome.odds!, fmt)}</span>
        )}
        <AnimatePresence>
          {dir !== 0 && !locked && (
            <motion.svg initial={{ opacity: 0, y: dir > 0 ? 4 : -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} width="8" height="8" viewBox="0 0 8 8" className={clsx(dir > 0 ? 'text-up' : 'rotate-180 text-down', selected && '!text-accentInk')}>
              <path d="M4 1L7.5 6.5h-7z" fill="currentColor" />
            </motion.svg>
          )}
        </AnimatePresence>
      </span>
    </motion.button>
  );
});
