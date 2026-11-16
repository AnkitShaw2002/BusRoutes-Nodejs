// app/config/security.js
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const setupSecurity = (app) => {
    // Helmet Security Headers
    app.use(helmet({ contentSecurityPolicy: false }));

    // CORS
    const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:3000,http://localhost:3001').split(',').map((origin) => origin.trim()).filter(Boolean);
    app.use(
        cors({
            origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
            methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            credentials: true
        })
    );

    // Global Rate Limiting
    const globalLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100,
        message: 'Too many requests from this IP, please try again later.'
    });
    app.use('/api/', globalLimiter);
};

module.exports = setupSecurity;
