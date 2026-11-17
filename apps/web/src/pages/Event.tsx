import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ChevronDown, Lock, Star, Trophy } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BalancePill } from '../components/Chrome';
import { Flag, SportIcon } from '../components/icons';
import { OddsButton } from '../components/OddsButton';
import { TeamBadge } from '../components/TeamBadge';
import { Button, EmptyState, ErrorState, LiveDot, Segmented, Skeleton, useNow } from '../components/ui';
import { api, onWs, subscribeEvent } from '../lib/api';
import { countdown, dayLabel, SPORT_NAMES, time } from '../lib/format';
import { useEventFull, useMe } from '../lib/queries';
import { haptic, inTelegram } from '../lib/tg';
import { useEventsStore } from '../store';
import type { EventFull, Incident, Market } from '../types';

const GROUPS: { key: Market['group'] | 'all'; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'main', label: 'Основные' },
  { key: 'totals', label: 'Тоталы' },
  { key: 'handicap', label: 'Форы' },
  { key: 'period', label: 'Периоды' },
  { key: 'score', label: 'Счёт' },
  { key: 'other', label: 'Другое' },
];

function Hero({ ev }: { ev: EventFull }) {
  const now = useNow(1000);
  const live = ev.status === 'live';
  const [c1] = ev.home.colors;
  const [c2] = ev.away.colors;
  return (
    <div className="relative overflow-hidden px-4 pb-5 pt-2">
      <div className="pointer-events-none absolute -left-16 -top-24 h-64 w-64 rounded-full opacity-25 blur-3xl" style={{ background: c1 }} />
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full opacity-20 blur-3xl" style={{ background: c2 }} />
      <div className="relative flex items-center justify-center gap-1.5 text-[12px] font-semibold text-muted">
        <SportIcon sport={ev.sport} size={14} />
        <Flag code={ev.league.country} />
        <span className="truncate">{ev.league.name}</span>
      </div>
      <div className="relative mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
        {[ev.home, ev.away].map((t, side) => (
          <div key={t.id} className={clsx('flex min-w-0 flex-col items-center gap-2.5', side === 1 && 'col-start-3')}>
            <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18, delay: side * 0.06 }}>
              <TeamBadge team={t} sport={ev.sport} size={64} />
            </motion.div>
            <span className="line-clamp-2 w-full text-center text-[14px] font-extrabold leading-tight">{t.name}</span>
            {live && ev.sb.serving === side && <span className="text-[10.5px] font-bold text-gold">● подаёт</span>}
          </div>
        ))}
        <div className="col-start-2 row-start-1 flex min-w-[110px] flex-col items-center pt-2">
          {live || ev.status === 'finished' ? (
            <>
              <div className="num flex items-center font-display text-[40px] font-bold leading-none tracking-tight">
                <AnimatePresence mode="popLayout">
                  <motion.span key={`h${ev.sb.score[0]}`} initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}>
                    {ev.sb.score[0]}
                  </motion.span>
                </AnimatePresence>
                <span className="mx-2 text-faint">:</span>
                <AnimatePresence mode="popLayout">
                  <motion.span key={`a${ev.sb.score[1]}`} initial={{ y: -16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 16, opacity: 0 }}>
                    {ev.sb.score[1]}
                  </motion.span>
                </AnimatePresence>
              </div>
              <div className={clsx('mt-2.5 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-extrabold', ev.sb.isBreak ? 'bg-gold/15 text-gold' : 'bg-live/15 text-live')}>
                {!ev.sb.isBreak && live && <LiveDot className="!h-1.5 !w-1.5" />}
                <span className="num">{ev.sb.clock}</span>
              </div>
              <div className="mt-1.5 text-center text-[11.5px] font-semibold text-muted">{ev.sb.period}</div>
            </>
          ) : (
            <>
              <div className="font-display text-[26px] font-bold leading-none">{time(ev.startAt)}</div>
              <div className="mt-1.5 text-[12px] font-semibold text-muted">{dayLabel(ev.startAt)}</div>
              {ev.startAt - now < 3 * 3600e3 && (
                <div className="num mt-2.5 rounded-full bg-accent/15 px-2.5 py-1 text-[12px] font-extrabold text-accent">через {countdown(ev.startAt - now)}</div>
              )}
            </>
          )}
        </div>
      </div>
      {ev.sb.detail && <div className="num relative mt-3 text-center text-[12.5px] font-semibold text-muted">{ev.sb.detail}</div>}
      {live && typeof ev.sb.pressure === 'number' && (
        <div className="relative mx-auto mt-4 max-w-[300px]">
          <div className="mb-1.5 flex justify-between text-[10.5px] font-bold uppercase tracking-wider text-faint">
            <span>Давление</span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-surface3">
            <motion.div className="h-full rounded-l-full" style={{ background: c1 }} animate={{ width: `${Math.round(ev.sb.pressure * 100)}%` }} transition={{ type: 'spring', stiffness: 80, damping: 20 }} />
            <motion.div className="h-full flex-1 rounded-r-full" style={{ background: c2, opacity: 0.85 }} />
          </div>
        </div>
      )}
    </div>
  );
}

