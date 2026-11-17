import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { ArrowLeft, Crown, Trophy } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Chrome';
import { Coin } from '../components/icons';
import { Button, EmptyState, ErrorState, Segmented, Skeleton } from '../components/ui';
import { api } from '../lib/api';
import { coins, compact } from '../lib/format';
import { inTelegram } from '../lib/tg';
import type { LeaderRow } from '../types';
import { Avatar } from './Profile';

function Podium({ rows }: { rows: LeaderRow[] }) {
  const order = [rows[1], rows[0], rows[2]];
  const h = [92, 124, 76];
  const colors = ['from-[#D7DDE8] to-[#9AA4B5]', 'from-[#FFE27A] to-[#F5A700]', 'from-[#F0B27A] to-[#B66A2C]'];
  return (
    <div className="grid grid-cols-3 items-end gap-2 px-4 pt-4">
      {order.map((r, i) =>
        r ? (
          <motion.div key={r.userId} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: [0.1, 0, 0.2][i], type: 'spring', stiffness: 220, damping: 22 }} className="flex flex-col items-center">
            <div className="relative">
              {i === 1 && <Crown size={22} className="absolute -top-6 left-1/2 -translate-x-1/2 text-gold" fill="currentColor" />}
              <div className={clsx('rounded-full bg-gradient-to-br p-[3px]', colors[i])}>
                <div className="rounded-full bg-bg p-[2px]">
                  <Avatar name={r.name} photo={r.photo} size={i === 1 ? 62 : 50} />
                </div>
              </div>
            </div>
            <div className={clsx('mt-2 w-full truncate text-center text-[12.5px] font-extrabold', r.me && 'text-accent')}>{r.name}</div>
            <div className="num flex items-center gap-1 text-[12px] font-bold text-up">+{compact(r.profit)}</div>
            <div className={clsx('mt-2 flex w-full items-start justify-center rounded-t-2xl bg-gradient-to-b pt-2 font-display text-[22px] font-bold text-[#1A1200]', colors[i])} style={{ height: h[i] }}>
              {r.rank}
            </div>
          </motion.div>
        ) : (
          <div key={i} />
        ),
      )}
    </div>
  );
}

export default function Leaderboard() {
  const [period, setPeriod] = useState<'week' | 'all'>('week');
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['leaderboard', period], queryFn: () => api<{ top: LeaderRow[]; me: LeaderRow | null }>(`/api/leaderboard?period=${period}`), refetchInterval: 30_000 });
  const top = q.data?.top ?? [];
  return (
    <div className="pb-28">
      <Header
        title={
          <span className="flex items-center gap-2">
            {!inTelegram && (
              <button onClick={() => nav(-1)} className="press -ml-1 grid h-8 w-8 place-items-center rounded-full bg-surface2" aria-label="Назад">
                <ArrowLeft size={17} />
              </button>
            )}
            Рейтинг
          </span>
        }
        right={<span />}
        sub={
          <div className="px-4 pb-3">
            <Segmented value={period} onChange={setPeriod} options={[{ value: 'week', label: 'Эта неделя' }, { value: 'all', label: 'Всё время' }]} />
          </div>
        }
      />
      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : q.isLoading ? (
        <div className="space-y-2 p-4">
          <Skeleton className="h-52 w-full rounded-3xl" />
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-2xl" />)}
        </div>
      ) : !top.length ? (
        <EmptyState icon={<Trophy size={30} />} title="Рейтинг пока пуст" text="Сделайте ставку — после расчёта вы появитесь в таблице. Место на пьедестале свободно." action={<Button onClick={() => nav('/')}>Сделать ставку</Button>} />
      ) : (
        <>
          <Podium rows={top.slice(0, 3)} />
          <div className="card mx-3 -mt-px divide-y divide-line overflow-hidden">
            {top.slice(3).map((r, i) => (
              <motion.div key={r.userId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.02, 0.3) }} className={clsx('flex items-center gap-3 px-4 py-3', r.me && 'bg-accent/10')}>
                <span className="num w-6 text-center text-[13px] font-extrabold text-faint">{r.rank}</span>
                <Avatar name={r.name} photo={r.photo} size={34} />
                <span className="min-w-0 flex-1">
                  <span className={clsx('block truncate text-[14px] font-bold', r.me && 'text-accent')}>{r.name}</span>
                  <span className="text-[11.5px] text-muted">
                    {r.bets} ставок · {Math.round(r.winRate * 100)}% выигрышей
                  </span>
                </span>
                <span className={clsx('num flex items-center gap-1 font-display text-[14px] font-bold', r.profit >= 0 ? 'text-up' : 'text-down')}>{coins(r.profit, { sign: true })}</span>
              </motion.div>
            ))}
          </div>
        </>
      )}
      {q.data?.me && (
        <div className="fixed inset-x-0 bottom-[calc(62px+var(--safe-bottom))] z-30 mx-auto max-w-[480px] px-3 pb-2 lg:sticky lg:bottom-4 lg:max-w-none lg:px-4">
          <div className="glass flex items-center gap-3 rounded-2xl border border-accent/30 px-4 py-3 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.6)]">
            <span className="num font-display text-[15px] font-bold text-accent">#{q.data.me.rank}</span>
            <span className="flex-1 text-[13.5px] font-bold">Ваше место</span>
            <Coin size={15} />
            <span className={clsx('num font-display text-[14px] font-bold', q.data.me.profit >= 0 ? 'text-up' : 'text-down')}>{coins(q.data.me.profit, { sign: true })}</span>
          </div>
        </div>
      )}
    </div>
  );
}
