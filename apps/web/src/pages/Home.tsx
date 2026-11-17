import { motion } from 'framer-motion';
import { ChevronRight, Gift, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Header, SportChips } from '../components/Chrome';
import { Coin } from '../components/icons';
import { groupByLeague, LeagueGroup, MatchListSkeleton } from '../components/MatchCard';
import { TopMatchCard } from '../components/TopMatchCard';
import { ErrorState, LiveDot, SectionTitle, Segmented, Skeleton } from '../components/ui';
import { coins, dayLabel } from '../lib/format';
import { useEventList, useMe, useSportCounts } from '../lib/queries';
import { useEventsStore, useUi } from '../store';
import type { EventSummary, SportId } from '../types';

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

export default function Home() {
  const [sport, setSport] = useState<SportId | null>(null);
  const [tab, setTab] = useState<'live' | 'upcoming'>('live');
  const all = useEventList('all');
  const counts = useSportCounts();
  const list = useStoreList(all.data);

  const filtered = useMemo(() => (sport ? list.filter((e) => e.sport === sport) : list), [list, sport]);
  const top = useMemo(() => {
    // в топе — равные по силе матчи: без «решённых» коэффициентов вроде 1.01
    const balanced = (e: EventSummary) => Math.min(...e.main!.outcomes.map((o) => o.odds ?? 1)) >= 1.25;
    const t = filtered.filter((e) => e.top && e.main && balanced(e));
    const live = t.filter((e) => e.status === 'live');
    const soon = t.filter((e) => e.status === 'scheduled').sort((a, b) => a.startAt - b.startAt);
    return [...live, ...soon].slice(0, 8);
  }, [filtered]);
  const live = filtered.filter((e) => e.status === 'live');
  const upcoming = filtered.filter((e) => e.status === 'scheduled').sort((a, b) => a.startAt - b.startAt);

  // предстоящие — по дням, внутри по лигам
  const byDay = useMemo(() => {
    const m = new Map<string, EventSummary[]>();
    for (const e of upcoming.slice(0, 60)) {
      const d = dayLabel(e.startAt);
      if (!m.has(d)) m.set(d, []);
      m.get(d)!.push(e);
    }
    return [...m.entries()];
  }, [upcoming]);

  return (
    <div className="pb-6">
      <Header />
      <div className="bg-aurora">
        <PromoBonus />

        <SectionTitle className="mt-5" action={<span className="text-[12px] font-bold text-faint">{top.length ? `${top.length} матчей` : ''}</span>}>
          Топ-матчи
        </SectionTitle>
        {all.isLoading ? (
          <div className="mt-3 flex gap-3 overflow-hidden px-4">
            <Skeleton className="h-[218px] w-[84%] shrink-0 rounded-[22px]" />
            <Skeleton className="h-[218px] w-[84%] shrink-0 rounded-[22px]" />
          </div>
        ) : top.length ? (
          <div className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-1">
            {top.map((e, i) => (
              <TopMatchCard key={e.id} id={e.id} index={i} />
            ))}
          </div>
        ) : (
          <div className="mx-4 mt-3 rounded-2xl border border-dashed border-line py-6 text-center text-[13px] text-muted">Топ-матчей по этому виду спорта пока нет</div>
        )}
      </div>

      <div className="mt-5">
        <SportChips value={sport} onChange={setSport} counts={counts.data} mode="all" />
      </div>

      <Link to="/leaderboard" className="press mx-4 mt-4 flex items-center gap-3 rounded-[18px] border border-line bg-surface px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
          <Trophy size={18} strokeWidth={2.3} />
        </span>
        <span className="flex-1">
          <span className="block text-[14px] font-extrabold">Рейтинг недели</span>
          <span className="text-[12px] text-muted">Кто больше всех заработал за неделю</span>
        </span>
        <ChevronRight size={18} className="text-faint" />
      </Link>

      <div className="mt-5 px-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'live', label: <><LiveDot className="!h-1.5 !w-1.5" /> Лайв <span className="num text-faint">{live.length}</span></> },
            { value: 'upcoming', label: <>Скоро <span className="num text-faint">{upcoming.length}</span></> },
          ]}
        />
      </div>

      <div className="mt-3 space-y-3">
        {all.isError ? (
          <ErrorState onRetry={() => all.refetch()} />
        ) : all.isLoading ? (
          <MatchListSkeleton />
        ) : tab === 'live' ? (
          live.length ? (
            <>
              {groupByLeague(live).slice(0, 6).map((g, i) => (
                <LeagueGroup key={g.league.id} {...g} index={i} />
              ))}
              <Link to="/live" className="press mx-3 flex h-11 items-center justify-center gap-1 rounded-2xl bg-surface2 text-[13.5px] font-bold">
                Весь лайв <ChevronRight size={16} />
              </Link>
            </>
          ) : (
            <div className="mx-4 rounded-2xl border border-dashed border-line py-8 text-center text-[13px] text-muted">Сейчас нет матчей в лайве — загляните во вкладку «Скоро»</div>
          )
        ) : (
          byDay.map(([day, evs]) => (
            <div key={day} className="space-y-3">
              <div className="px-4 pt-1 text-[12px] font-extrabold uppercase tracking-wider text-faint">{day}</div>
              {groupByLeague(evs).map((g, i) => (
                <LeagueGroup key={g.league.id + day} {...g} index={i} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
