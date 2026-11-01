import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import { initSocket } from './socket.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import aiRoutes from './routes/ai.js';
import integrationRoutes from './routes/integrations.js';
import inboundRoutes, { publicApi } from './routes/inbound.js';
import path from 'path';
import { fileURLToPath } from 'url';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const app = express();
app.use(cors({ origin }));
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/projects/:id/ai', aiRoutes);
app.use('/api/projects/:id/integrations', integrationRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/inbound', inboundRoutes);
app.use('/api/public/v1', publicApi);
app.use('/api/tasks', taskRoutes);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const clientDist = path.resolve(__dirname, '../../client/dist');

app.use(express.static(clientDist));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();

  res.sendFile(path.join(clientDist, 'index.html'));
});
app.use(notFound);
app.use(errorHandler);

const server = http.createServer(app);
initSocket(server, origin);

const port = process.env.PORT || 5000;
connectDB()
  .then(() => server.listen(port, () => console.log(`API running on http://localhost:${port}`)))
  .catch((err) => {
    console.error('Startup failed:', err.message);
    process.exit(1);
  });
