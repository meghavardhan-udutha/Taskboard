import { Router } from 'express';
import Project from '../models/Project.js';
import Task from '../models/Task.js';
import User from '../models/User.js';
import Activity from '../models/Activity.js';
import Message from '../models/Message.js';
import { emitToProject } from '../socket.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';
import { createDemoProject } from '../services/demoHistory.js';
import { createTask } from '../services/taskService.js';
import { getProjectFor, publicProject, populateTask, log, isDoneList, USER_FIELDS } from './helpers.js';

const router = Router();
router.use(requireAuth);

const DEFAULT_LISTS = [
  { title: 'To do' },
  { title: 'In progress' },
  { title: 'Done', isDone: true },
];

router.get(
  '/',
  wrap(async (req, res) => {
    const projects = await Project.find({ members: req.user._id }).sort({ updatedAt: -1 });
    const out = [];
    for (const p of projects) {
      const doneIds = p.lists.filter((l) => l.isDone).map((l) => l._id);
      const total = await Task.countDocuments({ project: p._id });
      const done = await Task.countDocuments({ project: p._id, list: { $in: doneIds } });
      out.push({
        id: p._id,
        name: p.name,
        description: p.description,
        memberCount: p.members.length,
        total,
        done,
        isOwner: String(p.owner) === String(req.user._id),
        isSynthetic: p.isSynthetic,
      });
    }
    res.json({ projects: out });
  })
);

router.post(
  '/',
  wrap(async (req, res) => {
    const { name, description } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Project name is required.' });
    const project = await Project.create({
      name,
      description,
      owner: req.user._id,
      members: [req.user._id],
      lists: DEFAULT_LISTS,
    });
    await log(project, req.user, `created the project "${project.name}"`);
    res.status(201).json({ project });
  })
);

// Creates a synthetic project with six months of history so the AI features can be tried.
router.post(
  '/demo-history',
  wrap(async (req, res) => {
    const existing = await Project.findOne({ owner: req.user._id, isSynthetic: true });
    if (existing) return res.status(409).json({ message: 'You already have a sample project. Open it from the list.' });
    const project = await createDemoProject(req.user);
    res.status(201).json({ project: publicProject(project) });
  })
);

router.get(
  '/:id',
  wrap(async (req, res) => {
    const project = await getProjectFor(req, res);
    if (!project) return;
    await project.populate('members', USER_FIELDS);
    res.json({ project: publicProject(project), isOwner: String(project.owner) === String(req.user._id) });
  })
);

router.put(
  '/:id',
  wrap(async (req, res) => {
    const project = await getProjectFor(req, res);
    if (!project) return;
    if (String(project.owner) !== String(req.user._id))
      return res.status(403).json({ message: 'Only the project owner can do that.' });
    if (req.body.name !== undefined) {
      if (!req.body.name.trim()) return res.status(400).json({ message: 'Project name is required.' });
      project.name = req.body.name;
    }
    if (req.body.description !== undefined) project.description = req.body.description;
    await project.save();
    await log(project, req.user, 'updated the project details');
    res.json({ project: publicProject(project) });
  })
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const project = await getProjectFor(req, res);
    if (!project) return;
    if (String(project.owner) !== String(req.user._id))
      return res.status(403).json({ message: 'Only the project owner can delete it.' });
    await Task.deleteMany({ project: project._id });
    await Message.deleteMany({ project: project._id });
    await Activity.deleteMany({ project: project._id });
    await project.deleteOne();
    res.json({ message: 'Project deleted.' });
  })
);

// Members
router.post(
  '/:id/members',
  wrap(async (req, res) => {
    const project = await getProjectFor(req, res);
    if (!project) return;
    if (String(project.owner) !== String(req.user._id))
      return res.status(403).json({ message: 'Only the project owner can add members.' });
    const user = await User.findOne({ email: (req.body.email || '').toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: 'No account uses that email. Ask them to register first.' });
    if (project.members.some((m) => String(m) === String(user._id)))
      return res.status(409).json({ message: `${user.name} is already a member.` });
    project.members.push(user._id);
    await project.save();
    await log(project, req.user, `added ${user.name} to the project`, 'members');
    res.json({ message: 'Member added.' });
  })
);

router.delete(
  '/:id/members/:userId',
  wrap(async (req, res) => {
    const project = await getProjectFor(req, res);
    if (!project) return;
    if (String(project.owner) !== String(req.user._id))
      return res.status(403).json({ message: 'Only the project owner can remove members.' });
    if (String(project.owner) === req.params.userId)
      return res.status(400).json({ message: 'The owner cannot be removed.' });
    project.members = project.members.filter((m) => String(m) !== req.params.userId);
    await project.save();
    await Task.updateMany({ project: project._id }, { $pull: { assignees: req.params.userId } });
    await log(project, req.user, 'removed a member from the project', 'members');
    res.json({ message: 'Member removed.' });
  })
);

// Lists
router.post(
  '/:id/lists',
  wrap(async (req, res) => {
    const project = await getProjectFor(req, res);
    if (!project) return;
    if (!req.body.title?.trim()) return res.status(400).json({ message: 'List name is required.' });
    project.lists.push({ title: req.body.title });
    await project.save();
    await log(project, req.user, `added the list "${req.body.title}"`, 'lists');
    res.status(201).json({ lists: project.lists });
  })
);

