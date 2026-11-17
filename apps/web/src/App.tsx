import { useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BetSlip } from './components/BetSlip';
import { SideRight } from './components/SideRight';
import { BottomNav, SideNav, useIsDesktop } from './components/Chrome';
import { Logo } from './components/icons';
import { BonusSheet, fireConfetti, Onboarding, Toasts } from './components/Overlays';
import { Button } from './components/ui';
import { api, connectWs, onWs } from './lib/api';
import { coins } from './lib/format';
import { setBalance, useMe } from './lib/queries';
import { haptic, initTelegram, setHaptics, setTgColors, tg } from './lib/tg';
import { toast, useEventsStore, useUi } from './store';
import Home from './pages/Home';
import Live from './pages/Live';
import EventPage from './pages/Event';
import Bets from './pages/Bets';
import Profile from './pages/Profile';
import Leaderboard from './pages/Leaderboard';
import Search from './pages/Search';
import Help from './pages/Help';

const Admin = lazy(() => import('./pages/Admin'));

function useTelegramBackButton() {
  const loc = useLocation();
  const nav = useNavigate();
  useEffect(() => {
    if (!tg) return;
    const root = ['/', '/virtual', '/live', '/bets', '/profile'].includes(loc.pathname);
    const back = () => (window.history.length > 1 ? nav(-1) : nav('/'));
    try {
      if (root) tg.BackButton.hide();
      else {
        tg.BackButton.show();
        tg.BackButton.onClick(back);
      }
    } catch {
      /* старый клиент */
    }
    return () => {
      try {
        tg!.BackButton.offClick(back);
      } catch {
        /* ignore */
      }
    };
  }, [loc.pathname, nav]);
}

/** Плавное появление страницы на CSS: не зависит от JS-анимаций и всегда заканчивается видимой страницей. */
function PageFade({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}

function Splash() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-bg">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 220, damping: 18 }} className="flex flex-col items-center gap-4">
        <motion.div animate={{ rotate: [0, -6, 6, 0] }} transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}>
          <Logo size={72} />
        </motion.div>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-surface2">
          <motion.div className="h-full w-1/2 rounded-full bg-accent" animate={{ x: ['-100%', '200%'] }} transition={{ repeat: Infinity, duration: 1.1, ease: 'easeInOut' }} />
        </div>
      </motion.div>
    </div>
  );
}

function AuthError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <Logo size={64} />
      <h1 className="mt-6 font-display text-[20px] font-semibold">Не удалось войти</h1>
      <p className="mt-2 text-[14px] text-muted">{message}</p>
      <Button className="mt-6" onClick={onRetry}>
        Попробовать снова
      </Button>
    </div>
  );
}

export default function App() {
  const theme = useUi((s) => s.theme);
  const setBonusOpen = useUi((s) => s.setBonusOpen);
  const me = useMe();
  const qc = useQueryClient();
  const loc = useLocation();
  const upsert = useEventsStore((s) => s.upsert);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const desktop = useIsDesktop();
  useTelegramBackButton();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#070B14' : '#F2F4F9');
    setTgColors(theme);
  }, [theme]);

  useEffect(() => {
    initTelegram(useUi.getState().theme);
    connectWs();
    if (new URLSearchParams(location.search).get('bonus')) setTimeout(() => setBonusOpen(true), 600);
  }, [setBonusOpen]);

  useEffect(() => {
    if (me.data) {
      setHaptics(me.data.settings.haptics);
      if (onboarded === null) setOnboarded(me.data.onboarded);
    }
  }, [me.data, onboarded]);

  // живые обновления и личные уведомления
  useEffect(
    () =>
      onWs((m) => {
        if (m.t === 'live') upsert(m.events);
        if (m.t === 'notice') {
          if (typeof m.balance === 'number') setBalance(qc, m.balance);
          if (m.kind === 'bet_settled') {
            const b = m.payload;
            qc.invalidateQueries({ queryKey: ['bets'] });
            qc.invalidateQueries({ queryKey: ['profile'] });
            if (b?.status === 'won') {
              haptic.notify('success');
              fireConfetti();
              toast({ kind: 'win', title: `Ставка сыграла! +${coins(b.payout)}`, text: b.type === 'express' ? `Экспресс × ${b.odds.toFixed(2)}` : `${b.selections[0].eventName}` });
            } else if (b?.status === 'void') toast({ kind: 'info', title: `Возврат ставки ${coins(b.payout)}` });
            else if (b) toast({ kind: 'error', title: 'Ставка не сыграла', text: b.type === 'express' ? `Экспресс из ${b.selections.length}` : b.selections[0].eventName });
          }
          if (m.kind === 'achievement') {
            haptic.notify('success');
            toast({ kind: 'achievement', title: `Достижение: ${m.payload.title}`, text: m.payload.desc });
            qc.invalidateQueries({ queryKey: ['profile'] });
          }
        }
      }),
    [qc, upsert],
  );

  if (me.isLoading) return <Splash />;
  if (me.isError) {
    const e: any = me.error;
    return <AuthError message={e?.status === 401 ? 'Откройте приложение через бота в Telegram.' : e?.message ?? 'Проверьте подключение к интернету.'} onRetry={() => me.refetch()} />;
  }

  const finishOnboarding = () => {
    setOnboarded(true);
    haptic.notify('success');
    api('/api/me/onboarded', { body: {} }).catch(() => {});
  };

  const hideNav = loc.pathname.startsWith('/admin') || loc.pathname.startsWith('/search');

  return (
    <div className="mx-auto min-h-dvh lg:flex lg:max-w-[1400px] lg:gap-6 lg:px-6">
      {desktop && <SideNav />}
    <main className="relative mx-auto min-h-dvh w-full max-w-[480px] bg-bg lg:max-w-[780px] lg:flex-1" style={{ paddingBottom: hideNav || desktop ? (desktop ? 24 : undefined) : 'calc(76px + var(--safe-bottom))' }}>
      {/* Без AnimatePresence mode="wait": если анимация ухода старой страницы не доигрывала
          (свёрнутое окно, экономия ресурсов в Telegram), новая страница не появлялась — оставался пустой экран. */}
      <PageFade key={loc.pathname.split('/')[1] + (loc.pathname.startsWith('/event') ? loc.pathname : '')}>
        <Suspense fallback={<Splash />}>
          <Routes location={loc}>
            <Route path="/" element={<Home />} />
            <Route path="/virtual" element={<Live />} />
            <Route path="/live" element={<Live />} />
            <Route path="/event/:id" element={<EventPage />} />
            <Route path="/bets" element={<Bets />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/search" element={<Search />} />
            <Route path="/help" element={<Help />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </Suspense>
      </PageFade>
    </main>
      {desktop && (
        <div className="w-[360px] shrink-0 py-4">
          <div className="no-scrollbar sticky top-4 max-h-[calc(100dvh-32px)] space-y-3 overflow-y-auto">
            <BetSlip docked />
            <SideRight />
          </div>
        </div>
      )}
      {!hideNav && !desktop && <BottomNav />}
      {!desktop && <BetSlip />}
      <BonusSheet />
      <Toasts />
      <AnimatePresence>{onboarded === false && <Onboarding onDone={finishOnboarding} />}</AnimatePresence>
    </div>
  );
}
