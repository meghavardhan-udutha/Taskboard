import Task from '../../models/Task.js';
import { auc, fitLogistic, fitRidge, mean, median, quantile } from './models.js';
import {
  DURATION_FEATURES, LATE_FEATURES, MIN_TASKS, durationFeatures, isLate, lateFeatures, sumMinutes,
} from './features.js';

const DAY = 86400000;
const cache = new Map(); // projectId -> { key, result }

const byCreated = (a, b) => new Date(a.createdAt) - new Date(b.createdAt);
const round = (n, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

function splitChrono(rows, frac = 0.7) {
  const cut = Math.floor(rows.length * frac);
  return [rows.slice(0, cut), rows.slice(cut)];
}

function trainDuration(all, doneIds) {
  const data = all
    .filter((t) => doneIds.has(String(t.list)) && t.completedAt && t.estimateMinutes > 0 && sumMinutes(t) > 0)
    .sort(byCreated);
  if (data.length < MIN_TASKS)
    return { available: false, have: data.length, need: MIN_TASKS, reason: `Needs at least ${MIN_TASKS} finished tasks that have both an estimate and logged time. This project has ${data.length}.` };

  const rows = data.map((t) => ({ t, x: durationFeatures(all, t, doneIds), y: Math.log(sumMinutes(t) / t.estimateMinutes) }));
  const [train, test] = splitChrono(rows);
  const model = fitRidge(train.map((r) => r.x), train.map((r) => r.y), 3);
  const baselineRatio = Math.exp(mean(train.map((r) => r.y)));

  const actual = test.map((r) => sumMinutes(r.t));
  const est = test.map((r) => r.t.estimateMinutes);
  const predModel = test.map((r) => r.t.estimateMinutes * Math.exp(model.predict(r.x)));
  const predBase = est.map((e) => e * baselineRatio);
  const mae = (p) => mean(p.map((v, i) => Math.abs(v - actual[i])));
  const within = (p) => mean(p.map((v, i) => (Math.abs(v - actual[i]) <= 0.25 * actual[i] ? 1 : 0)));
  const metrics = {
    testSize: test.length,
    trainSize: train.length,
    maeMinutes: { model: round(mae(predModel), 1), averageRatioBaseline: round(mae(predBase), 1), rawEstimate: round(mae(est), 1) },
    within25Percent: { model: round(within(predModel)), averageRatioBaseline: round(within(predBase)), rawEstimate: round(within(est)) },
  };
  // Pick whichever candidate had the lowest error on the held-out newer tasks.
  // The model must win by at least 3% to be used, otherwise a simpler rule is safer.
  const m = metrics.maeMinutes;
  const bestSimple = m.rawEstimate <= m.averageRatioBaseline ? 'estimate' : 'baseline';
  const chosen = m.model < Math.min(m.rawEstimate, m.averageRatioBaseline) * 0.97 ? 'model' : bestSimple;

  // Final model uses all finished tasks; interval width comes from residuals on that data.
  const full = fitRidge(rows.map((r) => r.x), rows.map((r) => r.y), 3);
  const sigma = Math.sqrt(mean(rows.map((r) => (r.y - full.predict(r.x)) ** 2)));
  const ratioAll = Math.exp(mean(rows.map((r) => r.y)));
  const sigmaBase = Math.sqrt(mean(rows.map((r) => (r.y - Math.log(ratioAll)) ** 2)));
  const sigmaEst = Math.sqrt(mean(rows.map((r) => r.y ** 2)));

  const drivers = full.w.slice(1).map((w, j) => ({ feature: DURATION_FEATURES[j], weight: round(w, 3) }))
    .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 4);

  return {
    available: true,
    chosen,
    note:
      chosen === 'model'
        ? 'The model beat both simple rules (your raw estimate, and estimate times the average overrun) on held-out newer tasks.'
        : chosen === 'estimate'
          ? 'The model did not beat simply trusting your estimates on newer tasks, so predictions equal the estimate. The range still shows how far off estimates usually are.'
          : 'The model did not clearly beat the simple average-overrun rule on newer tasks, so predictions use that rule.',
    metrics,
    drivers,
    predict: (all2, t) => {
      const lr = chosen === 'model' ? full.predict(durationFeatures(all2, t, doneIds)) : chosen === 'baseline' ? Math.log(ratioAll) : 0;
      const s = chosen === 'model' ? sigma : chosen === 'baseline' ? sigmaBase : sigmaEst;
      const p = t.estimateMinutes * Math.exp(lr);
      return { minutes: Math.round(p), low: Math.round(p * Math.exp(-1.28 * s)), high: Math.round(p * Math.exp(1.28 * s)) };
    },
  };
}

