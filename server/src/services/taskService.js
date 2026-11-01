import Project from '../models/Project.js';
import Task from '../models/Task.js';

// Creates a task with the next per-project number (shown as TB-<number>).
export async function createTask(project, user, fields, source = 'web') {
  const { title, listId, description, priority, assignees, labels, dueDate, estimateMinutes } = fields;
  const list = project.lists.id(listId) || project.lists[0];
  const memberIds = project.members.map((m) => String(m._id ?? m));
  const last = await Task.findOne({ project: project._id, list: list._id }).sort({ position: -1 });
  const bumped = await Project.findByIdAndUpdate(project._id, { $inc: { taskCounter: 1 } }, { new: true });
  return Task.create({
    project: project._id,
    list: list._id,
    number: bumped.taskCounter,
    position: last ? last.position + 1 : 0,
    title,
    description,
    priority,
    assignees: (assignees || []).filter((a) => memberIds.includes(String(a))),
    labels: (labels || []).map((l) => String(l).trim()).filter(Boolean),
    dueDate: dueDate || null,
    estimateMinutes: Number(estimateMinutes) || 0,
    createdBy: user._id,
    completedAt: list.isDone ? new Date() : null,
    source,
  });
}

// Moves a task into a list. Returns { ok:false, message } if blocked by unfinished tasks.
export async function moveTask(project, task, list, index = 0) {
  const doneIds = new Set(project.lists.filter((l) => l.isDone).map((l) => String(l._id)));
  const wasDone = doneIds.has(String(task.list));
  if (list.isDone && !wasDone && task.blockedBy?.length) {
    const blockers = await Task.find({ _id: { $in: task.blockedBy } }).select('title list');
    const open = blockers.filter((b) => !doneIds.has(String(b.list)));
    if (open.length) return { ok: false, message: `Finish these first: ${open.map((t) => t.title).join(', ')}` };
  }
  const siblings = await Task.find({ project: project._id, list: list._id, _id: { $ne: task._id } }).sort({
    position: 1,
    createdAt: 1,
  });
  const at = Math.min(Math.max(Number(index) || 0, 0), siblings.length);
  siblings.splice(at, 0, task);
  task.list = list._id;
  if (list.isDone && !wasDone) task.completedAt = new Date();
  if (!list.isDone) task.completedAt = null;
  if (wasDone && !list.isDone) task.reopenCount = (task.reopenCount || 0) + 1;
  await Promise.all(
    siblings.map((t, i) => {
      t.position = i;
      return t.save();
    })
  );
  return { ok: true };
}
