import type { Config } from 'tailwindcss';

// Semantic design tokens for the professional re-skin (design/*-professional-mockup.html).
// Components reference these by name (bg-surface, text-ink, border-line) — never raw hex.
// NOTE: the legacy palette still lives in app/globals.css for screens not yet re-skinned;
// it is removed screen-by-screen as each is converted.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#f4f6f9',
        surface: '#ffffff',
        ink: '#18233c',
        'ink-soft': '#5a6378',
        muted: '#8b94a6',
        faint: '#b6bdca',
        line: '#e9ecf2',
        'line-2': '#eef1f6',
        accent: '#137a63',
        'accent-soft': '#e9f3ef',
        'accent-line': '#cfe6dd',
        warn: '#d99a36',
        'warn-soft': '#faf0dd',
      },
      fontFamily: {
        // next/font wires these CSS variables in app/layout.tsx.
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
