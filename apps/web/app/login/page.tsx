import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · Resale' };

export default function LoginPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <div className="card" style={{ width: 360, padding: 28 }}>
        <div className="brand" style={{ padding: '0 0 18px' }}>
          <span className="dot" style={{ width: 26, height: 26 }}>R</span>
          <b style={{ color: 'var(--ink)', fontSize: 16 }}>Resale</b>
        </div>
        <h1 style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>Owner sign in</h1>
        <p className="sub" style={{ marginBottom: 18 }}>Dashboard access for the shop owner.</p>
        <LoginForm />
      </div>
    </div>
  );
}
