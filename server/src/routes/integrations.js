import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { wrap } from '../middleware/error.js';
import { getProjectFor } from './helpers.js';
import { assertSafeUrl } from '../services/safeUrl.js';
import { notifyProject } from '../services/notify.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const rand = (n = 24) => crypto.randomBytes(n).toString('hex');
export const hashKey = (k) => crypto.createHash('sha256').update(k).digest('hex');

async function ownerProject(req, res) {
  const project = await getProjectFor(req, res);
  if (!project) return null;
  if (String(project.owner) !== String(req.user._id)) {
    res.status(403).json({ message: 'Only the project owner can manage integrations.' });
    return null;
  }
  return project;
}

function view(project) {
  const c = project.integrations;
  const id = String(project._id);
  return {
    baseUrl: process.env.PUBLIC_URL || '',
    slackWebhookUrl: c.slackWebhookUrl,
    discordWebhookUrl: c.discordWebhookUrl,
    webhookUrls: c.webhookUrls,
    githubRepo: c.githubRepo,
    github: c.githubSecret ? { path: `/api/inbound/github/${id}`, secret: c.githubSecret } : null,
    email: c.inboundEmailSecret ? { path: `/api/inbound/email/${id}/${c.inboundEmailSecret}` } : null,
    calendar: c.calendarToken ? { path: `/api/inbound/calendar/${id}/${c.calendarToken}.ics` } : null,
    apiKey: c.apiKeyPrefix ? { prefix: c.apiKeyPrefix } : null,
    lastDelivery: c.lastDelivery || null,
  };
}

router.get('/', wrap(async (req, res) => {
  const project = await ownerProject(req, res);
  if (project) res.json(view(project));
}));

router.put('/', wrap(async (req, res) => {
  const project = await ownerProject(req, res);
  if (!project) return;
  const b = req.body;
  const c = project.integrations;
  try {
    if (b.slackWebhookUrl !== undefined) {
      if (b.slackWebhookUrl) await assertSafeUrl(b.slackWebhookUrl, { host: ['hooks.slack.com'] });
      c.slackWebhookUrl = b.slackWebhookUrl.trim();
    }
    if (b.discordWebhookUrl !== undefined) {
      if (b.discordWebhookUrl) await assertSafeUrl(b.discordWebhookUrl, { host: ['discord.com', 'discordapp.com'], pathPrefix: '/api/webhooks/' });
      c.discordWebhookUrl = b.discordWebhookUrl.trim();
    }
    if (b.webhookUrls !== undefined) {
      const urls = b.webhookUrls.map((u) => u.trim()).filter(Boolean).slice(0, 5);
      for (const u of urls) await assertSafeUrl(u);
      c.webhookUrls = urls;
    }
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
  if (b.githubRepo !== undefined) {
    if (b.githubRepo && !/^[\w.-]+\/[\w.-]+$/.test(b.githubRepo)) return res.status(400).json({ message: 'Use the form owner/repository.' });
    c.githubRepo = b.githubRepo;
  }
  await project.save();
  res.json(view(project));
}));

router.post('/secrets/:kind', wrap(async (req, res) => {
  const project = await ownerProject(req, res);
  if (!project) return;
  const c = project.integrations;
  let apiKey;
  switch (req.params.kind) {
    case 'github': c.githubSecret = rand(); break;
    case 'email': c.inboundEmailSecret = rand(); break;
    case 'calendar': c.calendarToken = rand(); break;
    case 'apikey': {
      c.apiKeyPrefix = rand(4);
      const secret = rand(16);
      c.apiKeyHash = hashKey(secret);
      apiKey = `tb_${c.apiKeyPrefix}_${secret}`; // shown once, only the hash is stored
      break;
    }
    default: return res.status(404).json({ message: 'Unknown integration.' });
  }
  await project.save();
  res.json({ ...view(project), ...(apiKey ? { newApiKey: apiKey } : {}) });
}));

router.delete('/secrets/:kind', wrap(async (req, res) => {
  const project = await ownerProject(req, res);
  if (!project) return;
  const c = project.integrations;
  const map = { github: ['githubSecret'], email: ['inboundEmailSecret'], calendar: ['calendarToken'], apikey: ['apiKeyPrefix', 'apiKeyHash'] };
  if (!map[req.params.kind]) return res.status(404).json({ message: 'Unknown integration.' });
  map[req.params.kind].forEach((k) => (c[k] = ''));
  await project.save();
  res.json(view(project));
}));

router.post('/test', wrap(async (req, res) => {
  const project = await ownerProject(req, res);
  if (!project) return;
  const results = await notifyProject(project, { kind: 'test', actorName: req.user.name, message: 'sent a test notification from Taskboard' });
  if (!results.length) return res.status(400).json({ message: 'Add a Slack, Discord or webhook link first.' });
  res.json({ results });
}));

export default router;
