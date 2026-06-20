import type { Metadata } from 'next';
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
