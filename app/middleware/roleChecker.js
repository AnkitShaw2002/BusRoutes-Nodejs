const roleModel = require('../models/Role');
const logger = require('../utils/logger');

/**
 * Middleware to check if the authenticated user has the required permissions on API routes.
 * Supports multiple permission arguments (OR logic).
 * 
 * Usage: roleChecker('projects:manage', 'projects:view')
 */
const roleChecker = (...requiredPermissions) => {
    return async (req, res, next) => {
        try {
            const user = req.user;

            // 1. Check if user and role exist in the request (populated by checkAuth)
            if (!user || !user.role) {
                return res.status(401).json({ 
                    status: false, 
                    message: 'Authentication required: No user or role found in request.' 
                });
            }

            // 2. Fetch role permissions from the database
            const role = await roleModel.findOne({ name: user.role }).lean();

            if (!role) {
                logger.error(`Role definition not found for: ${user.role}`);
                return res.status(403).json({ 
                    status: false, 
                    message: 'Access Denied: Role configuration error.' 
                });
            }

            // 3. Admin bypass if no specific permissions are required
            if (role.name === 'admin' && requiredPermissions.length === 0) {
                return next();
            }

            // 4. Permission Check (OR logic)
            const hasPermission = requiredPermissions.some(perm =>
                Array.isArray(role.permissions) && role.permissions.includes(perm)
            );

            if (hasPermission || requiredPermissions.length === 0) {
                return next();
            }

            // 5. Access Denied Response
            return res.status(403).json({ 
                status: false, 
                message: `Access Denied: Insufficient permissions. Required one of: [${requiredPermissions.join(', ')}]` 
            });

        } catch (error) {
            logger.error(`roleChecker Error: ${error.message}`);
            return res.status(500).json({ 
                status: false, 
                message: 'Internal Server Error during permission verification.' 
            });
        }
    };
};

module.exports = roleChecker;