import { useMutation, useQueryClient } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Award, Check, CheckCircle2, Gift, Info, Trophy } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { coins, countdown } from '../lib/format';
import { setBalance, useMe } from '../lib/queries';
import { haptic } from '../lib/tg';
import { toast, useToasts, useUi } from '../store';
import { Coin, Logo, SportIcon, Wordmark } from './icons';
import { Button, Sheet, useNow } from './ui';

export function fireConfetti(strong = false) {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#C8FF2E', '#FFC93C', '#2BE59B', '#ffffff'];
    confetti({ particleCount: strong ? 140 : 80, spread: strong ? 90 : 70, startVelocity: 42, origin: { y: 0.65 }, colors, scalar: 0.9, ticks: 180, zIndex: 9999 });
  } catch {
    /* ignore */
  }
}

/* ---------- тосты ---------- */

export function Toasts() {
  const list = useToasts((s) => s.list);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] mx-auto flex max-w-[480px] flex-col items-center gap-2 px-3 pt-3">
      <AnimatePresence>
        {list.map((t) => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? AlertCircle : t.kind === 'win' ? Trophy : t.kind === 'achievement' ? Award : Info;
          return (
            <motion.button
              key={t.id}
              layout
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 500, damping: 36 }}
              onClick={() => dismiss(t.id)}
              className="glass pointer-events-auto flex w-full items-center gap-3 rounded-2xl border border-line px-3.5 py-3 text-left shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]"
            >
              <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', t.kind === 'success' && 'bg-up/15 text-up', t.kind === 'error' && 'bg-down/15 text-down', t.kind === 'info' && 'bg-accent/15 text-accent', (t.kind === 'win' || t.kind === 'achievement') && 'bg-gold/15 text-gold')}>
                <Icon size={19} strokeWidth={2.3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-extrabold leading-snug">{t.title}</span>
                {t.text && <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{t.text}</span>}
              </span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/* ---------- ежедневный бонус ---------- */

export function BonusSheet() {
  const open = useUi((s) => s.bonusOpen);
  const setOpen = useUi((s) => s.setBonusOpen);
  const { data: me } = useMe();
  const qc = useQueryClient();
  const now = useNow(1000);
  const [justGot, setJustGot] = useState<number | null>(null);
  const b = me?.bonus;

  const claim = useMutation({
    mutationFn: () => api<{ amount: number; day: number; balance: number }>('/api/bonus/claim', { body: {} }),
    onSuccess: (r) => {
      haptic.notify('success');
      fireConfetti(true);
      setJustGot(r.amount);
      setBalance(qc, r.balance);
      qc.invalidateQueries({ queryKey: ['me'] });
      setTimeout(() => {
        setOpen(false);
        setJustGot(null);
      }, 1800);
    },
    onError: (e) => toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Не удалось получить бонус' }),
  });

  if (!b) return null;
  const currentDay = b.available ? b.nextDay : b.streak % 7 === 0 && b.streak > 0 ? 7 : b.streak;

  return (
    <Sheet open={open} onClose={() => setOpen(false)}>
      <div className="relative overflow-hidden px-5 pb-6">
        <div className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-gold/25 blur-3xl" />
        <div className="relative flex flex-col items-center pt-2 text-center">
          <motion.div initial={{ rotate: -8, scale: 0.8 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 14 }} className="grid h-[72px] w-[72px] place-items-center rounded-[24px] bg-gradient-to-br from-[#FFE27A] to-[#F5A700] text-[#3A2400] shadow-[0_14px_40px_-10px_rgba(255,190,40,0.7)]">
            <Gift size={34} strokeWidth={2.2} />
          </motion.div>
          <h2 className="mt-4 font-display text-[22px] font-semibold">Ежедневный бонус</h2>
          <p className="mt-1.5 max-w-[280px] text-[13.5px] text-muted">Заходите каждый день — награда растёт. Пропуск дня сбрасывает серию.</p>
        </div>

        <div className="relative mt-5 grid grid-cols-4 gap-2">
          {b.ladder.map((amt, i) => {
            const day = i + 1;
            const taken = b.available ? day < b.nextDay && b.streak > 0 : day <= currentDay;
            const isNext = b.available && day === b.nextDay;
            return (
              <motion.div
                key={day}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 + i * 0.03 }}
                className={clsx(
                  'relative flex flex-col items-center justify-center rounded-2xl border py-3',
                  day === 7 && 'col-span-2',
                  isNext ? 'border-gold/70 bg-gold/10 shadow-[0_0_0_3px_rgb(var(--gold)/0.12)]' : taken ? 'border-line bg-surface2/40' : 'border-line bg-surface2',
                )}
              >
                <span className={clsx('text-[11px] font-bold', isNext ? 'text-gold' : 'text-muted')}>День {day}</span>
                <span className="mt-1.5">{taken ? <Check size={20} className="text-up" strokeWidth={3} /> : <Coin size={day === 7 ? 30 : 22} />}</span>
                <span className={clsx('num mt-1 font-display text-[13.5px] font-bold', taken && 'text-muted')}>{coins(amt)}</span>
              </motion.div>
            );
          })}
        </div>

        <div className="relative mt-5">
          <>
            {justGot ? (
              <motion.div key="got" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex h-[54px] items-center justify-center gap-2 rounded-[18px] bg-up/15 font-display text-[18px] font-bold text-up">
                +{coins(justGot)} <Coin size={20} />
              </motion.div>
            ) : b.available ? (
              <Button key="claim" variant="gold" size="lg" className="w-full" loading={claim.isPending} onClick={() => claim.mutate()}>
                Забрать {coins(b.nextAmount)}
              </Button>
            ) : (
              <div key="wait" className="flex h-[54px] flex-col items-center justify-center rounded-[18px] bg-surface2 text-center">
                <span className="text-[12px] font-semibold text-muted">Следующий бонус через</span>
                <span className="num font-display text-[17px] font-bold">{countdown(b.nextAt - now)}</span>
              </div>
            )}
          </>
        </div>
      </div>
    </Sheet>
  );
}

