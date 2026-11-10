import { useState, useEffect, useCallback } from 'react';
import { api } from './api';
import { deriveKeys, encryptJSON, decryptJSON, generatePassword } from './crypto';

const AUTO_LOCK_MS = 5 * 60 * 1000;

export default function App() {
  const [key, setKey] = useState(null);

  const lock = useCallback(async () => {
    setKey(null);
    try { await api.logout(); } catch {}
  }, []);

  // auto-lock after 5 minutes of inactivity
  useEffect(() => {
    if (!key) return;
    let t = setTimeout(lock, AUTO_LOCK_MS);
    const reset = () => { clearTimeout(t); t = setTimeout(lock, AUTO_LOCK_MS); };
    const events = ['mousemove', 'keydown', 'click', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset));
    return () => { clearTimeout(t); events.forEach((e) => window.removeEventListener(e, reset)); };
  }, [key, lock]);

  return key ? <Vault cryptoKey={key} onLock={lock} /> : <Auth onUnlock={setKey} />;
}

/* ---------------- Auth ---------------- */
function Auth({ onUnlock }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (mode === 'register') {
      if (pw.length < 12) return setErr('Use at least 12 characters for the master password.');
      if (pw !== pw2) return setErr('The two passwords do not match.');
    }
    setBusy(true);
    try {
      const { key, authHash } = await deriveKeys(email, pw);
      await (mode === 'register' ? api.register : api.login)({ email, authHash });
      onUnlock(key);
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-intro">
        <div className="brand-mark" aria-hidden="true">V</div>
        <p className="eyebrow">YOUR PRIVATE SPACE</p>
        <h1>Everything safe.<br /><em>Only yours.</em></h1>
        <p className="intro-copy">A calmer place for the keys to your digital life. Encrypted on your device, locked to everyone else.</p>
        <div className="trust-note"><span className="status-dot" /> End-to-end encrypted <span className="trust-divider">·</span> Zero-knowledge by design</div>
      </section>
      <section className="auth-card">
        <div className="card-heading"><p className="eyebrow">{mode === 'login' ? 'WELCOME BACK' : 'GET STARTED'}</p><h2>{mode === 'login' ? 'Unlock your vault' : 'Create your vault'}</h2>
          <p className="muted">{mode === 'login' ? 'Enter your details to access your passwords.' : 'Choose a strong master password. It cannot be recovered if forgotten.'}</p></div>
      <form onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" /></label>
        <label>Master password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {mode === 'register' && (
          <label>Confirm master password<input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} required autoComplete="new-password" /></label>
        )}
        {err && <p className="error">{err}</p>}
        <button className="primary" disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Unlock vault' : 'Create vault'} <span aria-hidden="true">↗</span></button>
      </form>
      <div className="auth-switch"><span className="muted">{mode === 'login' ? 'New here?' : 'Already have a vault?'}</span><button className="link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setErr(''); }}>
        {mode === 'login' ? 'First time? Create your vault' : 'Back to unlock'}
      </button></div>
      <p className="privacy-foot"><span aria-hidden="true">◈</span> Your master password never leaves this device.</p>
      </section>
    </main>
  );
}

