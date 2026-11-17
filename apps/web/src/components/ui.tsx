import clsx from 'clsx';
import { AnimatePresence, animate, motion, useDragControls, useMotionValue, useTransform, type PanInfo } from 'framer-motion';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../lib/tg';
import { coins } from '../lib/format';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={clsx('relative overflow-hidden rounded-xl bg-surface2', className)}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={clsx('relative inline-flex h-2 w-2', className)}>
      <span className="absolute inset-0 animate-ping rounded-full bg-live opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-live" />
    </span>
  );
}

export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-live/15 px-2 py-[3px] text-[10px] font-extrabold tracking-wider text-live">
      <LiveDot className="!h-1.5 !w-1.5" />
      LIVE
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={clsx('relative flex rounded-2xl bg-surface2 p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => {
              if (!active) haptic.select();
              onChange(o.value);
            }}
            className={clsx('relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-xl font-bold transition-colors', size === 'sm' ? 'h-8 text-[13px]' : 'h-10 text-sm', active ? 'text-ink' : 'text-muted')}
          >
            {active && <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 -z-10 rounded-xl bg-surface3 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_4px_14px_-6px_rgba(0,0,0,0.5)]" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center px-8 py-14 text-center">
      <div className="relative mb-5 grid h-20 w-20 place-items-center">
        <div className="absolute inset-0 rounded-[28px] bg-accent/10 blur-xl" />
        <div className="relative grid h-20 w-20 place-items-center rounded-[28px] border border-line bg-surface2 text-accent">{icon}</div>
      </div>
      <div className="font-display text-[17px] font-semibold">{title}</div>
      {text && <div className="mt-2 max-w-[260px] text-[13.5px] leading-relaxed text-muted">{text}</div>}
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  );
}

export function ErrorState({ text, onRetry }: { text?: string; onRetry?: () => void }) {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  return (
    <EmptyState
      icon={offline ? <WifiOff size={30} /> : <RefreshCw size={28} />}
      title={offline ? 'Нет подключения' : 'Не удалось загрузить'}
      text={offline ? 'Проверьте интернет — мы обновим данные автоматически.' : text ?? 'Похоже, сервер задумался. Попробуйте ещё раз.'}
      action={
        onRetry && (
          <Button variant="secondary" onClick={onRetry}>
            Повторить
          </Button>
        )
      }
    />
  );
}

export function Button({ children, className, variant = 'primary', size = 'md', loading, disabled, onClick, type = 'button' }: { children: ReactNode; className?: string; variant?: 'primary' | 'secondary' | 'ghost' | 'gold' | 'danger'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit' }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={() => {
        haptic.tap(variant === 'primary' ? 'medium' : 'light');
        onClick?.();
      }}
      className={clsx(
        'press relative inline-flex select-none items-center justify-center gap-2 overflow-hidden font-bold transition-[opacity,background-color] disabled:opacity-45',
        size === 'sm' && 'h-9 rounded-xl px-3.5 text-[13px]',
        size === 'md' && 'h-11 rounded-2xl px-5 text-[14.5px]',
        size === 'lg' && 'h-[54px] rounded-[18px] px-6 text-[15.5px]',
        variant === 'primary' && 'bg-accent text-accentInk shadow-glow',
        variant === 'secondary' && 'bg-surface2 text-ink',
        variant === 'ghost' && 'text-muted',
        variant === 'gold' && 'bg-gradient-to-br from-[#FFE27A] to-[#F5A700] text-[#2A1A00] shadow-[0_8px_28px_-8px_rgba(255,190,40,0.6)]',
        variant === 'danger' && 'bg-down/15 text-down',
        className,
      )}
    >
      {loading ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : children}
    </button>
  );
}

/** Анимированное число: прокручивается к новому значению. */
export function AnimatedNumber({ value, format = coins, className, duration = 0.7 }: { value: number; format?: (n: number) => string; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current;
    prev.current = value;
    if (from === value || !ref.current) {
      if (ref.current) ref.current.textContent = format(value);
      return;
    }
    const ctrl = animate(from, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = format(Math.round(v * 100) / 100);
      },
    });
    return () => ctrl.stop();
  }, [value, format, duration]);
  return (
    <span ref={ref} className={clsx('num', className)}>
      {format(value)}
    </span>
  );
}

/** Нижняя шторка, тянется пальцем. */
export function Sheet({ open, onClose, children, title, className, maxH = '88dvh' }: { open: boolean; onClose: () => void; children: ReactNode; title?: ReactNode; className?: string; maxH?: string }) {
  const controls = useDragControls();
  const y = useMotionValue(0);
  const opacity = useTransform(y, [0, 400], [1, 0]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 600) onClose();
  };
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" style={{ opacity }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div
            role="dialog"
            className={clsx('absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-[480px] flex-col rounded-t-[28px] border-t border-line bg-surface shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.6)]', className)}
            style={{ y, maxHeight: maxH, paddingBottom: 'var(--safe-bottom)' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={onDragEnd}
          >
            <div className="flex shrink-0 cursor-grab touch-none flex-col items-center pb-1 pt-2.5" onPointerDown={(e) => controls.start(e)}>
              <div className="h-1.5 w-11 rounded-full bg-faint/60" />
              {title && <div className="mt-3 w-full px-5 text-left font-display text-[17px] font-semibold">{title}</div>}
            </div>
            <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function useNow(interval = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(t);
  }, [interval]);
  return now;
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-between px-4', className)}>
      <h2 className="font-display text-[17px] font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => {
        haptic.select();
        onChange(!checked);
      }}
      className={clsx('relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-surface3')}
    >
      <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 35 }} className={clsx('absolute top-[3px] h-6 w-6 rounded-full shadow-md', checked ? 'right-[3px] bg-accentInk' : 'left-[3px] bg-white')} />
    </button>
  );
}
