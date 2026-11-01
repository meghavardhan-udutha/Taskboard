import { Router } from 'express';
import Task from '../models/Task.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';
import { moveTask } from '../services/taskService.js';
import { getTaskFor, populateTask, log } from './helpers.js';

const router = Router();
router.use(requireAuth);

router.put(
  '/:id',
  wrap(async (req, res) => {
    const { task, project } = await getTaskFor(req, res);
    if (!task) return;
    const b = req.body;
    const memberIds = project.members.map(String);

    if (b.title !== undefined) {
      if (!b.title.trim()) return res.status(400).json({ message: 'Task title is required.' });
      task.title = b.title;
    }
    if (b.description !== undefined) task.description = b.description;
    if (b.priority !== undefined) task.priority = b.priority;
    if (b.assignees !== undefined) task.assignees = b.assignees.filter((a) => memberIds.includes(String(a)));
    if (b.labels !== undefined) task.labels = b.labels.map((l) => String(l).trim()).filter(Boolean);
    if (b.dueDate !== undefined) task.dueDate = b.dueDate || null;
    if (b.estimateMinutes !== undefined) task.estimateMinutes = Math.max(0, Number(b.estimateMinutes) || 0);
    if (b.blockedBy !== undefined) {
      const ids = b.blockedBy.map(String).filter((id) => id !== String(task._id));
      const valid = await Task.find({ _id: { $in: ids }, project: project._id }).select('_id');
      task.blockedBy = valid.map((t) => t._id);
    }
    await task.save();
    await log(project, req.user, `edited the task "${task.title}"`, 'tasks');
    res.json({ task: await populateTask(Task.findById(task._id)) });
  })
);

// Move to another list and/or position. body: { listId, index }
router.put(
  '/:id/move',
  wrap(async (req, res) => {
    const { task, project } = await getTaskFor(req, res);
    if (!task) return;
    const list = project.lists.id(req.body.listId);
    if (!list) return res.status(404).json({ message: 'List not found.' });

    const result = await moveTask(project, task, list, req.body.index);
    if (!result.ok) return res.status(409).json({ message: result.message });
    await log(project, req.user, `moved "${task.title}" to ${list.title}`, 'tasks');
    res.json({ task: await populateTask(Task.findById(task._id)) });
  })
);

router.delete(
  '/:id',
  wrap(async (req, res) => {
    const { task, project } = await getTaskFor(req, res);
    if (!task) return;
    await Task.updateMany({ blockedBy: task._id }, { $pull: { blockedBy: task._id } });
    await task.deleteOne();
    await log(project, req.user, `deleted the task "${task.title}"`, 'tasks');
    res.json({ message: 'Task deleted.' });
  })
);

router.post(
  '/:id/comments',
  wrap(async (req, res) => {
    const { task, project } = await getTaskFor(req, res);
    if (!task) return;
    if (!req.body.text?.trim()) return res.status(400).json({ message: 'Write something before posting.' });
    task.comments.push({ author: req.user._id, text: req.body.text });
    await task.save();
    await log(project, req.user, `commented on "${task.title}"`, 'tasks');
    res.status(201).json({ task: await populateTask(Task.findById(task._id)) });
  })
);

router.post(
  '/:id/time',
  wrap(async (req, res) => {
    const { task, project } = await getTaskFor(req, res);
    if (!task) return;
    const minutes = Math.round(Number(req.body.minutes));
    if (!minutes || minutes < 1 || minutes > 1440)
      return res.status(400).json({ message: 'Enter between 1 and 1440 minutes.' });
    task.timeLogs.push({ user: req.user._id, minutes, note: req.body.note || '' });
    await task.save();
    await log(project, req.user, `logged ${minutes} min on "${task.title}"`, 'tasks');
    res.status(201).json({ task: await populateTask(Task.findById(task._id)) });
  })
);

// Attach a link (GitHub issue/PR, Google Drive file, anything else) to a task.
router.post(
  '/:id/links',
  wrap(async (req, res) => {
    const { task, project } = await getTaskFor(req, res);
    if (!task) return;
    let u;
    try {
      u = new URL(req.body.url);
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
    } catch {
      return res.status(400).json({ message: 'Enter a full link starting with https://' });
    }
    const kind = /github\.com$/i.test(u.hostname) ? 'github' : /(drive|docs)\.google\.com$/i.test(u.hostname) ? 'drive' : 'other';
    task.links.push({ kind, url: u.toString(), title: req.body.title || u.hostname });
    await task.save();
    await log(project, req.user, `attached a link to "${task.title}"`, 'tasks');
    res.status(201).json({ task: await populateTask(Task.findById(task._id)) });
  })
);

router.delete(
  '/:id/links/:linkId',
  wrap(async (req, res) => {
    const { task, project } = await getTaskFor(req, res);
    if (!task) return;
    task.links = task.links.filter((l) => String(l._id) !== req.params.linkId);
    await task.save();
    await log(project, req.user, `removed a link from "${task.title}"`, 'tasks');
    res.json({ task: await populateTask(Task.findById(task._id)) });
  })
);

export default router;
