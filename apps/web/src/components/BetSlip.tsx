import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Check, Lock, Minus, Plus, Ticket, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, ApiError } from '../lib/api';
import { coins, fmtOdds } from '../lib/format';
import { setBalance, useMe } from '../lib/queries';
import { haptic } from '../lib/tg';
import { toast, useSlip, type SlipItem } from '../store';
import type { Bet } from '../types';
import { Coin, SportIcon } from './icons';
import { useOddsFormat } from './OddsButton';
import { AnimatedNumber, Button, EmptyState, LiveBadge, Segmented, Sheet } from './ui';

const ACCEPT_TEXT = { any: 'принимать любые', up: 'принимать повышение', none: 'не принимать' } as const;

function SlipRow({ it, conflict }: { it: SlipItem; conflict: boolean }) {
  const remove = useSlip((s) => s.remove);
  const fmt = useOddsFormat();
  const changed = it.prevOdds && it.prevOdds !== it.odds;
  const locked = it.status === 'suspended' || it.status === 'closed';
  return (
    <motion.div layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 34 }} className={clsx('relative mb-2 overflow-hidden rounded-2xl border bg-surface2/60 p-3', conflict ? 'border-down/50' : 'border-line')}>
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface3 text-muted">
          <SportIcon sport={it.sport} size={15} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[12px] font-semibold text-muted">
              {it.home.name} — {it.away.name}
            </span>
            {it.live && <LiveBadge />}
          </div>
          <div className="mt-1 truncate text-[12px] text-faint">{it.marketTitle}</div>
          <div className="mt-0.5 text-[14.5px] font-extrabold">{it.label}</div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button aria-label="Убрать" onClick={() => { haptic.tap(); remove(it.eventId, it.market, it.outcome); }} className="-mr-1 -mt-1 grid h-7 w-7 place-items-center rounded-full text-faint active:bg-surface3">
            <X size={16} />
          </button>
          {locked ? (
            <span className="flex items-center gap-1 text-[12px] font-bold text-muted">
              <Lock size={12} /> {it.status === 'closed' ? 'закрыт' : 'пауза'}
            </span>
          ) : (
            <div className="flex items-center gap-1.5">
              {changed && <span className="num text-[12px] font-semibold text-faint line-through">{fmtOdds(it.prevOdds!, fmt)}</span>}
              <span className={clsx('num rounded-lg px-2 py-0.5 font-display text-[14px] font-bold', changed ? (it.odds > it.prevOdds! ? 'bg-up/15 text-up' : 'bg-down/15 text-down') : 'bg-accent/15 text-accent')}>{fmtOdds(it.odds, fmt)}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/** На телефоне купон — выезжающая шторка; на широком экране (docked) — постоянная колонка справа. */
export function BetSlip({ docked = false }: { docked?: boolean }) {
  const { items, mode, stake, open: sheetOpen, setOpen, setMode, setStake, clear, applyOdds, acceptAll } = useSlip();
  const open = docked || sheetOpen;
  const { data: me } = useMe();
  const qc = useQueryClient();
  const fmt = useOddsFormat();
  const [placed, setPlaced] = useState<null | { count: number }>(null);
  const [stakeText, setStakeText] = useState(String(stake));
  const accept = me?.settings.acceptChanges ?? 'up';

  useEffect(() => setStakeText(String(stake)), [stake, open]);

  // актуализируем коэффициенты, пока купон открыт
  useEffect(() => {
    if (!open || !items.length) return;
    let alive = true;
    const run = async () => {
      try {
        const res = await api<any[]>('/api/odds', { body: { selections: useSlip.getState().items.map(({ eventId, market, outcome }) => ({ eventId, market, outcome })) } });
        if (alive) applyOdds(res);
      } catch {
        /* сеть */
      }
    };
    run();
    const t = setInterval(run, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [open, items.length, applyOdds]);

  const conflictIds = useMemo(() => {
    const cnt = new Map<string, number>();
    items.forEach((i) => cnt.set(i.eventId, (cnt.get(i.eventId) ?? 0) + 1));
    return new Set([...cnt].filter(([, n]) => n > 1).map(([id]) => id));
  }, [items]);

  const expressAllowed = items.length >= 2 && conflictIds.size === 0;
  const effMode = mode === 'express' && expressAllowed ? 'express' : 'single';
  const openItems = items.filter((i) => i.status !== 'suspended' && i.status !== 'closed');
  const totalOdds = Math.round(items.reduce((a, i) => a * i.odds, 1) * 100) / 100;
  const totalStake = effMode === 'express' ? stake : stake * items.length;
  const potential = effMode === 'express' ? Math.floor(stake * totalOdds * 100) / 100 : items.reduce((a, i) => a + Math.floor(stake * i.odds * 100) / 100, 0);
  const needAccept = items.some((i) => i.prevOdds && (accept === 'none' || (accept === 'up' && i.odds < i.prevOdds)));
  const balance = me?.balance ?? 0;
  const notEnough = totalStake > balance;
  const quick = me?.settings.quickStakes ?? [100, 500, 1000, 5000];

  const place = useMutation({
    mutationFn: () =>
      api<{ bets: Bet[]; balance: number; achievements: string[] }>('/api/bets', {
        body: {
          type: effMode,
          stake,
          accept: 'any' as const, // изменения уже показаны и приняты в купоне
          selections: items.map((i) => ({ eventId: i.eventId, market: i.market, outcome: i.outcome, odds: i.odds })),
        },
      }),
    onSuccess: (r) => {
      haptic.notify('success');
      setBalance(qc, r.balance);
      qc.invalidateQueries({ queryKey: ['bets'] });
      setPlaced({ count: r.bets.length });
      setTimeout(() => {
        clear();
        setOpen(false);
        setPlaced(null);
        toast({ kind: 'success', title: r.bets.length > 1 ? `Принято ставок: ${r.bets.length}` : 'Ставка принята', text: `Возможный выигрыш ${coins(r.bets.reduce((a, b) => a + b.potential, 0))}` });
      }, 1100);
    },
    onError: (e: unknown) => {
      haptic.notify('error');
      if (e instanceof ApiError && e.code === 'odds_changed') {
        applyOdds(e.data.changes.map((c: any) => ({ ...c, status: 'open' })));
        toast({ kind: 'error', title: 'Коэффициенты изменились', text: 'Проверьте купон и подтвердите ставку' });
        return;
      }
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Не удалось сделать ставку' });
    },
  });

  const setStakeSafe = (n: number) => setStake(Math.max(0, Math.min(Math.floor(n), 1_000_000)));
  const lockedCount = items.length - openItems.length;

  let cta: React.ReactNode;
  if (needAccept) cta = 'Принять изменения';
  else if (lockedCount) cta = 'Уберите закрытые исходы';
  else if (notEnough) cta = 'Недостаточно монет';
  else cta = (
    <>
      Поставить <span className="num">{coins(totalStake)}</span>
    </>
  );

  const body = (
    <>
      <div className="flex items-center gap-2 px-5 pb-3 pt-1">
        <h2 className="font-display text-[19px] font-semibold">Купон</h2>
        {items.length > 0 && <span className="num grid h-6 min-w-6 place-items-center rounded-full bg-accent px-1.5 text-[12px] font-extrabold text-accentInk">{items.length}</span>}
        {items.length > 0 && (
          <button onClick={() => { haptic.tap(); clear(); }} className="ml-auto flex items-center gap-1.5 rounded-full px-2 py-1 text-[13px] font-bold text-muted active:bg-surface2">
            <Trash2 size={15} /> Очистить
          </button>
        )}
      </div>

      {!items.length && docked ? (
        <div className="flex items-start gap-3 px-5 pb-5">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-line bg-surface2 text-accent">
            <Ticket size={20} />
          </div>
          <p className="text-[12.5px] leading-snug text-muted">Купон пуст. Нажмите на вариант в любом матче — он появится здесь, останется ввести сумму и нажать «Поставить».</p>
        </div>
      ) : !items.length ? (
        <EmptyState icon={<Ticket size={32} />} title="Купон пуст" text="Выберите матч и нажмите на исход, например на победу команды. Он появится здесь, останется ввести сумму и нажать «Поставить»." action={docked ? undefined : <Button variant="secondary" onClick={() => setOpen(false)}>Выбрать матч</Button>} />
      ) : (
        <div className="px-4 pb-4">
          {items.length > 1 && (
            <Segmented
              className="mb-3"
              value={effMode}
              onChange={(v) => {
                if (v === 'express' && !expressAllowed) {
                  haptic.notify('warning');
                  toast({ kind: 'error', title: 'Экспресс недоступен', text: 'В экспресс нельзя добавить два исхода одного матча' });
                  return;
                }
                setMode(v);
              }}
              options={[
                { value: 'single', label: `Ординары · ${items.length}` },
                { value: 'express', label: <>Экспресс <span className="num text-accent">{fmtOdds(totalOdds, fmt)}</span></> },
              ]}
            />
          )}

          <AnimatePresence initial={false}>
            {items.map((it) => (
              <SlipRow key={`${it.eventId}|${it.market}|${it.outcome}`} it={it} conflict={effMode === 'express' && conflictIds.has(it.eventId)} />
            ))}
          </AnimatePresence>

          {conflictIds.size > 0 && items.length > 1 && (
            <div className="mb-2 flex items-start gap-2 rounded-xl bg-down/10 px-3 py-2.5 text-[12.5px] font-semibold text-down">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              Два исхода одного матча — доступны только ординары.
            </div>
          )}

          {/* сумма */}
          <div className="mt-3 rounded-2xl border border-line bg-surface2/50 p-3">
            <div className="flex items-center justify-between text-[12px] font-semibold text-muted">
              <span>{effMode === 'express' ? 'Сумма ставки' : items.length > 1 ? 'Сумма на каждый исход' : 'Сумма ставки'}</span>
              <span className="flex items-center gap-1">
                Баланс <Coin size={13} /> <AnimatedNumber value={balance} className="font-bold text-ink" />
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button aria-label="Меньше" onClick={() => { haptic.select(); setStakeSafe(stake - (stake > 1000 ? 500 : stake > 100 ? 50 : 10)); }} className="press grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-surface3">
                <Minus size={18} />
              </button>
              <div className="relative flex h-12 flex-1 items-center rounded-xl border border-line bg-bg/60 px-3 focus-within:border-accent/60">
                <Coin size={20} />
                <input
                  inputMode="numeric"
                  value={stakeText}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d]/g, '').slice(0, 7);
                    setStakeText(v);
                    setStakeSafe(Number(v || 0));
                  }}
                  onFocus={(e) => e.target.select()}
                  className="num w-full bg-transparent pl-2 text-center font-display text-[20px] font-bold outline-none"
                  aria-label="Сумма ставки"
                />
              </div>
              <button aria-label="Больше" onClick={() => { haptic.select(); setStakeSafe(stake + (stake >= 1000 ? 500 : stake >= 100 ? 50 : 10)); }} className="press grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-surface3">
                <Plus size={18} />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {quick.map((q) => (
                <button key={q} onClick={() => { haptic.select(); setStakeSafe(q); }} className={clsx('press h-9 rounded-xl text-[13px] font-bold', stake === q ? 'bg-ink text-bg' : 'bg-surface3 text-ink/85')}>
                  {q >= 1000 ? `${q / 1000}K` : q}
                </button>
              ))}
              <button onClick={() => { haptic.select(); setStakeSafe(Math.min(50_000, Math.floor(balance / (effMode === 'express' ? 1 : items.length)))); }} className="press h-9 rounded-xl bg-surface3 text-[13px] font-bold text-gold">
                Макс
              </button>
            </div>
          </div>

          <div className="mt-3 space-y-1.5 px-1 text-[13px]">
            {effMode === 'express' && (
              <div className="flex justify-between text-muted">
                <span>Итоговый коэффициент</span>
                <span className="num font-bold text-ink">{fmtOdds(totalOdds, fmt)}</span>
              </div>
            )}
            {effMode === 'single' && items.length > 1 && (
              <div className="flex justify-between text-muted">
                <span>Всего к списанию</span>
                <span className="num font-bold text-ink">{coins(totalStake)}</span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted">Возможный выигрыш</span>
              <span className="flex items-center gap-1.5 font-display text-[17px] font-bold text-up">
                <Coin size={16} />
                <AnimatedNumber value={potential} duration={0.35} />
              </span>
            </div>
            <button
              onClick={async () => {
                const order = ['up', 'any', 'none'] as const;
                const next = order[(order.indexOf(accept) + 1) % 3];
                haptic.select();
                try {
                  await api('/api/me/settings', { method: 'PATCH', body: { acceptChanges: next } });
                  qc.invalidateQueries({ queryKey: ['me'] });
                } catch {
                  /* ignore */
                }
              }}
              className="pt-1 text-left text-[12px] text-faint"
            >
              При изменении коэффициента: <span className="font-bold text-muted underline decoration-dotted underline-offset-2">{ACCEPT_TEXT[accept]}</span>
            </button>
          </div>

          <div className="mt-4">
            <Button
              size="lg"
              className="w-full"
              loading={place.isPending}
              disabled={!needAccept && (lockedCount > 0 || notEnough || stake <= 0 || !!placed)}
              onClick={() => {
                if (needAccept) {
                  acceptAll();
                  haptic.notify('success');
                  return;
                }
                place.mutate();
              }}
            >
              {placed ? (
                  <motion.span key="ok" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2">
                    <Check size={20} strokeWidth={3} /> Принято
                  </motion.span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    {cta}
                  </span>
                )}
              
            </Button>
            <p className="mt-2.5 text-center text-[11px] text-faint">Демо-режим: ставки на виртуальные монеты</p>
          </div>
        </div>
      )}
      {/* «билет улетает» */}
      <AnimatePresence>
        {placed && (
          <motion.div initial={{ opacity: 1, y: 0, scale: 1, rotate: 0 }} animate={{ opacity: 0, y: -420, scale: 0.4, rotate: -12 }} transition={{ duration: 0.9, ease: [0.5, 0, 0.75, 0] }} className="pointer-events-none absolute bottom-24 left-1/2 -ml-12 grid h-16 w-24 place-items-center rounded-2xl bg-accent text-accentInk shadow-glow">
            <Ticket size={30} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  return docked ? (
    <aside className="card relative pt-4">{body}</aside>
  ) : (
    <Sheet open={sheetOpen} onClose={() => setOpen(false)} maxH="92dvh">
      {body}
    </Sheet>
  );
}
