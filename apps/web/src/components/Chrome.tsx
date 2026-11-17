import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Gift, Home, Radio, Search, Ticket, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useMe } from '../lib/queries';
import { haptic } from '../lib/tg';
import { useSlip, useUi } from '../store';
import { Coin, Logo, SportIcon, Wordmark } from './icons';
import { AnimatedNumber } from './ui';
import { SPORT_NAMES, SPORT_ORDER } from '../lib/format';
import type { SportId } from '../types';

export function BalancePill() {
  const { data } = useMe();
  const nav = useNavigate();
  return (
    <button onClick={() => nav('/profile')} className="press flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface2/80 pl-1.5 pr-3">
      <Coin size={22} />
      {data ? <AnimatedNumber value={data.balance} className="font-display text-[13.5px] font-semibold" /> : <span className="h-3 w-12 rounded bg-surface3" />}
    </button>
  );
}

export function BonusButton() {
  const { data } = useMe();
  const open = useUi((s) => s.setBonusOpen);
  const available = !!data?.bonus.available;
  return (
    <button
      aria-label="Ежедневный бонус"
      onClick={() => {
        haptic.tap();
        open(true);
      }}
      className={clsx('press relative grid h-9 w-9 place-items-center rounded-full border border-line', available ? 'bg-gold/15 text-gold' : 'bg-surface2/80 text-muted')}
    >
      <Gift size={18} strokeWidth={2.2} />
      {available && (
        <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
          <span className="absolute inset-0 animate-ping rounded-full bg-gold opacity-70" />
          <span className="relative h-3 w-3 rounded-full border-2 border-bg bg-gold" />
        </span>
      )}
    </button>
  );
}

export function Header({ title, right, sub }: { title?: ReactNode; right?: ReactNode; sub?: ReactNode }) {
  const nav = useNavigate();
  return (
    <header className="glass sticky top-0 z-30 border-b border-line">
      <div className="flex h-[56px] items-center gap-2.5 px-4">
        {title ? (
          <h1 className="min-w-0 flex-1 truncate font-display text-[19px] font-semibold tracking-tight">{title}</h1>
        ) : (
          <button className="flex flex-1 items-center gap-2" onClick={() => nav('/')}>
            <Logo size={30} />
            <Wordmark className="text-[17px]" />
          </button>
        )}
        {right ?? (
          <>
            <button aria-label="Поиск" onClick={() => nav('/search')} className="press grid h-9 w-9 place-items-center rounded-full border border-line bg-surface2/80 text-muted">
              <Search size={17} strokeWidth={2.2} />
            </button>
            <BonusButton />
            <BalancePill />
          </>
        )}
      </div>
      {sub}
    </header>
  );
}

const NAV = [
  { to: '/', label: 'Главная', icon: Home },
  { to: '/live', label: 'Лайв', icon: Radio },
  { to: '#slip', label: 'Купон', icon: Ticket },
  { to: '/bets', label: 'Ставки', icon: Ticket },
  { to: '/profile', label: 'Профиль', icon: User },
];

export function BottomNav() {
  const count = useSlip((s) => s.items.length);
  const setOpen = useSlip((s) => s.setOpen);
  const loc = useLocation();
  return (
    <nav className="glass fixed inset-x-0 bottom-0 z-40 mx-auto max-w-[480px] border-t border-line" style={{ paddingBottom: 'var(--safe-bottom)' }}>
      <div className="grid h-[62px] grid-cols-5 items-center">
        {NAV.map((n) => {
          if (n.to === '#slip') {
            return (
              <div key="slip" className="flex justify-center">
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    haptic.tap('medium');
                    setOpen(true);
                  }}
                  aria-label="Купон"
                  className={clsx('relative -mt-7 grid h-[58px] w-[58px] place-items-center rounded-[20px] border-4 border-bg transition-colors', count ? 'bg-accent text-accentInk shadow-glow' : 'bg-surface3 text-muted')}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v3a2.5 2.5 0 0 0 0 5v5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-5a2.5 2.5 0 0 0 0-5z" />
                    <path d="M9 9h6M9 13h4" />
                  </svg>
                  <AnimatePresence>
                    {count > 0 && (
                      <motion.span key={count} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }} className="num absolute -right-2 -top-2 grid h-[22px] min-w-[22px] place-items-center rounded-full border-2 border-bg bg-ink px-1 text-[11px] font-extrabold text-bg">
                        {count}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              </div>
            );
          }
          const Icon = n.icon;
          const active = n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to);
          return (
            <NavLink key={n.to} to={n.to} onClick={() => haptic.select()} className="relative flex h-full flex-col items-center justify-center gap-1">
              {active && <motion.span layoutId="nav-dot" className="absolute top-0 h-[3px] w-8 rounded-b-full bg-accent" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
              {n.to === '/live' ? (
                <span className="relative">
                  <Icon size={22} strokeWidth={active ? 2.4 : 2} className={active ? 'text-ink' : 'text-muted'} />
                  <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full border-2 border-bg bg-live" />
                </span>
              ) : (
                <Icon size={22} strokeWidth={active ? 2.4 : 2} className={active ? 'text-ink' : 'text-muted'} />
              )}
              <span className={clsx('text-[10.5px] font-bold', active ? 'text-ink' : 'text-muted')}>{n.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export function SportChips({ value, onChange, counts, mode }: { value: SportId | null; onChange: (s: SportId | null) => void; counts?: Record<string, { live: number; upcoming: number }>; mode: 'live' | 'upcoming' | 'all' }) {
  const n = (s: SportId) => (counts ? (mode === 'live' ? counts[s]?.live : mode === 'upcoming' ? counts[s]?.upcoming : (counts[s]?.live ?? 0) + (counts[s]?.upcoming ?? 0)) ?? 0 : null);
  const total = counts ? SPORT_ORDER.reduce((a, s) => a + (n(s) ?? 0), 0) : null;
  const chip = (id: SportId | null, label: string, count: number | null) => {
    const active = value === id;
    return (
      <button
        key={id ?? 'all'}
        onClick={() => {
          haptic.select();
          onChange(id);
        }}
        className={clsx('press flex h-[38px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-bold transition-colors', active ? 'border-transparent bg-ink text-bg' : 'border-line bg-surface text-ink/85')}
      >
        {id && <SportIcon sport={id} size={16} />}
        {label}
        {count !== null && <span className={clsx('num text-[11.5px] font-extrabold', active ? 'text-bg/55' : 'text-faint')}>{count}</span>}
      </button>
    );
  };
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-1">
      {chip(null, 'Все', total)}
      {SPORT_ORDER.filter((s) => n(s) !== 0).map((s) => chip(s, SPORT_NAMES[s], n(s)))}
    </div>
  );
}
