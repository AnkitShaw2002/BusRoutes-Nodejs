const express = require("express");
const router = express.Router();

const customerController = require("../controllers/customerController");
const { checkAuth } = require("../middleware/checkAuth");
const upload = require("../middleware/Uploadchecker");

// ==========================================
// CUSTOMER PROFILE ROUTES
// ==========================================

// Get Current Customer Profile
/**
 * @swagger
 * /api/v1/customer/profile:
 *   get:
 *     summary: Get the current customer's profile
 *     description: Return profile information for the authenticated user.
 *     tags:
 *       - Customer
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer profile returned successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Customer profile not found
 *       500:
 *         description: Internal server error
 */
router.get(
  "/customer/profile",
  checkAuth,
  customerController.getProfile,
);

// Update Current Customer Profile
/**
 * @swagger
 * /api/v1/customer/profile:
 *   patch:
 *     summary: Update the current customer's profile
 *     description: Update profile fields and optionally upload a profile image to Cloudinary.
 *     tags:
 *       - Customer
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               phone:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.patch(
  "/customer/profile",
  checkAuth,
  upload.single("image"),
  customerController.updateProfile,
);

// Change Current Customer Password
/**
 * @swagger
 * /api/v1/customer/change-password:
 *   put:
 *     summary: Change the current customer's password
 *     description: Verify the current password and replace it with a new password.
 *     tags:
 *       - Customer
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *               newPassword:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Current password is incorrect or new password is invalid
 *       401:
 *         description: Authentication required
 */
router.put(
  "/customer/change-password",
  checkAuth,
  customerController.changePassword,
);

// Get Customer Booking History
/**
 * @swagger
 * /api/v1/customer/bookings:
 *   get:
 *     summary: Get the current customer's booking history
 *     description: Return a paginated list of the authenticated customer's bookings.
 *     tags:
 *       - Customer
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Booking history returned successfully
 *       401:
 *         description: Authentication required
 */
router.get(
  "/customer/bookings",
  checkAuth,
  customerController.bookingHistory,
);

router.get("/customer/upcoming-trips", checkAuth, customerController.upcomingTrips);
router.get("/customer/cancelled-trips", checkAuth, customerController.cancelledTrips);
/**
 * @swagger
 * /api/v1/customer/favorite-routes:
 *   get:
 *     summary: List the customer's favorite routes
 *     tags: [Customer]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Favorite routes returned successfully }
 * /api/v1/customer/favorite-routes/{routeId}:
 *   post:
 *     summary: Save a route as a favorite
 *     tags: [Customer]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: routeId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       201: { description: Route saved }
 *   delete:
 *     summary: Remove a favorite route
 *     tags: [Customer]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: routeId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Route removed }
 * /api/v1/customer/saved-passengers:
 *   get:
 *     summary: List saved passengers
 *     tags: [Customer]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Saved passengers returned }
 *   post:
 *     summary: Save a passenger for future bookings
 *     tags: [Customer]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, age]
 *             properties:
 *               name: { type: string }
 *               age: { type: integer, minimum: 0, maximum: 120 }
 *               gender: { type: string, enum: [male, female, other, unspecified] }
 *               title: { type: string }
 *     responses:
 *       201: { description: Passenger saved }
 * /api/v1/customer/saved-passengers/{passengerId}:
 *   delete:
 *     summary: Remove a saved passenger
 *     tags: [Customer]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: passengerId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Passenger removed }
 */
router.get("/customer/favorite-routes", checkAuth, customerController.favoriteRoutes);
router.post("/customer/favorite-routes/:routeId", checkAuth, customerController.addFavoriteRoute);
router.delete("/customer/favorite-routes/:routeId", checkAuth, customerController.removeFavoriteRoute);
router.get("/customer/saved-passengers", checkAuth, customerController.savedPassengers);
router.post("/customer/saved-passengers", checkAuth, customerController.addSavedPassenger);
router.delete("/customer/saved-passengers/:passengerId", checkAuth, customerController.removeSavedPassenger);

module.exports = router;
