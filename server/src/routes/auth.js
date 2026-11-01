import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';

const router = Router();
const emailOk = (e) => /^\S+@\S+\.\S+$/.test(e || '');

router.post(
  '/register',
  wrap(async (req, res) => {
    const { name, email, password } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Name is required.' });
    if (!emailOk(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
    if (!password || password.length < 8)
      return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    if (await User.findOne({ email: email.toLowerCase() }))
      return res.status(409).json({ message: 'That email is already registered.' });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hash });
    res.status(201).json({ token: signToken(user._id), user: user.toPublic() });
  })
);

router.post(
  '/login',
  wrap(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() }).select('+password');
    const ok = user && (await bcrypt.compare(password || '', user.password));
    if (!ok) return res.status(401).json({ message: 'Email or password is incorrect.' });
    res.json({ token: signToken(user._id), user: user.toPublic() });
  })
);

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

export default router;
