const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate API requests using JWT.
 * Supports token from cookies or Authorization header (Bearer token).
 */
const checkAuth = async (req, res, next) => {
    try {
        // Extract token from cookies or Authorization header
        let token = req.cookies?.token;
        if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({ 
                status: false, 
                message: 'Authentication required. No token provided.' 
            });
        }

        if (!process.env.JWT_SECRET_KEY) {
            return res.status(503).json({ status: false, message: 'Authentication token secret is not configured.' });
        }

        // Verify Token
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);

        // Optional cross-check with session if session middleware is active
        if (req.session && req.session.token && req.session.token !== token) {
            logger.warn(`Session Token Mismatch: Possible identity hijack attempt for user ${decoded.email}`);
            return res.status(401).json({ 
                status: false, 
                message: 'Session token mismatch. Please log in again.' 
            });
        }

        // Fetch user from DB to ensure they still exist and are active
        const user = await User.findById(decoded.id || decoded._id, { password: 0, refreshToken: 0 }).populate('roleId', 'name permissions').lean();

        if (!user || user.isDeleted || user.status === 'inactive') {
            return res.status(401).json({ 
                status: false, 
                message: 'User no longer exists.' 
            });
        }

        if (user.isBanned) {
            return res.status(403).json({ 
                status: false, 
                message: 'Your account has been suspended/banned.' 
            });
        }

        // Attach user to request object
        req.user = {
            ...user,
            id: user._id,
            name: user.name || user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' '),
            role: user.roleId?.name || decoded.role || 'customer'
        };

        next();
    } catch (error) {
        logger.error(`checkAuth Error: ${error.message}`);
        return res.status(401).json({ 
            status: false, 
            message: 'Invalid or expired token.' 
        });
    }
};

/**
 * Optional authentication middleware for APIs.
 * Populates req.user if a valid token exists, but allows unauthenticated requests to proceed.
 */
const optionalAuth = async (req, res, next) => {
    try {
        let token = req.cookies?.token;
        if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
            const user = await User.findById(decoded.id || decoded._id, { password: 0, refreshToken: 0 }).populate('roleId', 'name permissions').lean();
            
            if (user && !user.isDeleted && !user.isBanned) {
                req.user = {
                    ...user,
                    id: user._id,
                    name: user.name || user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' '),
                    role: user.roleId?.name || decoded.role || 'customer'
                };
            }
        }
        next();
    } catch (error) {
        // Silently fail for optional authentication on APIs
        next();
    }
};


const authorizeRoles = (...roles) => (req, res, next) => {
         if (!req.user || !roles.includes(req.user.role)) {
             return res.status(403).json({ status: false, message: 'Forbidden: Insufficient role' });
         }
         next();
     };

module.exports = { checkAuth, optionalAuth,authorizeRoles };
