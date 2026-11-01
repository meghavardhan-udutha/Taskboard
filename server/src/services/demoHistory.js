import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import Activity from '../models/Activity.js';

// SYNTHETIC DATA. This simulates six months of a four-person team so the ML features have
// something to learn from. The relationships (who underestimates, how load causes lateness)
// are written into this generator, so accuracy measured on it says nothing about real teams.

const DAY = 86400000;
function rng(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

const TEAMMATES = [
  { name: 'Riya Menon (sample)', email: 'sample.riya@taskboard.invalid', bias: 0.3 },
  { name: 'Karthik Rao (sample)', email: 'sample.karthik@taskboard.invalid', bias: -0.1 },
  { name: 'Sana Iyer (sample)', email: 'sample.sana@taskboard.invalid', bias: 0.1 },
];
const TITLES = ['Fix login redirect', 'Design settings page', 'Write API tests', 'Optimise dashboard query', 'Update onboarding copy', 'Set up CI pipeline', 'Review pricing page', 'Migrate user table', 'Add export to CSV', 'Polish mobile layout', 'Investigate slow search', 'Draft release notes', 'Add audit log', 'Refactor notification module', 'Improve error messages'];
const LABELS = ['frontend', 'backend', 'design', 'bug', 'docs', 'infra'];

async function ensureTeammates() {
  const out = [];
  for (const t of TEAMMATES) {
    let u = await User.findOne({ email: t.email });
    if (!u) {
      u = await User.create({
        name: t.name,
        email: t.email,
        password: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 8), // nobody knows it: cannot sign in
        jobTitle: 'Sample teammate',
      });
    }
    out.push({ user: u, bias: t.bias });
  }
  return out;
}

export async function createDemoProject(owner, count = 220) {
  const r = rng(20261031);
  const mates = await ensureTeammates();
  const people = [{ user: owner, bias: -0.05 }, ...mates];
  const now = Date.now();

  const project = await Project.create({
    name: 'Sample project with 6 months of history',
    description: 'Synthetic data for trying the AI features. Not real work.',
    owner: owner._id,
    members: people.map((p) => p.user._id),
    lists: [{ title: 'To do' }, { title: 'In progress' }, { title: 'Done', isDone: true }],
    isSynthetic: true,
    taskCounter: count,
  });
  const [todo, doing, done] = project.lists;

  const rows = [];
  for (let i = 0; i < count; i++) {
    const created = now - 170 * DAY + (i / count) * 170 * DAY - r() * 0.5 * DAY;
    const who = people[Math.floor(r() * people.length)];
    const priority = r() < 0.12 ? 'urgent' : r() < 0.35 ? 'high' : r() < 0.8 ? 'medium' : 'low';
    const estimate = pick(r, [30, 60, 60, 90, 120, 180, 240, 360, 480]);
    const lead = 2 + Math.floor(r() * 10);
    const blockers = r() < 0.12 ? 1 : 0;

    // Open work for this person when the task is created (earlier rows only).
    const load = rows.filter((o) => o.who === who && o.created <= created && o.finish > created).length;

    const logRatio = who.bias + (priority === 'urgent' ? 0.15 : 0) + 0.1 * blockers + 0.25 * gauss(r);
    const actual = Math.max(10, Math.round(estimate * Math.exp(logRatio)));
    const workDays = actual / 240;
    const queueDays = 0.5 + load * 1.4 + r() * 3;
    const finish = created + (queueDays + workDays) * DAY;

    rows.push({ i, who, created, priority, estimate, lead, blockers, actual, finish, load });
  }

  const docs = rows.map((o) => {
    const isDone = o.finish <= now;
    const started = o.created + (o.finish - o.created - (o.actual / 240) * DAY);
    const logs = [];
    const parts = o.actual > 120 ? 2 : 1;
    for (let k = 0; k < parts; k++)
      logs.push({
        user: o.who.user._id,
        minutes: Math.max(1, Math.round(o.actual / parts)),
        loggedAt: new Date(Math.min(o.finish, started + ((k + 1) / parts) * (o.finish - started))),
      });
    const reopened = isDone && r() < (o.who.bias > 0.2 ? 0.14 : 0.06) ? 1 : 0;
    return {
      project: project._id,
      list: isDone ? done._id : r() < 0.5 ? doing._id : todo._id,
      number: o.i + 1,
      position: o.i,
      title: pick(r, TITLES),
      description: r() < 0.6 ? 'x'.repeat(Math.floor(r() * 400)) : '',
      priority: o.priority,
      assignees: [o.who.user._id],
      labels: r() < 0.7 ? [pick(r, LABELS)] : [],
      dueDate: new Date(Math.floor((o.created + o.lead * DAY) / DAY) * DAY),
      estimateMinutes: o.estimate,
      blockedBy: [],
      timeLogs: isDone ? logs : [],
      reopenCount: reopened,
      createdBy: owner._id,
      completedAt: isDone ? new Date(o.finish) : null,
      source: 'demo',
      createdAt: new Date(o.created),
      updatedAt: new Date(isDone ? o.finish : o.created),
    };
  });

  await Task.insertMany(docs, { timestamps: false });
  await Activity.create({ project: project._id, user: owner._id, message: 'generated sample history for trying the AI features' });
  return project;
}
