import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import {
  Award, Bell, Calendar, ChevronRight, Copy, Flame, Gem, Globe, HandCoins, Layers, Moon, RefreshCcw, Rocket,
  Shield, Smartphone, Sun, Target, Ticket, Trophy, UserPlus, Zap, type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Header } from '../components/Chrome';
import { BetModeSwitch } from '../components/SimpleBets';
import { Coin, SportIcon } from '../components/icons';
import { AnimatedNumber, Button, ErrorState, Sheet, Skeleton, Toggle, useNow } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { coins, countdown, fmtOdds, SPORT_NAMES } from '../lib/format';
import { setBalance, useMe } from '../lib/queries';
import { haptic, setHaptics, shareLink } from '../lib/tg';
import { toast, useUi } from '../store';
import type { Achievement, Profile as P, UserSettings } from '../types';

const ACH_ICON: Record<string, LucideIcon> = { ticket: Ticket, target: Target, layers: Layers, rocket: Rocket, flame: Flame, gem: Gem, zap: Zap, globe: Globe, 'hand-coins': HandCoins, calendar: Calendar, trophy: Trophy };

function Avatar({ name, photo, size = 64 }: { name: string; photo: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  if (photo && !err) return <img src={photo} onError={() => setErr(true)} alt="" className="rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <div className="grid place-items-center rounded-full bg-gradient-to-br from-accent to-[#7ED100] font-display font-bold text-accentInk" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials || 'V'}
    </div>
  );
}
export { Avatar };

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'up' | 'down' }) {
  return (
    <div className="rounded-2xl bg-surface2/70 p-3">
      <div className="text-[11.5px] font-semibold text-muted">{label}</div>
      <div className={clsx('num mt-1 font-display text-[17px] font-bold', tone === 'up' && 'text-up', tone === 'down' && 'text-down')}>{value}</div>
    </div>
  );
}

function AchievementTile({ a, i }: { a: Achievement; i: number }) {
  const Icon = ACH_ICON[a.icon] ?? Award;
  const on = !!a.unlockedAt;
  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.03 }} className={clsx('flex flex-col items-center rounded-2xl border p-3 text-center', on ? 'border-gold/30 bg-gold/[0.07]' : 'border-line bg-surface2/40')}>
      <span className={clsx('grid h-11 w-11 place-items-center rounded-2xl', on ? 'bg-gradient-to-br from-[#FFE27A] to-[#F5A700] text-[#3A2400] shadow-[0_6px_18px_-6px_rgba(255,190,40,0.6)]' : 'bg-surface3 text-faint')}>
        <Icon size={21} strokeWidth={2.2} />
      </span>
      <span className={clsx('mt-2 text-[12px] font-extrabold leading-tight', !on && 'text-muted')}>{a.title}</span>
      <span className="mt-0.5 text-[10.5px] leading-tight text-faint">{a.desc}</span>
    </motion.div>
  );
}

function SettingRow({ icon: Icon, label, children, onClick }: { icon: LucideIcon; label: string; children?: React.ReactNode; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-surface2 text-muted">
        <Icon size={17} />
      </span>
      <span className="flex-1 text-[14px] font-semibold">{label}</span>
      {children}
    </Comp>
  );
}

const ODDS_LABEL: Record<UserSettings['oddsFormat'], string> = { decimal: 'Десятичный', fractional: 'Дробный', american: 'Американский' };
const ACCEPT_LABEL: Record<UserSettings['acceptChanges'], string> = { any: 'Любые', up: 'Только повышение', none: 'Не принимать' };

