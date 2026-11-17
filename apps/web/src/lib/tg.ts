/* Обёртка над Telegram WebApp API с безопасными заглушками для обычного браузера. */

type Impact = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type Notice = 'error' | 'success' | 'warning';

interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: { id: number; first_name?: string; photo_url?: string }; start_param?: string };
  colorScheme: 'light' | 'dark';
  platform: string;
  version: string;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor(c: string): void;
  setBackgroundColor(c: string): void;
  setBottomBarColor?(c: string): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  openTelegramLink(url: string): void;
  openLink(url: string): void;
  onEvent(e: string, cb: () => void): void;
  offEvent(e: string, cb: () => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback: { impactOccurred(s: Impact): void; notificationOccurred(t: Notice): void; selectionChanged(): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp };
  }
}

export const tg: TgWebApp | null = typeof window !== 'undefined' && window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : null;
export const inTelegram = !!tg;

let hapticsOn = true;
export function setHaptics(on: boolean) {
  hapticsOn = on;
}

const supports = (v: string) => !!tg && tg.isVersionAtLeast?.(v);

export const haptic = {
  tap(kind: Impact = 'light') {
    if (hapticsOn && supports('6.1')) tg!.HapticFeedback.impactOccurred(kind);
    else if (hapticsOn && !tg && 'vibrate' in navigator) navigator.vibrate?.(8);
  },
  select() {
    if (hapticsOn && supports('6.1')) tg!.HapticFeedback.selectionChanged();
  },
  notify(t: Notice) {
    if (hapticsOn && supports('6.1')) tg!.HapticFeedback.notificationOccurred(t);
  },
};

export function initTelegram(theme: 'dark' | 'light') {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    const bg = theme === 'dark' ? '#070B14' : '#F2F4F9';
    if (supports('6.1')) {
      tg.setHeaderColor(bg);
      tg.setBackgroundColor(bg);
    }
    if (supports('7.10')) tg.setBottomBarColor?.(bg);
    if (supports('7.7')) tg.disableVerticalSwipes?.();
  } catch {
    /* старые клиенты */
  }
}

export function setTgColors(theme: 'dark' | 'light') {
  if (!tg || !supports('6.1')) return;
  const bg = theme === 'dark' ? '#070B14' : '#F2F4F9';
  try {
    tg.setHeaderColor(bg);
    tg.setBackgroundColor(bg);
  } catch {
    /* ignore */
  }
}

export function startParam(): string | null {
  return tg?.initDataUnsafe.start_param ?? new URLSearchParams(location.search).get('startapp');
}

export function shareLink(url: string, text: string) {
  const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (tg) tg.openTelegramLink(share);
  else window.open(share, '_blank');
}

/** Dev-пользователь для работы вне Telegram. */
export function devUserId(): string {
  try {
    const p = new URLSearchParams(location.search).get('dev');
    if (p) localStorage.setItem('volta.dev', p);
    return localStorage.getItem('volta.dev') ?? '1';
  } catch {
    return '1';
  }
}
