import { useState } from 'react';
import { api } from '../api.js';
import Avatar from './Avatar.jsx';

const toDateInput = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export default function TaskModal({ task, project, tasks, onClose, onChanged }) {
  const [form, setForm] = useState({
    title: task.title,
    description: task.description || '',
    priority: task.priority,
    dueDate: toDateInput(task.dueDate),
    estimateMinutes: task.estimateMinutes || 0,
    labels: (task.labels || []).join(', '),
    assignees: task.assignees.map((a) => a._id),
    blockedBy: task.blockedBy || [],
  });
  const [current, setCurrent] = useState(task);
  const [comment, setComment] = useState('');
  const [time, setTime] = useState({ minutes: '', note: '' });
  const [link, setLink] = useState({ url: '', title: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const d = await api(`/tasks/${task._id}`, {
        method: 'PUT',
        body: {
          ...form,
          labels: form.labels.split(',').map((l) => l.trim()).filter(Boolean),
          dueDate: form.dueDate || null,
          estimateMinutes: Number(form.estimateMinutes) || 0,
        },
      });
      setCurrent(d.task);
      onChanged();
      onClose();
    });

  const remove = () => {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    run(async () => {
      await api(`/tasks/${task._id}`, { method: 'DELETE' });
      onChanged();
      onClose();
    });
  };

  const addComment = (e) => {
    e.preventDefault();
    run(async () => {
      const d = await api(`/tasks/${task._id}/comments`, { method: 'POST', body: { text: comment } });
      setCurrent(d.task);
      setComment('');
      onChanged();
    });
  };

  const addTime = (e) => {
    e.preventDefault();
    run(async () => {
      const d = await api(`/tasks/${task._id}/time`, { method: 'POST', body: time });
      setCurrent(d.task);
      setTime({ minutes: '', note: '' });
      onChanged();
    });
  };

  const addLink = (e) => {
    e.preventDefault();
    run(async () => {
      const d = await api(`/tasks/${task._id}/links`, { method: 'POST', body: link });
      setCurrent(d.task);
      setLink({ url: '', title: '' });
      onChanged();
    });
  };
  const removeLink = (id) =>
    run(async () => {
      const d = await api(`/tasks/${task._id}/links/${id}`, { method: 'DELETE' });
      setCurrent(d.task);
      onChanged();
    });

  const toggle = (key, id) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));

  const spent = current.timeLogs.reduce((s, l) => s + l.minutes, 0);
  const others = tasks.filter((t) => t._id !== task._id);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Task details">
        <div className="modal-head">
          <span className="task-key">TB-{task.number}</span>
          <input className="title-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Task title" />
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">Close</button>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}

        <div className="modal-body">
          <div className="form-stack">
            <label>Description
              <textarea rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </label>
            <div className="row">
              <label>Priority
                <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </label>
              <label>Due date
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </label>
              <label>Estimate (minutes)
                <input type="number" min="0" value={form.estimateMinutes} onChange={(e) => setForm({ ...form, estimateMinutes: e.target.value })} />
              </label>
            </div>
            <label>Labels <span className="hint">(comma separated)</span>
              <input value={form.labels} onChange={(e) => setForm({ ...form, labels: e.target.value })} />
            </label>
            <fieldset>
              <legend>Assigned to</legend>
              <div className="chips">
                {project.members.map((m) => (
                  <label key={m._id} className={`chip ${form.assignees.includes(m._id) ? 'chip-on' : ''}`}>
                    <input type="checkbox" checked={form.assignees.includes(m._id)} onChange={() => toggle('assignees', m._id)} />
                    <Avatar user={m} size={20} /> {m.name}
                  </label>
                ))}
              </div>
            </fieldset>
            {others.length > 0 && (
              <fieldset>
                <legend>Blocked by <span className="hint">(must be done before this one)</span></legend>
                <div className="chips">
                  {others.map((t) => (
                    <label key={t._id} className={`chip ${form.blockedBy.includes(t._id) ? 'chip-on' : ''}`}>
                      <input type="checkbox" checked={form.blockedBy.includes(t._id)} onChange={() => toggle('blockedBy', t._id)} />
                      {t.title}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <div className="row">
              <button className="btn btn-primary" disabled={busy} onClick={save}>Save task</button>
              <button className="btn btn-danger" disabled={busy} onClick={remove}>Delete task</button>
            </div>
          </div>

          <div className="side-col">
            <h4>Links</h4>
            <p className="muted small">Pull requests and commits that mention TB-{task.number} appear here automatically.</p>
            <ul className="plain-list small">
              {current.links.map((l) => (
                <li key={l._id}>
                  <span><span className="badge">{l.kind === 'drive' ? 'Drive' : l.kind === 'github' ? 'GitHub' : 'Link'}</span>{' '}
                    <a href={l.url} target="_blank" rel="noreferrer noopener">{l.title || l.url}</a>{l.state && <span className="muted"> · {l.state}</span>}</span>
                  <button className="btn btn-ghost" onClick={() => removeLink(l._id)}>Remove</button>
                </li>
              ))}
            </ul>
            <form className="row" onSubmit={addLink}>
              <input type="url" required placeholder="https://…" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} />
              <input placeholder="Name (optional)" value={link.title} onChange={(e) => setLink({ ...link, title: e.target.value })} />
              <button className="btn" disabled={busy}>Add link</button>
            </form>

            <h4>Time tracking</h4>
            <p className="muted">{spent} min logged{current.estimateMinutes ? ` of ${current.estimateMinutes} min estimated` : ''}</p>
            <form className="row" onSubmit={addTime}>
              <input type="number" min="1" max="1440" required placeholder="Minutes" value={time.minutes} onChange={(e) => setTime({ ...time, minutes: e.target.value })} />
              <input placeholder="Note (optional)" value={time.note} onChange={(e) => setTime({ ...time, note: e.target.value })} />
              <button className="btn" disabled={busy}>Log time</button>
            </form>
            <ul className="plain-list small">
              {current.timeLogs.map((l) => (
                <li key={l._id}><span>{l.user?.name}: {l.minutes} min {l.note && `· ${l.note}`}</span></li>
              ))}
            </ul>

            <h4>Comments</h4>
            {current.comments.length === 0 && <p className="muted">No comments yet.</p>}
            <ul className="comments">
              {current.comments.map((c) => (
                <li key={c._id}>
                  <Avatar user={c.author} size={24} />
                  <div>
                    <b>{c.author?.name}</b> <span className="muted">{new Date(c.createdAt).toLocaleString()}</span>
                    <p>{c.text}</p>
                  </div>
                </li>
              ))}
            </ul>
            <form className="form-stack" onSubmit={addComment}>
              <textarea rows={2} required placeholder="Write a comment" value={comment} onChange={(e) => setComment(e.target.value)} />
              <button className="btn" disabled={busy}>Post comment</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
