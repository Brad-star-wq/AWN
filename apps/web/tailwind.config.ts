import type { Config } from 'tailwindcss';

// Locked redesign tokens — "Coastal Slate, whitened" (redesign walkthrough Part 1).
// These exact hexes are what the mockups use. Components reference them by name
// (bg-surface, text-ink, border-line, bg-accent) — never raw hex. The same
// values are mirrored as CSS variables in app/globals.css for the component
// classes there; this is the single source of truth for the palette.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f4f7f9',
        surface: '#ffffff',
        surface2: '#eef1f4',
        ink: '#2c353f',
        'ink-soft': '#566472',
        muted: '#8a96a4',
        faint: '#b3bdc8',
        line: '#e4e9ed',
        'line-2': '#eef1f4',
        accent: '#3f566f',
        'accent-soft': '#eaeef2',
        // Derived slate hairline for hover borders (replaces the old emerald one).
        'accent-line': '#cdd5de',
        // Faded-accent POS pad fill (in-store category buttons).
        pos: '#d9e2ea',
        // Calm, non-panic attention tone (aging / unpriced). Red is reserved.
        warn: '#9c7b3c',
        'warn-soft': '#f0ebdf',
        // Destructive / blocking only.
        danger: '#b4452f',
      },
      fontFamily: {
        // next/font wires these CSS variables in app/layout.tsx.
        // display/ui = Inter; body/sans = Nunito Sans.
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        ui: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
