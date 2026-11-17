import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Clock, HandCoins, Minus, Ticket, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Chrome';
import { Coin, SportIcon } from '../components/icons';
import { useOddsFormat } from '../components/OddsButton';
import { Button, EmptyState, ErrorState, LiveBadge, Segmented, Sheet, Skeleton } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { coins, fmtOdds, startLabel, time } from '../lib/format';
import { setBalance } from '../lib/queries';
import { haptic } from '../lib/tg';
import { toast } from '../store';
import type { Bet, BetSelection } from '../types';

const STATUS: Record<Bet['status'], { label: string; cls: string }> = {
  pending: { label: 'В игре', cls: 'bg-accent/15 text-accent' },
  won: { label: 'Выигрыш', cls: 'bg-up/15 text-up' },
  lost: { label: 'Проигрыш', cls: 'bg-down/15 text-down' },
  void: { label: 'Возврат', cls: 'bg-surface3 text-muted' },
  cashed_out: { label: 'Выкуплена', cls: 'bg-gold/15 text-gold' },
};

function SelIcon({ r }: { r: BetSelection['result'] }) {
  if (!r) return <Clock size={13} className="text-faint" />;
  if (r === 'win' || r === 'half_win') return <span className="grid h-4 w-4 place-items-center rounded-full bg-up text-bg"><Check size={11} strokeWidth={3.5} /></span>;
  if (r === 'lose' || r === 'half_lose') return <span className="grid h-4 w-4 place-items-center rounded-full bg-down text-bg"><X size={11} strokeWidth={3.5} /></span>;
  return <span className="grid h-4 w-4 place-items-center rounded-full bg-faint text-bg"><Minus size={11} strokeWidth={3.5} /></span>;
}

function CashoutSheet({ bet, onClose }: { bet: Bet | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [quote, setQuote] = useState<{ available: boolean; amount: number; reason?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!bet) return;
    setQuote(null);
    let alive = true;
    const load = () => api<{ available: boolean; amount: number; reason?: string }>(`/api/bets/${bet.id}/cashout`).then((r) => alive && setQuote(r)).catch(() => alive && setQuote({ available: false, amount: 0, reason: 'Нет связи' }));
    load();
    const t = setInterval(load, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [bet]);
  const confirm = async () => {
    if (!bet || !quote?.available) return;
    setBusy(true);
    try {
      const r = await api<{ amount: number; balance: number }>(`/api/bets/${bet.id}/cashout`, { body: { expected: quote.amount } });
      haptic.notify('success');
      setBalance(qc, r.balance);
      qc.invalidateQueries({ queryKey: ['bets'] });
      toast({ kind: 'success', title: `Ставка выкуплена за ${coins(r.amount)}` });
      onClose();
    } catch (e) {
      haptic.notify('error');
      if (e instanceof ApiError && e.code === 'cashout_changed') {
        setQuote({ available: true, amount: e.data.amount });
        toast({ kind: 'error', title: 'Сумма выкупа изменилась', text: 'Проверьте новую сумму' });
      } else toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Не удалось выкупить' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={!!bet} onClose={onClose}>
      {bet && (
        <div className="px-5 pb-6 pt-2 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-[22px] bg-gold/15 text-gold">
            <HandCoins size={30} />
          </div>
          <h3 className="mt-4 font-display text-[20px] font-semibold">Продать ставку?</h3>
          <p className="mx-auto mt-1.5 max-w-[290px] text-[13.5px] text-muted">Вы получите сумму сейчас, и ставка закроется независимо от результата матча.</p>
          <div className="mt-5 grid grid-cols-2 gap-2 text-left">
            <div className="rounded-2xl bg-surface2 p-3">
              <div className="text-[11.5px] font-semibold text-muted">Ставка</div>
              <div className="num mt-0.5 font-display text-[16px] font-bold">{coins(bet.stake)}</div>
            </div>
            <div className="rounded-2xl bg-surface2 p-3">
              <div className="text-[11.5px] font-semibold text-muted">Возможный выигрыш</div>
              <div className="num mt-0.5 font-display text-[16px] font-bold">{coins(bet.potential)}</div>
            </div>
          </div>
          <div className="mt-2 rounded-2xl border border-gold/30 bg-gold/10 p-4">
            <div className="text-[12px] font-semibold text-gold">Сумма выкупа</div>
            <div className="mt-1 flex items-center justify-center gap-2 font-display text-[28px] font-bold">
              {quote ? (quote.available ? <><Coin size={24} /> <span className="num">{coins(quote.amount)}</span></> : <span className="text-[14px] text-muted">{quote.reason}</span>) : <Skeleton className="h-8 w-28" />}
            </div>
          </div>
          <Button variant="gold" size="lg" className="mt-4 w-full" loading={busy} disabled={!quote?.available} onClick={confirm}>
            Продать за {quote?.available ? coins(quote.amount) : '…'}
          </Button>
          <button onClick={onClose} className="mt-3 h-10 text-[14px] font-bold text-muted">
            Оставить ставку
          </button>
        </div>
      )}
    </Sheet>
  );
}

function BetCard({ bet, onCashout, index }: { bet: Bet; onCashout: (b: Bet) => void; index: number }) {
  const fmt = useOddsFormat();
  const nav = useNavigate();
  const st = STATUS[bet.status];
  const won = bet.status === 'won';
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.04, 0.3) }} className={clsx('relative mx-3 overflow-hidden rounded-[20px] border bg-surface', won ? 'border-up/30' : 'border-line')}>
      {won && <div className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full bg-up/20 blur-3xl" />}
      <div className="relative flex items-center gap-2 px-4 pb-2 pt-3.5">
        <span className="text-[13px] font-extrabold">{bet.type === 'express' ? `Экспресс · ${bet.selections.length}` : 'Ординар'}</span>
        {bet.live && <LiveBadge />}
        <span className="text-[11.5px] font-semibold text-faint">· {time(bet.createdAt)}</span>
        <span className={clsx('ml-auto rounded-full px-2.5 py-1 text-[11px] font-extrabold', st.cls)}>{st.label}</span>
      </div>
      <div className="relative space-y-2.5 px-4 pb-3">
        {bet.selections.map((s, i) => (
          <button key={i} onClick={() => s.event && (s.event.status === 'live' || s.event.status === 'scheduled') && nav(`/event/${s.eventId}`)} className="flex w-full items-start gap-2.5 text-left">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-surface2 text-muted">
              <SportIcon sport={s.sport} size={13} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[12px] font-semibold text-muted">{s.eventName}</span>
                {s.event?.status === 'live' && (
                  <span className="num shrink-0 rounded-md bg-live/15 px-1.5 text-[11px] font-extrabold text-live">
                    {s.event.score[0]}:{s.event.score[1]} {s.event.clock}
                  </span>
                )}
                {s.event?.status === 'scheduled' && <span className="shrink-0 text-[11px] font-semibold text-faint">{startLabel(s.event.startAt)}</span>}
              </span>
              <span className="mt-0.5 block truncate text-[13.5px] font-bold">
                <span className="font-semibold text-faint">{s.marketTitle}: </span>
                {s.label}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
              <span className="num text-[13px] font-extrabold">{fmtOdds(s.odds, fmt)}</span>
              <SelIcon r={s.result} />
            </span>
          </button>
        ))}
      </div>
      {/* линия отрыва билета */}
      <div className="relative h-0">
        <div className="absolute -left-2.5 -top-2.5 h-5 w-5 rounded-full bg-bg" />
        <div className="absolute -right-2.5 -top-2.5 h-5 w-5 rounded-full bg-bg" />
        <div className="mx-4 border-t border-dashed border-line" />
      </div>
      <div className="relative grid grid-cols-3 gap-2 px-4 py-3">
        <div>
          <div className="text-[11px] font-semibold text-faint">Ставка</div>
          <div className="num text-[14px] font-extrabold">{coins(bet.stake)}</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold text-faint">Коэф.</div>
          <div className="num text-[14px] font-extrabold">{fmtOdds(bet.odds, fmt)}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold text-faint">{bet.status === 'pending' ? 'Выигрыш' : 'Выплата'}</div>
          <div className={clsx('num flex items-center justify-end gap-1 font-display text-[15px] font-bold', won && 'text-up', bet.status === 'lost' && 'text-faint line-through decoration-1')}>
            {coins(bet.status === 'pending' ? bet.potential : bet.status === 'lost' && bet.payout === 0 ? bet.potential : bet.payout)}
          </div>
        </div>
      </div>
      {bet.status === 'pending' && (
        <div className="relative px-3 pb-3">
          <button onClick={() => { haptic.tap(); onCashout(bet); }} className="press flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-surface2 text-[13px] font-bold text-gold">
            <HandCoins size={16} /> Продать ставку
          </button>
        </div>
      )}
    </motion.div>
  );
}

