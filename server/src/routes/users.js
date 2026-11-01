import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import Task from '../models/Task.js';
import Project from '../models/Project.js';
import { requireAuth } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';

const router = Router();
router.use(requireAuth);

// Profile: read
router.get('/me', (req, res) => res.json({ user: req.user.toPublic() }));

// Profile: edit own information
router.put(
  '/me',
  wrap(async (req, res) => {
    const { name, email, jobTitle, bio, avatarUrl } = req.body;
    const user = req.user;

    if (name !== undefined) {
      if (!String(name).trim()) return res.status(400).json({ message: 'Name cannot be empty.' });
      user.name = name;
    }
    if (email !== undefined) {
      if (!/^\S+@\S+\.\S+$/.test(email))
        return res.status(400).json({ message: 'Enter a valid email address.' });
      const taken = await User.findOne({ email: email.toLowerCase(), _id: { $ne: user._id } });
      if (taken) return res.status(409).json({ message: 'That email is already in use.' });
      user.email = email;
    }
    if (jobTitle !== undefined) user.jobTitle = jobTitle;
    if (bio !== undefined) user.bio = bio;
    if (avatarUrl !== undefined) {
      if (avatarUrl && !/^https?:\/\//i.test(avatarUrl))
        return res.status(400).json({ message: 'Photo link must start with http:// or https://' });
      user.avatarUrl = avatarUrl;
    }
    await user.save();
    res.json({ user: user.toPublic() });
  })
);

// Profile: change password
router.put(
  '/me/password',
  wrap(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 8)
      return res.status(400).json({ message: 'New password must be at least 8 characters.' });
    const user = await User.findById(req.user._id).select('+password');
    if (!(await bcrypt.compare(currentPassword || '', user.password)))
      return res.status(400).json({ message: 'Current password is incorrect.' });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: 'Password updated.' });
  })
);

// Dashboard numbers: plain counts and sums from the user's own tasks.
router.get(
  '/me/stats',
  wrap(async (req, res) => {
    const projects = await Project.find({ members: req.user._id }).select('lists name');
    const doneListIds = new Set();
    projects.forEach((p) => p.lists.forEach((l) => l.isDone && doneListIds.add(String(l._id))));

    const tasks = await Task.find({ assignees: req.user._id }).select(
      'title project list dueDate completedAt timeLogs priority'
    );
    const now = new Date();
    let open = 0, done = 0, overdue = 0, minutes = 0;
    tasks.forEach((t) => {
      const isDone = doneListIds.has(String(t.list));
      if (isDone) done++;
      else {
        open++;
        if (t.dueDate && t.dueDate < now) overdue++;
      }
      t.timeLogs.forEach((l) => String(l.user) === String(req.user._id) && (minutes += l.minutes));
    });

    const upcoming = tasks
      .filter((t) => !doneListIds.has(String(t.list)) && t.dueDate)
      .sort((a, b) => a.dueDate - b.dueDate)
      .slice(0, 5)
      .map((t) => ({ id: t._id, title: t.title, project: t.project, dueDate: t.dueDate, priority: t.priority }));

    res.json({ projects: projects.length, open, done, overdue, minutesLogged: minutes, upcoming });
  })
);

export default router;
