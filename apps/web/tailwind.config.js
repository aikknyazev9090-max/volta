/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        surface2: v('surface2'),
        surface3: v('surface3'),
        ink: v('ink'),
        muted: v('muted'),
        faint: v('faint'),
        accent: v('accent'),
        accentInk: v('accent-ink'),
        up: v('up'),
        down: v('down'),
        live: v('live'),
        gold: v('gold'),
        line: 'rgb(var(--line) / var(--line-a))',
      },
      fontFamily: {
        sans: ['"Manrope Variable"', 'Manrope', 'system-ui', 'sans-serif'],
        display: ['"Unbounded Variable"', 'Unbounded', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl2: '1.125rem', xl3: '1.375rem' },
      boxShadow: {
        card: '0 1px 0 0 rgb(255 255 255 / 0.04) inset, 0 8px 24px -12px rgb(0 0 0 / 0.5)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.4), 0 8px 28px -6px rgb(var(--accent) / 0.45)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        pulseDot: { '0%,100%': { opacity: 1, transform: 'scale(1)' }, '50%': { opacity: 0.4, transform: 'scale(0.8)' } },
      },
      animation: { shimmer: 'shimmer 1.4s infinite', pulseDot: 'pulseDot 1.4s ease-in-out infinite' },
    },
  },
  plugins: [],
};