/* ---------- онбординг ---------- */

const SLIDES = [
  {
    title: 'Ставки на спорт прямо в Telegram',
    text: 'Футбол, хоккей, баскетбол, теннис, киберспорт и MMA — в лайве и до начала матча.',
    art: 'sports',
  },
  {
    title: 'Ординар или экспресс',
    text: 'Нажмите на коэффициент — исход попадёт в купон. Несколько исходов из разных матчей перемножаются в экспресс.',
    art: 'slip',
  },
  {
    title: '10 000 монет на старт',
    text: 'Это демо: монеты виртуальные, их нельзя купить или вывести. Забирайте бонус каждый день и поднимайтесь в рейтинге.',
    art: 'coins',
  },
];

function SlideArt({ kind }: { kind: string }) {
  if (kind === 'sports') {
    const sports = ['football', 'hockey', 'basketball', 'tennis', 'cs2', 'mma'] as const;
    return (
      <div className="relative mx-auto h-56 w-56">
        <div className="absolute inset-6 rounded-full bg-accent/20 blur-3xl" />
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16 }} className="absolute left-1/2 top-1/2 -ml-12 -mt-12">
          <Logo size={96} />
        </motion.div>
        {sports.map((s, i) => {
          const a = (i / sports.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <motion.div key={s} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1, x: Math.cos(a) * 92, y: Math.sin(a) * 92 }} transition={{ delay: 0.15 + i * 0.06, type: 'spring', stiffness: 220, damping: 18 }} className="absolute left-1/2 top-1/2 -ml-6 -mt-6 grid h-12 w-12 place-items-center rounded-2xl border border-line bg-surface2 text-ink shadow-card">
              <SportIcon sport={s} size={22} />
            </motion.div>
          );
        })}
      </div>
    );
  }
  if (kind === 'slip') {
    return (
      <div className="relative mx-auto flex h-56 w-64 flex-col justify-center gap-2.5">
        <div className="absolute inset-8 rounded-full bg-accent/15 blur-3xl" />
        {[
          ['Зенит — Спартак', 'П1', '1.85'],
          ['Бавария — Байер', 'Б 2.5', '1.62'],
          ['NAVI — Vitality', 'П2', '2.10'],
        ].map(([m, o, k], i) => (
          <motion.div key={m} initial={{ x: 60, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.1 + i * 0.12, type: 'spring', stiffness: 260, damping: 24 }} className="relative flex items-center justify-between rounded-2xl border border-line bg-surface2 px-4 py-3">
            <span>
              <span className="block text-[11px] font-semibold text-muted">{m}</span>
              <span className="text-[14px] font-extrabold">{o}</span>
            </span>
            <span className="num rounded-lg bg-accent px-2 py-1 font-display text-[13px] font-bold text-accentInk">{k}</span>
          </motion.div>
        ))}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="relative flex items-center justify-between px-1 text-[13px] font-bold">
          <span className="text-muted">Экспресс</span>
          <span className="num font-display text-accent">× 6.30</span>
        </motion.div>
      </div>
    );
  }
  return (
    <div className="relative mx-auto grid h-56 w-56 place-items-center">
      <div className="absolute inset-8 rounded-full bg-gold/25 blur-3xl" />
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div key={i} initial={{ y: -120, opacity: 0, rotate: -20 }} animate={{ y: i * -10, opacity: 1, rotate: 0 }} transition={{ delay: 0.1 + i * 0.08, type: 'spring', stiffness: 260, damping: 15 }} className="absolute" style={{ marginTop: 40 }}>
          <Coin size={96 - i * 4} />
        </motion.div>
      ))}
      <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.6 }} className="absolute bottom-0 rounded-full bg-surface2 px-4 py-1.5 font-display text-[18px] font-bold">
        10 000
      </motion.div>
    </div>
  );
}

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const s = SLIDES[i];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex justify-center bg-bg bg-aurora" style={{ paddingBottom: 'var(--safe-bottom)' }}>
      <div className="flex w-full max-w-[480px] flex-col">
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="flex items-center gap-2">
          <Logo size={26} />
          <Wordmark className="text-[15px]" />
        </div>
        {!last && (
          <button onClick={onDone} className="text-[14px] font-bold text-muted">
            Пропустить
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col justify-center">
        <div key={i} className="animate-page-in px-7 text-center">
            <SlideArt kind={s.art} />
            <h1 className="mt-8 font-display text-[25px] font-semibold leading-tight tracking-tight">{s.title}</h1>
            <p className="mx-auto mt-3 max-w-[320px] text-[15px] leading-relaxed text-muted">{s.text}</p>
          </div>
        
      </div>
      <div className="px-5 pb-6">
        <div className="mb-5 flex justify-center gap-1.5">
          {SLIDES.map((_, k) => (
            <motion.span key={k} animate={{ width: k === i ? 24 : 7, opacity: k === i ? 1 : 0.35 }} className="h-[7px] rounded-full bg-accent" />
          ))}
        </div>
        <Button size="lg" className="w-full" onClick={() => (last ? onDone() : setI(i + 1))}>
          {last ? 'Начать играть' : 'Далее'}
        </Button>
        <p className="mt-3 text-center text-[11.5px] text-faint">Демо-режим: виртуальные монеты, без реальных денег</p>
      </div>
      </div>
    </motion.div>
  );
}
