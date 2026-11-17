import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useEventsStore } from '../store';
import type { EventFull, EventSummary, Me } from '../types';
import { api } from './api';

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me'), staleTime: 30_000, refetchInterval: 60_000 });
}

export function setBalance(qc: QueryClient, balance: number) {
  qc.setQueryData<Me>(['me'], (m) => (m ? { ...m, balance } : m));
}

/** Список событий; живые обновления приходят в стор через WebSocket. */
export function useEventList(status: 'live' | 'upcoming' | 'all', sport?: string | null) {
  const upsert = useEventsStore((s) => s.upsert);
  const q = useQuery({
    queryKey: ['events', status, sport ?? 'all'],
    queryFn: () => api<EventSummary[]>(`/api/events?status=${status}${sport ? `&sport=${sport}` : ''}`),
    refetchInterval: 25_000,
    staleTime: 10_000,
  });
  useEffect(() => {
    if (q.data) upsert(q.data);
  }, [q.data, upsert]);
  return q;
}

export function useSportCounts() {
  return useQuery({ queryKey: ['sports'], queryFn: () => api<Record<string, { live: number; upcoming: number }>>('/api/sports'), refetchInterval: 30_000 });
}

export function useEventFull(id: string) {
  return useQuery({ queryKey: ['event', id], queryFn: () => api<EventFull>(`/api/events/${id}`), retry: (n, e: any) => e?.status !== 404 && e?.status !== 410 && n < 2 });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}
