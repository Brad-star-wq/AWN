/**
 * Phase A token/preview page (redesign walkthrough Part 1 acceptance artifact).
 * Renders the locked Coastal Slate palette, the Inter + Nunito type scale, and
 * each component class so the foundation can be checked against the mockups
 * before any screen is built. Gated behind login like every route.
 */
const SWATCHES: Array<{ name: string; var: string; note: string; dark?: boolean }> = [
  { name: 'canvas', var: '--canvas', note: 'app background' },
  { name: 'surface', var: '--surface', note: 'cards, bars, inputs' },
  { name: 'surface2', var: '--surface2', note: 'keypad / subtle fills' },
  { name: 'ink', var: '--ink', note: 'primary text · dark block', dark: true },
  { name: 'ink-soft', var: '--ink-soft', note: 'secondary text', dark: true },
  { name: 'muted', var: '--muted', note: 'tertiary / captions', dark: true },
  { name: 'faint', var: '--faint', note: 'placeholders' },
  { name: 'line', var: '--line', note: 'hairline borders' },
  { name: 'accent', var: '--accent', note: 'primary action · store credit', dark: true },
  { name: 'accent-soft', var: '--accent-soft', note: 'tint / focus ring' },
  { name: 'pos', var: '--pos', note: 'POS pad fill' },
  { name: 'danger', var: '--danger', note: 'destructive only', dark: true },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 40 }}>
      <div className="eyebrow">{title}</div>
      {children}
    </section>
  );
}

export default function StyleguidePage() {
  return (
    <div style={{ background: 'var(--canvas)', minHeight: '100vh', padding: '40px 48px' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--ui)', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>
          Coastal Slate — design tokens
        </h1>
        <p className="sub" style={{ marginTop: 6, marginBottom: 32 }}>
          Phase A foundation. Inter for UI/headings, Nunito Sans for body + tabular numerals.
        </p>

        <Section title="Palette">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            {SWATCHES.map((s) => (
              <div key={s.name} className="card" style={{ overflow: 'hidden' }}>
                <div style={{ background: `var(${s.var})`, height: 64, borderBottom: '1px solid var(--line)' }} />
                <div className="pad" style={{ padding: '10px 12px' }}>
                  <div style={{ fontFamily: 'var(--ui)', fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                  <div className="sub" style={{ fontSize: 11.5 }}>{s.note}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type">
          <div className="card pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontFamily: 'var(--ui)', fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em' }}>Inter 600 — heading</div>
            <div style={{ fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 500 }}>Inter 500 — UI label / nav</div>
            <div style={{ fontSize: 14 }}>Nunito Sans 400 — body copy that explains a thing calmly.</div>
            <div className="num" style={{ fontSize: 22, fontWeight: 800 }}>$1,234.50 · −$60 · ×3 (tabular)</div>
          </div>
        </Section>

        <Section title="Money blocks & overview">
          <div className="ov" style={{ marginBottom: 14 }}>
            <div className="cell"><div className="l">Credit given today</div><div className="v credit num">$245</div></div>
            <div className="cell"><div className="l">Credit used today</div><div className="v num">$60</div></div>
            <div className="cell liab"><div className="l">Outstanding liability</div><div className="v num">$4,210</div></div>
          </div>
          <div className="moneyblock" style={{ maxWidth: 280 }}>
            <div className="l">Credit balance</div>
            <div className="v num">$120</div>
          </div>
        </Section>

        <Section title="Buttons & badges">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
            <button className="btn primary">Primary</button>
            <button className="btn">Secondary</button>
            <button className="btn sm">Small</button>
            <button className="btn danger">Destructive</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge draft">Draft</span>
            <span className="badge ready">Ready</span>
            <span className="badge pushed">Pushed</span>
            <span className="badge tracked">Tracked</span>
          </div>
        </Section>

        <Section title="In-store — receipt line, POS pad, chips, keypad">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div>
              <div className="line">
                <span className="lnm">Sneakers</span>
                <span className="qty"><span className="x">×</span>3</span>
                <span className="lpr empty">$ —</span>
              </div>
              <div className="line">
                <span className="lnm">Cards</span>
                <span className="qty edit"><span className="x">×</span>20</span>
                <span className="lpr">$160</span>
              </div>
              <div className="cats" style={{ marginTop: 12 }}>
                <button className="cat">Sneakers</button>
                <button className="cat">Cards</button>
                <button className="cat">Clothing</button>
                <button className="cat">More</button>
                <button className="cat">Other</button>
              </div>
            </div>
            <div>
              <div className="afl">Condition</div>
              <div className="chips" style={{ marginBottom: 14 }}>
                <span className="chip on">DS</span>
                <span className="chip">VNDS</span>
                <span className="chip">Used</span>
              </div>
              <div className="keypad" style={{ maxWidth: 220 }}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '←'].map((k) => (
                  <button key={k}>{k}</button>
                ))}
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
