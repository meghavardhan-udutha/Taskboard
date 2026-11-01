import { mean } from './models.js';

const DAY = 86400000;
export const MIN_TASKS = 30; // minimum finished tasks before a model is trained
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export const sumMinutes = (t) => (t.timeLogs || []).reduce((s, l) => s + l.minutes, 0);
const firstAssignee = (t) => (t.assignees?.[0] ? String(t.assignees[0]) : null);
const prioDummies = (p) => [p === 'low' ? 1 : 0, p === 'high' ? 1 : 0, p === 'urgent' ? 1 : 0];

// Everything below uses only information that existed when the task was created.
// "Before" statistics come from tasks that were already finished at that moment (no leakage).

function finishedBefore(all, t, doneIds) {
  const at = new Date(t.createdAt).getTime();
  return all.filter((o) => o._id !== t._id && o.completedAt && doneIds.has(String(o.list)) && new Date(o.completedAt).getTime() <= at);
}

export function assigneeRatioBefore(history, t) {
  const a = firstAssignee(t);
  const mine = history.filter((o) => firstAssignee(o) === a && o.estimateMinutes > 0 && sumMinutes(o) > 0);
  const ratios = mine.map((o) => Math.log(sumMinutes(o) / o.estimateMinutes));
  const m = 3; // shrink toward 0 (= "estimates are accurate") until the person has enough history
  return (ratios.reduce((s, v) => s + v, 0)) / (ratios.length + m);
}

export function assigneeLateRateBefore(history, t, prior) {
  const a = firstAssignee(t);
  const mine = history.filter((o) => firstAssignee(o) === a && o.dueDate);
  const late = mine.filter((o) => isLate(o)).length;
  const m = 3;
  return (late + m * prior) / (mine.length + m);
}

export const isLate = (t) => !!(t.dueDate && t.completedAt && new Date(t.completedAt).getTime() > new Date(t.dueDate).getTime() + DAY);

function openLoadAt(all, t) {
  const a = firstAssignee(t);
  if (!a) return 0;
  const at = new Date(t.createdAt).getTime();
  return all.filter(
    (o) => o._id !== t._id && firstAssignee(o) === a && new Date(o.createdAt).getTime() <= at && (!o.completedAt || new Date(o.completedAt).getTime() > at)
  ).length;
}

export const DURATION_FEATURES = ['log estimate', 'priority low', 'priority high', 'priority urgent', 'labels', 'description length', 'blockers', 'assignee past estimate error'];

export function durationFeatures(all, t, doneIds) {
  const hist = finishedBefore(all, t, doneIds);
  return [
    Math.log(Math.max(t.estimateMinutes, 1)),
    ...prioDummies(t.priority),
    (t.labels || []).length,
    Math.min((t.description || '').length / 200, 5),
    (t.blockedBy || []).length,
    assigneeRatioBefore(hist, t),
  ];
}

export const LATE_FEATURES = ['estimate (hours)', 'priority low', 'priority high', 'priority urgent', 'days from creation to due date', 'assignee open tasks at creation', 'assignee past late rate', 'blockers'];

export function lateFeatures(all, t, doneIds) {
  const hist = finishedBefore(all, t, doneIds);
  const withDue = hist.filter((o) => o.dueDate);
  const prior = withDue.length ? withDue.filter(isLate).length / withDue.length : 0.3;
  const lead = (new Date(t.dueDate).getTime() - new Date(t.createdAt).getTime()) / DAY;
  return [
    (t.estimateMinutes || 0) / 60,
    ...prioDummies(t.priority),
    Math.max(Math.min(lead, 60), -5),
    openLoadAt(all, t),
    assigneeLateRateBefore(hist, t, prior),
    (t.blockedBy || []).length,
  ];
}

export { mean };
