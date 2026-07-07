import type { Metadata, Viewport } from 'next';
import { Inter, Nunito_Sans } from 'next/font/google';
import './globals.css';

// Locked redesign type (Coastal Slate): Inter carries UI, headings, labels,
// buttons; Nunito Sans carries body text and every numeral (tabular). The CSS
// var names stay `--font-display` / `--font-body` so existing `font-display`
// utilities keep resolving — only the typeface behind them changed.
const display = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});
const body = Nunito_Sans({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AWN Resale',
  description: 'Store-credit & buy-outright back office.',
  applicationName: 'AWN Resale',
  // Next auto-links /manifest.webmanifest from app/manifest.ts; naming it here is
  // explicit and harmless.
  manifest: '/manifest.webmanifest',
  // Generated PNG icons (see app/pwa/*). `apple` drives the iOS home-screen icon.
  icons: {
    icon: [
      { url: '/pwa/icon-192', sizes: '192x192', type: 'image/png' },
      { url: '/pwa/icon-512', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/pwa/apple-icon', sizes: '180x180', type: 'image/png' }],
  },
  // iOS full-screen + custom title. Emits apple-mobile-web-app-capable=yes,
  // apple-mobile-web-app-title, and apple-mobile-web-app-status-bar-style.
  appleWebApp: {
    capable: true,
    title: 'AWN Resale',
    statusBarStyle: 'default',
  },
};

// themeColor lives on the viewport export in Next 14 — the ink token, so the
// installed app's status bar / chrome matches the shell instead of white.
export const viewport: Viewport = {
  themeColor: '#2c353f',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
