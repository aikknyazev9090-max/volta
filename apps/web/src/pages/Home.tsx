import clsx from 'clsx';
import { motion } from 'framer-motion';
import { ChevronRight, Cpu, Gift, Globe2, GraduationCap, Trophy, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Header } from '../components/Chrome';
import { Coin, Flag } from '../components/icons';
import { groupByLeague, LeagueGroup, MatchListSkeleton } from '../components/MatchCard';
import { TopMatchCard } from '../components/TopMatchCard';
import { ErrorState, SectionTitle, Skeleton } from '../components/ui';
import { coins, dayLabel } from '../lib/format';
import { useEventList, useMe } from '../lib/queries';
import { haptic } from '../lib/tg';
import { useEventsStore, useUi } from '../store';
import type { EventSummary } from '../types';

/** Карточка «Как сделать ставку» для новичков; можно скрыть. */
function HowTo() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('volta.howto.hidden') === '1';
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem('volta.howto.hidden', '1');
    } catch {
      /* приватный режим */
    }
  };
  const steps = ['Выберите матч в списке ниже', 'Нажмите на вариант — например, на победу команды', 'В купоне введите сумму и нажмите «Поставить»'];
  return (
    <div className="card relative mx-4 mt-3 p-4">
      <button aria-label="Скрыть" onClick={hide} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full text-faint">
        <X size={16} />
      </button>
      <div className="flex items-center gap-2 text-[14.5px] font-extrabold">
        <GraduationCap size={18} className="text-accent" /> Как сделать ставку
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((t, i) => (
          <li key={t} className="flex items-center gap-2.5 text-[13px] font-semibold text-ink/85">
            <span className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-[12px] font-extrabold text-accentInk">{i + 1}</span>
            {t}
          </li>
        ))}
      </ol>
      <Link to="/help" className="mt-3 inline-flex items-center gap-1 text-[13px] font-bold text-accent">
        Подробная инструкция <ChevronRight size={15} />
      </Link>
    </div>
  );
}

/** Пояснение к реальным матчам. */
function RealInfo() {
  return (
    <div className="card mx-3 flex gap-3 p-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
        <Globe2 size={18} strokeWidth={2.3} />
      </span>
      <div className="text-[12.5px] leading-snug text-muted">
        <div className="text-[13.5px] font-extrabold text-ink">Настоящие матчи топ-лиг Европы</div>
        Ставки — до стартового свистка. Расчёт по итоговому счёту, он приходит с задержкой до часа. Коэффициенты считает наша модель по рейтингу силы клубов.
      </div>
    </div>
  );
}

function groupByDay(list: EventSummary[]) {
  const m = new Map<string, EventSummary[]>();
  for (const e of list) {
    const d = e.status === 'live' ? 'Идут сейчас' : dayLabel(e.startAt);
    if (!m.has(d)) m.set(d, []);
    m.get(d)!.push(e);
  }
  return [...m.entries()];
}

function PromoBonus() {
  const { data: me } = useMe();
  const open = useUi((s) => s.setBonusOpen);
  if (!me?.bonus.available) return null;
  return (
    <motion.button initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} onClick={() => open(true)} className="press relative mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 overflow-hidden rounded-[20px] border border-gold/30 bg-gradient-to-r from-gold/15 via-gold/5 to-transparent px-4 py-3 text-left">
      <div className="pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-gold/25 blur-2xl" />
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#FFE27A] to-[#F5A700] text-[#3A2400]">
        <Gift size={22} strokeWidth={2.3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-extrabold">Бонус дня {me.bonus.nextDay} ждёт вас</span>
        <span className="flex items-center gap-1 text-[12.5px] font-semibold text-muted">
          Заберите <Coin size={13} /> {coins(me.bonus.nextAmount)}
        </span>
      </span>
      <ChevronRight size={18} className="text-gold" />
    </motion.button>
  );
}

function useStoreList(data: EventSummary[] | undefined) {
  const byId = useEventsStore((s) => s.byId);
  return useMemo(() => (data ?? []).map((e) => byId[e.id] ?? e).filter((e) => e.status === 'live' || e.status === 'scheduled'), [data, byId]);
}

/** Короткие названия турниров для фильтра. */
const SHORT_LEAGUE: Record<string, string> = {
  'real-CL': 'Лига чемпионов',
  'real-PL': 'АПЛ',
  'real-PD': 'Ла Лига',
  'real-SA': 'Серия A',
  'real-BL1': 'Бундеслига',
  'real-FL1': 'Лига 1',
  'real-DED': 'Эредивизи',
  'real-PPL': 'Португалия',
};
const ORDER = Object.keys(SHORT_LEAGUE);

