import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowLeft, Ban, Flag as FlagIcon, Lock, Plus, Search, Star, Unlock, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SportIcon } from '../components/icons';
import { Button, EmptyState, ErrorState, Sheet, Skeleton } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { coins, SPORT_NAMES, SPORT_ORDER, startLabel } from '../lib/format';
import { useMe } from '../lib/queries';
import { toast } from '../store';
import type { EventSummary, Market, SportId, Team } from '../types';

type Tab = 'dash' | 'events' | 'users' | 'settings' | 'log';

const run = async (fn: () => Promise<unknown>, ok?: string) => {
  try {
    await fn();
    if (ok) toast({ kind: 'success', title: ok });
    return true;
  } catch (e) {
    toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Ошибка' });
    return false;
  }
};

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="card p-3.5">
      <div className="text-[11.5px] font-semibold text-muted">{label}</div>
      <div className="num mt-1 font-display text-[20px] font-bold">{value}</div>
      {sub && <div className="text-[11px] text-faint">{sub}</div>}
    </div>
  );
}

function Dashboard() {
  const q = useQuery({ queryKey: ['admin', 'dash'], queryFn: () => api<any>('/api/admin/dashboard'), refetchInterval: 15_000 });
  if (q.isError) return <ErrorState onRetry={() => q.refetch()} />;
  if (!q.data) return <div className="grid grid-cols-2 gap-2 p-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>;
  const d = q.data;
  const max = Math.max(1, ...d.hourly.map((h: any) => h.count));
  return (
    <div className="space-y-3 p-4">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Пользователи" value={d.users.total} sub={`+${d.users.newToday} за сутки`} />
        <Tile label="Активны за 24 ч" value={d.users.dau} />
        <Tile label="Ставок за 24 ч" value={d.bets.count} sub={`${d.bets.live} в лайве · ${d.bets.pending} в игре`} />
        <Tile label="Оборот, монет" value={coins(d.bets.turnover)} />
        <Tile label="GGR, монет" value={<span className={d.bets.ggr >= 0 ? 'text-up' : 'text-down'}>{coins(d.bets.ggr, { sign: true })}</span>} sub="ставки − выплаты" />
        <Tile label="События" value={`${d.events.live} / ${d.events.upcoming}`} sub="лайв / скоро" />
      </div>
      <div className="card p-4">
        <div className="mb-3 text-[13px] font-extrabold">Ставки по часам (24 ч)</div>
        <div className="flex h-24 items-end gap-[3px]">
          {d.hourly.map((h: any) => (
            <div key={h.h} className="flex-1 rounded-t bg-accent/80" style={{ height: `${Math.max(3, (h.count / max) * 100)}%`, opacity: h.count ? 1 : 0.25 }} title={`${h.count}`} />
          ))}
        </div>
      </div>
      <div className="card divide-y divide-line">
        <div className="px-4 py-3 text-[13px] font-extrabold">Популярные события</div>
        {d.topEvents.length ? (
          d.topEvents.map((t: any) => (
            <div key={t.event_id} className="flex items-center gap-2 px-4 py-2.5 text-[13px]">
              <SportIcon sport={t.sport} size={15} className="text-muted" />
              <span className="flex-1 truncate font-semibold">{t.event_name}</span>
              <span className="text-muted">{t.n} ст.</span>
              <span className="num w-20 text-right font-bold">{coins(t.volume)}</span>
            </div>
          ))
        ) : (
          <div className="px-4 py-4 text-[13px] text-muted">Пока нет ставок</div>
        )}
      </div>
    </div>
  );
}

type AdminEvent = EventSummary & { adminSuspended: boolean; markets: Market[]; overrides: Record<string, number>; exposure: { bets: number; volume: number } };

