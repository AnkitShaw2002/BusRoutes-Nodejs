const express = require("express");
const router = express.Router();

const bookingController = require("../controllers/bookingController");
const { checkAuth, authorizeRoles } = require("../middleware/checkAuth");

// ==========================================
// CUSTOMER BOOKING ROUTES
// ==========================================

// Create Booking and Reserve Seats
/**
 * @swagger
 * /api/v1/bookings:
 *   post:
 *     summary: Reserve seats and create a booking
 *     description: Reserve the requested seats for ten minutes while the customer completes payment.
 *     tags:
 *       - Bookings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tripId
 *               - seats
 *               - passengers
 *             properties:
 *               tripId:
 *                 type: string
 *                 example: 65f1a2b3c4d5e6f7a8b9c0d1
 *               seats:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - seatNumber
 *                   properties:
 *                     seatNumber:
 *                       type: string
 *                       example: A1
 *               passengers:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - age
 *                   properties:
 *                     title:
 *                       type: string
 *                       enum: [Mr, Ms, Mrs, Dr, Prof]
 *                     name:
 *                       type: string
 *                     age:
 *                       type: integer
 *                     gender:
 *                       type: string
 *                       enum: [male, female, other]
 *               boardingPoint:
 *                 type: string
 *               droppingPoint:
 *                 type: string
 *               couponCode:
 *                 type: string
 *     responses:
 *       201:
 *         description: Seats reserved and booking created
 *       400:
 *         description: Invalid booking or passenger details
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Trip not found or unavailable
 *       409:
 *         description: One or more selected seats are no longer available
 *       500:
 *         description: Internal server error
 */
router.post(
  "/bookings",
  checkAuth,
  bookingController.createBooking,
);

// Get Current Customer Bookings
/**
 * @swagger
 * /api/v1/bookings:
 *   get:
 *     summary: Get the authenticated customer's bookings
 *     description: Return the current customer's paginated booking history.
 *     tags:
 *       - Bookings
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
 *         description: Booking list returned successfully
 *       401:
 *         description: Authentication required
 */
router.get(
  "/bookings",
  checkAuth,
  bookingController.listMyBookings,
);

// Download Confirmed Booking Ticket
/**
 * @swagger
 * /api/v1/bookings/{id}/ticket:
 *   get:
 *     summary: Download a confirmed PDF ticket
 *     description: Return a PDF ticket with a QR code that staff can verify at boarding.
 *     tags:
 *       - Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Booking ID
 *     responses:
 *       200:
 *         description: PDF ticket generated successfully
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Confirmed booking not found
 */
router.get(
  "/bookings/:id/ticket",
  checkAuth,
  bookingController.downloadTicket,
);
/**
 * @swagger
 * /api/v1/bookings/{id}/invoice:
 *   get:
 *     summary: Download a booking invoice PDF
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: PDF invoice, content: { application/pdf: { schema: { type: string, format: binary } } } }
 * /api/v1/bookings/{id}/email-ticket:
 *   post:
 *     summary: Email a PDF ticket and invoice to the booking customer
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Ticket email sent }
 *       503: { description: SMTP is not configured or delivery failed }
 */
router.get("/bookings/:id/invoice", checkAuth, bookingController.downloadTicket);
router.post("/bookings/:id/email-ticket", checkAuth, bookingController.emailTicket);

// Get Booking Details
/**
 * @swagger
 * /api/v1/bookings/{id}:
 *   get:
 *     summary: Get booking and passenger details
 *     description: Customers can view their own bookings. Staff and admins can view any booking.
 *     tags:
 *       - Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking details returned successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Booking not found
 */
router.get(
  "/bookings/:id",
  checkAuth,
  bookingController.getBooking,
);

// Cancel Booking
/**
 * @swagger
 * /api/v1/bookings/{id}:
 *   delete:
 *     summary: Cancel a booking
 *     description: Cancel the booking, release its seats, and refund a captured Razorpay payment.
 *     tags:
 *       - Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Booking cancelled successfully
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Active booking not found
 *       503:
 *         description: Refund processing is unavailable
 */
