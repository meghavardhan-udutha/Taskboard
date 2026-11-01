import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import User from './models/User.js';
import Project from './models/Project.js';

let io;
// projectId -> Map(userId -> { user, sockets:Set })
const presence = new Map();

function broadcastPresence(projectId) {
  const room = presence.get(projectId);
  const users = room ? [...room.values()].map((e) => e.user) : [];
  io.to(`project:${projectId}`).emit('presence', users);
}

export function initSocket(httpServer, origin) {
  io = new Server(httpServer, { cors: { origin, credentials: true } });

  io.use(async (socket, next) => {
    try {
      const payload = jwt.verify(socket.handshake.auth?.token, process.env.JWT_SECRET);
      const user = await User.findById(payload.id);
      if (!user) return next(new Error('unauthorized'));
      socket.data.user = { id: String(user._id), name: user.name, avatarUrl: user.avatarUrl };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const me = socket.data.user;
    const joined = new Set();

    socket.on('project:join', async (projectId) => {
      try {
        const project = await Project.findOne({ _id: projectId, members: me.id }).select('_id');
        if (!project) return;
        socket.join(`project:${projectId}`);
        joined.add(projectId);
        if (!presence.has(projectId)) presence.set(projectId, new Map());
        const room = presence.get(projectId);
        if (!room.has(me.id)) room.set(me.id, { user: me, sockets: new Set() });
        room.get(me.id).sockets.add(socket.id);
        broadcastPresence(projectId);
      } catch {
        /* ignore malformed ids */
      }
    });

    socket.on('project:leave', (projectId) => leave(projectId));

    function leave(projectId) {
      socket.leave(`project:${projectId}`);
      joined.delete(projectId);
      const room = presence.get(projectId);
      const entry = room?.get(me.id);
      if (entry) {
        entry.sockets.delete(socket.id);
        if (entry.sockets.size === 0) room.delete(me.id);
        if (room.size === 0) presence.delete(projectId);
      }
      broadcastPresence(projectId);
    }

    socket.on('disconnect', () => [...joined].forEach(leave));
  });

  return io;
}

// Tell everyone viewing a project that something changed; clients refetch.
export function emitProjectChange(projectId, kind) {
  io?.to(`project:${projectId}`).emit('project:changed', { kind });
}

export function emitToProject(projectId, event, payload) {
  io?.to(`project:${projectId}`).emit(event, payload);
}