function Picker<T extends string>({ open, onClose, title, value, options, onPick }: { open: boolean; onClose: () => void; title: string; value: T; options: { value: T; label: string; hint?: string }[]; onPick: (v: T) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="space-y-1.5 px-4 pb-6 pt-3">
        {options.map((o) => (
          <button key={o.value} onClick={() => { haptic.select(); onPick(o.value); onClose(); }} className={clsx('flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left', o.value === value ? 'border-accent/60 bg-accent/10' : 'border-line bg-surface2/50')}>
            <span>
              <span className="block text-[14.5px] font-bold">{o.label}</span>
              {o.hint && <span className="text-[12px] text-muted">{o.hint}</span>}
            </span>
            {o.value === value && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export default function Profile() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  const now = useNow(1000);
  const [picker, setPicker] = useState<null | 'odds' | 'accept'>(null);
  const [refilling, setRefilling] = useState(false);
  const prof = useQuery({ queryKey: ['profile'], queryFn: () => api<P>('/api/profile') });
  const botQ = useQuery({ queryKey: ['bot'], queryFn: () => api<{ username: string }>('/api/public/bot'), staleTime: Infinity });

  const save = async (patch: Partial<UserSettings>) => {
    qc.setQueryData(['me'], (m: any) => (m ? { ...m, settings: { ...m.settings, ...patch } } : m));
    if (patch.haptics !== undefined) setHaptics(patch.haptics);
    try {
      await api('/api/me/settings', { method: 'PATCH', body: patch });
    } catch {
      toast({ kind: 'error', title: 'Не удалось сохранить настройку' });
      qc.invalidateQueries({ queryKey: ['me'] });
    }
  };

  const refill = async () => {
    setRefilling(true);
    try {
      const r = await api<{ balance: number }>('/api/refill', { body: {} });
      setBalance(qc, r.balance);
      qc.invalidateQueries({ queryKey: ['me'] });
      haptic.notify('success');
      toast({ kind: 'success', title: 'Баланс пополнен', text: `Теперь у вас ${coins(r.balance)} монет` });
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Не удалось пополнить' });
    } finally {
      setRefilling(false);
    }
  };

  const refLink = botQ.data?.username && prof.data ? `https://t.me/${botQ.data.username}?start=${prof.data.referral.code}` : '';
  const s = prof.data?.stats;
  const unlocked = prof.data?.achievements.filter((a) => a.unlockedAt).length ?? 0;

  return (
    <div className="pb-8">
      <Header title="Профиль" right={<span />} />
      {/* шапка профиля */}
      <div className="relative overflow-hidden px-4 pb-4 pt-5">
        <div className="pointer-events-none absolute -top-20 left-1/2 h-48 w-72 -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex items-center gap-4">
          {me ? <Avatar name={me.name} photo={me.photo} /> : <Skeleton className="h-16 w-16 rounded-full" />}
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[19px] font-semibold">{me?.name ?? '…'}</div>
            {me?.username && <div className="text-[13px] text-muted">@{me.username}</div>}
          </div>
        </div>
        <div className="relative mt-4 rounded-[22px] border border-line bg-surface p-4">
          <div className="text-[12px] font-semibold text-muted">Баланс</div>
          <div className="mt-1 flex items-center gap-2">
            <Coin size={28} />
            {me ? <AnimatedNumber value={me.balance} className="font-display text-[30px] font-bold tracking-tight" /> : <Skeleton className="h-8 w-32" />}
          </div>
          <div className="mt-1 text-[11.5px] text-faint">Демо-монеты: их нельзя купить или вывести</div>
          {me?.refill.eligible && (
            <Button className="mt-3 w-full" loading={refilling} disabled={!me.refill.available} onClick={refill}>
              <RefreshCcw size={16} />
              {me.refill.available ? `Пополнить до ${coins(me.refill.amount)}` : `Пополнение через ${countdown(me.refill.nextAt - now)}`}
            </Button>
          )}
        </div>
      </div>

      {prof.isError ? (
        <ErrorState onRetry={() => prof.refetch()} />
      ) : (
        <>
          {/* статистика */}
          <section className="px-4">
            <h3 className="mb-2.5 font-display text-[15px] font-semibold">Статистика</h3>
            {s ? (
              <div className="grid grid-cols-3 gap-2">
                <Stat label="Ставок" value={s.total} />
                <Stat label="Выиграно" value={`${Math.round(s.winRate * 100)}%`} />
                <Stat label="ROI" value={`${s.roi >= 0 ? '+' : ''}${Math.round(s.roi * 100)}%`} tone={s.roi > 0 ? 'up' : s.roi < 0 ? 'down' : undefined} />
                <Stat label="Прибыль" value={coins(s.profit, { sign: true })} tone={s.profit > 0 ? 'up' : s.profit < 0 ? 'down' : undefined} />
                <Stat label="Лучший выигрыш" value={coins(s.biggestWin)} />
                <Stat label="Макс. коэф." value={s.maxOdds ? fmtOdds(s.maxOdds) : '—'} />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[68px] rounded-2xl" />)}</div>
            )}
            {s?.favoriteSport && (
              <div className="mt-2 flex items-center gap-2 rounded-2xl bg-surface2/70 px-3 py-2.5 text-[13px]">
                <SportIcon sport={s.favoriteSport} size={17} className="text-accent" />
                <span className="text-muted">Любимый вид спорта:</span>
                <span className="font-bold">{SPORT_NAMES[s.favoriteSport]}</span>
              </div>
            )}
          </section>

          {/* рейтинг */}
          <Link to="/leaderboard" className="press mx-4 mt-4 flex items-center gap-3 rounded-[18px] border border-line bg-surface px-4 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-accent">
              <Trophy size={18} />
            </span>
            <span className="flex-1 text-[14px] font-extrabold">Рейтинг игроков</span>
            <ChevronRight size={18} className="text-faint" />
          </Link>

          {/* достижения */}
          <section className="mt-6 px-4">
            <div className="mb-2.5 flex items-baseline justify-between">
              <h3 className="font-display text-[15px] font-semibold">Достижения</h3>
              <span className="num text-[12px] font-bold text-faint">
                {unlocked} / {prof.data?.achievements.length ?? 0}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {prof.data ? prof.data.achievements.map((a, i) => <AchievementTile key={a.code} a={a} i={i} />) : Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[118px] rounded-2xl" />)}
            </div>
          </section>

          {/* рефералы */}
          {prof.data && (
            <section className="relative mx-4 mt-6 overflow-hidden rounded-[22px] border border-accent/25 bg-gradient-to-br from-accent/15 via-accent/5 to-transparent p-4">
              <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-accent/20 blur-2xl" />
              <div className="relative flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-accentInk">
                  <UserPlus size={21} />
                </span>
                <div className="flex-1">
                  <div className="text-[14.5px] font-extrabold">Пригласите друга</div>
                  <div className="text-[12.5px] text-muted">+{coins(prof.data.referral.bonus)} монет вам и другу</div>
                </div>
                <div className="text-right">
                  <div className="num font-display text-[18px] font-bold">{prof.data.referral.invited}</div>
                  <div className="text-[10.5px] text-muted">приглашено</div>
                </div>
              </div>
              <div className="relative mt-3 flex gap-2">
                <Button className="flex-1" disabled={!refLink} onClick={() => shareLink(refLink, 'Залетай в VOLTA — ставки на спорт в Telegram. Дарю бонусные монеты на старт ⚡')}>
                  Пригласить
                </Button>
                <Button
                  variant="secondary"
                  disabled={!refLink}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(refLink);
                      toast({ kind: 'success', title: 'Ссылка скопирована' });
                    } catch {
                      toast({ kind: 'error', title: 'Не удалось скопировать' });
                    }
                  }}
                >
                  <Copy size={16} />
                </Button>
              </div>
            </section>
          )}
        </>
      )}

      <section className="mt-6">
        <Link to="/help" className="card press mx-4 flex items-center gap-3 px-4 py-3.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent/15 text-[17px]">📘</span>
          <span className="flex-1">
            <span className="block text-[14px] font-extrabold">Как делать ставки</span>
            <span className="block text-[12px] text-muted">Инструкция для новичков и словарь терминов</span>
          </span>
          <span className="text-faint">›</span>
        </Link>
      </section>

      {/* настройки */}
      {me && (
        <section className="mt-6">
          <h3 className="mb-2.5 px-4 font-display text-[15px] font-semibold">Настройки</h3>
          <div className="mx-4 mb-2">
            <div className="mb-1.5 px-1 text-[12px] font-semibold text-muted">Режим ставок на странице матча</div>
            <BetModeSwitch />
          </div>
          <div className="card mx-4 divide-y divide-line overflow-hidden">
            <SettingRow icon={theme === 'dark' ? Moon : Sun} label="Тёмная тема">
              <Toggle checked={theme === 'dark'} onChange={(v) => setTheme(v ? 'dark' : 'light')} />
            </SettingRow>
            <SettingRow icon={Layers} label="Формат коэффициентов" onClick={() => setPicker('odds')}>
              <span className="text-[13px] font-semibold text-muted">{ODDS_LABEL[me.settings.oddsFormat]}</span>
              <ChevronRight size={16} className="text-faint" />
            </SettingRow>
            <SettingRow icon={RefreshCcw} label="Изменение коэффициентов" onClick={() => setPicker('accept')}>
              <span className="text-[13px] font-semibold text-muted">{ACCEPT_LABEL[me.settings.acceptChanges]}</span>
              <ChevronRight size={16} className="text-faint" />
            </SettingRow>
            <SettingRow icon={Bell} label="Уведомления в боте">
              <Toggle checked={me.settings.notifications} onChange={(v) => save({ notifications: v })} />
            </SettingRow>
            <SettingRow icon={Smartphone} label="Вибрация">
              <Toggle checked={me.settings.haptics} onChange={(v) => save({ haptics: v })} />
            </SettingRow>
            {me.isAdmin && (
              <Link to="/admin" className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent/15 text-accent">
                  <Shield size={17} />
                </span>
                <span className="flex-1 text-[14px] font-semibold">Админ-панель</span>
                <ChevronRight size={16} className="text-faint" />
              </Link>
            )}
          </div>
          <div className="mx-6 mt-5 space-y-1.5 text-center text-[11.5px] leading-relaxed text-faint">
            <p>VOLTA — демо-версия. Ставки принимаются только на виртуальные монеты, которые нельзя купить, продать или вывести.</p>
            <p>18+ · Играйте ради удовольствия.</p>
          </div>
          <Picker
            open={picker === 'odds'}
            onClose={() => setPicker(null)}
            title="Формат коэффициентов"
            value={me.settings.oddsFormat}
            onPick={(v) => save({ oddsFormat: v })}
            options={[
              { value: 'decimal', label: 'Десятичный', hint: '2.50' },
              { value: 'fractional', label: 'Дробный', hint: '3/2' },
              { value: 'american', label: 'Американский', hint: '+150' },
            ]}
          />
          <Picker
            open={picker === 'accept'}
            onClose={() => setPicker(null)}
            title="Если коэффициент изменился"
            value={me.settings.acceptChanges}
            onPick={(v) => save({ acceptChanges: v })}
            options={[
              { value: 'up', label: 'Принимать повышение', hint: 'Понижение потребует подтверждения' },
              { value: 'any', label: 'Принимать любые', hint: 'Ставка всегда по актуальному коэффициенту' },
              { value: 'none', label: 'Не принимать', hint: 'Подтверждать каждое изменение' },
            ]}
          />
        </section>
      )}
    </div>
  );
}
