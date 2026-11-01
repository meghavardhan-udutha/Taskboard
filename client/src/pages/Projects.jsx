import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Projects() {
  const [projects, setProjects] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', description: '' });
  const [busy, setBusy] = useState(false);

  const load = () =>
    api('/projects').then((d) => setProjects(d.projects)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const makeSample = async () => {
    setBusy(true);
    setError('');
    try { await api('/projects/demo-history', { method: 'POST' }); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/projects', { method: 'POST', body: form });
      setForm({ name: '', description: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <h1>Projects</h1>
        <p className="muted">Open a project to see its board, or start a new one.</p>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}

      <form className="panel inline-form" onSubmit={create}>
        <input placeholder="New project name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="What is it for? (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button className="btn btn-primary" disabled={busy}>Create project</button>
      </form>

      <p className="muted small">
        Want to try the AI features before you have real history?{' '}
        <button className="btn btn-ghost link-btn" onClick={makeSample} disabled={busy}>Create a sample project with six months of synthetic history</button>
      </p>

      {projects === null && !error && <p className="muted">Loading projects…</p>}
      {projects?.length === 0 && (
        <div className="empty">
          <h3>No projects yet</h3>
          <p>Name your first project above. It starts with To do, In progress and Done lists.</p>
        </div>
      )}
      <div className="project-grid">
        {projects?.map((p) => {
          const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
          return (
            <Link key={p.id} to={`/projects/${p.id}`} className="project-card">
              <h3>{p.name}{p.isSynthetic && <span className="badge badge-sample">Sample data</span>}</h3>
              <p className="muted">{p.description || 'No description'}</p>
              <div className="progress" aria-label={`${pct}% complete`}><span style={{ width: `${pct}%` }} /></div>
              <div className="project-meta">
                <span>{p.done} of {p.total} tasks done</span>
                <span>{p.memberCount} {p.memberCount === 1 ? 'member' : 'members'}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
