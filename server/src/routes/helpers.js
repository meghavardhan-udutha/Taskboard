import Project from '../models/Project.js';
import Task from '../models/Task.js';
import Activity from '../models/Activity.js';
import { emitProjectChange } from '../socket.js';
import { notifyProject } from '../services/notify.js';

export const USER_FIELDS = 'name email avatarUrl jobTitle';

// Returns the project if the signed-in user is a member, otherwise sends the error and returns null.
export async function getProjectFor(req, res, projectId = req.params.id) {
  const project = await Project.findById(projectId);
  if (!project) {
    res.status(404).json({ message: 'Project not found.' });
    return null;
  }
  if (!project.members.some((m) => String(m) === String(req.user._id))) {
    res.status(403).json({ message: 'You are not a member of this project.' });
    return null;
  }
  return project;
}

export async function getTaskFor(req, res) {
  const task = await Task.findById(req.params.id);
  if (!task) {
    res.status(404).json({ message: 'Task not found.' });
    return {};
  }
  const project = await getProjectFor(req, res, task.project);
  if (!project) return {};
  return { task, project };
}

export function populateTask(query) {
  return query
    .populate('assignees', USER_FIELDS)
    .populate('comments.author', USER_FIELDS)
    .populate('timeLogs.user', USER_FIELDS);
}

export async function log(project, user, message, kind = 'activity') {
  await Activity.create({ project: project._id, user: user._id, message });
  emitProjectChange(String(project._id), kind);
  notifyProject(project, { kind, actorName: user.name, message });
}

export function isDoneList(project, listId) {
  return project.lists.some((l) => String(l._id) === String(listId) && l.isDone);
}

// Project as sent to the browser: integration secrets never leave the owner-only integrations routes.
export function publicProject(project) {
  const obj = project.toObject ? project.toObject() : { ...project };
  delete obj.integrations;
  return obj;
}
