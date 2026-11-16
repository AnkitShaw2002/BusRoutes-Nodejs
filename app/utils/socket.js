const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const logger = require("../utils/logger");

let io;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: [process.env.CLIENT_ORIGIN || "http://localhost:3000", "http://localhost:3001"],
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers.authorization?.replace(/^Bearer\s+/i, '');
      if (!token) return next(); // Public trip updates remain available.
      const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
      const user = await User.findById(decoded.id || decoded._id).populate('roleId', 'name').select('_id roleId status isDeleted').lean();
      if (!user || user.isDeleted || user.status !== 'active') return next(new Error('Unauthorized socket connection.'));
      socket.user = { id: String(user._id), role: user.roleId?.name || decoded.role || 'customer' };
      return next();
    } catch (error) {
      return next(new Error('Invalid or expired socket token.'));
    }
  });

  io.on("connection", (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // 1. User joins personal notification room
    // Used for individual booking confirmations, payment status updates, and alerts:
    // io.to(`user_${userId}`).emit('notification', data)
    socket.on("user:join", () => {
      if (!socket.user) {
        logger.warn("Unauthenticated socket requested a private user room");
        return;
      }

      const room = `user_${socket.user.id}`;
      socket.join(room);
      logger.info(`Socket ${socket.id} joined user room: ${room}`);
    });

    // 2. Trip room join
    // Used for real-time seat availability updates, trip status changes, or delays:
    // io.to(`trip_${tripId}`).emit('trip_update', data)
    socket.on("trip:join", (tripId) => {
      if (!tripId) {
        logger.warn("Trip ID missing for socket join");
        return;
      }

      const room = `trip_${tripId}`;
      socket.join(room);
      logger.info(`Socket ${socket.id} joined trip room: ${room}`);
    });

    // 3. Driver/Staff/Admin joins operational role room
    // Used for broadcasting updates to all staff or drivers simultaneously:
    // io.to(`role:admin`).emit('admin_alert', data)
    socket.on("role:join", () => {
      if (!socket.user || !['admin','staff','driver','customer'].includes(socket.user.role)) {
        logger.warn("Unauthorized socket requested an operations room");
        return;
      }

      const room = `role:${socket.user.role}`;
      socket.join(room);
      logger.info(`Socket ${socket.id} joined role room: ${room}`);
    });

    socket.on("disconnect", () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error("Socket.IO has not been initialized");
  }

  return io;
}

module.exports = {
  initSocket,
  getIO,
};