router.put(
  '/:id/lists/:listId',
  wrap(async (req, res) => {
    const project = await getProjectFor(req, res);
    if (!project) return;
    const list = project.lists.id(req.params.listId);
    if (!list) return res.status(404).json({ message: 'List not found.' });
    if (req.body.title !== undefined) {
      if (!req.body.title.trim()) return res.status(400).json({ message: 'List name is required.' });
      list.title = req.body.title;
    }
    if (req.body.isDone !== undefined) list.isDone = !!req.body.isDone;
    await project.save();
    await log(project, req.user, `updated the list "${list.title}"`, 'lists');
    res.json({ lists: project.lists });
  })
);

router.delete(
  '/:id/lists/:listId',
  wrap(async (req, res) => {
    const project = await getProjectFor(req, res);
    if (!project) return;
    const list = project.lists.id(req.params.listId);
    if (!list) return res.status(404).json({ message: 'List not found.' });
    if (project.lists.length === 1)
      return res.status(400).json({ message: 'A project needs at least one list.' });
    if (await Task.exists({ project: project._id, list: list._id }))
      return res.status(400).json({ message: 'Move or delete this list\'s tasks before deleting it.' });
    const title = list.title;
    list.deleteOne();
    await project.save();
    await log(project, req.user, `deleted the list "${title}"`, 'lists');
    res.json({ lists: project.lists });
  })
);

// Tasks in a project
router.get(
  '/:id/tasks',
  wrap(async (req, res) => {
    const project = await getProjectFor(req, res);
    if (!project) return;
    const tasks = await populateTask(Task.find({ project: project._id }).sort({ position: 1, createdAt: 1 }));
    res.json({ tasks });
  })
);

router.post(
  '/:id/tasks',
  wrap(async (req, res) => {
    const project = await getProjectFor(req, res);
    if (!project) return;
    if (!req.body.title?.trim()) return res.status(400).json({ message: 'Task title is required.' });
    const task = await createTask(project, req.user, req.body, 'web');
    await log(project, req.user, `created the task "${task.title}"`, 'tasks');
    res.status(201).json({ task: await populateTask(Task.findById(task._id)) });
  })
);

router.get(
  '/:id/activity',
  wrap(async (req, res) => {
    const project = await getProjectFor(req, res);
    if (!project) return;
    const activity = await Activity.find({ project: project._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('user', USER_FIELDS);
    res.json({ activity });
  })
);

// Team chat: visible to project members only (getProjectFor enforces membership).
router.get(
  '/:id/messages',
  wrap(async (req, res) => {
    const project = await getProjectFor(req, res);
    if (!project) return;
    const query = { project: project._id };
    if (req.query.before) query.createdAt = { $lt: new Date(req.query.before) };
    const messages = await Message.find(query).sort({ createdAt: -1 }).limit(50).populate('author', USER_FIELDS);
    res.json({ messages: messages.reverse(), hasMore: messages.length === 50 });
  })
);

router.post(
  '/:id/messages',
  wrap(async (req, res) => {
    const project = await getProjectFor(req, res);
    if (!project) return;
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Write a message first.' });
    if (text.length > 2000) return res.status(400).json({ message: 'Messages can be up to 2000 characters.' });
    const created = await Message.create({ project: project._id, author: req.user._id, text });
    const message = await Message.findById(created._id).populate('author', USER_FIELDS);
    emitToProject(String(project._id), 'chat:message', message);
    res.status(201).json({ message });
  })
);

// Statistics only: counts, sums and averages from this project's own tasks. No prediction.
router.get(
  '/:id/insights',
  wrap(async (req, res) => {
    const project = await getProjectFor(req, res);
    if (!project) return;
    await project.populate('members', 'name');
    const tasks = await Task.find({ project: project._id });
    const now = new Date();
    const open = tasks.filter((t) => !isDoneList(project, t.list));
    const done = tasks.filter((t) => isDoneList(project, t.list));
    const spent = (t) => t.timeLogs.reduce((s, l) => s + l.minutes, 0);

    const withBoth = done.filter((t) => t.estimateMinutes > 0 && spent(t) > 0);
    const estimated = withBoth.reduce((s, t) => s + t.estimateMinutes, 0);
    const actual = withBoth.reduce((s, t) => s + spent(t), 0);

    const workload = project.members.map((m) => {
      const mine = open.filter((t) => t.assignees.some((a) => String(a) === String(m._id)));
      return {
        userId: m._id,
        name: m.name,
        openTasks: mine.length,
        overdue: mine.filter((t) => t.dueDate && t.dueDate < now).length,
        estimateMinutes: mine.reduce((s, t) => s + t.estimateMinutes, 0),
      };
    });

    res.json({
      total: tasks.length,
      done: done.length,
      open: open.length,
      overdue: open.filter((t) => t.dueDate && t.dueDate < now).length,
      unassigned: open.filter((t) => t.assignees.length === 0).length,
      estimateAccuracy: {
        sampleSize: withBoth.length,
        estimatedMinutes: estimated,
        actualMinutes: actual,
      },
      workload,
      byList: project.lists.map((l) => ({
        listId: l._id,
        title: l.title,
        count: tasks.filter((t) => String(t.list) === String(l._id)).length,
      })),
    });
  })
);

export default router;
