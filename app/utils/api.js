const mongoose = require('mongoose');
const ActivityLog = require('../models/ActivityLog');

const send = (res, data, message = 'Success', status = 200) =>
  res.status(status).json({ success: true, message, data });

const fail = (res, status, message) => res.status(status).json({ success: false, message });

const pageOptions = (query) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
};

const paginated = async (res, query, filter, Model, sort = { createdAt: -1 }, populate = '') => {
  const { page, limit, skip } = pageOptions(query);
  let cursor = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (populate) cursor = cursor.populate(populate);
  const [items, total] = await Promise.all([cursor.lean(), Model.countDocuments(filter)]);
  return res.json({ success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

const validId = (id) => mongoose.isValidObjectId(id);

const logActivity = async (req, module, action, description) => {
  if (!req.user?._id && !req.user?.id) return;
  try {
    await ActivityLog.create({ userId: req.user._id || req.user.id, module, action, description, ipAddress: req.ip, userAgent: req.get('user-agent') });
  } catch (error) {
    require('./logger').warn(`Activity log skipped: ${error.message}`);
  }
};

const emit = (room, event, payload) => {
  try { require('./socket').getIO().to(room).emit(event, payload); } catch (_) { /* Socket is optional outside the server runtime. */ }
};

const cache = {
  async get(key) {
    try { const client = require('../config/redis'); return client?.getCache ? await client.getCache(key) : null; } catch (_) { return null; }
  },
  async set(key, value, ttl = 120) {
    try { const client = require('../config/redis'); return client?.setCache ? await client.setCache(key, value, ttl) : false; } catch (_) { return false; }
  },
  async invalidate(pattern) {
    try { const client = require('../config/redis'); return client?.invalidatePattern ? await client.invalidatePattern(pattern) : false; } catch (_) { return false; }
  }
};

module.exports = { send, fail, pageOptions, paginated, validId, logActivity, emit, cache };
