import Project from '../models/Project.js';
import { assertSafeUrl } from './safeUrl.js';

async function post(url, body, target) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
    redirect: 'error',
  });
  if (!res.ok) throw new Error(`${target} answered ${res.status}`);
}

// Fire-and-forget: sends one activity line to every channel the owner connected.
export function notifyProject(project, { kind, actorName, message }) {
  const cfg = project.integrations;
  if (!cfg) return Promise.resolve([]);
  const text = `${actorName} ${message}`;
  const jobs = [];
  if (cfg.slackWebhookUrl) jobs.push(['Slack', cfg.slackWebhookUrl, { text: `*${project.name}*: ${text}` }]);
  if (cfg.discordWebhookUrl) jobs.push(['Discord', cfg.discordWebhookUrl, { content: `**${project.name}**: ${text}` }]);
  (cfg.webhookUrls || []).forEach((u) =>
    jobs.push([
      'Webhook',
      u,
      { event: kind, project: { id: String(project._id), name: project.name }, actor: actorName, message, at: new Date().toISOString() },
    ])
  );
  if (!jobs.length) return Promise.resolve([]);

  return Promise.allSettled(
    jobs.map(async ([target, url, body]) => {
      try {
        await assertSafeUrl(url);
        await post(url, body, target);
        return { target, ok: true };
      } catch (e) {
        return { target, ok: false, error: e.message };
      }
    })
  ).then(async (results) => {
    const failed = results.map((r) => r.value).find((v) => v && !v.ok);
    const last = failed || results[0]?.value;
    if (!last) return [];
    await Project.updateOne(
      { _id: project._id },
      { $set: { 'integrations.lastDelivery': { at: new Date(), ok: !failed, target: last.target, error: failed?.error || '' } } }
    ).catch(() => {});
    return results.map((r) => r.value);
  });
}
