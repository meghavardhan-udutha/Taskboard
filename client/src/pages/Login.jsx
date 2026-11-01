import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { signIn } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      signIn(await api('/auth/login', { method: 'POST', body: form }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <aside className="auth-side">
        <Link to="/" className="lp-brand"><span className="lp-logo" aria-hidden="true" />Taskboard</Link>
        <div>
          <h2>Your team’s projects, tasks and chat in one place.</h2>
          <p>Sign in to pick up your boards, due dates and conversations where you left them.</p>
        </div>
        <Link to="/" className="auth-back">Back to home</Link>
      </aside>
      <form className="auth-card" onSubmit={submit}>
        <h1>Sign in to Taskboard</h1>
        <p className="muted">Pick up where your team left off.</p>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <label>Email
          <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>Password
          <input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </label>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted">New here? <Link to="/register">Create an account</Link></p>
      </form>
    </div>
  );
}
