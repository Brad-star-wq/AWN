import { renderAppIcon } from '@/lib/pwa-icon';

// iOS apple-touch-icon (180×180). Linked via metadata.icons.apple in layout so
// iOS uses this mark on the home screen instead of a page screenshot.
export const dynamic = 'force-static';

export function GET() {
  return renderAppIcon(180);
}