function MarketCard({ title, markets, ev, defaultOpen }: { title: string; markets: Market[]; ev: EventFull; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const lines = markets.length > 1;
  return (
    <motion.div layout="position" className="card overflow-hidden">
      <button onClick={() => { haptic.select(); setOpen(!open); }} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <span className="flex-1 text-[14px] font-extrabold">{title}</span>
        {lines && <span className="text-[11.5px] font-bold text-faint">{markets.length} линии</span>}
        <motion.span animate={{ rotate: open ? 180 : 0 }}>
          <ChevronDown size={18} className="text-faint" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="space-y-1.5 px-3 pb-3">
              {markets.map((m) => {
                const grid = m.layout === 'grid' || m.outcomes.length > 3;
                return (
                  <div key={m.key} className={clsx('grid gap-1.5', grid ? 'grid-cols-3' : m.outcomes.length === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
                    {m.outcomes.map((o) => (
                      <OddsButton key={o.key} ev={ev} market={m} outcome={o} variant={grid ? 'stack' : 'inline'} />
                    ))}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Markets({ ev }: { ev: EventFull }) {
  const [group, setGroup] = useState<(typeof GROUPS)[number]['key']>('all');
  const present = new Set(ev.markets.map((m) => m.group));
  const groups = GROUPS.filter((g) => g.key === 'all' || present.has(g.key as Market['group']));
  const cards = useMemo(() => {
    const filtered = ev.markets.filter((m) => group === 'all' || m.group === group);
    const map = new Map<string, Market[]>();
    for (const m of filtered) {
      if (!map.has(m.title)) map.set(m.title, []);
      map.get(m.title)!.push(m);
    }
    return [...map.entries()];
  }, [ev.markets, group]);

  if (!ev.markets.length) {
    return <EmptyState icon={<Lock size={28} />} title={ev.status === 'finished' ? 'Матч завершён' : 'Рынки закрыты'} text={ev.status === 'finished' ? 'Ставки по этому матчу рассчитаны.' : 'Приём ставок временно приостановлен. Коэффициенты скоро вернутся.'} />;
  }
  return (
    <div>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-3">
        {groups.map((g) => (
          <button key={g.key} onClick={() => { haptic.select(); setGroup(g.key); }} className={clsx('press h-8 shrink-0 rounded-full px-3.5 text-[12.5px] font-bold transition-colors', group === g.key ? 'bg-ink text-bg' : 'bg-surface2 text-muted')}>
            {g.label}
          </button>
        ))}
      </div>
      <AnimatePresence>
        {ev.suspended && ev.status === 'live' && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="mx-3 mb-2 overflow-hidden">
            <div className="flex items-center gap-2 rounded-xl bg-gold/10 px-3 py-2.5 text-[12.5px] font-bold text-gold">
              <Lock size={14} /> Опасный момент — приём ставок на паузе
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="space-y-2 px-3">
        {cards.map(([title, ms], i) => (
          <MarketCard key={title} title={title} markets={ms} ev={ev} defaultOpen={i < 6} />
        ))}
      </div>
    </div>
  );
}

function Stats({ ev }: { ev: EventFull }) {
  if (!ev.stats.length) return <EmptyState icon={<Trophy size={28} />} title="Статистика появится в лайве" text="Как только матч начнётся, здесь будут удары, владение и другие цифры." />;
  return (
    <div className="card mx-3 space-y-4 p-4">
      {ev.stats.map((s) => {
        const total = s.h + s.a || 1;
        return (
          <div key={s.label}>
            <div className="mb-1.5 flex items-center justify-between text-[13px]">
              <span className="num w-10 font-extrabold">{s.h}</span>
              <span className="font-semibold text-muted">{s.label}</span>
              <span className="num w-10 text-right font-extrabold">{s.a}</span>
            </div>
            <div className="flex gap-1">
              <div className="flex h-1.5 flex-1 justify-end overflow-hidden rounded-full bg-surface3">
                <motion.div className="h-full rounded-full" style={{ background: ev.home.colors[0] }} animate={{ width: `${(s.h / total) * 100}%` }} />
              </div>
              <div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-surface3">
                <motion.div className="h-full rounded-full" style={{ background: ev.away.colors[0] }} animate={{ width: `${(s.a / total) * 100}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const INC_ICON: Record<Incident['type'], string> = { goal: '⚡', period: '⏱', start: '▶', finish: '🏁', point: '•', card: '▮', info: 'i' };

function Timeline({ ev }: { ev: EventFull }) {
  if (!ev.incidents.length) return <EmptyState icon={<Trophy size={28} />} title="Хроника пуста" text="Голы, перерывы и ключевые моменты появятся здесь по ходу матча." />;
  return (
    <div className="card mx-3 divide-y divide-line">
      <AnimatePresence initial={false}>
        {ev.incidents.map((i) => (
          <motion.div key={`${i.at}-${i.text}-${i.clock}`} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className={clsx('flex items-center gap-3 px-4 py-3', i.side === 1 && 'flex-row-reverse text-right')}>
            <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[13px]', i.type === 'goal' ? 'bg-accent/15 text-accent' : i.type === 'card' ? 'bg-gold/15 text-gold' : 'bg-surface2 text-muted')}>{INC_ICON[i.type]}</span>
            <div className="min-w-0 flex-1">
              <div className={clsx('text-[13.5px]', i.type === 'goal' ? 'font-extrabold' : 'font-semibold')}>{i.text}</div>
              {i.side !== undefined && <div className="truncate text-[11.5px] text-muted">{i.side === 0 ? ev.home.name : ev.away.name}</div>}
            </div>
            {i.clock && <span className="num text-[12px] font-bold text-faint">{i.clock}</span>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default function EventPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useEventFull(id);
  const { data: me } = useMe();
  const [tab, setTab] = useState<'bets' | 'stats' | 'timeline'>('bets');
  const upsert = useEventsStore((s) => s.upsert);
  const fav = me?.favorites.includes(id);

  useEffect(() => {
    subscribeEvent(id);
    const off = onWs((m) => {
      if (m.t === 'event' && m.data?.id === id) {
        qc.setQueryData(['event', id], m.data);
        upsert([m.data]);
      }
    });
    return () => {
      off();
      subscribeEvent(null);
    };
  }, [id, qc, upsert]);

  const toggleFav = async () => {
    haptic.tap();
    try {
      await api(`/api/favorites/${id}`, { body: {} });
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch {
      /* ignore */
    }
  };

  const ev = q.data;
  const err: any = q.error;

  return (
    <div className="min-h-dvh pb-8">
      <header className="glass sticky top-0 z-30 flex h-[56px] items-center gap-2 border-b border-line px-3">
        {!inTelegram && (
          <button aria-label="Назад" onClick={() => (history.length > 1 ? nav(-1) : nav('/'))} className="press grid h-9 w-9 place-items-center rounded-full bg-surface2">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="min-w-0 flex-1 px-1">
          {ev ? (
            <div className="truncate text-[14px] font-extrabold">
              {ev.home.short} — {ev.away.short}
              <span className="ml-1.5 text-[12px] font-semibold text-muted">· {SPORT_NAMES[ev.sport]}</span>
            </div>
          ) : (
            <div className="h-3 w-32 rounded bg-surface2" />
          )}
        </div>
        {ev?.status === 'scheduled' && (
          <button aria-label="В избранное" onClick={toggleFav} className={clsx('press grid h-9 w-9 place-items-center rounded-full', fav ? 'bg-gold/15 text-gold' : 'bg-surface2 text-muted')}>
            <Star size={17} fill={fav ? 'currentColor' : 'none'} />
          </button>
        )}
        <BalancePill />
      </header>

      {q.isLoading ? (
        <div className="space-y-3 p-4">
          <Skeleton className="mx-auto h-4 w-40" />
          <div className="flex items-center justify-between px-4 pt-2">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-10 w-20" />
            <Skeleton className="h-16 w-16 rounded-full" />
          </div>
          <Skeleton className="mt-6 h-10 w-full rounded-2xl" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : err?.status === 410 || err?.status === 404 ? (
        <EmptyState icon={<Trophy size={28} />} title={err.status === 410 ? 'Матч завершён' : 'Матч не найден'} text="Ставки по нему рассчитаны — результат смотрите в разделе «Ставки»." action={<Button onClick={() => nav('/')}>К матчам</Button>} />
      ) : q.isError || !ev ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <>
          <Hero ev={ev} />
          <div className="px-4 pb-3">
            <Segmented
              value={tab}
              onChange={setTab}
              size="sm"
              options={[
                { value: 'bets', label: `Ставки${ev.marketsCount ? ` · ${ev.marketsCount}` : ''}` },
                { value: 'stats', label: 'Статистика' },
                { value: 'timeline', label: 'Хроника' },
              ]}
            />
          </div>
          <AnimatePresence mode="wait">
            <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
              {tab === 'bets' && <Markets ev={ev} />}
              {tab === 'stats' && <Stats ev={ev} />}
              {tab === 'timeline' && <Timeline ev={ev} />}
            </motion.div>
          </AnimatePresence>
        </>
      )}
    </div>
  );
}
