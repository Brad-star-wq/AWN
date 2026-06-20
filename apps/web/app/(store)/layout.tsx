// In-store mode shell: a single mobile column, full-bleed on a phone and
// centred in a soft frame on larger screens. No dashboard sidebar — store mode
// is the one-handed, tap-first surface (walkthrough Part 2). Routes are gated by
// the same auth middleware as the rest of the app.
export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#d9dde1', display: 'flex', justifyContent: 'center' }}>
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          minHeight: '100vh',
          background: 'var(--canvas)',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--ink)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
