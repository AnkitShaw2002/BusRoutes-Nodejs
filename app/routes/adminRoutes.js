const express = require("express");
const router = express.Router();

const adminController = require("../controllers/adminController");
const { checkAuth, authorizeRoles } = require("../middleware/checkAuth");

// ==========================================
// ADMIN DASHBOARD AND REPORT ROUTES
// ==========================================

// Get Dashboard Statistics
/**
 * @swagger
 * /api/v1/admin/dashboard:
 *   get:
 *     summary: Get administration dashboard statistics
 *     description: Return booking, revenue, bus, route, trip, and customer statistics for the admin dashboard.
 *     tags:
 *       - Administration
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics returned successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: User does not have permission to view the dashboard
 *       500:
 *         description: Internal server error
 */
router.get(
  "/admin/dashboard",
  checkAuth,
  authorizeRoles("admin", "staff"),
  adminController.dashboard,
);

// Get Management Reports
/**
 * @swagger
 * /api/v1/admin/reports:
 *   get:
 *     summary: Get booking, payment, coupon, and route reports
 *     description: Build aggregated reports for the selected date range. Defaults to the last 30 days.
 *     tags:
 *       - Administration
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start of the report period
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End of the report period
 *     responses:
 *       200:
 *         description: Reports generated successfully
 *       400:
 *         description: Invalid report date range
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *       500:
 *         description: Internal server error
 */
router.get(
  "/admin/reports",
  checkAuth,
  authorizeRoles("admin"),
  adminController.reports,
);

module.exports = router;
