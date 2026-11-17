import { memo } from 'react';
import type { SportId, Team } from '../types';
import { isIndividual } from '../lib/format';

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * k)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * k)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * k)));
  return `rgb(${r},${g},${b})`;
}

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** Генерируемая эмблема: щит в цветах клуба или аватар игрока. */
export const TeamBadge = memo(function TeamBadge({ team, sport, size = 36 }: { team: Team; sport: SportId; size?: number }) {
  const [c1, c2] = team.colors;
  const id = `tb-${team.id}`;
  const text = luminance(c1) > 0.62 ? '#0B1020' : '#FFFFFF';
  const label = team.short.length > 3 ? team.short.slice(0, 4) : team.short;
  const fs = label.length > 3 ? 8.5 : label.length > 2 ? 10 : 12;

  if (isIndividual(sport)) {
    const initials = team.name.replace(/«.*?»/g, '').split(/[\s.]+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('');
    return (
      <svg width={size} height={size} viewBox="0 0 40 40" className="shrink-0" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={shade(c1, 1.15)} />
            <stop offset="1" stopColor={shade(c1, 0.6)} />
          </linearGradient>
        </defs>
        <circle cx="20" cy="20" r="19" fill={`url(#${id})`} />
        <circle cx="20" cy="20" r="18.4" fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth="1.2" />
        <text x="20" y="25" textAnchor="middle" fontFamily="Unbounded Variable, Unbounded, sans-serif" fontWeight="700" fontSize="13" fill={text}>
          {initials}
        </text>
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 40 44" className="shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.35)]" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={shade(c1, 1.18)} />
          <stop offset="1" stopColor={shade(c1, 0.72)} />
        </linearGradient>
        <clipPath id={`${id}-c`}>
          <path d="M20 2l16 5v13c0 10.5-6.8 17.6-16 22C10.8 37.6 4 30.5 4 20V7z" />
        </clipPath>
      </defs>
      <path d="M20 2l16 5v13c0 10.5-6.8 17.6-16 22C10.8 37.6 4 30.5 4 20V7z" fill={`url(#${id})`} />
      <g clipPath={`url(#${id}-c)`}>
        <path d="M26 0h6L14 44H8z" fill={c2} opacity=".9" />
        <path d="M0 0h40v14H0z" fill="#fff" opacity=".08" />
      </g>
      <path d="M20 2l16 5v13c0 10.5-6.8 17.6-16 22C10.8 37.6 4 30.5 4 20V7z" fill="none" stroke="#fff" strokeOpacity=".28" strokeWidth="1.2" />
      <text x="20" y="25.5" textAnchor="middle" fontFamily="Unbounded Variable, Unbounded, sans-serif" fontWeight="800" fontSize={fs} fill={text} letterSpacing=".02em" style={{ paintOrder: 'stroke' }} stroke={text === '#FFFFFF' ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.3)'} strokeWidth=".6">
        {label}
      </text>
    </svg>
  );
});
