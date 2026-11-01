// End-to-end check against a running API + MongoDB. Usage (PowerShell):
//   $env:API="http://localhost:5000/api"; $env:ALLOW_PRIVATE_WEBHOOKS="true" (set on the server too); node tests/e2e.mjs
import http from 'http';
import crypto from 'crypto';
import { io } from '../../client/node_modules/socket.io-client/build/esm-debug/index.js';

const B = process.env.API || 'http://localhost:5050/api';
const ORIGIN = B.replace(/\/api$/, '');
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL:', m)); };
const call = async (p, o = {}, t, headers = {}) => {
  const r = await fetch(B + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}), ...headers }, body: o.raw ?? (o.body ? JSON.stringify(o.body) : undefined) });
  const ct = r.headers.get('content-type') || '';
  return { s: r.status, d: ct.includes('json') ? await r.json() : await r.text() };
};
const uid = Math.random().toString(36).slice(2, 7);
const reg = async (name) => (await call('/auth/register', { method: 'POST', body: { name, email: `${name.toLowerCase()}${uid}@x.com`, password: 'password1' } })).d;
const A = await reg('Ana'), Bn = await reg('Ben'), Cy = await reg('Cy');
const ta = A.token, tb = Bn.token, tc = Cy.token;

// ---- 1. team permissions: a non-owner member can delete lists and change assignees
let r = await call('/projects', { method: 'POST', body: { name: 'Perm' } }, ta);
const pid = r.d.project._id; let lists = r.d.project.lists;
await call(`/projects/${pid}/members`, { method: 'POST', body: { email: `ben${uid}@x.com` } }, ta);
await call(`/projects/${pid}/members`, { method: 'POST', body: { email: `cy${uid}@x.com` } }, ta);
r = await call(`/projects/${pid}/lists`, { method: 'POST', body: { title: 'Scratch' } }, tb); ok(r.s === 201, 'member adds list');
const scratch = r.d.lists.at(-1)._id;
r = await call(`/projects/${pid}/lists/${scratch}`, { method: 'DELETE' }, tb); ok(r.s === 200, 'member (not owner) deletes list');
let t = (await call(`/projects/${pid}/tasks`, { method: 'POST', body: { title: 'Task A' } }, tb)).d.task;
ok(t.number === 1, 'task number 1');
r = await call(`/tasks/${t._id}`, { method: 'PUT', body: { assignees: [Cy.user.id] } }, tb); ok(r.s === 200 && r.d.task.assignees[0]._id === Cy.user.id, 'member assigns teammate');
r = await call(`/tasks/${t._id}`, { method: 'PUT', body: { assignees: [A.user.id, Bn.user.id] } }, tc); ok(r.s === 200 && r.d.task.assignees.length === 2, 'another member re-assigns');
r = await call(`/projects/${pid}`, { method: 'PUT', body: { name: 'Hijack' } }, tb); ok(r.s === 403, 'owner-only rename still protected');

r = await call(`/projects/${pid}`, {}, tb); ok(!('integrations' in r.d.project), 'member never receives integration secrets');
r = await call(`/projects/${pid}`, {}, ta); ok(!('integrations' in r.d.project), 'project payload has no integrations field');

// ---- 2. team chat
const outsider = await reg('Zed');
r = await call(`/projects/${pid}/messages`, { method: 'POST', body: { text: 'hi team' } }, tb); ok(r.s === 201 && r.d.message.author.name === 'Ben', 'member posts chat');
ok((await call(`/projects/${pid}/messages`, {}, outsider.token)).s === 403, 'outsider cannot read chat');
ok((await call(`/projects/${pid}/messages`, { method: 'POST', body: { text: 'let me in' } }, outsider.token)).s === 403, 'outsider cannot post chat');
ok((await call(`/projects/${pid}/messages`, { method: 'POST', body: { text: '   ' } }, ta)).s === 400, 'empty chat rejected');
r = await call(`/projects/${pid}/messages`, {}, tc); ok(r.d.messages.length === 1 && r.d.messages[0].text === 'hi team', 'member reads chat');
const got = [];
const sock = io(ORIGIN, { auth: { token: ta } }); await new Promise((x) => sock.on('connect', x));
sock.on('chat:message', (m) => got.push(m.text)); sock.emit('project:join', pid); await new Promise((x) => setTimeout(x, 300));
await call(`/projects/${pid}/messages`, { method: 'POST', body: { text: 'live one' } }, tb); await new Promise((x) => setTimeout(x, 300));
ok(got.includes('live one'), 'chat delivered live over socket');
const sockOut = io(ORIGIN, { auth: { token: outsider.token } }); await new Promise((x) => sockOut.on('connect', x));
const leaked = []; sockOut.on('chat:message', (m) => leaked.push(m)); sockOut.emit('project:join', pid); await new Promise((x) => setTimeout(x, 300));
await call(`/projects/${pid}/messages`, { method: 'POST', body: { text: 'secret' } }, tb); await new Promise((x) => setTimeout(x, 300));
ok(leaked.length === 0, 'outsider socket receives no chat');
sock.close(); sockOut.close();

