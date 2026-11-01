import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Avatar from '../components/Avatar.jsx';

const fmtMinutes = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

export default function Profile() {
  const { user, setUser } = useAuth();
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');

  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    jobTitle: user.jobTitle || '',
    bio: user.bio || '',
    avatarUrl: user.avatarUrl || '',
  });
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState(null);

  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  useEffect(() => {
    api('/users/me/stats').then(setStats).catch((e) => setStatsError(e.message));
  }, []);

  const dirty =
    form.name !== user.name ||
    form.email !== user.email ||
    form.jobTitle !== (user.jobTitle || '') ||
    form.bio !== (user.bio || '') ||
    form.avatarUrl !== (user.avatarUrl || '');

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setProfileMsg(null);
    try {
      const d = await api('/users/me', { method: 'PUT', body: form });
      setUser(d.user);
      setProfileMsg({ type: 'success', text: 'Profile saved.' });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    if (pw.newPassword !== pw.confirm) return setPwMsg({ type: 'error', text: 'The new passwords do not match.' });
    setPwBusy(true);
    try {
      await api('/users/me/password', {
        method: 'PUT',
        body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword },
      });
      setPw({ currentPassword: '', newPassword: '', confirm: '' });
      setPwMsg({ type: 'success', text: 'Password updated.' });
    } catch (err) {
      setPwMsg({ type: 'error', text: err.message });
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <div>
      <div className="profile-head">
        <Avatar user={{ ...user, avatarUrl: form.avatarUrl }} size={64} />
        <div>
          <h1>{user.name}</h1>
          <p className="muted">{user.jobTitle || 'Add your job title below'} · {user.email}</p>
        </div>
      </div>

      <section aria-label="Your numbers">
        {statsError && <div className="alert alert-error">{statsError}</div>}
        {!stats && !statsError && <p className="muted">Loading your numbers…</p>}
        {stats && (
          <div className="stat-row">
            <div className="stat"><b>{stats.projects}</b><span>Projects</span></div>
            <div className="stat"><b>{stats.open}</b><span>Open tasks assigned to you</span></div>
            <div className="stat"><b className={stats.overdue ? 'text-danger' : ''}>{stats.overdue}</b><span>Overdue</span></div>
            <div className="stat"><b>{stats.done}</b><span>Completed</span></div>
            <div className="stat"><b>{fmtMinutes(stats.minutesLogged)}</b><span>Time logged</span></div>
          </div>
        )}
        {stats && stats.upcoming.length === 0 && stats.open === 0 && (
          <div className="empty"><p>Nothing is assigned to you right now. <Link to="/">Open a project</Link> to pick up work.</p></div>
        )}
        {stats?.upcoming.length > 0 && (
          <div className="panel">
            <h3>Due soonest</h3>
            <ul className="plain-list">
              {stats.upcoming.map((t) => (
                <li key={t.id}>
                  <Link to={`/projects/${t.project}`}>{t.title}</Link>
                  <span className={new Date(t.dueDate) < new Date() ? 'text-danger' : 'muted'}>
                    {new Date(t.dueDate).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="two-col">
        <form className="panel form-stack" onSubmit={saveProfile}>
          <h3>Your information</h3>
          {profileMsg && <div className={`alert alert-${profileMsg.type}`} role="status">{profileMsg.text}</div>}
          <label>Full name
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>Email
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>Job title
            <input maxLength={80} value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
          </label>
          <label>Photo link <span className="hint">(optional, starts with https://)</span>
            <input value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })} />
          </label>
          <label>About you <span className="hint">({form.bio.length}/500)</span>
            <textarea rows={4} maxLength={500} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </label>
          <button className="btn btn-primary" disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save changes'}</button>
        </form>

        <form className="panel form-stack" onSubmit={changePassword}>
          <h3>Change password</h3>
          {pwMsg && <div className={`alert alert-${pwMsg.type}`} role="status">{pwMsg.text}</div>}
          <label>Current password
            <input type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          </label>
          <label>New password <span className="hint">(at least 8 characters)</span>
            <input type="password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          </label>
          <label>Confirm new password
            <input type="password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </label>
          <button className="btn btn-primary" disabled={pwBusy}>{pwBusy ? 'Updating…' : 'Update password'}</button>
        </form>
      </div>
    </div>
  );
}