function trainLate(all, doneIds) {
  const data = all.filter((t) => doneIds.has(String(t.list)) && t.completedAt && t.dueDate).sort(byCreated);
  if (data.length < MIN_TASKS)
    return { available: false, have: data.length, need: MIN_TASKS, reason: `Needs at least ${MIN_TASKS} finished tasks that had a due date. This project has ${data.length}.` };

  const rows = data.map((t) => ({ t, x: lateFeatures(all, t, doneIds), y: isLate(t) ? 1 : 0 }));
  const [train, test] = splitChrono(rows);
  const pos = train.filter((r) => r.y).length;
  const testPos = test.filter((r) => r.y).length;
  if (pos < 5 || train.length - pos < 5)
    return { available: false, have: data.length, need: MIN_TASKS, reason: 'Needs at least 5 late and 5 on-time finished tasks in the training period. The history is too one-sided to learn from.' };

  const model = fitLogistic(train.map((r) => r.x), train.map((r) => r.y));
  const scores = test.map((r) => model.predict(r.x));
  const labels = test.map((r) => r.y);
  let tp = 0, fp = 0, fn = 0, tn = 0;
  scores.forEach((s, i) => {
    const p = s >= 0.5 ? 1 : 0;
    if (p && labels[i]) tp++; else if (p) fp++; else if (labels[i]) fn++; else tn++;
  });
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = tp + fn ? tp / (tp + fn) : null;
  const a = auc(scores, labels);
  const baseRate = testPos / test.length;
  const metrics = {
    testSize: test.length,
    trainSize: train.length,
    lateRateInTest: round(baseRate),
    accuracy: round((tp + tn) / test.length),
    majorityClassAccuracy: round(Math.max(baseRate, 1 - baseRate)),
    precision: round(precision),
    recall: round(recall),
    auc: round(a),
    brier: round(mean(scores.map((s, i) => (s - labels[i]) ** 2)), 3),
  };
  const reliable = a != null && a >= 0.65 && testPos >= 3 && test.length - testPos >= 3;

  const full = fitLogistic(rows.map((r) => r.x), rows.map((r) => r.y));
  const drivers = full.w.map((w, j) => ({ feature: LATE_FEATURES[j], weight: round(w, 3) }))
    .sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight)).slice(0, 4);

  return {
    available: true,
    reliable,
    note: reliable
      ? 'Late-risk scores ranked held-out newer tasks better than chance (AUC 0.65 or higher).'
      : 'The late-risk model did not separate late from on-time tasks well enough on newer tasks, so risk scores are hidden.',
    metrics,
    drivers,
    predict: (all2, t) => {
      const p = full.predict(lateFeatures(all2, t, doneIds));
      return { probability: round(p), level: p >= 0.6 ? 'high' : p >= 0.3 ? 'medium' : 'low' };
    },
  };
}

function velocity(all, doneIds, now) {
  const weeks = Array(8).fill(0);
  all.forEach((t) => {
    if (!t.completedAt || !doneIds.has(String(t.list))) return;
    const age = Math.floor((now - new Date(t.completedAt).getTime()) / (7 * DAY));
    if (age >= 0 && age < 8) weeks[age] += sumMinutes(t) || t.estimateMinutes || 0;
  });
  const active = weeks.filter((w) => w > 0);
  return { weeks, active };
}

// Trains on the project's own history. Results are cached until the task data changes.
export async function analyseProject(project) {
  const all = await Task.find({ project: project._id }).lean();
  const key = `${all.length}:${all.reduce((m, t) => Math.max(m, new Date(t.updatedAt).getTime()), 0)}`;
  const hit = cache.get(String(project._id));
  if (hit?.key === key) return hit.result;

  const doneIds = new Set(project.lists.filter((l) => l.isDone).map((l) => String(l._id)));
  const finished = all.filter((t) => doneIds.has(String(t.list)) && t.completedAt);
  const duration = trainDuration(all, doneIds);
  const late = trainLate(all, doneIds);

  const now = Date.now();
  const open = all.filter((t) => !doneIds.has(String(t.list)));
  const medianActual = median(finished.map(sumMinutes).filter((m) => m > 0)) || 60;

  const predictions = open.map((t) => {
    const out = { taskId: String(t._id), number: t.number, title: t.title, dueDate: t.dueDate, duration: null, late: null };
    if (duration.available && t.estimateMinutes > 0) out.duration = duration.predict(all, t);
    if (late.available && late.reliable && t.dueDate) out.late = late.predict(all, t);
    return out;
  });

  // Throughput forecast: statistics from recent weekly output, not a trained model.
  const { weeks, active } = velocity(all, doneIds, now);
  const remaining = open.reduce((s, t, i) => s + (predictions[i].duration?.minutes ?? (t.estimateMinutes || medianActual)), 0);
  let forecast;
  if (active.length < 4) {
    forecast = { available: false, reason: `Needs output from at least 4 of the last 8 weeks. This project has ${active.length}.` };
  } else if (open.length === 0) {
    forecast = { available: false, reason: 'There are no open tasks.' };
  } else {
    const at = (perWeek) => new Date(now + (remaining / perWeek) * 7 * DAY).toISOString();
    forecast = {
      available: true,
      remainingMinutes: Math.round(remaining),
      weeklyMinutes: { slow: Math.round(quantile(active, 0.25)), typical: Math.round(median(active)), fast: Math.round(quantile(active, 0.75)) },
      finishBy: { best: at(quantile(active, 0.75)), typical: at(median(active)), worst: at(quantile(active, 0.25)) },
      method: 'Remaining predicted work divided by recent weekly output. Assumes the team keeps a similar pace and no new tasks are added.',
    };
  }

  const result = {
    isSynthetic: !!project.isSynthetic,
    finishedTasks: finished.length,
    minTasks: MIN_TASKS,
    duration: strip(duration),
    late: strip(late),
    predictions,
    forecast,
    weeklyOutputMinutes: weeks.slice().reverse(),
  };
  cache.set(String(project._id), { key, result });
  return result;
}

const strip = ({ predict, ...rest }) => rest;