function LeagueChips({ list, value, onChange }: { list: EventSummary[]; value: string | null; onChange: (id: string | null) => void }) {
  const leagues = useMemo(() => {
    const m = new Map<string, { league: EventSummary['league']; n: number }>();
    for (const e of list) {
      const x = m.get(e.league.id) ?? { league: e.league, n: 0 };
      x.n++;
      m.set(e.league.id, x);
    }
    return [...m.values()].sort((a, b) => ORDER.indexOf(a.league.id) - ORDER.indexOf(b.league.id));
  }, [list]);
  if (leagues.length < 2) return null;
  const chip = (id: string | null, label: React.ReactNode, n: number) => {
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
        {label}
        <span className={clsx('num text-[11.5px] font-extrabold', active ? 'text-bg/55' : 'text-faint')}>{n}</span>
      </button>
    );
  };
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 lg:flex-wrap">
      {chip(null, 'Все', list.length)}
      {leagues.map(({ league, n }) =>
        chip(
          league.id,
          <>
            <Flag code={league.country} />
            {SHORT_LEAGUE[league.id] ?? league.name}
          </>,
          n,
        ),
      )}
    </div>
  );
}

/** Ссылка на раздел виртуальных матчей. */
function VirtualLink() {
  return (
    <Link to="/virtual" className="press mx-4 mt-4 flex items-center gap-3 rounded-[18px] border border-line bg-surface px-4 py-3">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface2 text-muted">
        <Cpu size={18} strokeWidth={2.3} />
      </span>
      <span className="flex-1">
        <span className="block text-[14px] font-extrabold">Виртуальные матчи</span>
        <span className="text-[12px] text-muted">Матчи разыгрывает компьютер — круглосуточно, с лайвом</span>
      </span>
      <ChevronRight size={18} className="text-faint" />
    </Link>
  );
}

export default function Home() {
  // турнир хранится в адресе (?league=real-PL): так его можно выбрать и из левого меню на компьютере
  const [params, setParams] = useSearchParams();
  const league = params.get('league');
  const setLeague = (id: string | null) => {
    const p = new URLSearchParams(params);
    if (id) p.set('league', id);
    else p.delete('league');
    setParams(p, { replace: true });
  };
  const all = useEventList('all');
  const list = useStoreList(all.data);
  const real = useMemo(() => list.filter((e) => e.real), [list]);
  const filtered = useMemo(() => (league ? real.filter((e) => e.league.id === league) : real), [real, league]);
  const sorted = useMemo(() => [...filtered].sort((a, b) => (a.status === b.status ? a.startAt - b.startAt : a.status === 'live' ? -1 : 1)), [filtered]);
  const byDay = useMemo(() => groupByDay(sorted), [sorted]);
  const top = useMemo(() => {
    const balanced = (e: EventSummary) => Math.min(...e.main!.outcomes.map((o) => o.odds ?? 1)) >= 1.25;
    return sorted.filter((e) => e.status === 'scheduled' && e.top && e.main && balanced(e)).slice(0, 8);
  }, [sorted]);

  return (
    <div className="pb-6">
      <Header />
      <div className="bg-aurora">
        <PromoBonus />
        <HowTo />

        {(all.isLoading || top.length > 0) && (
          <>
            <SectionTitle className="mt-5" action={<span className="text-[12px] font-bold text-faint">{top.length ? `${top.length} матчей` : ''}</span>}>
              Главные матчи
            </SectionTitle>
            {all.isLoading ? (
              <div className="mt-3 flex gap-3 overflow-hidden px-4">
                <Skeleton className="h-[218px] w-[84%] shrink-0 rounded-[22px]" />
                <Skeleton className="h-[218px] w-[84%] shrink-0 rounded-[22px]" />
              </div>
            ) : (
              <div className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-1 lg:grid lg:grid-cols-2 lg:overflow-visible lg:[&>*:nth-child(n+5)]:hidden">
                {top.map((e, i) => (
                  <TopMatchCard key={e.id} id={e.id} index={i} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-5">
        <LeagueChips list={real} value={league} onChange={setLeague} />
      </div>

      <div className="mt-3 space-y-3">
        <RealInfo />
        {all.isError ? (
          <ErrorState onRetry={() => all.refetch()} />
        ) : all.isLoading ? (
          <MatchListSkeleton />
        ) : sorted.length ? (
          byDay.map(([day, evs]) => (
            <div key={day} className="space-y-3">
              <div className="px-4 pt-1 text-[12px] font-extrabold uppercase tracking-wider text-faint">{day}</div>
              {groupByLeague(evs).map((g, i) => (
                <LeagueGroup key={g.league.id + day} {...g} index={i} />
              ))}
            </div>
          ))
        ) : (
          <div className="mx-4 rounded-2xl border border-dashed border-line px-6 py-8 text-center text-[13px] text-muted">
            Расписание обновляется. Пока ближайших матчей нет — загляните в виртуальные матчи.
          </div>
        )}
      </div>

      <VirtualLink />

      <Link to="/leaderboard" className="press mx-4 mt-3 flex items-center gap-3 rounded-[18px] border border-line bg-surface px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
          <Trophy size={18} strokeWidth={2.3} />
        </span>
        <span className="flex-1">
          <span className="block text-[14px] font-extrabold">Рейтинг недели</span>
          <span className="text-[12px] text-muted">Кто больше всех заработал за неделю</span>
        </span>
        <ChevronRight size={18} className="text-faint" />
      </Link>
    </div>
  );
}
