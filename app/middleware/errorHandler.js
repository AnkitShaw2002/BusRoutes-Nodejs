const logger = require('../utils/logger');

/**
 * Global Error Handling Middleware for API requests.
 * Catches all unhandled errors and returns standardized JSON responses.
 */
const errorHandler = (err, req, res, next) => {
    // Log the error stack for debugging
    if (logger && typeof logger.error === 'function') {
        logger.error(`Error ${err.status || 500}: ${err.message}`, { stack: err.stack });
    } else {
        console.error(err.stack);
    }

    // If headers have already been sent, delegate to default Express error handler
    if (res.headersSent) {
        return next(err);
    }

    const statusCode = err.status || err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    // Standardized API error payload
    const responsePayload = {
        status: false,
        message: message
    };

    // Attach error details or stack trace if running in development mode
    if (process.env.NODE_ENV === 'development') {
        responsePayload.error = err;
        responsePayload.stack = err.stack;
    }

    return res.status(statusCode).json(responsePayload);
};

module.exports = errorHandler;