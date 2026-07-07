import { ImageResponse } from 'next/og';

// The app mark — an "AWN" monogram on the Coastal ink, full-bleed so it doubles
// as a maskable icon (safe-zone padding not needed when the whole tile is the
// brand color). Rendered with next/og so we ship no binary image assets and add
// no image dependency. Long-cached; the mark only changes when this file does.
export function renderAppIcon(size: number): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2c353f',
          color: '#f4f7f9',
          fontSize: Math.round(size * 0.3),
          fontWeight: 700,
          letterSpacing: -1,
          fontFamily: 'sans-serif',
        }}
      >
        AWN
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    },
  );
}
