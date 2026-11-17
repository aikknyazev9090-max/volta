import { Radio } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Header, SportChips } from '../components/Chrome';
import { SportIcon } from '../components/icons';
import { groupByLeague, LeagueGroup, MatchListSkeleton } from '../components/MatchCard';
import { EmptyState, ErrorState, LiveDot } from '../components/ui';
import { SPORT_NAMES, SPORT_ORDER } from '../lib/format';
import { useEventList, useSportCounts } from '../lib/queries';
import { useEventsStore } from '../store';
import type { SportId } from '../types';

export default function Live() {
  const [sport, setSport] = useState<SportId | null>(null);
  const q = useEventList('live');
  const counts = useSportCounts();
  const byId = useEventsStore((s) => s.byId);
  const list = useMemo(() => (q.data ?? []).map((e) => byId[e.id] ?? e).filter((e) => e.status === 'live' && (!sport || e.sport === sport)), [q.data, byId, sport]);
  const bySport = SPORT_ORDER.map((s) => ({ sport: s, evs: list.filter((e) => e.sport === s) })).filter((x) => x.evs.length);

  return (
    <div className="pb-6">
      <Header
        title={
          <span className="flex items-center gap-2">
            Лайв <LiveDot />
          </span>
        }
        sub={
          <div className="pb-2.5">
            <SportChips value={sport} onChange={setSport} counts={counts.data} mode="live" />
          </div>
        }
      />
      <div className="mt-3 space-y-4">
        {q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          <MatchListSkeleton groups={3} />
        ) : !list.length ? (
          <EmptyState icon={<Radio size={30} />} title="Сейчас тихо" text="Матчей в лайве по этому фильтру нет. Новые начинаются каждые несколько минут." />
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
        )}
      </div>
    </div>
  );
}
