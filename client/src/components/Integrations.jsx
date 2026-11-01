import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Integrations({ projectId }) {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({ slackWebhookUrl: '', discordWebhookUrl: '', webhookUrls: '', githubRepo: '' });
  const [msg, setMsg] = useState(null);
  const [newKey, setNewKey] = useState('');
  const [busy, setBusy] = useState(false);
  const path = `/projects/${projectId}/integrations`;

  const adopt = (c) => {
    setCfg(c);
    setForm({ slackWebhookUrl: c.slackWebhookUrl, discordWebhookUrl: c.discordWebhookUrl, webhookUrls: c.webhookUrls.join('\n'), githubRepo: c.githubRepo });
  };
  useEffect(() => { api(path).then(adopt).catch((e) => setMsg({ type: 'error', text: e.message })); }, [path]);

  const run = async (fn, ok) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg({ type: 'success', text: ok }); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
    setBusy(false);
  };

  if (!cfg) return msg ? <div className="alert alert-error">{msg.text}</div> : <p className="muted">Loading…</p>;
  const base = cfg.baseUrl || window.location.origin;
  const local = /localhost|127\.0\.0\.1/.test(base);
  const full = (p) => `${base}${p}`;

  const save = (e) => {
    e.preventDefault();
    run(async () => adopt(await api(path, { method: 'PUT', body: { ...form, webhookUrls: form.webhookUrls.split('\n').map((s) => s.trim()).filter(Boolean) } })), 'Saved.');
  };
  const secret = (kind) => run(async () => {
    const r = await api(`${path}/secrets/${kind}`, { method: 'POST' });
    if (r.newApiKey) setNewKey(r.newApiKey);
    adopt(r);
  });
  const revoke = (kind) => run(async () => { adopt(await api(`${path}/secrets/${kind}`, { method: 'DELETE' })); if (kind === 'apikey') setNewKey(''); }, 'Turned off.');
  const test = () => run(async () => {
    const r = await api(`${path}/test`, { method: 'POST' });
    const bad = r.results.filter((x) => !x.ok);
    if (bad.length) throw new Error(bad.map((b) => `${b.target}: ${b.error}`).join('; '));
    setMsg({ type: 'success', text: `Test message delivered to ${r.results.map((x) => x.target).join(', ')}.` });
  });

  return (
    <div>
      <p className="muted">Only the project owner can see and change these settings. Secrets below act like passwords.</p>
      {local && <div className="alert alert-warn" role="note">Your API address is <b>{base}</b>, which GitHub, email services and Google cannot reach. Deploy the API, or use a tunnel such as ngrok, then set <code>PUBLIC_URL</code> in <code>server/.env</code> so these links show the public address.</div>}
      {msg && <div className={`alert alert-${msg.type}`} role="status">{msg.text}</div>}

      <form className="panel form-stack" onSubmit={save}>
        <h3>Slack, Discord and webhooks</h3>
        <p className="muted small">Every activity line (task created, moved, commented…) is posted to the channels you connect.</p>
        <label>Slack incoming webhook <span className="hint">(https://hooks.slack.com/…)</span>
          <input value={form.slackWebhookUrl} onChange={(e) => setForm({ ...form, slackWebhookUrl: e.target.value })} /></label>
        <label>Discord webhook <span className="hint">(https://discord.com/api/webhooks/…)</span>
          <input value={form.discordWebhookUrl} onChange={(e) => setForm({ ...form, discordWebhookUrl: e.target.value })} /></label>
        <label>Other webhooks <span className="hint">(one https link per line, up to 5; receives JSON)</span>
          <textarea rows={3} value={form.webhookUrls} onChange={(e) => setForm({ ...form, webhookUrls: e.target.value })} /></label>
        <label>GitHub repository <span className="hint">(owner/name, for your reference)</span>
          <input value={form.githubRepo} onChange={(e) => setForm({ ...form, githubRepo: e.target.value })} /></label>
        <div className="row">
          <button className="btn btn-primary" disabled={busy}>Save</button>
          <button type="button" className="btn" disabled={busy} onClick={test}>Send test message</button>
        </div>
        {cfg.lastDelivery && <p className={cfg.lastDelivery.ok ? 'muted small' : 'text-danger small'}>Last delivery: {cfg.lastDelivery.ok ? 'worked' : `failed (${cfg.lastDelivery.error})`} · {cfg.lastDelivery.target} · {new Date(cfg.lastDelivery.at).toLocaleString()}</p>}
      </form>

      <div className="panel form-stack">
        <h3>GitHub</h3>
        <p className="muted small">GitHub tells Taskboard about pull requests and pushes. Mention a task as <code>TB-12</code> in a PR title, description, branch name or commit message and it is linked to that task. Write <code>closes TB-12</code> and merging the PR moves the task to your done list.</p>
        {!cfg.github ? <button className="btn" disabled={busy} onClick={() => secret('github')}>Turn on</button> : (
          <>
            <p className="small">In GitHub: repository Settings → Webhooks → Add webhook.</p>
            <label>Payload URL<input readOnly value={full(cfg.github.path)} onFocus={(e) => e.target.select()} /></label>
            <label>Secret<input readOnly value={cfg.github.secret} onFocus={(e) => e.target.select()} /></label>
            <p className="muted small">Content type: application/json. Events: Pull requests and Pushes.</p>
            <div className="row"><button className="btn" disabled={busy} onClick={() => secret('github')}>New secret</button><button className="btn btn-danger" disabled={busy} onClick={() => revoke('github')}>Turn off</button></div>
          </>
        )}
      </div>

      <div className="panel form-stack">
        <h3>Google Calendar</h3>
        <p className="muted small">A read-only calendar feed of task due dates. Taskboard does not sign in to your Google account and cannot edit your calendar.</p>
        {!cfg.calendar ? <button className="btn" disabled={busy} onClick={() => secret('calendar')}>Create feed link</button> : (
          <>
            <label>Feed link<input readOnly value={full(cfg.calendar.path)} onFocus={(e) => e.target.select()} /></label>
            <p className="muted small">In Google Calendar: Other calendars → + → From URL, paste the link. Google refreshes subscribed calendars on its own schedule, so changes can take hours to appear. Anyone with the link can read the due dates.</p>
            <div className="row"><button className="btn" disabled={busy} onClick={() => secret('calendar')}>New link</button><button className="btn btn-danger" disabled={busy} onClick={() => revoke('calendar')}>Turn off</button></div>
          </>
        )}
      </div>

      <div className="panel form-stack">
        <h3>Email to task</h3>
        <p className="muted small">Point an inbound email service (for example Mailgun, SendGrid or Postmark inbound routing) at this link. Each email becomes a task: subject is the title, body is the description. Taskboard does not receive email itself.</p>
        {!cfg.email ? <button className="btn" disabled={busy} onClick={() => secret('email')}>Create link</button> : (
          <>
            <label>Webhook link<input readOnly value={full(cfg.email.path)} onFocus={(e) => e.target.select()} /></label>
            <div className="row"><button className="btn" disabled={busy} onClick={() => secret('email')}>New link</button><button className="btn btn-danger" disabled={busy} onClick={() => revoke('email')}>Turn off</button></div>
          </>
        )}
      </div>

      <div className="panel form-stack">
        <h3>Public API key</h3>
        <p className="muted small">Lets your own scripts list tasks and create tasks in this project. Send it in an <code>x-api-key</code> header.</p>
        {newKey && <div className="alert alert-success">Copy this key now. It is shown once and only a hash is kept.<input readOnly value={newKey} onFocus={(e) => e.target.select()} /></div>}
        {cfg.apiKey ? <p className="small">Active key starts with <code>tb_{cfg.apiKey.prefix}_</code></p> : <p className="muted small">No key yet.</p>}
        <pre className="code">{`# PowerShell\nInvoke-RestMethod -Uri "${full('/api/public/v1/tasks')}" -Headers @{ "x-api-key" = "YOUR_KEY" }\nInvoke-RestMethod -Method Post -Uri "${full('/api/public/v1/tasks')}" -Headers @{ "x-api-key" = "YOUR_KEY" } -ContentType "application/json" -Body '{"title":"Fix typo","priority":"low"}'`}</pre>
        <div className="row"><button className="btn" disabled={busy} onClick={() => secret('apikey')}>{cfg.apiKey ? 'Replace key' : 'Create key'}</button>{cfg.apiKey && <button className="btn btn-danger" disabled={busy} onClick={() => revoke('apikey')}>Revoke</button>}</div>
      </div>

      <div className="panel">
        <h3>Google Drive and other documents</h3>
        <p className="muted small">Open any task and use “Links” to attach a Google Drive, Docs or GitHub link. Taskboard does not browse your Drive.</p>
      </div>
    </div>
  );
}
