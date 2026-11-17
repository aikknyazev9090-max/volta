import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Search as SearchIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MatchCard } from '../components/MatchCard';
import { EmptyState, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { useEventsStore } from '../store';
import type { EventSummary } from '../types';

const SUGGEST = ['Зенит', 'Реал', 'ЦСКА', 'NAVI', 'Spirit', 'Бавария', 'НБА', 'КХЛ'];

export default function Search() {
  const nav = useNavigate();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const upsert = useEventsStore((s) => s.upsert);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(t);
  }, [term]);
  useEffect(() => input.current?.focus(), []);
  const q = useQuery({ queryKey: ['search', debounced], queryFn: () => api<EventSummary[]>(`/api/search?q=${encodeURIComponent(debounced)}`), enabled: debounced.length >= 2 });
  useEffect(() => {
    if (q.data) upsert(q.data);
  }, [q.data, upsert]);

  return (
    <div className="pb-6">
      <header className="glass sticky top-0 z-30 flex h-[60px] items-center gap-2 border-b border-line px-3">
        <button aria-label="Назад" onClick={() => nav(-1)} className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface2">
          <ArrowLeft size={18} />
        </button>
        <div className="flex h-10 flex-1 items-center gap-2 rounded-full border border-line bg-surface2 px-3.5 focus-within:border-accent/50">
          <SearchIcon size={16} className="text-muted" />
          <input ref={input} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Команда, игрок или лига" className="w-full bg-transparent text-[14.5px] font-semibold outline-none placeholder:text-faint" />
          {term && (
            <button aria-label="Очистить" onClick={() => setTerm('')} className="text-muted">
              <X size={16} />
            </button>
          )}
        </div>
      </header>
      {debounced.length < 2 ? (
        <div className="px-4 pt-5">
          <div className="mb-3 text-[12px] font-extrabold uppercase tracking-wider text-faint">Популярное</div>
          <div className="flex flex-wrap gap-2">
            {SUGGEST.map((s) => (
              <button key={s} onClick={() => setTerm(s)} className="press h-9 rounded-full border border-line bg-surface px-4 text-[13px] font-bold">
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : q.isLoading ? (
        <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : !q.data?.length ? (
        <EmptyState icon={<SearchIcon size={28} />} title="Ничего не нашли" text={`По запросу «${debounced}» матчей нет. Попробуйте другое название.`} />
      ) : (
        <div className="card mx-3 mt-3 divide-y divide-line overflow-hidden">
          {q.data.map((e) => (
            <MatchCard key={e.id} id={e.id} showLeague />
          ))}
        </div>
      )}
    </div>
  );
}
