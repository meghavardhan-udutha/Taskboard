import { Router } from 'express';
import Task from '../models/Task.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';
import { getProjectFor, isDoneList, USER_FIELDS } from './helpers.js';
import { analyseProject } from '../services/ml/index.js';
import { recommend, buildSummary, llm } from '../services/recommend.js';
import { parseTaskText } from '../services/nlp.js';
import { createTask } from '../services/taskService.js';
import { log } from './helpers.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

async function context(req, res) {
  const project = await getProjectFor(req, res);
  if (!project) return null;
  await project.populate('members', USER_FIELDS);
  const analysis = await analyseProject(project);
  const rec = await recommend(project, analysis, project.members);
  const tasks = await Task.find({ project: project._id }).select('list dueDate').lean();
  const now = Date.now();
  const open = tasks.filter((t) => !isDoneList(project, t.list));
  const counts = {
    total: tasks.length,
    done: tasks.length - open.length,
    open: open.length,
    overdue: open.filter((t) => t.dueDate && new Date(t.dueDate).getTime() + 86400000 < now).length,
  };
  return { project, analysis, rec, counts };
}

router.get('/analysis', wrap(async (req, res) => {
  const c = await context(req, res);
  if (c) res.json(c.analysis);
}));

router.get('/recommendations', wrap(async (req, res) => {
  const c = await context(req, res);
  if (c) res.json(c.rec);
}));

router.get('/summary', wrap(async (req, res) => {
  const c = await context(req, res);
  if (!c) return;
  const text = buildSummary(c.project, c.analysis, c.rec, c.counts);
  let narrative = null;
  let notice = '';
  try {
    narrative = await llm(
      'You write short project status updates for a software team. Use only the facts given. Do not invent numbers, names or dates. Plain prose, under 120 words.',
      `Project: ${c.project.name}\nFacts:\n${text}`
    );
  } catch (e) {
    notice = e.message;
  }
  res.json({ summary: text, narrative, source: narrative ? 'llm' : 'template', notice, llmConfigured: !!process.env.ANTHROPIC_API_KEY });
}));

router.post('/ask', wrap(async (req, res) => {
  const c = await context(req, res);
  if (!c) return;
  const q = (req.body.question || '').trim();
  if (!q) return res.status(400).json({ message: 'Type a question first.' });
  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(503).json({ message: 'The assistant needs an ANTHROPIC_API_KEY in server/.env. Summary, forecast and recommendations work without it.' });
  const facts = JSON.stringify({ counts: c.counts, forecast: c.analysis.forecast, nextUp: c.rec.nextUp.slice(0, 5), workload: c.rec.workload, rebalance: c.rec.rebalance, rework: c.rec.rework, lateRiskTasks: c.analysis.predictions.filter((p) => p.late?.level === 'high').slice(0, 10), models: { duration: c.analysis.duration.available ? c.analysis.duration.metrics : c.analysis.duration.reason, late: c.analysis.late.available ? c.analysis.late.metrics : c.analysis.late.reason }, syntheticData: c.analysis.isSynthetic });
  try {
    const answer = await llm(
      'You are the assistant inside a project management tool. Answer only from the JSON facts provided. If the facts do not contain the answer, say so. Never invent numbers. Keep answers under 150 words.',
      `Facts:\n${facts}\n\nQuestion: ${q}`
    );
    res.json({ answer });
  } catch (e) {
    res.status(502).json({ message: e.message });
  }
}));

// Natural-language quick add. preview=true only parses.
router.post('/parse-task', wrap(async (req, res) => {
  const project = await getProjectFor(req, res);
  if (!project) return;
  await project.populate('members', USER_FIELDS);
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ message: 'Describe the task first.' });
  const parsed = parseTaskText(text, project.members);
  if (!parsed.title) return res.status(400).json({ message: 'Add a short title, for example "Fix login bug tomorrow high @ben".' });
  if (req.body.preview) return res.json({ parsed });
  const task = await createTask(project, req.user, {
    title: parsed.title, priority: parsed.priority, dueDate: parsed.dueDate, estimateMinutes: parsed.estimateMinutes,
    labels: parsed.labels, assignees: parsed.assigneeIds, listId: req.body.listId,
  }, 'nlp');
  await log(project, req.user, `created the task "${task.title}" from plain text`, 'tasks');
  res.status(201).json({ parsed, task });
}));

export default router;
