import type { Metadata } from 'next';
import { Red_Hat_Display, Urbanist } from 'next/font/google';
import './globals.css';

// Display (headings, money, brand) + body (everything else), per the mockups.
const display = Red_Hat_Display({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-display',
  display: 'swap',
});
const body = Urbanist({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Resale — Dashboard',
  description: 'Owner dashboard for the resale shop.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-body">{children}</body>
    </html>
  );
}
