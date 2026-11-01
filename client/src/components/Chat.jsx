import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { getSocket } from '../socket.js';
import Avatar from './Avatar.jsx';

export default function Chat({ projectId, meId }) {
  const [messages, setMessages] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const stickRef = useRef(true);

  useEffect(() => {
    api(`/projects/${projectId}/messages`)
      .then((d) => { setMessages(d.messages); setHasMore(d.hasMore); })
      .catch((e) => setError(e.message));
  }, [projectId]);

  useEffect(() => {
    const socket = getSocket();
    const onMsg = (m) => setMessages((cur) => (cur && !cur.some((x) => x._id === m._id) ? [...cur, m] : cur));
    socket.on('chat:message', onMsg);
    return () => socket.off('chat:message', onMsg);
  }, [projectId]);

  useEffect(() => {
    if (stickRef.current) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const loadEarlier = useCallback(async () => {
    stickRef.current = false;
    try {
      const d = await api(`/projects/${projectId}/messages?before=${encodeURIComponent(messages[0].createdAt)}`);
      setMessages((cur) => [...d.messages, ...cur]);
      setHasMore(d.hasMore);
    } catch (e) {
      setError(e.message);
    }
  }, [projectId, messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setError('');
    stickRef.current = true;
    try {
      const d = await api(`/projects/${projectId}/messages`, { method: 'POST', body: { text } });
      setMessages((cur) => (cur.some((x) => x._id === d.message._id) ? cur : [...cur, d.message]));
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="panel chat">
      <p className="muted small">Only people on this project can see this chat.</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="chat-log" aria-live="polite">
        {hasMore && <button className="btn btn-ghost" onClick={loadEarlier}>Load earlier messages</button>}
        {messages === null && !error && <p className="muted">Loading messages…</p>}
        {messages?.length === 0 && <p className="muted">No messages yet. Say hello to your team.</p>}
        {messages?.map((m) => (
          <div key={m._id} className={`chat-msg ${m.author?._id === meId ? 'chat-mine' : ''}`}>
            <Avatar user={m.author} size={28} />
            <div className="chat-bubble">
              <div className="chat-meta"><b>{m.author?.name}</b> <span className="muted small">{new Date(m.createdAt).toLocaleString()}</span></div>
              <div className="chat-text">{m.text}</div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="chat-form" onSubmit={send}>
        <input value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Message your team" aria-label="Message your team" />
        <button className="btn btn-primary" disabled={sending || !text.trim()}>Send</button>
      </form>
    </div>
  );
}