router.delete(
  "/bookings/:id",
  checkAuth,
  bookingController.cancelBooking,
);

/**
 * @swagger
 * /api/v1/bookings/{id}/reschedule:
 *   post:
 *     summary: Reschedule a confirmed booking
 *     description: Move seats to another available future trip. This endpoint currently requires the same total fare.
 *     tags: [Bookings]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tripId]
 *             properties:
 *               tripId: { type: string }
 *               seats: { type: array, items: { type: string } }
 *     responses:
 *       200: { description: Booking rescheduled }
 *       409: { description: Target seats unavailable or fare differs }
 */
router.post("/bookings/:id/reschedule", checkAuth, bookingController.rescheduleBooking);

// List Bookings for Staff and Admin
/**
 * @swagger
 * /api/v1/admin/bookings:
 *   get:
 *     summary: List and filter all bookings
 *     description: Return a paginated list of bookings, with optional status and trip filters.
 *     tags:
 *       - Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: tripId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bookings returned successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Staff or admin role required
 */
router.get(
  "/admin/bookings",
  checkAuth,
  authorizeRoles("admin", "staff"),
  bookingController.adminBookings,
);

// Create Offline Booking for Staff and Admin
/**
 * @swagger
 * /api/v1/admin/bookings:
 *   post:
 *     summary: Create an offline booking
 *     description: Reserve seats and create a booking on behalf of a passenger.
 *     tags:
 *       - Bookings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tripId
 *               - seats
 *               - passengers
 *             properties:
 *               tripId:
 *                 type: string
 *               seats:
 *                 type: array
 *                 items:
 *                   type: object
 *               passengers:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Offline booking created
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Staff or admin role required
 */
router.post(
  "/admin/bookings",
  checkAuth,
  authorizeRoles("admin", "staff"),
  bookingController.createBooking,
);

// Update Booking Status for Staff and Admin
/**
 * @swagger
 * /api/v1/admin/bookings/{id}:
 *   patch:
 *     summary: Update booking status and boarding details
 *     tags:
 *       - Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bookingStatus:
 *                 type: string
 *               boardingPoint:
 *                 type: string
 *               droppingPoint:
 *                 type: string
 *     responses:
 *       200:
 *         description: Booking updated successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Staff or admin role required
 *       404:
 *         description: Booking not found
 */
router.patch(
  "/admin/bookings/:id",
  checkAuth,
  authorizeRoles("admin", "staff"),
  bookingController.adminUpdateBooking,
);

// Get Trip Passenger Manifest
/**
 * @swagger
 * /api/v1/trips/{tripId}/manifest:
 *   get:
 *     summary: Get a trip's passenger manifest
 *     description: Return confirmed passenger names and seats. Drivers can access only their assigned trips.
 *     tags:
 *       - Bookings
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tripId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Passenger manifest returned successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Role is not authorized or trip is not assigned
 *       404:
 *         description: Trip not found
 */
router.get(
  "/trips/:tripId/manifest",
  checkAuth,
  authorizeRoles("admin", "staff", "driver"),
  bookingController.manifest,
);

// Verify Ticket QR Code
/**
 * @swagger
 * /api/v1/tickets/verify:
 *   post:
 *     summary: Verify a ticket QR code at boarding
 *     tags:
 *       - Bookings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookingReference
 *               - ticketCode
 *             properties:
 *               bookingReference:
 *                 type: string
 *               ticketCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Ticket verified successfully
 *       400:
 *         description: Ticket code is invalid
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Role is not authorized or trip is not assigned
 *       404:
 *         description: Ticket was not found
 */
router.post(
  "/tickets/verify",
  checkAuth,
  authorizeRoles("admin", "staff", "driver"),
  bookingController.verifyTicket,
);

module.exports = router;
