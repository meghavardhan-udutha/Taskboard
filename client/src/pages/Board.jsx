import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import Avatar from '../components/Avatar.jsx';
import TaskModal from '../components/TaskModal.jsx';
import ListView from '../components/ListView.jsx';
import CalendarView from '../components/CalendarView.jsx';
import Insights from '../components/Insights.jsx';
import Chat from '../components/Chat.jsx';
import AIPanel from '../components/AIPanel.jsx';
import Integrations from '../components/Integrations.jsx';

export default function Board() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [activity, setActivity] = useState([]);
  const [online, setOnline] = useState([]);
  const [view, setView] = useState('board');
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [drag, setDrag] = useState(null);
  const [newList, setNewList] = useState('');
  const [memberEmail, setMemberEmail] = useState('');
  const [showTeam, setShowTeam] = useState(false);
  const [filter, setFilter] = useState({ mine: false, text: '' });
  const quickRefs = useRef({});
  const [unread, setUnread] = useState(0);
  const [analysis, setAnalysis] = useState(null);
  const [nl, setNl] = useState({ text: '', preview: null, error: '', busy: false });
  const viewRef = useRef('board');
  useEffect(() => { viewRef.current = view; if (view === 'chat') setUnread(0); }, [view]);

  const meId = useMemo(() => {
    try { return JSON.parse(atob(localStorage.getItem('taskboard_token').split('.')[1])).id; } catch { return null; }
  }, []);

  const load = useCallback(async () => {
    try {
      const [p, t, a] = await Promise.all([
        api(`/projects/${id}`),
        api(`/projects/${id}/tasks`),
        api(`/projects/${id}/activity`),
      ]);
      setProject(p.project);
      setIsOwner(p.isOwner);
      setTasks(t.tasks);
      setActivity(a.activity);
      setRefreshKey((k) => k + 1);
      setError('');
      api(`/projects/${id}/ai/analysis`).then(setAnalysis).catch(() => setAnalysis(null));
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const join = () => socket.emit('project:join', id);
    const onChange = () => load();
    const onPresence = (users) => setOnline(users);
    const onChat = (m) => { if (viewRef.current !== 'chat' && m.author?._id !== meId) setUnread((n) => n + 1); };
    socket.on('chat:message', onChat);
    socket.on('connect', join);
    socket.on('project:changed', onChange);
    socket.on('presence', onPresence);
    if (socket.connected) join();
    return () => {
      socket.emit('project:leave', id);
      socket.off('connect', join);
      socket.off('project:changed', onChange);
      socket.off('presence', onPresence);
      socket.off('chat:message', onChat);
    };
  }, [id, load, meId]);

  const visibleTasks = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!filter.mine || t.assignees.some((a) => a._id === meId)) &&
          (!filter.text || t.title.toLowerCase().includes(filter.text.toLowerCase()))
      ),
    [tasks, filter, meId]
  );

  const doneListIds = useMemo(() => new Set(project?.lists.filter((l) => l.isDone).map((l) => l._id)), [project]);
  const isBlocked = (t) =>
    !doneListIds.has(t.list) &&
    (t.blockedBy || []).some((bid) => {
      const b = tasks.find((x) => x._id === bid);
      return b && !doneListIds.has(b.list);
    });

  const act = async (fn) => {
    setNotice('');
    try {
      await fn();
      await load();
    } catch (e) {
      setNotice(e.message);
    }
  };

  const quickAdd = (e, listId) => {
    e.preventDefault();
    const input = quickRefs.current[listId];
    const title = input.value.trim();
    if (!title) return;
    act(async () => {
      await api(`/projects/${id}/tasks`, { method: 'POST', body: { title, listId } });
      input.value = '';
    });
  };

  const nlPreview = async (e) => {
    e.preventDefault();
    setNl((n) => ({ ...n, busy: true, error: '' }));
    try {
      const d = await api(`/projects/${id}/ai/parse-task`, { method: 'POST', body: { text: nl.text, preview: true } });
      setNl((n) => ({ ...n, preview: d.parsed, busy: false }));
    } catch (err) { setNl((n) => ({ ...n, error: err.message, busy: false })); }
  };
  const nlCreate = async () => {
    setNl((n) => ({ ...n, busy: true, error: '' }));
    try {
      await api(`/projects/${id}/ai/parse-task`, { method: 'POST', body: { text: nl.text } });
      setNl({ text: '', preview: null, error: '', busy: false });
      await load();
    } catch (err) { setNl((n) => ({ ...n, error: err.message, busy: false })); }
  };

  const riskOf = (taskId) => analysis?.predictions?.find((p) => p.taskId === taskId)?.late;

  const drop = (listId, index) => {
    if (!drag) return;
    const dragged = drag;
    setDrag(null);
    act(() => api(`/tasks/${dragged}/move`, { method: 'PUT', body: { listId, index } }));
  };

  const openTask = tasks.find((t) => t._id === openId);

  if (error && !project)
    return (
      <div className="empty">
        <h3>Can't open this project</h3>
        <p>{error}</p>
        <Link to="/" className="btn">Back to projects</Link>
      </div>
    );
  if (!project) return <p className="muted">Loading project…</p>;

  return (
    <div>
      <div className="board-head">
        <div>
          <h1>{project.name}</h1>
          {project.description && <p className="muted">{project.description}</p>}
        </div>
        <div className="board-tools">
          <div className="avatar-stack" aria-label="People online now">
            {online.map((u) => <Avatar key={u.id} user={u} size={28} />)}
          </div>
          <span className="muted">{online.length} online</span>
          <button className="btn" onClick={() => setShowTeam((s) => !s)}>Team</button>
        </div>
      </div>

      {notice && <div className="alert alert-error" role="alert">{notice}</div>}

      {showTeam && (
        <div className="panel">
          <h3>Team</h3>
          <ul className="plain-list">
            {project.members.map((m) => (
              <li key={m._id}>
                <span className="row"><Avatar user={m} size={24} /> {m.name} <span className="muted">{m.email}</span></span>
                {isOwner && m._id !== project.owner && (
                  <button className="btn btn-ghost" onClick={() => act(() => api(`/projects/${id}/members/${m._id}`, { method: 'DELETE' }))}>Remove</button>
                )}
              </li>
            ))}
          </ul>
          {isOwner && (
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); act(async () => { await api(`/projects/${id}/members`, { method: 'POST', body: { email: memberEmail } }); setMemberEmail(''); }); }}>
              <input type="email" required placeholder="Teammate's email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} />
              <button className="btn">Add member</button>
            </form>
          )}
          {isOwner && (
            <button className="btn btn-danger" onClick={() => { if (window.confirm('Delete this project and all its tasks?')) act(async () => { await api(`/projects/${id}`, { method: 'DELETE' }); navigate('/'); }); }}>Delete project</button>
          )}
        </div>
      )}

      <form className="panel nl-bar" onSubmit={nlPreview}>
        <input value={nl.text} onChange={(e) => setNl({ text: e.target.value, preview: null, error: '', busy: false })}
          placeholder='Quick add: "Fix login bug tomorrow high priority @ben #backend 2h"' aria-label="Describe a task in plain words" />
        <button className="btn" disabled={nl.busy || !nl.text.trim()}>Preview</button>
        {nl.error && <div className="alert alert-error nl-full">{nl.error}</div>}
        {nl.preview && (
          <div className="nl-preview nl-full">
            <span><b>{nl.preview.title}</b></span>
            {nl.preview.priority && <span className={`badge p-${nl.preview.priority}`}>{nl.preview.priority}</span>}
            {nl.preview.dueDate && <span className="badge">due {nl.preview.dueDate}</span>}
            {nl.preview.estimateMinutes > 0 && <span className="badge">{nl.preview.estimateMinutes} min</span>}
            {nl.preview.labels.map((l) => <span key={l} className="label">{l}</span>)}
            {nl.preview.assigneeNames.map((n) => <span key={n} className="badge">{n}</span>)}
            {nl.preview.unmatched.length > 0 && <span className="text-danger small">No teammate matches @{nl.preview.unmatched.join(', @')}</span>}
            <button type="button" className="btn btn-primary" disabled={nl.busy} onClick={nlCreate}>Create task</button>
            <span className="muted small">Read by pattern matching, so check it looks right.</span>
          </div>
        )}
      </form>

      <div className="toolbar">
        <div className="tabs" role="tablist">
          {['board', 'list', 'calendar', 'chat', 'insights', 'ai', 'activity', ...(isOwner ? ['integrations'] : [])].map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'tab tab-on' : 'tab'} onClick={() => setView(v)}>
              {v === 'ai' ? 'AI' : v[0].toUpperCase() + v.slice(1)}{v === 'chat' && unread > 0 && <span className="unread">{unread}</span>}
            </button>
          ))}
        </div>
        <div className="row">
          <input placeholder="Search tasks" value={filter.text} onChange={(e) => setFilter({ ...filter, text: e.target.value })} />
          <label className="check"><input type="checkbox" checked={filter.mine} onChange={(e) => setFilter({ ...filter, mine: e.target.checked })} /> Only mine</label>
        </div>
      </div>

      {view === 'board' && (
        <div className="board">
          {project.lists.map((list) => {
            const items = visibleTasks.filter((t) => t.list === list._id);
            return (
              <div key={list._id} className="column" onDragOver={(e) => e.preventDefault()} onDrop={() => drop(list._id, items.length)}>
                <div className="column-head">
                  <h3>{list.title} <span className="count">{items.length}</span></h3>
                  {list.isDone && <span className="badge done-badge">Counts as done</span>}
                  <button className="btn btn-ghost" onClick={() => { const t = window.prompt('Rename list', list.title); if (t) act(() => api(`/projects/${id}/lists/${list._id}`, { method: 'PUT', body: { title: t } })); }}>Rename</button>
                  <button className="btn btn-ghost" onClick={() => { if (window.confirm(`Delete the list "${list.title}"?`)) act(() => api(`/projects/${id}/lists/${list._id}`, { method: 'DELETE' })); }}>Delete</button>
                </div>
                {items.length === 0 && <p className="muted small">Nothing here yet. Drag a task in or add one below.</p>}
                {items.map((t, i) => (
                  <div
                    key={t._id}
                    className={`card p-border-${t.priority} ${drag === t._id ? 'dragging' : ''}`}
                    draggable
                    onDragStart={() => setDrag(t._id)}
                    onDragEnd={() => setDrag(null)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.stopPropagation(); drop(list._id, i); }}
                    onClick={() => setOpenId(t._id)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setOpenId(t._id)}
                  >
                    <div className="card-title"><span className="task-key">TB-{t.number}</span> {t.title}</div>
                    {t.labels.length > 0 && <div className="labels">{t.labels.map((l) => <span key={l} className="label">{l}</span>)}</div>}
                    <div className="card-foot">
                      <span className={`badge p-${t.priority}`}>{t.priority}</span>
                      {t.dueDate && <span className={new Date(t.dueDate) < new Date() && !list.isDone ? 'text-danger small' : 'muted small'}>Due {new Date(t.dueDate).toLocaleDateString()}</span>}
                      {isBlocked(t) && <span className="badge blocked">Blocked</span>}
                      {!list.isDone && riskOf(t._id) && riskOf(t._id).level !== 'low' && <span className={`badge risk-${riskOf(t._id).level}`} title="Predicted risk of finishing late">{riskOf(t._id).level} late risk</span>}
                      {t.comments.length > 0 && <span className="muted small">{t.comments.length} comments</span>}
                      <div className="avatar-stack">{t.assignees.map((a) => <Avatar key={a._id} user={a} size={22} />)}</div>
                    </div>
                  </div>
                ))}
                <form className="quick-add" onSubmit={(e) => quickAdd(e, list._id)}>
                  <input ref={(el) => (quickRefs.current[list._id] = el)} placeholder="Add a task" aria-label={`Add a task to ${list.title}`} />
                </form>
              </div>
            );
          })}
          <form className="column column-new" onSubmit={(e) => { e.preventDefault(); if (!newList.trim()) return; act(async () => { await api(`/projects/${id}/lists`, { method: 'POST', body: { title: newList } }); setNewList(''); }); }}>
            <input placeholder="New list name" value={newList} onChange={(e) => setNewList(e.target.value)} />
            <button className="btn">Add list</button>
          </form>
        </div>
      )}

      {view === 'list' && <ListView tasks={visibleTasks} lists={project.lists} onOpen={(t) => setOpenId(t._id)} />}
      {view === 'calendar' && <CalendarView tasks={visibleTasks} onOpen={(t) => setOpenId(t._id)} />}
      {view === 'chat' && <Chat projectId={id} meId={meId} />}
      {view === 'ai' && <AIPanel projectId={id} refreshKey={refreshKey} onOpen={(tid) => setOpenId(tid)} />}
      {view === 'integrations' && isOwner && <Integrations projectId={id} />}
      {view === 'insights' && <Insights projectId={id} refreshKey={refreshKey} />}
      {view === 'activity' && (
        <div className="panel">
          {activity.length === 0 && <p className="muted">No activity yet.</p>}
          <ul className="plain-list">
            {activity.map((a) => (
              <li key={a._id}>
                <span><b>{a.user?.name}</b> {a.message}</span>
                <span className="muted small">{new Date(a.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {openTask && (
        <TaskModal key={openTask._id} task={openTask} project={project} tasks={tasks} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </div>
  );
}