export default function Bets() {
  const [tab, setTab] = useState<'active' | 'settled'>('active');
  const [cash, setCash] = useState<Bet | null>(null);
  const nav = useNavigate();
  const q = useInfiniteQuery({
    queryKey: ['bets', tab],
    queryFn: ({ pageParam }) => api<Bet[]>(`/api/bets?status=${tab}${pageParam ? `&before=${pageParam}` : ''}`),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.length === 30 ? last[last.length - 1].id : undefined),
    refetchInterval: tab === 'active' ? 5000 : false,
  });
  const bets = q.data?.pages.flat() ?? [];

  return (
    <div className="pb-6">
      <Header
        title="Мои ставки"
        sub={
          <div className="px-4 pb-3">
            <Segmented value={tab} onChange={setTab} options={[{ value: 'active', label: 'Активные' }, { value: 'settled', label: 'Рассчитанные' }]} />
          </div>
        }
      />
      <div className="mt-3 space-y-3">
        {q.isError ? (
          <ErrorState onRetry={() => q.refetch()} />
        ) : q.isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="mx-3 h-44 rounded-[20px]" />)
        ) : !bets.length ? (
          <EmptyState
            icon={<Ticket size={30} />}
            title={tab === 'active' ? 'Активных ставок нет' : 'История пуста'}
            text={tab === 'active' ? 'Выберите матч и нажмите на коэффициент, чтобы сделать первую ставку.' : 'Здесь появятся рассчитанные ставки.'}
            action={<Button onClick={() => nav('/')}>К матчам</Button>}
          />
        ) : (
          <AnimatePresence>
            {bets.map((b, i) => (
              <BetCard key={b.id} bet={b} index={i} onCashout={setCash} />
            ))}
          </AnimatePresence>
        )}
        {q.hasNextPage && (
          <div className="px-3">
            <Button variant="secondary" className="w-full" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()}>
              Показать ещё
            </Button>
          </div>
        )}
      </div>
      <CashoutSheet bet={cash} onClose={() => setCash(null)} />
    </div>
  );
}
