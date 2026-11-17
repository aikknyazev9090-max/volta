import { Globe } from 'lucide-react';
import type { SportId } from '../types';

type P = { className?: string; size?: number };

/** Собственные иконки видов спорта в едином стиле (обводка 1.8). */
export function SportIcon({ sport, className, size = 20 }: P & { sport: SportId }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className };
  switch (sport) {
    case 'football':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.2l3.2 2.3-1.2 3.8h-4l-1.2-3.8z" fill="currentColor" fillOpacity=".18" />
          <path d="M12 3v4.2M15.2 9.5l4.1-1.4M14 13.3l2.6 3.5M10 13.3l-2.6 3.5M8.8 9.5L4.7 8.1" />
        </svg>
      );
    case 'hockey':
      return (
        <svg {...common}>
          <path d="M5 3l6.5 13.5c.4.9 1.3 1.5 2.3 1.5H20" />
          <path d="M19 3l-4.2 8.7" />
          <ellipse cx="7" cy="19" rx="3.2" ry="1.6" fill="currentColor" fillOpacity=".18" />
        </svg>
      );
    case 'basketball':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3v18" />
          <path d="M5.6 5.6c2.6 2.4 2.6 10.4 0 12.8M18.4 5.6c-2.6 2.4-2.6 10.4 0 12.8" />
        </svg>
      );
    case 'tennis':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity=".12" />
          <path d="M5.2 5.8c3.6 3.2 3.6 9.2 0 12.4M18.8 5.8c-3.6 3.2-3.6 9.2 0 12.4" />
        </svg>
      );
    case 'cs2':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="7.5" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <path d="M12 2v5M12 17v5M2 12h5M17 12h5" />
        </svg>
      );
    case 'dota2':
      return (
        <svg {...common}>
          <path d="M4 4h4.5L20 15.5V20h-4.5L4 8.5z" fill="currentColor" fillOpacity=".14" />
          <path d="M14 4h6v6M4 14v6h6" />
        </svg>
      );
    case 'mma':
      return (
        <svg {...common}>
          <path d="M7 10V7.5A2.5 2.5 0 0 1 9.5 5h5A3.5 3.5 0 0 1 18 8.5V14a5 5 0 0 1-5 5h-1.5A4.5 4.5 0 0 1 7 14.5z" fill="currentColor" fillOpacity=".14" />
          <path d="M7 11.5h6.5a1.5 1.5 0 0 0 0-3H10M9 19v2h7v-2.5" />
        </svg>
      );
    case 'volleyball':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3c0 5 2 8 7.8 10.5M12 12c-4 2.5-6.2 5.4-6.7 7.6M12 12C7.6 9.8 4 10 3.2 10.6M12 12c4.5-2 6.5-4.7 6.7-7" />
        </svg>
      );
  }
}

export function Logo({ className, size = 28 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id="vg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E4FF7A" />
          <stop offset="1" stopColor="#A6F000" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="url(#vg)" />
      <path d="M11 12h8.2l5.1 13.4L30.2 12H37L26.9 36h-6.2z" fill="#0A1000" />
      <path d="M27.5 9.5L21 23.5h5.2L23.5 33l9.5-14.2h-5.4l2.6-9.3z" fill="#0A1000" stroke="url(#vg)" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={`font-display font-bold tracking-[0.08em] ${className ?? ''}`}>VOLTA</span>;
}

/** Монета — единица демо-валюты. */
export function Coin({ size = 16, className }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE58A" />
          <stop offset="1" stopColor="#F5A700" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#cg)" />
      <circle cx="12" cy="12" r="7.3" fill="none" stroke="#B87800" strokeOpacity=".45" strokeWidth="1.2" />
      <path d="M13.2 6.5L9 13h3l-1.2 4.5L15 11h-3z" fill="#8A5400" />
    </svg>
  );
}

const FLAG: Record<string, JSX.Element> = {
  ru: (
    <>
      <rect width="24" height="6" fill="#fff" />
      <rect y="6" width="24" height="6" fill="#1C57D6" />
      <rect y="12" width="24" height="6" fill="#E3243B" />
    </>
  ),
  de: (
    <>
      <rect width="24" height="6" fill="#111" />
      <rect y="6" width="24" height="6" fill="#DD1F26" />
      <rect y="12" width="24" height="6" fill="#FFCE00" />
    </>
  ),
  it: (
    <>
      <rect width="8" height="18" fill="#009246" />
      <rect x="8" width="8" height="18" fill="#fff" />
      <rect x="16" width="8" height="18" fill="#CE2B37" />
    </>
  ),
  es: (
    <>
      <rect width="24" height="18" fill="#C60B1E" />
      <rect y="4.5" width="24" height="9" fill="#FFC400" />
    </>
  ),
  gb: (
    <>
      <rect width="24" height="18" fill="#fff" />
      <rect x="10" width="4" height="18" fill="#CE1124" />
      <rect y="7" width="24" height="4" fill="#CE1124" />
    </>
  ),
  us: (
    <>
      <rect width="24" height="18" fill="#fff" />
      {[0, 2, 4, 6, 8].map((i) => (
        <rect key={i} y={i * 2 * 1.8} width="24" height="1.8" fill="#B22234" />
      ))}
      <rect width="11" height="9" fill="#3C3B6E" />
    </>
  ),
  fr: (
    <>
      <rect width="8" height="18" fill="#002654" />
      <rect x="8" width="8" height="18" fill="#fff" />
      <rect x="16" width="8" height="18" fill="#CE1126" />
    </>
  ),
  nl: (
    <>
      <rect width="24" height="6" fill="#AE1C28" />
      <rect y="6" width="24" height="6" fill="#fff" />
      <rect y="12" width="24" height="6" fill="#21468B" />
    </>
  ),
  pt: (
    <>
      <rect width="24" height="18" fill="#FF0000" />
      <rect width="9.6" height="18" fill="#006600" />
      <circle cx="9.6" cy="9" r="3.2" fill="#FFCC00" />
    </>
  ),
  eu: (
    <>
      <rect width="24" height="18" fill="#1B3F95" />
      {Array.from({ length: 12 }, (_, i) => (
        <circle key={i} cx={12 + 5 * Math.cos((i * Math.PI) / 6)} cy={9 + 5 * Math.sin((i * Math.PI) / 6)} r="0.8" fill="#FFDD00" />
      ))}
    </>
  ),
};

export function Flag({ code, className }: { code: string; className?: string }) {
  const f = FLAG[code];
  if (!f) return <Globe className={className} size={14} strokeWidth={2} />;
  return (
    <svg viewBox="0 0 24 18" className={`h-[11px] w-[15px] rounded-[2.5px] ring-1 ring-black/10 ${className ?? ''}`} aria-hidden>
      {f}
    </svg>
  );
}
