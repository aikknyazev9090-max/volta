import '@fontsource-variable/manrope';
import '@fontsource-variable/unbounded';
import './index.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'framer-motion';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

const qc = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 5_000 },
  },
});

// тема до первого рендера, чтобы не мигало
try {
  const raw = localStorage.getItem('volta.ui');
  const theme = raw ? JSON.parse(raw).state?.theme : null;
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MotionConfig>
    </QueryClientProvider>
  </React.StrictMode>,
);
