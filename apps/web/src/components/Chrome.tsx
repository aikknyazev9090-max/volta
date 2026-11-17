import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Cpu, Gift, HelpCircle, Home, Search, Ticket, Trophy, User } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useEventList, useMe, useSportCounts } from '../lib/queries';
import { haptic } from '../lib/tg';
import { useEvent, useSlip, useUi } from '../store';
import { Coin, Flag, Logo, SportIcon, Wordmark } from './icons';
import { AnimatedNumber } from './ui';
import { SPORT_NAMES, SPORT_ORDER } from '../lib/format';
import type { EventSummary, SportId } from '../types';

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
  { to: '/virtual', label: 'Виртуальные', icon: Cpu },
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
              {n.to === '/virtual' ? (
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
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-1 lg:flex-wrap lg:overflow-visible">
      {chip(null, 'Все', total)}
      {SPORT_ORDER.filter((s) => n(s) !== 0).map((s) => chip(s, SPORT_NAMES[s], n(s)))}
    </div>
  );
}

/** true на широком экране (компьютер): там меню слева и купон справа. */
export function useIsDesktop() {
  const q = '(min-width: 1024px)';
  const [v, setV] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setV(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return v;
}

const SIDE = [
  { to: '/', label: 'Главная', icon: Home },
  { to: '/virtual', label: 'Виртуальные матчи', icon: Cpu },
  { to: '/bets', label: 'Мои ставки', icon: Ticket },
  { to: '/leaderboard', label: 'Рейтинг', icon: Trophy },
  { to: '/profile', label: 'Профиль', icon: User },
  { to: '/help', label: 'Как делать ставки', icon: HelpCircle },
];

/** Левое меню на компьютере. */
export function SideNav() {
  const loc = useLocation();
  const nav = useNavigate();
  return (
    <aside className="sticky top-0 flex h-dvh w-[232px] shrink-0 flex-col gap-1 py-5">
      <button className="mb-5 flex items-center gap-2.5 px-3" onClick={() => nav('/')}>
        <Logo size={34} />
        <Wordmark className="text-[19px]" />
      </button>
      {SIDE.map((n) => {
        const Icon = n.icon;
        const active = n.to === '/' ? loc.pathname === '/' : loc.pathname.startsWith(n.to);
        return (
          <NavLink key={n.to} to={n.to} className={clsx('flex h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] font-bold transition-colors', active ? 'bg-surface2 text-ink' : 'text-muted hover:bg-surface hover:text-ink')}>
            <span className="relative">
              <Icon size={20} strokeWidth={active ? 2.4 : 2} className={active ? 'text-accent' : ''} />
              {n.to === '/virtual' && <span className="absolute -right-1 -top-0.5 h-2 w-2 rounded-full border-2 border-bg bg-live" />}
            </span>
            {n.label}
          </NavLink>
        );
      })}
      <SideExtras />
      <div className="mt-3 flex items-center gap-2 border-t border-line px-1 pt-3">
        <BonusButton />
        <BalancePill />
      </div>
    </aside>
  );
}

/** Компактная строка лайв-матча для боковой колонки. */
function MiniLive({ id }: { id: string }) {
  const ev = useEvent(id);
  if (!ev || ev.status !== 'live') return null;
  return (
    <NavLink to={`/event/${ev.id}`} className="block rounded-xl px-3 py-2 transition-colors hover:bg-surface">
      <div className="flex items-center gap-1.5 text-[10.5px] font-bold text-faint">
        <SportIcon sport={ev.sport} size={11} />
        <span className="truncate">{ev.league.name}</span>
        <span className="num ml-auto shrink-0 text-live">{ev.sb.clock}</span>
      </div>
      {[ev.home, ev.away].map((t, i) => (
        <div key={t.id} className="mt-0.5 flex items-center gap-2 text-[12.5px] font-semibold">
          <span className="min-w-0 flex-1 truncate">{t.name}</span>
          <span className="num font-extrabold">{ev.sb.score[i]}</span>
        </div>
      ))}
    </NavLink>
  );
}

const LEAGUE_ORDER = ['real-CL', 'real-PL', 'real-PD', 'real-SA', 'real-BL1', 'real-FL1', 'real-DED', 'real-PPL'];

/** Нижняя часть левого меню: турниры с реальными матчами и пара виртуальных матчей в лайве. */
function SideExtras() {
  const all = useEventList('all');
  const loc = useLocation();
  const cur = loc.pathname === '/' ? new URLSearchParams(loc.search).get('league') : null;
  const list = all.data ?? [];
  const leagues = new Map<string, { league: EventSummary['league']; n: number }>();
  for (const e of list) {
    if (!e.real || e.status !== 'scheduled') continue;
    const x = leagues.get(e.league.id) ?? { league: e.league, n: 0 };
    x.n++;
    leagues.set(e.league.id, x);
  }
  const liveIds = list.filter((e) => !e.real && e.status === 'live').slice(0, 3).map((e) => e.id);
  return (
    <div className="no-scrollbar mt-5 min-h-0 flex-1 overflow-y-auto">
      {leagues.size > 0 && <div className="px-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">Турниры</div>}
      {[...leagues.values()].sort((a, b) => LEAGUE_ORDER.indexOf(a.league.id) - LEAGUE_ORDER.indexOf(b.league.id)).map(({ league, n }) => (
        <NavLink key={league.id} to={`/?league=${league.id}`} className={clsx('flex h-9 items-center gap-3 rounded-xl px-3 text-[13.5px] font-semibold transition-colors', cur === league.id ? 'bg-surface2 text-ink' : 'text-muted hover:bg-surface hover:text-ink')}>
          <Flag code={league.country} />
          <span className="min-w-0 flex-1 truncate">{league.name}</span>
          <span className="num w-6 text-right text-[11.5px] font-bold text-faint">{n}</span>
        </NavLink>
      ))}
      {liveIds.length > 0 && (
        <>
          <div className="mt-5 flex items-center gap-2 px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-faint">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-live" /> Виртуальный лайв
          </div>
          {liveIds.map((id) => (
            <MiniLive key={id} id={id} />
          ))}
          <NavLink to="/virtual" className="block px-3 py-1.5 text-[12.5px] font-bold text-accent">
            Все виртуальные матчи →
          </NavLink>
        </>
      )}
    </div>
  );
}
