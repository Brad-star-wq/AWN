import { renderAppIcon } from '@/lib/pwa-icon';

// Static PWA icon (manifest 512×512, also used maskable).
export const dynamic = 'force-static';

export function GET() {
  return renderAppIcon(512);
}
