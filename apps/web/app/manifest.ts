import type { MetadataRoute } from 'next';

// Web app manifest (Next metadata convention). Next serves this at
// /manifest.webmanifest and auto-injects <link rel="manifest">.
//
// The one setting that does the heavy lifting is display: 'standalone' — that's
// what strips the browser chrome so the installed app opens full-screen.
// Colors come from the Coastal tokens: canvas (background) + ink (theme).
// Icons are generated PNGs served by the /pwa/* route handlers (Phase B).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AWN Resale',
    short_name: 'AWN',
    description: 'Store-credit & buy-outright back office.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f4f7f9',
    theme_color: '#2c353f',
    icons: [
      { src: '/pwa/icon-192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa/icon-512', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