/* ---------------- Vault ---------------- */
function Vault({ cryptoKey, onLock }) {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // null | {} (new) | item
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await api.list();
      const list = await Promise.all(rows.map(async (r) => ({ id: r._id, ...(await decryptJSON(cryptoKey, r)) })));
      list.sort((a, b) => a.site.localeCompare(b.site));
      setItems(list);
      setErr('');
    } catch (x) {
      setErr(x.message);
    } finally {
      setLoading(false);
    }
  }, [cryptoKey]);

  useEffect(() => { load(); }, [load]);

  async function save({ id, ...fields }) {
    const blob = await encryptJSON(cryptoKey, fields);
    if (id) await api.update(id, blob);
    else await api.create(blob);
    setEditing(null);
    await load();
  }

  async function remove(id) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    try { await api.remove(id); await load(); } catch (x) { setErr(x.message); }
  }

  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) => `${i.site} ${i.username} ${i.url}`.toLowerCase().includes(needle));

  return (
    <main className="vault">
      <header className="vault-header">
        <div className="brand-lockup"><div className="brand-mark small" aria-hidden="true">V</div><div><h1>Vault</h1><span className="muted brand-caption">Your private space</span></div></div>
        <div className="actions">
          <button className="primary" onClick={() => setEditing({})}>Add password</button>
          <button className="ghost" onClick={onLock}>Lock</button>
        </div>
      </header>
      <section className="vault-welcome"><div><p className="eyebrow">PASSWORDS, IN ONE PLACE</p><h2>Your digital life,<br className="mobile-break"/> securely in hand.</h2><p className="muted">A private collection that only you can unlock.</p></div><div className="secure-badge"><span className="status-dot"/> Encrypted on this device</div></section>
      <div className="search-wrap"><span aria-hidden="true">⌕</span><input className="search" placeholder="Search by site or username" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {err && <p className="error">{err}</p>}
      {loading ? (
        <p className="muted">Decrypting…</p>
      ) : shown.length === 0 ? (
        <p className="muted">{items.length ? 'No entries match your search.' : 'Your vault is empty. Add your first password.'}</p>
      ) : (
        <div className="list">{shown.map((i) => <Row key={i.id} item={i} onEdit={setEditing} onDelete={remove} />)}</div>
      )}
      {editing && <Form initial={editing} onSave={save} onClose={() => setEditing(null)} />}
    </main>
  );
}

function CopyBtn({ text, label }) {
  const [done, setDone] = useState(false);
  async function go() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
      setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 20000); // clear clipboard after 20s
    } catch {}
  }
  return <button className="ghost" onClick={go}>{done ? 'Copied' : label}</button>;
}

function Row({ item, onEdit, onDelete }) {
  const [show, setShow] = useState(false);
  const safeUrl = /^https?:\/\//i.test(item.url || '');
  return (
    <div className="row">
      <div className="info">
        <strong>{item.site}</strong>
        <span className="muted">{item.username}</span>
        {show && <code>{item.password}</code>}
        {show && item.notes && <p className="muted notes">{item.notes}</p>}
      </div>
      <div className="actions">
        {safeUrl && <a className="ghost btn" href={item.url} target="_blank" rel="noreferrer noopener">Open site</a>}
        <CopyBtn text={item.username} label="Copy username" />
        <CopyBtn text={item.password} label="Copy password" />
        <button className="ghost" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
        <button className="ghost" onClick={() => onEdit(item)}>Edit</button>
        <button className="ghost danger" onClick={() => onDelete(item.id)}>Delete</button>
      </div>
    </div>
  );
}

function Form({ initial, onSave, onClose }) {
  const [f, setF] = useState({ site: '', url: '', username: '', password: '', notes: '', ...initial });
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!f.site.trim() || !f.password) return setErr('Site and password are required.');
    setBusy(true);
    try { await onSave(f); } catch (x) { setErr(x.message); setBusy(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{initial.id ? 'Edit password' : 'Add password'}</h2>
        <label>Site name<input value={f.site} onChange={set('site')} autoFocus /></label>
        <label>Site URL<input value={f.url} onChange={set('url')} placeholder="https://" /></label>
        <label>Username or email<input value={f.username} onChange={set('username')} autoComplete="off" /></label>
        <label>Password
          <div className="inline">
            <input type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} autoComplete="new-password" />
            <button type="button" className="ghost" onClick={() => setShow((s) => !s)}>{show ? 'Hide' : 'Show'}</button>
            <button type="button" className="ghost" onClick={() => { setF({ ...f, password: generatePassword() }); setShow(true); }}>Generate</button>
          </div>
        </label>
        <label>Notes<textarea rows="3" value={f.notes} onChange={set('notes')} /></label>
        {err && <p className="error">{err}</p>}
        <div className="actions end">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </div>
  );
}
