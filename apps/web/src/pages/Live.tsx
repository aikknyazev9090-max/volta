import { Cpu, Radio } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Header, SportChips } from '../components/Chrome';
import { SportIcon } from '../components/icons';
import { groupByLeague, LeagueGroup, MatchListSkeleton } from '../components/MatchCard';
import { EmptyState, ErrorState, LiveDot, Segmented } from '../components/ui';
import { dayLabel, SPORT_NAMES, SPORT_ORDER } from '../lib/format';
import { useEventList, useSportCounts } from '../lib/queries';
import { useEventsStore } from '../store';
import type { EventSummary, SportId } from '../types';

/** Раздел «Виртуальные матчи»: их разыгрывает компьютер, круглосуточно и с лайв-ставками. */
export default function Virtual() {
  const [sport, setSport] = useState<SportId | null>(null);
  const [tab, setTab] = useState<'live' | 'upcoming'>('live');
  const q = useEventList('all');
  const counts = useSportCounts();
  const byId = useEventsStore((s) => s.byId);
  const all = useMemo(
    () => (q.data ?? []).map((e) => byId[e.id] ?? e).filter((e) => !e.real && (e.status === 'live' || e.status === 'scheduled') && (!sport || e.sport === sport)),
    [q.data, byId, sport],
  );
  const live = all.filter((e) => e.status === 'live');
  const upcoming = all.filter((e) => e.status === 'scheduled').sort((a, b) => a.startAt - b.startAt);
  const bySport = SPORT_ORDER.map((s) => ({ sport: s, evs: live.filter((e) => e.sport === s) })).filter((x) => x.evs.length);
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
      <Header
        title={
          <span className="flex items-center gap-2">
            Виртуальные <LiveDot />
          </span>
        }
        sub={
          <div className="pb-2.5">
            <SportChips value={sport} onChange={setSport} counts={counts.data} mode={tab === 'live' ? 'live' : 'upcoming'} />
          </div>
        }
      />
      <div className="card mx-3 mt-3 flex gap-3 p-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface2 text-muted">
          <Cpu size={18} strokeWidth={2.3} />
        </span>
        <div className="text-[12.5px] leading-snug text-muted">
          <div className="text-[13.5px] font-extrabold text-ink">Матчи разыгрывает компьютер</div>
          Это не настоящий спорт: исход считает модель по силе команд. Матчи идут круглосуточно и быстрее реального времени, ставить можно и по ходу игры.
        </div>
      </div>
      <div className="mt-3 px-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'live', label: <><LiveDot className="!h-1.5 !w-1.5" /> Идут <span className="num text-faint">{live.length}</span></> },
            { value: 'upcoming', label: <>Скоро <span className="num text-faint">{upcoming.length}</span></> },
          ]}
        />
      </div>
      <div className="mt-3 space-y-4">
        {q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <MatchListSkeleton groups={3} />
        ) : tab === 'live' ? (
          !live.length ? (
            <EmptyState icon={<Radio size={30} />} title="Сейчас тихо" text="Матчей по этому фильтру нет. Новые начинаются каждые несколько минут." />
          ) : (
            bySport.map(({ sport: s, evs }) => (
              <section key={s} className="space-y-3">
                {!sport && (
                  <div className="flex items-center gap-2 px-4">
                    <SportIcon sport={s} size={17} className="text-accent" />
                    <span className="font-display text-[15px] font-semibold">{SPORT_NAMES[s]}</span>
                    <span className="num text-[12px] font-bold text-faint">{evs.length}</span>
                  </div>
                )}
                {groupByLeague(evs).map((g, i) => (
                  <LeagueGroup key={g.league.id} {...g} index={i} />
                ))}
              </section>
            ))
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
