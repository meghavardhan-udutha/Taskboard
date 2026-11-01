# Taskboard

Collaborative project management with a Kanban board, list and calendar views, team chat, a personal
dashboard, AI-assisted planning, and integrations.

Stack: React + Vite, Node + Express, MongoDB + Mongoose, JWT + bcrypt, Socket.IO, REST.

## Run it (Windows PowerShell)

Needs Node.js 18+ and a MongoDB server (local, or an Atlas connection string).

```powershell
# API
cd server
Copy-Item .env.example .env      # set MONGO_URI and a long random JWT_SECRET
npm install
npm run dev

# Web app (second PowerShell window)
cd client
npm install
npm run dev
```

Open http://localhost:5173. On the Projects page, "Create a sample project with six months of synthetic
history" gives the AI tab something to work with straight away.

## Permissions

- Any project member can add, edit, move and delete tasks and lists, change who a task is assigned to, chat, and attach links.
- Only the owner can rename or delete the project, add or remove members, and manage integrations.

## AI and machine learning: what is real

| Feature | What it is | Needs |
| --- | --- | --- |
| Task duration prediction | Ridge regression on the project's own finished tasks. Used only if it beats both "trust the estimate" and "estimate x average overrun" on newer, held-out tasks | 30+ finished tasks with an estimate and logged time |
| Late-risk prediction | Logistic regression. Shown only if it ranks late vs on-time tasks better than chance (AUC 0.65+) on held-out newer tasks | 30+ finished tasks with due dates, 5+ late and 5+ on time |
| Finish forecast | Statistics: remaining predicted work divided by recent weekly output, as a best / typical / slow range | Output in at least 4 of the last 8 weeks |
| Suggested order, workload rebalancing, rework, blockers | Rule-based scoring. Every suggestion lists the rules that produced it | None |
| Quick add in plain words | Pattern matching (dates, @people, #labels, priority, 2h), not ML. Always previewed first | None |
| Project summary | Template from the numbers; rephrased by Claude if `ANTHROPIC_API_KEY` is set | Optional key |
| "Ask about this project" | Claude answers from the computed facts only | `ANTHROPIC_API_KEY` |

How the models avoid cheating: training uses the older 70% of tasks and testing uses the newest 30% (no shuffling).
Every feature is something known when the task was created, and per-person history only counts tasks finished before
that moment. Results compare against simple baselines. With too little history the app says so and shows no prediction.

**The sample project is synthetic.** `server/src/services/demoHistory.js` simulates six months of a four-person team,
with the patterns (who underestimates, how workload causes lateness) written into the generator. Accuracy figures on it
only show that the code works. They say nothing about how well it will predict your real projects. The Claude API
parts have not been run against the live service.

## Integrations

| Integration | How it works | Status |
| --- | --- | --- |
| Slack, Discord, generic webhooks | Every activity line is posted to the links the owner saves. Slack and Discord links are checked to be on their real domains; other webhooks must be public https | Tested with a local receiver; not tested against real Slack or Discord |
| GitHub | GitHub webhook (HMAC-verified). PRs and commits that mention `TB-12` are linked to the task; a merged PR saying `closes TB-12` moves it to done | Tested with signed sample payloads; not tested against github.com |
| Google Calendar | Read-only .ics feed of due dates that Google Calendar subscribes to by URL. No Google sign-in, no two-way sync | Feed tested; not tested inside Google Calendar |
| Email to task | A webhook link for inbound email services (Mailgun, SendGrid, Postmark...). Taskboard does not receive mail itself | Tested with sample requests |
| Public API | Project API key (`x-api-key`) to list and create tasks. Only a hash is stored | Tested |
| Google Drive | Attach Drive/Docs links to tasks. No Drive browsing | Links only |

GitHub, email services and Google need to reach your API from the internet. Deploy it, or use a tunnel such as ngrok,
and set `PUBLIC_URL` in `server/.env`.

## Tests

```powershell
cd server
npm test                                  # unit tests (no database needed)
# with the API running against a test database and ALLOW_PRIVATE_WEBHOOKS=true:
$env:API="http://localhost:5000/api"; node tests/e2e.mjs
```
`tests/ui_test.py` is a Playwright browser test (needs `pip install playwright` and `playwright install chromium`).

## Not built yet

Two-way Google Calendar sync, GitHub OAuth and issue creation, Slack slash commands, Google Drive picker, file
uploads, roles beyond owner/member, rate limiting for public endpoints, an ML evaluation on real (non-synthetic) data.
