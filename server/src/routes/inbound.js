import { Router } from 'express';
import crypto from 'crypto';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Activity from '../models/Activity.js';
import { wrap } from '../middleware/error.js';
import { createTask, moveTask } from '../services/taskService.js';
import { emitProjectChange } from '../socket.js';
import { notifyProject } from '../services/notify.js';
import { hashKey } from './integrations.js';

const router = Router();
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

async function systemLog(project, source, message) {
  await Activity.create({ project: project._id, user: project.owner, message: `(via ${source}) ${message}` });
  emitProjectChange(String(project._id), 'tasks');
  notifyProject(project, { kind: 'integration', actorName: source, message });
}

// ---------- GitHub: pull requests and pushes that mention TB-<number> ----------
const REF = /\bTB-(\d+)\b/gi;
const CLOSES = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+TB-(\d+)\b/gi;
const nums = (text, re) => [...String(text || '').matchAll(re)].map((m) => Number(m[1]));

router.post('/github/:projectId', wrap(async (req, res) => {
  const project = await Project.findById(req.params.projectId);
  const secret = project?.integrations?.githubSecret;
  if (!project || !secret) return res.status(404).json({ message: 'Not found.' });
  const sig = req.headers['x-hub-signature-256'] || '';
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody || Buffer.alloc(0)).digest('hex');
  if (!safeEqual(sig, expected)) return res.status(401).json({ message: 'Signature does not match.' });

  const event = req.headers['x-github-event'];
  const body = req.body;
  if (event === 'ping') return res.json({ ok: true, message: 'pong' });
  const handled = [];
  const doneList = project.lists.find((l) => l.isDone);
  const find = (n) => Task.findOne({ project: project._id, number: n });

  if (event === 'pull_request') {
    const pr = body.pull_request;
    const text = `${pr.title}\n${pr.body || ''}\n${pr.head?.ref || ''}`;
    const state = pr.merged ? 'merged' : pr.state;
    const closing = new Set(nums(text, CLOSES));
    for (const n of new Set(nums(text, REF))) {
      const task = await find(n);
      if (!task) continue;
      const existing = task.links.find((l) => l.url === pr.html_url);
      if (existing) { existing.state = state; existing.title = pr.title; }
      else task.links.push({ kind: 'github', title: `PR #${pr.number}: ${pr.title}`, url: pr.html_url, state });
      let moved = false;
      if (pr.merged && closing.has(n) && doneList && String(task.list) !== String(doneList._id)) {
        await task.save();
        const r = await moveTask(project, task, doneList, 0);
        moved = r.ok;
      } else await task.save();
      await systemLog(project, 'GitHub', `PR #${pr.number} ${state} for TB-${n}${moved ? `, task moved to ${doneList.title}` : ''}`);
      handled.push({ task: n, moved });
    }
  } else if (event === 'push') {
    for (const c of body.commits || []) {
      for (const n of new Set(nums(c.message, REF))) {
        const task = await find(n);
        if (!task) continue;
        if (!task.links.some((l) => l.url === c.url)) task.links.push({ kind: 'github', title: `Commit ${String(c.id).slice(0, 7)}: ${c.message.split('\n')[0]}`.slice(0, 200), url: c.url, state: 'committed' });
        await task.save();
        await systemLog(project, 'GitHub', `commit ${String(c.id).slice(0, 7)} mentions TB-${n}`);
        handled.push({ task: n });
      }
    }
  } else return res.json({ ok: true, ignored: event });
  res.json({ ok: true, handled });
}));

// ---------- Email to task: a mail service forwards each message here as JSON or form data ----------
router.post('/email/:projectId/:secret', wrap(async (req, res) => {
  const project = await Project.findById(req.params.projectId);
  const secret = project?.integrations?.inboundEmailSecret;
  if (!project || !secret || !safeEqual(req.params.secret, secret)) return res.status(404).json({ message: 'Not found.' });
  const b = req.body || {};
  const subject = String(b.subject || b.Subject || '').trim().slice(0, 200);
  const text = String(b.text || b['body-plain'] || b.TextBody || '').trim().slice(0, 4500);
  const from = String(b.from || b.sender || b.From || '').slice(0, 200);
  if (!subject) return res.status(400).json({ message: 'The email has no subject.' });
  const owner = await User.findById(project.owner);
  const task = await createTask(project, owner, { title: subject, description: `${text}${from ? `\n\nFrom: ${from}` : ''}` }, 'email');
  await systemLog(project, 'Email', `created TB-${task.number} "${task.title}"`);
  res.status(201).json({ ok: true, task: { number: task.number, title: task.title } });
}));

