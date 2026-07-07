import { renderAppIcon } from '@/lib/pwa-icon';

// Static PWA icon (manifest 192×192). Prerendered at build so it's a plain
// cached asset — no per-request work, safe for the service worker to cache.
export const dynamic = 'force-static';

export function GET() {
  return renderAppIcon(192);
}