function OddsEditor({ ev, onClose }: { ev: AdminEvent | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [vals, setVals] = useState<Record<string, string>>({});
  if (!ev) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;
  const save = async (m: Market, o: { key: string }, raw: string | null) => {
    const odds = raw === null ? null : Number(raw.replace(',', '.'));
    if (odds !== null && !(odds >= 1.01)) return toast({ kind: 'error', title: 'Коэффициент должен быть ≥ 1.01' });
    if (await run(() => api(`/api/admin/events/${ev.id}/odds`, { body: { market: m.key, outcome: o.key, odds } }), odds === null ? 'Ручной коэффициент снят' : 'Коэффициент сохранён')) qc.invalidateQueries({ queryKey: ['admin', 'events'] });
  };
  return (
    <Sheet open onClose={onClose} title={`${ev.home.name} — ${ev.away.name}`}>
      <div className="space-y-3 px-4 pb-6 pt-3">
        <p className="text-[12.5px] text-muted">Ручной коэффициент заменяет расчётный, пока вы его не снимете.</p>
        {ev.markets.slice(0, 12).map((m) => (
          <div key={m.key} className="rounded-2xl border border-line p-3">
            <div className="mb-2 text-[13px] font-extrabold">{m.title}</div>
            <div className="grid grid-cols-3 gap-1.5">
              {m.outcomes.map((o) => {
                const k = `${m.key}|${o.key}`;
                const manual = ev.overrides[k];
                return (
                  <div key={o.key} className={clsx('rounded-xl p-2', manual ? 'bg-gold/10' : 'bg-surface2')}>
                    <div className="truncate text-[11px] font-semibold text-muted">{o.label}</div>
                    <input
                      defaultValue={o.odds ?? ''}
                      onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
                      onBlur={() => vals[k] !== undefined && vals[k] !== String(o.odds) && save(m, o, vals[k])}
                      inputMode="decimal"
                      className="num w-full bg-transparent text-[15px] font-extrabold outline-none"
                    />
                    {manual && (
                      <button onClick={() => save(m, o, null)} className="text-[10.5px] font-bold text-gold">
                        снять
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function CreateEvent({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const leagues = useQuery({ queryKey: ['admin', 'leagues'], queryFn: () => api<{ id: string; sport: SportId; name: string; teams: Team[] }[]>('/api/admin/leagues'), enabled: open });
  const [sport, setSport] = useState<SportId>('football');
  const [leagueId, setLeagueId] = useState('');
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [start, setStart] = useState(10);
  const [top, setTop] = useState(true);
  const ls = leagues.data?.filter((l) => l.sport === sport) ?? [];
  const league = ls.find((l) => l.id === leagueId) ?? ls[0];
  const teams = league?.teams ?? [];
  const sel = 'h-11 w-full rounded-xl border border-line bg-surface2 px-3 text-[14px] font-semibold outline-none';
  const submit = async () => {
    const h = home || teams[0]?.id;
    const a = away || teams[1]?.id;
    if (await run(() => api('/api/admin/events', { body: { sport, leagueId: league.id, homeId: h, awayId: a, startInMin: start, top } }), 'Событие создано')) {
      qc.invalidateQueries({ queryKey: ['admin', 'events'] });
      onClose();
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Новое событие">
      <div className="space-y-3 px-4 pb-6 pt-3">
        <select className={sel} value={sport} onChange={(e) => { setSport(e.target.value as SportId); setLeagueId(''); setHome(''); setAway(''); }}>
          {SPORT_ORDER.map((s) => <option key={s} value={s}>{SPORT_NAMES[s]}</option>)}
        </select>
        <select className={sel} value={league?.id ?? ''} onChange={(e) => { setLeagueId(e.target.value); setHome(''); setAway(''); }}>
          {ls.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <select className={sel} value={home || teams[0]?.id || ''} onChange={(e) => setHome(e.target.value)}>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <select className={sel} value={away || teams[1]?.id || ''} onChange={(e) => setAway(e.target.value)}>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <label className="block text-[12.5px] font-semibold text-muted">
          Начало через, минут
          <input type="number" min={0} value={start} onChange={(e) => setStart(Number(e.target.value))} className={clsx(sel, 'mt-1')} />
        </label>
        <label className="flex items-center gap-2 text-[14px] font-semibold">
          <input type="checkbox" checked={top} onChange={(e) => setTop(e.target.checked)} className="h-5 w-5 accent-[rgb(var(--accent))]" /> Показывать в «Топ-матчах»
        </label>
        <Button className="w-full" onClick={submit} disabled={!league}>
          Создать
        </Button>
      </div>
    </Sheet>
  );
}

function Events() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<'live' | 'scheduled' | 'finished'>('live');
  const [edit, setEdit] = useState<AdminEvent | null>(null);
  const [create, setCreate] = useState(false);
  const q = useQuery({ queryKey: ['admin', 'events', status], queryFn: () => api<AdminEvent[]>(`/api/admin/events?status=${status}`), refetchInterval: 5000 });
  const act = async (ev: AdminEvent, path: string, body: object, ok: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    if (await run(() => api(`/api/admin/events/${ev.id}/${path}`, { body }), ok)) qc.invalidateQueries({ queryKey: ['admin', 'events'] });
  };
  return (
    <div className="p-4">
      <div className="mb-3 flex gap-2">
        {(['live', 'scheduled', 'finished'] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={clsx('h-9 rounded-full px-3.5 text-[13px] font-bold', status === s ? 'bg-ink text-bg' : 'bg-surface2 text-muted')}>
            {s === 'live' ? 'Лайв' : s === 'scheduled' ? 'Скоро' : 'Завершены'}
          </button>
        ))}
        <Button size="sm" className="ml-auto" onClick={() => setCreate(true)}>
          <Plus size={15} /> Создать
        </Button>
      </div>
      {q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <Skeleton className="h-40" />
      ) : !q.data.length ? (
        <EmptyState icon={<FlagIcon size={26} />} title="Событий нет" />
      ) : (
        <div className="space-y-2">
          {q.data.map((ev) => (
            <div key={ev.id} className="card p-3">
              <div className="flex items-center gap-2">
                <SportIcon sport={ev.sport} size={15} className="text-muted" />
                <span className="truncate text-[12px] font-semibold text-muted">{ev.league.name}</span>
                {ev.top && <Star size={13} className="text-gold" fill="currentColor" />}
                <span className="ml-auto text-[11.5px] font-bold text-faint">{ev.status === 'live' ? `${ev.sb.clock} · ${ev.sb.period}` : ev.status === 'scheduled' ? startLabel(ev.startAt) : ev.status === 'cancelled' ? 'Отменён' : 'Завершён'}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="flex-1 truncate text-[14px] font-extrabold">
                  {ev.home.name} — {ev.away.name}
                </span>
                {ev.status !== 'scheduled' && <span className="num font-display text-[15px] font-bold">{ev.sb.score[0]}:{ev.sb.score[1]}</span>}
              </div>
              <div className="mt-1 text-[12px] text-muted">
                В игре: {ev.exposure.bets} ставок на {coins(ev.exposure.volume)} · {ev.adminSuspended ? <span className="font-bold text-gold">приостановлено</span> : 'приём открыт'}
              </div>
              {(ev.status === 'live' || ev.status === 'scheduled') && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => act(ev, 'suspend', { suspended: !ev.adminSuspended }, ev.adminSuspended ? 'Приём открыт' : 'Приём приостановлен')}>
                    {ev.adminSuspended ? <Unlock size={14} /> : <Lock size={14} />} {ev.adminSuspended ? 'Открыть' : 'Пауза'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEdit(ev)}>
                    Кф
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => act(ev, 'top', { top: !ev.top }, ev.top ? 'Убрано из топа' : 'Добавлено в топ')}>
                    <Star size={14} /> {ev.top ? 'Из топа' : 'В топ'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => act(ev, 'finish', {}, 'Матч завершён и рассчитан', 'Досимулировать матч до конца и рассчитать ставки?')}>
                    <FlagIcon size={14} /> Завершить
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => act(ev, 'cancel', {}, 'Событие отменено, ставки возвращены', 'Отменить событие? Все ставки будут возвращены.')}>
                    <XCircle size={14} /> Отменить
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <OddsEditor ev={edit} onClose={() => setEdit(null)} />
      <CreateEvent open={create} onClose={() => setCreate(false)} />
    </div>
  );
}

function UserDetail({ id, onClose }: { id: number | null; onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'user', id], queryFn: () => api<any>(`/api/admin/users/${id}`), enabled: !!id });
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const d = q.data;
  return (
    <Sheet open={!!id} onClose={onClose} title={d?.user.name ?? 'Пользователь'}>
      {!d ? (
        <div className="p-4"><Skeleton className="h-40" /></div>
      ) : (
        <div className="space-y-3 px-4 pb-6 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <Tile label="Баланс" value={coins(d.user.balance)} sub={d.audit.ok ? 'журнал сходится ✓' : 'расхождение с журналом!'} />
            <Tile label="Telegram ID" value={<span className="text-[15px]">{d.user.tgId}</span>} sub={d.user.username ? `@${d.user.username}` : undefined} />
          </div>
          <div className="rounded-2xl border border-line p-3">
            <div className="mb-2 text-[13px] font-extrabold">Корректировка баланса</div>
            <div className="flex gap-2">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="+1000 / −500" inputMode="numeric" className="h-10 w-28 rounded-xl bg-surface2 px-3 text-[14px] font-bold outline-none" />
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина" className="h-10 flex-1 rounded-xl bg-surface2 px-3 text-[14px] outline-none" />
            </div>
            <Button
              size="sm"
              className="mt-2 w-full"
              onClick={async () => {
                const n = Number(amount.replace('−', '-').replace(/\s/g, ''));
                if (!n || reason.length < 2) return toast({ kind: 'error', title: 'Укажите сумму и причину' });
                if (await run(() => api(`/api/admin/users/${id}/balance`, { body: { amount: n, reason } }), 'Баланс изменён')) {
                  setAmount('');
                  setReason('');
                  qc.invalidateQueries({ queryKey: ['admin'] });
                }
              }}
            >
              Применить
            </Button>
          </div>
          <Button
            variant={d.user.blocked ? 'secondary' : 'danger'}
            className="w-full"
            onClick={async () => {
              if (await run(() => api(`/api/admin/users/${id}/block`, { body: { blocked: !d.user.blocked } }), d.user.blocked ? 'Разблокирован' : 'Заблокирован')) qc.invalidateQueries({ queryKey: ['admin'] });
            }}
          >
            <Ban size={16} /> {d.user.blocked ? 'Разблокировать' : 'Заблокировать'}
          </Button>
          <div className="card divide-y divide-line">
            <div className="px-4 py-2.5 text-[13px] font-extrabold">Журнал операций</div>
            {d.ledger.map((l: any) => (
              <div key={l.id} className="flex items-center gap-2 px-4 py-2 text-[12.5px]">
                <span className="flex-1 truncate text-muted">{l.note ?? l.type}</span>
                <span className={clsx('num font-bold', l.amount >= 0 ? 'text-up' : 'text-down')}>{coins(l.amount, { sign: true })}</span>
                <span className="num w-20 text-right text-faint">{coins(l.balance_after)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}

function Users() {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['admin', 'users', term], queryFn: () => api<any[]>(`/api/admin/users?q=${encodeURIComponent(term)}`) });
  return (
    <div className="p-4">
      <div className="mb-3 flex h-11 items-center gap-2 rounded-xl border border-line bg-surface2 px-3">
        <Search size={16} className="text-muted" />
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Имя, @username или Telegram ID" className="w-full bg-transparent text-[14px] outline-none" />
      </div>
      {!q.data ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="card divide-y divide-line">
          {q.data.map((u) => (
            <button key={u.id} onClick={() => setOpen(u.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold">
                  {u.name} {u.blocked && <span className="text-down">· заблокирован</span>}
                </span>
                <span className="text-[12px] text-muted">{u.username ? `@${u.username}` : u.tgId}</span>
              </span>
              <span className="num text-[13px] font-bold">{coins(u.balance)}</span>
            </button>
          ))}
        </div>
      )}
      <UserDetail id={open} onClose={() => setOpen(null)} />
    </div>
  );
}

function Settings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api<any>('/api/admin/settings') });
  const [draft, setDraft] = useState<Record<string, string>>({});
  if (!q.data) return <div className="p-4"><Skeleton className="h-60" /></div>;
  const fields: [string, string, (v: any) => string, (s: string) => any][] = [
    ['margin', 'Маржа, %', (v) => String(Math.round(v * 1000) / 10), (s) => Number(s) / 100],
    ['minStake', 'Мин. ставка', String, Number],
    ['maxStake', 'Макс. ставка', String, Number],
    ['maxWin', 'Макс. выигрыш', String, Number],
    ['maxSelections', 'Событий в экспрессе', String, Number],
    ['startBalance', 'Стартовый баланс', String, Number],
    ['refillAmount', 'Пополнение до', String, Number],
    ['referralBonus', 'Бонус за друга', String, Number],
    ['cashoutMargin', 'Маржа выкупа, %', (v) => String(Math.round(v * 1000) / 10), (s) => Number(s) / 100],
    ['bonusLadder', 'Бонусы по дням (7 чисел)', (v) => v.join(', '), (s) => s.split(/[,\s]+/).filter(Boolean).map(Number)],
  ];
  const save = async () => {
    const patch: Record<string, any> = {};
    for (const [k, , , parse] of fields) if (draft[k] !== undefined) patch[k] = parse(draft[k]);
    if (!Object.keys(patch).length) return;
    if (await run(() => api('/api/admin/settings', { method: 'PUT', body: patch }), 'Настройки сохранены')) {
      setDraft({});
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    }
  };
  return (
    <div className="space-y-2 p-4">
      {fields.map(([k, label, fmt]) => (
        <label key={k} className="card flex items-center gap-3 px-4 py-2.5">
          <span className="flex-1 text-[13.5px] font-semibold">{label}</span>
          <input value={draft[k] ?? fmt(q.data[k])} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className="num w-40 rounded-lg bg-surface2 px-2.5 py-1.5 text-right text-[14px] font-bold outline-none" />
        </label>
      ))}
      <Button className="w-full" onClick={save} disabled={!Object.keys(draft).length}>
        Сохранить
      </Button>
      <p className="px-1 text-[11.5px] text-faint">Маржа применяется при следующем пересчёте коэффициентов (в лайве — через несколько секунд).</p>
    </div>
  );
}

function Log() {
  const q = useQuery({ queryKey: ['admin', 'log'], queryFn: () => api<any[]>('/api/admin/log') });
  if (!q.data) return <div className="p-4"><Skeleton className="h-40" /></div>;
  if (!q.data.length) return <EmptyState icon={<FlagIcon size={26} />} title="Журнал пуст" text="Здесь появятся действия администраторов." />;
  return (
    <div className="card m-4 divide-y divide-line">
      {q.data.map((l) => (
        <div key={l.id} className="px-4 py-2.5">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="font-extrabold">{l.action}</span>
            <span className="text-faint">{new Date(l.created_at).toLocaleString('ru-RU')}</span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted">{JSON.stringify(l.payload)}</div>
        </div>
      ))}
    </div>
  );
}

export default function Admin() {
  const { data: me, isLoading } = useMe();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('dash');
  if (isLoading) return null;
  if (!me?.isAdmin) return <EmptyState icon={<Lock size={28} />} title="Нет доступа" text="Раздел доступен только администраторам." action={<Button onClick={() => nav('/')}>На главную</Button>} />;
  const tabs: [Tab, string][] = [['dash', 'Обзор'], ['events', 'События'], ['users', 'Игроки'], ['settings', 'Настройки'], ['log', 'Журнал']];
  return (
    <div className="pb-10">
      <header className="glass sticky top-0 z-30 border-b border-line">
        <div className="flex h-[56px] items-center gap-2 px-3">
          <button onClick={() => nav('/profile')} className="press grid h-9 w-9 place-items-center rounded-full bg-surface2" aria-label="Назад">
            <ArrowLeft size={18} />
          </button>
          <h1 className="font-display text-[18px] font-semibold">Админ-панель</h1>
        </div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2.5">
          {tabs.map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={clsx('h-8 shrink-0 rounded-full px-3.5 text-[13px] font-bold', tab === k ? 'bg-accent text-accentInk' : 'bg-surface2 text-muted')}>
              {l}
            </button>
          ))}
        </div>
      </header>
      {tab === 'dash' && <Dashboard />}
      {tab === 'events' && <Events />}
      {tab === 'users' && <Users />}
      {tab === 'settings' && <Settings />}
      {tab === 'log' && <Log />}
    </div>
  );
}
