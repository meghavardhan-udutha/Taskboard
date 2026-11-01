import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeUrl } from '../src/services/safeUrl.js';

delete process.env.ALLOW_PRIVATE_WEBHOOKS;
const bad = ['http://example.com/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://192.168.1.2/x', 'https://169.254.169.254/latest', 'https://[::1]/x', 'not a url'];
for (const u of bad) test(`rejects ${u}`, async () => assert.rejects(() => assertSafeUrl(u)));
test('slack host must match', async () => assert.rejects(() => assertSafeUrl('https://evil.com/services/x', { host: ['hooks.slack.com'] })));
test('discord path must match', async () => assert.rejects(() => assertSafeUrl('https://discord.com/other', { host: ['discord.com'], pathPrefix: '/api/webhooks/' })));
test('public https IP literal is allowed', async () => assert.ok(await assertSafeUrl('https://8.8.8.8/hook')));
