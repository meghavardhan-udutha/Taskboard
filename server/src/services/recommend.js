import Task from '../models/Task.js';
import { sumMinutes } from './ml/features.js';

const DAY = 86400000;
const PRIO = { urgent: 40, high: 25, medium: 10, low: 0 };

// Rule-based suggestions. Each one carries the reasons that produced it.
export async function recommend(project, analysis, members) {
  const all = await Task.find({ project: project._id }).lean();
  const doneIds = new Set(project.lists.filter((l) => l.isDone).map((l) => String(l._id)));
  const open = all.filter((t) => !doneIds.has(String(t.list)));
  const done = all.filter((t) => doneIds.has(String(t.list)));
  const now = Date.now();
  const predById = new Map(analysis.predictions.map((p) => [p.taskId, p]));
  const isOpen = (id) => open.some((t) => String(t._id) === String(id));

  const blocksCount = (t) => open.filter((o) => (o.blockedBy || []).some((b) => String(b) === String(t._id))).length;
  const isBlocked = (t) => (t.blockedBy || []).some((b) => isOpen(b));

  const ranked = open
    .filter((t) => !isBlocked(t))
    .map((t) => {
      const reasons = [];
      let score = PRIO[t.priority] ?? 10;
      if (t.priority === 'urgent' || t.priority === 'high') reasons.push(`${t.priority} priority`);
      if (t.dueDate) {
        const days = (new Date(t.dueDate).getTime() + DAY - now) / DAY;
        if (days < 0) { score += 30; reasons.push('overdue'); }
        else if (days <= 2) { score += 20; reasons.push('due within 2 days'); }
        else if (days <= 7) { score += 10; reasons.push('due this week'); }
      }
      const b = blocksCount(t);
      if (b) { score += 8 * b; reasons.push(`blocks ${b} other ${b === 1 ? 'task' : 'tasks'}`); }
      const risk = predById.get(String(t._id))?.late;
      if (risk) { score += risk.probability * 20; if (risk.level !== 'low') reasons.push(`${risk.level} predicted risk of finishing late`); }
      return { taskId: String(t._id), number: t.number, title: t.title, score: Math.round(score), reasons };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  // Workload: remaining minutes per person (predicted when available, otherwise the estimate).
  const load = new Map(members.map((m) => [String(m._id), { name: m.name, minutes: 0, tasks: [] }]));
  open.forEach((t) => {
    const a = String(t.assignees?.[0] || '');
    if (!load.has(a)) return;
    const mins = predById.get(String(t._id))?.duration?.minutes ?? t.estimateMinutes ?? 0;
    const row = load.get(a);
    row.minutes += mins;
    row.tasks.push({ id: String(t._id), number: t.number, title: t.title, priority: t.priority, minutes: mins });
  });
  const rows = [...load.entries()].map(([id, v]) => ({ userId: id, ...v }));
  const avg = rows.length ? rows.reduce((s, r) => s + r.minutes, 0) / rows.length : 0;
  const suggestions = [];
  const lightest = [...rows].sort((a, b) => a.minutes - b.minutes)[0];
  rows.filter((r) => avg > 0 && r.minutes > 1.5 * avg && r.tasks.length >= 2 && r.userId !== lightest?.userId).forEach((r) => {
    const t = [...r.tasks].sort((a, b) => (PRIO[a.priority] - PRIO[b.priority]) || b.minutes - a.minutes)[0];
    suggestions.push({
      taskId: t.id, title: t.title, from: r.name, to: lightest.name,
      reason: `${r.name} has about ${Math.round(r.minutes / 60)}h of open work, ${Math.round(r.minutes / avg * 10) / 10}x the team average of ${Math.round(avg / 60)}h. ${lightest.name} has the least (${Math.round(lightest.minutes / 60)}h).`,
    });
  });

  // Rework: finished tasks that were reopened.
  const reopened = done.filter((t) => t.reopenCount > 0);
  const byPerson = new Map();
  done.forEach((t) => {
    const a = String(t.assignees?.[0] || '');
    if (!load.has(a)) return;
    const v = byPerson.get(a) || { done: 0, reopened: 0 };
    v.done++;
    if (t.reopenCount > 0) v.reopened++;
    byPerson.set(a, v);
  });
  const rework = {
    reopenedTasks: reopened.length,
    finishedTasks: done.length,
    rate: done.length ? Math.round((reopened.length / done.length) * 100) / 100 : null,
    byPerson: [...byPerson.entries()]
      .map(([id, v]) => ({ name: load.get(id).name, finished: v.done, reopened: v.reopened, rate: Math.round((v.reopened / v.done) * 100) / 100 }))
      .filter((r) => r.finished >= 5),
  };

  const blockedByOverdue = open
    .filter((t) => (t.blockedBy || []).some((b) => open.find((o) => String(o._id) === String(b) && o.dueDate && new Date(o.dueDate).getTime() + DAY < now)))
    .map((t) => ({ taskId: String(t._id), number: t.number, title: t.title }));

  return { nextUp: ranked, workload: rows.map(({ tasks, ...r }) => ({ ...r, openTasks: tasks.length })), rebalance: suggestions, rework, blockedByOverdue, method: 'Rule-based scoring. The reasons listed are the exact rules that fired.' };
}

export function buildSummary(project, analysis, rec, counts) {
  const parts = [];
  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
  parts.push(`${counts.done} of ${counts.total} tasks are done (${pct}%). ${counts.open} are open${counts.overdue ? `, ${counts.overdue} of them overdue` : ''}.`);
  if (analysis.forecast.available) {
    const f = analysis.forecast.finishBy;
    parts.push(`At the recent pace the open work should be finished around ${new Date(f.typical).toDateString()} (between ${new Date(f.best).toDateString()} and ${new Date(f.worst).toDateString()}).`);
  } else parts.push(`No finish forecast yet: ${analysis.forecast.reason}`);
  const high = analysis.predictions.filter((p) => p.late?.level === 'high');
  if (high.length) parts.push(`${high.length} open ${high.length === 1 ? 'task is' : 'tasks are'} at high predicted risk of finishing late: ${high.slice(0, 3).map((h) => h.title).join(', ')}.`);
  if (rec.rebalance[0]) parts.push(rec.rebalance[0].reason);
  if (rec.nextUp[0]) parts.push(`Suggested next task: "${rec.nextUp[0].title}" (${rec.nextUp[0].reasons.join(', ') || 'highest score'}).`);
  if (rec.rework.rate != null && rec.rework.rate >= 0.1) parts.push(`${Math.round(rec.rework.rate * 100)}% of finished tasks were reopened, which points to rework.`);
  if (analysis.isSynthetic) parts.push('Note: this project contains synthetic sample data.');
  return parts.join(' ');
}

export async function llm(system, user) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 700, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`The AI service answered ${res.status}.`);
  const data = await res.json();
  return data.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || null;
}

export { sumMinutes };
