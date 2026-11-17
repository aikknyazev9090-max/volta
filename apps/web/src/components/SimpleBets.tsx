import clsx from 'clsx';
import { ChevronRight, HelpCircle, Info, Layers, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { balancedTotal, chances, describeEvent, humanOutcome, marketHelp, winnerMarket } from '../lib/explain';
import { haptic } from '../lib/tg';
import { useUi } from '../store';
import type { EventFull, Market } from '../types';
import { OddsButton } from './OddsButton';

/** Переключатель «Простые ставки / Все ставки». */
export function BetModeSwitch({ className }: { className?: string }) {
  const mode = useUi((s) => s.betMode);
  const set = useUi((s) => s.setBetMode);
  const item = (v: 'simple' | 'pro', label: string, Icon: typeof Sparkles) => (
    <button
      onClick={() => {
        haptic.select();
        set(v);
      }}
      className={clsx('press flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[11px] text-[13px] font-bold transition-colors', mode === v ? 'bg-ink text-bg' : 'text-muted')}
    >
      <Icon size={15} /> {label}
    </button>
  );
  return (
    <div className={clsx('flex gap-1 rounded-[14px] border border-line bg-surface p-1', className)}>
      {item('simple', 'Простые ставки', Sparkles)}
      {item('pro', 'Все ставки', Layers)}
    </div>
  );
}

/** Описание матча: о чём он и чего ждать. */
export function EventAbout({ ev }: { ev: EventFull }) {
  const [open, setOpen] = useState(false);
  const lines = [
    ...(ev.real ? ['Это настоящий матч. Ставки принимаются до стартового свистка, расчёт — по итоговому счёту основного времени (появляется с небольшой задержкой). Коэффициенты считает наша модель по рейтингу силы клубов.'] : []),
    ...describeEvent(ev),
  ];
  const shown = open ? lines : lines.slice(0, 2);
  return (
    <div className="card mx-3 mb-3 p-4">
      <div className="mb-2 flex items-center gap-2 text-[13px] font-extrabold">
        <Info size={16} className="text-accent" /> О матче
      </div>
      <div className="space-y-1.5 text-[13.5px] leading-relaxed text-ink/85">
        {shown.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
      {lines.length > 2 && (
        <button onClick={() => setOpen(!open)} className="mt-2 text-[12.5px] font-bold text-accent">
          {open ? 'Свернуть' : 'Подробнее'}
        </button>
      )}
    </div>
  );
}

function Question({ title, hint, ev, market, subs }: { title: string; hint: string; ev: EventFull; market: Market; subs?: Record<string, string> }) {
  const open = market.outcomes.filter((o) => o.odds || ev.suspended);
  if (!open.length) return null;
  return (
    <div className="card p-3">
      <div className="px-1 pb-2.5">
        <div className="text-[15px] font-extrabold">{title}</div>
        <div className="mt-0.5 text-[12.5px] leading-snug text-muted">{hint}</div>
      </div>
      <div className="space-y-1.5">
        {market.outcomes.map((o) => (
          <OddsButton key={o.key} ev={ev} market={market} outcome={o} variant="simple" title={humanOutcome(market, o, ev)} sub={subs?.[o.key]} />
        ))}
      </div>
    </div>
  );
}

/** Простой режим: 2–3 главных вопроса о матче вместо десятков рынков. */
export function SimpleBets({ ev }: { ev: EventFull }) {
  const setMode = useUi((s) => s.setBetMode);
  const wm = winnerMarket(ev);
  const total = balancedTotal(ev);
  const btts = ev.sport === 'football' || ev.sport === 'hockey' ? ev.markets.find((m) => m.key === 'btts') : undefined;
  const distance = ev.sport === 'mma' ? ev.markets.find((m) => m.key === 'distance') : undefined;
  const ch = wm ? chances(wm) : {};
  const chanceSubs = Object.fromEntries(Object.entries(ch).map(([k, v]) => [k, `Шанс примерно ${v}%`]));

  return (
    <div className="space-y-2 px-3">
      <div className="flex items-start gap-2.5 rounded-2xl bg-accent/10 px-3.5 py-3 text-[12.5px] leading-snug text-ink/85">
        <HelpCircle size={17} className="mt-px shrink-0 text-accent" />
        <span>
          Нажмите на вариант, в который верите, — он попадёт в купон. Число справа — коэффициент: во сколько раз умножится ставка, если угадаете.{' '}
          <Link to="/help" className="font-bold text-accent">
            Как это работает
          </Link>
        </span>
      </div>
      {wm && <Question title="Кто победит?" hint={marketHelp(wm, ev)} ev={ev} market={wm} subs={chanceSubs} />}
      {total && (
        <Question
          title={ev.sport === 'basketball' ? 'Сколько очков наберут команды?' : ev.sport === 'tennis' ? 'Сколько будет геймов?' : ev.sport === 'football' || ev.sport === 'hockey' ? `Сколько будет ${ev.sport === 'hockey' ? 'шайб' : 'голов'}?` : 'Сколько продлится серия?'}
          hint="Победитель не важен — считается общее количество за матч у обеих сторон."
          ev={ev}
          market={total}
        />
      )}
      {btts && <Question title="Забьют ли обе команды?" hint="Сыграет «да», если каждая команда забьёт хотя бы раз." ev={ev} market={btts} />}
      {distance && <Question title="Дойдёт ли бой до решения судей?" hint="Или кто-то победит досрочно — нокаутом или приёмом." ev={ev} market={distance} />}
      {!wm && !total && <div className="card p-4 text-center text-[13px] text-muted">Главные ставки сейчас закрыты. Загляните во «Все ставки».</div>}
      <button
        onClick={() => {
          haptic.select();
          setMode('pro');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        className="card press flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <Layers size={18} className="text-muted" />
        <span className="flex-1">
          <span className="block text-[14px] font-extrabold">Все ставки на матч · {ev.marketsCount}</span>
          <span className="block text-[12px] text-muted">Форы, тоталы, точный счёт и другое</span>
        </span>
        <ChevronRight size={18} className="text-faint" />
      </button>
    </div>
  );
}
