import { requireOwner } from '@/lib/server/auth';
import { SignOut } from '@/components/sign-out';

export default async function SettingsPage() {
  const user = await requireOwner();

  return (
    <div className="formwrap">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="sect-title">Square connection</span>
        </div>
        <div className="pad">
          <div className="sub" style={{ marginBottom: 12 }}>
            Mock adapter active · the live Square sync lands in Phase 5.
          </div>
          <div className="field">
            <label>Store Credit tender label</label>
            <input defaultValue="Store Credit" />
          </div>
          <button className="btn" disabled title="Available with the Phase 5 Square adapter">
            Connect Square
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="sect-title">Items &amp; defaults</span>
        </div>
        <div className="pad">
          <div className="field">
            <label>Default item type</label>
            <select defaultValue="Shoe">
              <option>Shoe</option>
              <option>Card</option>
              <option>Other</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Categories</label>
            <input defaultValue="Shoe, Card, Other" />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="pad" style={{ borderBottom: '1px solid var(--line)' }}>
          <span className="sect-title">Staff &amp; access</span>
        </div>
        <div className="rowlist">
          <div className="row">
            Owner (you)
            <span className="sub" style={{ marginLeft: 'auto' }}>{user.email}</span>
          </div>
          <div className="row">
            <span className="sub">Staff logins arrive in a later pass.</span>
            <span style={{ marginLeft: 'auto' }}>
              <SignOut />
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="pad" style={{ display: 'flex', alignItems: 'center' }}>
          <span className="sect-title">Backups</span>
          <span className="badge pushed" style={{ marginLeft: 'auto' }}>Postgres</span>
        </div>
        <div className="pad" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="sub">
            The credit ledger is append-only in Postgres — full change history is retained by design (no row is ever edited or deleted).
          </div>
        </div>
      </div>
    </div>
  );
}
