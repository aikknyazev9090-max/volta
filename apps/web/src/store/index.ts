import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { EventSummary, SportId, Team } from '../types';

/* ---------- живые данные событий ---------- */

interface EventsState {
  byId: Record<string, EventSummary>;
  upsert: (list: EventSummary[]) => void;
}

export const useEventsStore = create<EventsState>((set) => ({
  byId: {},
  upsert: (list) =>
    set((s) => {
      if (!list.length) return s;
      const next = { ...s.byId };
      for (const e of list) next[e.id] = e;
      return { byId: next };
    }),
}));

export const useEvent = (id: string) => useEventsStore((s) => s.byId[id]);

/* ---------- купон ---------- */

export interface SlipItem {
  eventId: string;
  market: string;
  outcome: string;
  odds: number;
  label: string;
  marketTitle: string;
  sport: SportId;
  home: Team;
  away: Team;
  live: boolean;
  /** состояние после последней проверки */
  status?: 'open' | 'suspended' | 'closed';
  prevOdds?: number;
}

interface SlipState {
  items: SlipItem[];
  mode: 'single' | 'express';
  stake: number;
  open: boolean;
  toggle: (it: SlipItem) => 'added' | 'removed' | 'replaced';
  remove: (eventId: string, market: string, outcome: string) => void;
  clear: () => void;
  setMode: (m: 'single' | 'express') => void;
  setStake: (n: number) => void;
  setOpen: (o: boolean) => void;
  applyOdds: (list: { eventId: string; market: string; outcome: string; odds: number | null; status: string; live?: boolean }[]) => void;
  acceptAll: () => void;
}

const safeStorage = createJSONStorage(() => {
  try {
    const k = '__volta_test';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const mem = new Map<string, string>();
    return { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
  }
});

const same = (a: { eventId: string; market: string; outcome: string }, b: typeof a) => a.eventId === b.eventId && a.market === b.market && a.outcome === b.outcome;

export const useSlip = create<SlipState>()(
  persist(
    (set, get) => ({
      items: [],
      mode: 'single',
      stake: 100,
      open: false,
      toggle: (it) => {
        const items = get().items;
        if (items.some((x) => same(x, it))) {
          set({ items: items.filter((x) => !same(x, it)) });
          return 'removed';
        }
        const sameMarket = items.findIndex((x) => x.eventId === it.eventId && x.market === it.market);
        if (sameMarket >= 0) {
          const next = items.slice();
          next[sameMarket] = { ...it, status: 'open' };
          set({ items: next });
          return 'replaced';
        }
        const next = [...items, { ...it, status: 'open' as const }];
        set({ items: next, mode: next.length >= 2 && new Set(next.map((x) => x.eventId)).size === next.length ? 'express' : get().mode });
        return 'added';
      },
      remove: (eventId, market, outcome) => {
        const next = get().items.filter((x) => !same(x, { eventId, market, outcome }));
        set({ items: next, mode: next.length < 2 ? 'single' : get().mode, open: next.length ? get().open : false });
      },
      clear: () => set({ items: [], mode: 'single' }),
      setMode: (mode) => set({ mode }),
      setStake: (stake) => set({ stake }),
      setOpen: (open) => set({ open }),
      applyOdds: (list) =>
        set((s) => ({
          items: s.items.map((it) => {
            const u = list.find((x) => same(x, it));
            if (!u) return it;
            const status = u.status as SlipItem['status'];
            if (u.odds && Math.abs(u.odds - it.odds) > 1e-9) return { ...it, prevOdds: it.prevOdds ?? it.odds, odds: u.odds, status, live: !!u.live };
            return { ...it, status, live: u.live ?? it.live };
          }),
        })),
      acceptAll: () => set((s) => ({ items: s.items.map((it) => ({ ...it, prevOdds: undefined })) })),
    }),
    { name: 'volta.slip', storage: safeStorage, partialize: (s) => ({ items: s.items, mode: s.mode, stake: s.stake }) },
  ),
);

export const isSelected = (items: SlipItem[], eventId: string, market: string, outcome: string) =>
  items.some((x) => x.eventId === eventId && x.market === market && x.outcome === outcome);

/* ---------- тосты ---------- */

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info' | 'win' | 'achievement';
  title: string;
  text?: string;
  icon?: string;
}

interface ToastState {
  list: Toast[];
  push: (t: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let tid = 1;
export const useToasts = create<ToastState>((set, get) => ({
  list: [],
  push: (t) => {
    const id = tid++;
    set({ list: [...get().list.slice(-2), { ...t, id }] });
    setTimeout(() => get().dismiss(id), t.kind === 'error' ? 4200 : 3400);
  },
  dismiss: (id) => set({ list: get().list.filter((x) => x.id !== id) }),
}));

export const toast = (t: Omit<Toast, 'id'>) => useToasts.getState().push(t);

/* ---------- UI ---------- */

interface UiState {
  theme: 'dark' | 'light';
  bonusOpen: boolean;
  setTheme: (t: 'dark' | 'light') => void;
  setBonusOpen: (o: boolean) => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      theme: 'dark',
      bonusOpen: false,
      setTheme: (theme) => set({ theme }),
      setBonusOpen: (bonusOpen) => set({ bonusOpen }),
    }),
    { name: 'volta.ui', storage: safeStorage, partialize: (s) => ({ theme: s.theme }) },
  ),
);