// ---- 3. natural language task creation
r = await call(`/projects/${pid}/ai/parse-task`, { method: 'POST', body: { text: 'Fix login bug tomorrow high priority @ben #backend 2h', preview: true } }, ta);
ok(r.d.parsed.priority === 'high' && r.d.parsed.estimateMinutes === 120 && r.d.parsed.assigneeIds[0] === Bn.user.id, 'nl preview');
r = await call(`/projects/${pid}/ai/parse-task`, { method: 'POST', body: { text: 'Write docs friday 45m @cy' } }, ta);
ok(r.s === 201 && r.d.task.source === 'nlp' && r.d.task.assignees.length === 1, 'nl create ' + r.s + ' source=' + r.d.task?.source + ' assignees=' + r.d.task?.assignees?.length);

// ---- 4. ML: not enough history -> honest fallback
r = await call(`/projects/${pid}/ai/analysis`, {}, ta);
ok(r.d.duration.available === false && /at least 30/.test(r.d.duration.reason), 'small project: no model, explains why');
ok(r.d.late.available === false && r.d.forecast.available === false, 'small project: no late model, no forecast');

// ---- 5. ML: sample history
r = await call('/projects/demo-history', { method: 'POST' }, ta); ok(r.s === 201, 'create sample history');
const did = r.d.project._id;
ok((await call('/projects/demo-history', { method: 'POST' }, ta)).s === 409, 'one sample per user');
const t0 = Date.now();
r = await call(`/projects/${did}/ai/analysis`, {}, ta);
const an = r.d; console.log('analysis ms:', Date.now() - t0);
ok(an.isSynthetic && an.duration.available && an.late.available, 'models trained on sample history: ' + (an.late.reason || ''));
console.log('duration:', JSON.stringify({ chosen: an.duration.chosen, ...an.duration.metrics, drivers: an.duration.drivers }));
console.log('late:', JSON.stringify({ reliable: an.late.reliable, ...an.late.metrics, drivers: an.late.drivers }));
console.log('forecast:', JSON.stringify(an.forecast));
ok(an.duration.metrics.testSize > 30 && an.duration.metrics.trainSize > 100, 'chronological split sizes');
ok(an.duration.metrics.maeMinutes.model <= an.duration.metrics.maeMinutes.rawEstimate, 'duration model not worse than raw estimate on held-out tasks');
ok(an.late.available && an.late.metrics.auc > 0.5, 'late model above chance on held-out tasks: ' + JSON.stringify(an.late).slice(0, 300));
ok(an.predictions.length > 0 && an.predictions.every((p) => !p.duration || (p.duration.low <= p.duration.minutes && p.duration.minutes <= p.duration.high)), 'prediction ranges ordered');
ok(an.forecast.available && new Date(an.forecast.finishBy.best) <= new Date(an.forecast.finishBy.worst), 'forecast best <= worst');

r = await call(`/projects/${did}/ai/recommendations`, {}, ta);
ok(r.d.nextUp.length > 0 && r.d.nextUp[0].reasons !== undefined && r.d.workload.length === 4, 'recommendations');
console.log('rework:', JSON.stringify(r.d.rework));
r = await call(`/projects/${did}/ai/summary`, {}, ta); ok(r.d.source === 'template' && r.d.summary.includes('synthetic'), 'template summary flags synthetic data');
r = await call(`/projects/${did}/ai/ask`, { method: 'POST', body: { question: 'what is at risk?' } }, ta); ok(r.s === 503, 'ask needs API key (no key configured here)');
ok((await call(`/projects/${did}/ai/analysis`, {}, outsider.token)).s === 403, 'outsider cannot read analysis');

