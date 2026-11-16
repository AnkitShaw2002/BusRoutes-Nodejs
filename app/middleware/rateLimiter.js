const rateLimit = require('express-rate-limit');

/**
 * Standardized JSON handler for rate limit violations on API routes.
 */
const rateLimitHandler = (req, res, next, options) => {
    const message = typeof options.message === 'object' ? options.message.message : options.message;
    
    return res.status(options.statusCode).json({
        status: false,
        message: message
    });
};

// General API rate limiter (100 requests per 15 minutes)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
    message: 'Too many requests from this IP, please try again after 15 minutes.',
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false,
});

// Stricter limiter for sensitive auth routes (10 requests per hour)
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: 'Too many authentication attempts. Please try again after an hour.',
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false,
});

// Limiter for project creation/bidding actions to prevent spam (5 requests per minute)
const projectActionLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    message: 'Slow down! You are performing actions too quickly.',
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    apiLimiter,
    authLimiter,
    projectActionLimiter
};