// ---------- Calendar feed (iCalendar). Google Calendar can subscribe to this link ----------
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsDate = (d) => new Date(d).toISOString().slice(0, 10).replace(/-/g, '');

router.get('/calendar/:projectId/:file', wrap(async (req, res) => {
  const token = req.params.file.replace(/\.ics$/, '');
  const project = await Project.findById(req.params.projectId);
  const secret = project?.integrations?.calendarToken;
  if (!project || !secret || !safeEqual(token, secret)) return res.status(404).send('Not found');
  await project.populate('members', 'name');
  const names = new Map(project.members.map((m) => [String(m._id), m.name]));
  const doneIds = new Set(project.lists.filter((l) => l.isDone).map((l) => String(l._id)));
  const tasks = await Task.find({ project: project._id, dueDate: { $ne: null } }).lean();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Taskboard//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(project.name)} (Taskboard)`];
  tasks.forEach((t) => {
    const day = new Date(t.dueDate);
    const next = new Date(day.getTime() + 86400000);
    const who = (t.assignees || []).map((a) => names.get(String(a))).filter(Boolean).join(', ');
    lines.push(
      'BEGIN:VEVENT',
      `UID:task-${t._id}@taskboard`,
      `DTSTAMP:${new Date(t.updatedAt || Date.now()).toISOString().replace(/[-:]|\.\d{3}/g, '')}`,
      `DTSTART;VALUE=DATE:${icsDate(day)}`,
      `DTEND;VALUE=DATE:${icsDate(next)}`,
      `SUMMARY:${esc(`${doneIds.has(String(t.list)) ? '[Done] ' : ''}TB-${t.number} ${t.title}`)}`,
      `DESCRIPTION:${esc(`Priority: ${t.priority}${who ? `\nAssigned to: ${who}` : ''}`)}`,
      `STATUS:${doneIds.has(String(t.list)) ? 'CONFIRMED' : 'TENTATIVE'}`,
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  res.set('Content-Type', 'text/calendar; charset=utf-8').send(lines.join('\r\n'));
}));

export default router;

// ---------- Public API, authenticated with a project API key ----------
export const publicApi = Router();

publicApi.use(wrap(async (req, res, next) => {
  const m = (req.headers['x-api-key'] || '').match(/^tb_([0-9a-f]{8})_([0-9a-f]{32})$/);
  const project = m && (await Project.findOne({ 'integrations.apiKeyPrefix': m[1] }));
  if (!project || !safeEqual(hashKey(m[2]), project.integrations.apiKeyHash)) return res.status(401).json({ message: 'Invalid API key.' });
  req.project = project;
  next();
}));

publicApi.get('/tasks', wrap(async (req, res) => {
  const doneIds = new Set(req.project.lists.filter((l) => l.isDone).map((l) => String(l._id)));
  const tasks = await Task.find({ project: req.project._id }).sort({ number: 1 }).lean();
  res.json({
    tasks: tasks.map((t) => ({
      key: `TB-${t.number}`, title: t.title, priority: t.priority, labels: t.labels, dueDate: t.dueDate,
      estimateMinutes: t.estimateMinutes, done: doneIds.has(String(t.list)),
      list: req.project.lists.id(t.list)?.title,
    })),
  });
}));

publicApi.post('/tasks', wrap(async (req, res) => {
  const b = req.body || {};
  if (!String(b.title || '').trim()) return res.status(400).json({ message: 'title is required.' });
  const owner = await User.findById(req.project.owner);
  const list = req.project.lists.find((l) => l.title.toLowerCase() === String(b.list || '').toLowerCase());
  const task = await createTask(req.project, owner, { ...b, listId: list?._id }, 'api');
  await systemLog(req.project, 'API', `created TB-${task.number} "${task.title}"`);
  res.status(201).json({ key: `TB-${task.number}`, id: task._id });
}));