// ---- 6. integrations (owner only)
r = await call(`/projects/${pid}/integrations`, {}, tb); ok(r.s === 403, 'member cannot read integrations');
const received = [];
const srv = http.createServer((q, s) => { let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => { received.push(JSON.parse(b)); s.end('ok'); }); });
await new Promise((x) => srv.listen(0, '127.0.0.1', x));
const hook = `http://127.0.0.1:${srv.address().port}/hook`;
r = await call(`/projects/${pid}/integrations`, { method: 'PUT', body: { slackWebhookUrl: 'https://evil.example.com/x' } }, ta); ok(r.s === 400, 'slack url must be hooks.slack.com');
r = await call(`/projects/${pid}/integrations`, { method: 'PUT', body: { webhookUrls: [hook], githubRepo: 'ana/app' } }, ta); ok(r.s === 200 && r.d.webhookUrls[0] === hook, 'save webhook');
r = await call(`/projects/${pid}/integrations/test`, { method: 'POST' }, ta); ok(r.s === 200 && r.d.results[0].ok && received.some((m) => m.event === 'test'), 'test notification delivered');
await call(`/projects/${pid}/tasks`, { method: 'POST', body: { title: 'Triggers webhook' } }, ta); await new Promise((x) => setTimeout(x, 500));
ok(received.some((m) => m.event === 'tasks' && /Triggers webhook/.test(m.message)), 'activity forwarded to webhook');

// GitHub
r = await call(`/projects/${pid}/integrations/secrets/github`, { method: 'POST' }, ta); const gh = r.d.github;
const send = (event, payload, secret = gh.secret) => { const raw = JSON.stringify(payload); return call(gh.path.replace('/api', ''), { method: 'POST', raw }, null, { 'x-github-event': event, 'x-hub-signature-256': 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex') }); };
r = await send('ping', {}); ok(r.s === 200, 'github ping');
r = await send('ping', {}, 'wrong'); ok(r.s === 401, 'github bad signature rejected');
r = await send('pull_request', { pull_request: { number: 7, title: 'Add login (closes TB-1)', body: '', state: 'closed', merged: true, html_url: 'https://github.com/ana/app/pull/7', head: { ref: 'feat/x' } } });
ok(r.d.handled?.[0]?.moved === true, 'merged PR with "closes TB-1" moves task to done');
r = await call(`/projects/${pid}/tasks`, {}, ta); const t1 = r.d.tasks.find((x) => x.number === 1);
ok(t1.links[0]?.state === 'merged' && t1.completedAt, 'PR link stored and task completed');
r = await send('push', { commits: [{ id: 'abcdef123456', message: 'wip TB-2 refactor', url: 'https://github.com/ana/app/commit/abcdef1' }] });
ok(r.d.handled?.length === 1, 'push commit linked to task'); 

// Email
r = await call(`/projects/${pid}/integrations/secrets/email`, { method: 'POST' }, ta); const em = r.d.email.path.replace('/api', '');
r = await call(em, { method: 'POST', body: { subject: 'Customer asks for export', text: 'Please add CSV', from: 'c@acme.com' } }); ok(r.s === 201, 'email creates task');
r = await call(em + 'x', { method: 'POST', body: { subject: 'x' } }); ok(r.s === 404, 'email bad secret');

// Calendar
r = await call(`/projects/${pid}/integrations/secrets/calendar`, { method: 'POST' }, ta);
await call(`/projects/${pid}/tasks`, { method: 'POST', body: { title: 'Dated, with comma', dueDate: '2026-12-01' } }, ta);
r = await call(r.d.calendar.path.replace('/api', ''));
ok(r.s === 200 && r.d.startsWith('BEGIN:VCALENDAR') && r.d.includes('DTSTART;VALUE=DATE:20261201') && r.d.includes('Dated\\, with comma'), 'ics feed');
ok((await call(`/inbound/calendar/${pid}/wrong.ics`)).s === 404, 'ics bad token');

// Public API
r = await call(`/projects/${pid}/integrations/secrets/apikey`, { method: 'POST' }, ta); const key = r.d.newApiKey;
ok(/^tb_[0-9a-f]{8}_[0-9a-f]{32}$/.test(key), 'api key format');
r = await call(`/projects/${pid}/integrations`, {}, ta); ok(!JSON.stringify(r.d).includes(key.split('_')[2]), 'api key secret not stored/returned again');
r = await call('/public/v1/tasks', { method: 'POST', body: { title: 'From API', priority: 'high', list: 'To do' } }, null, { 'x-api-key': key }); ok(r.s === 201, 'public api create');
r = await call('/public/v1/tasks', {}, null, { 'x-api-key': key }); ok(r.d.tasks.some((x) => x.title === 'From API'), 'public api list');
ok((await call('/public/v1/tasks', {}, null, { 'x-api-key': key.slice(0, -1) + (key.endsWith('0') ? '1' : '0') })).s === 401, 'public api bad key');
r = await call(`/projects/${pid}/integrations/secrets/apikey`, { method: 'DELETE' }, ta);
ok((await call('/public/v1/tasks', {}, null, { 'x-api-key': key })).s === 401, 'revoked key stops working');
srv.close();

console.log(`passed ${pass}, failed ${fail}`); process.exit(fail ? 1 : 0);
