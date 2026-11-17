import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { ChevronRight, Gift, Trophy } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { coins, countdown } from '../lib/format';
import { useMe } from '../lib/queries';
import { useUi } from '../store';
import type { LeaderRow } from '../types';
import { Coin } from './icons';
import { useNow } from './ui';

/** Бонус дня: серия по дням и кнопка. */
function BonusMini() {
  const { data: me } = useMe();
  const open = useUi((s) => s.setBonusOpen);
  const now = useNow(1000);
  if (!me) return null;
  const b = me.bonus;
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-[13.5px] font-extrabold">
        <Gift size={16} className="text-gold" /> Бонус дня
        <span className="ml-auto text-[11.5px] font-bold text-faint">серия {b.streak} дн.</span>
      </div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {b.ladder.map((amt, i) => {
          const done = i < b.streak % b.ladder.length || (b.streak > 0 && b.streak % b.ladder.length === 0 && !b.available);
          const next = i === b.nextDay - 1;
          return (
            <div key={i} className={clsx('flex flex-col items-center rounded-lg py-1.5', done ? 'bg-gold/15 text-gold' : next ? 'bg-surface3 text-ink' : 'bg-surface2 text-faint')}>
              <span className="text-[9.5px] font-bold">{i + 1}д</span>
              <span className="num text-[10.5px] font-extrabold">{amt >= 1000 ? `${amt / 1000}K` : amt}</span>
            </div>
          );
        })}
      </div>
      {b.available ? (
        <button onClick={() => open(true)} className="press mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-gold text-[13.5px] font-extrabold text-[#1a1200]">
          Забрать +{coins(b.nextAmount)} <Coin size={15} />
        </button>
      ) : (
        <div className="mt-3 text-center text-[12px] font-semibold text-muted">
          Следующий бонус через <span className="num font-bold text-ink">{countdown(Math.max(0, b.nextAt - now))}</span>
        </div>
      )}
    </div>
  );
}

/** Тройка лидеров недели и своё место. */
function LeadersMini() {
  const q = useQuery({ queryKey: ['leaderboard', 'week'], queryFn: () => api<{ top: LeaderRow[]; me: LeaderRow | null }>('/api/leaderboard?period=week'), refetchInterval: 60_000 });
  const top = (q.data?.top ?? []).slice(0, 3);
  const medal = ['🥇', '🥈', '🥉'];
  return (
    <div className="card p-4">
      <Link to="/leaderboard" className="flex items-center gap-2 text-[13.5px] font-extrabold">
        <Trophy size={16} className="text-accent" /> Лидеры недели
        <ChevronRight size={16} className="ml-auto text-faint" />
      </Link>
      {top.length ? (
        <div className="mt-2.5 space-y-1">
          {top.map((r, i) => (
            <div key={r.userId} className={clsx('flex items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-[13px]', r.me && 'bg-accent/10')}>
              <span className="w-5 text-center">{medal[i]}</span>
              <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
              <span className={clsx('num font-extrabold', r.profit >= 0 ? 'text-up' : 'text-down')}>{coins(r.profit, { sign: true })}</span>
            </div>
          ))}
          {q.data?.me && q.data.me.rank > 3 && (
            <div className="mt-1 flex items-center gap-2.5 border-t border-line px-1.5 pt-2 text-[12.5px] text-muted">
              <span className="num w-5 text-center font-bold">#{q.data.me.rank}</span>
              <span className="flex-1">Ваше место</span>
              <span className={clsx('num font-bold', q.data.me.profit >= 0 ? 'text-up' : 'text-down')}>{coins(q.data.me.profit, { sign: true })}</span>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[12.5px] leading-snug text-muted">На этой неделе ещё никто не выигрывал. Сделайте ставку и станьте первым.</p>
      )}
    </div>
  );
}

/** Правая колонка на компьютере под купоном. */
export function SideRight() {
  return (
    <div className="space-y-3">
      <BonusMini />
      <LeadersMini />
      <p className="px-2 text-center text-[11px] leading-relaxed text-faint">Демо-режим: монеты виртуальные, их нельзя купить или вывести.</p>
    </div>
  );
}
