const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/paymentController");
const { checkAuth, authorizeRoles } = require("../middleware/checkAuth");

// ==========================================
// CUSTOMER PAYMENT ROUTES
// ==========================================

// Create Razorpay Order
/**
 * @swagger
 * /api/v1/payments/orders:
 *   post:
 *     summary: Create a Razorpay order for a pending booking
 *     description: Create a payment order for the authenticated customer's active seat reservation.
 *     tags:
 *       - Payments
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bookingId
 *             properties:
 *               bookingId:
 *                 type: string
 *                 example: 65f1a2b3c4d5e6f7a8b9c0d1
 *     responses:
 *       201:
 *         description: Razorpay order created successfully
 *       400:
 *         description: Invalid booking ID
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Pending booking not found or reservation expired
 *       503:
 *         description: Razorpay is not configured
 *       500:
 *         description: Internal server error
 */
router.post(
  "/payments/orders",
  checkAuth,
  paymentController.createOrder,
);

/**
 * @swagger
 * /api/v1/payments/stripe/checkout:
 *   post:
 *     summary: Create a Stripe Checkout session
 *     description: Create a hosted Stripe Checkout session for an active booking; confirmation arrives through the signed webhook.
 *     tags: [Payments]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bookingId]
 *             properties:
 *               bookingId: { type: string }
 *     responses:
 *       201: { description: Checkout URL created }
 *       503: { description: Stripe is not configured }
 */
router.post("/payments/stripe/checkout", checkAuth, paymentController.createStripeCheckout);

// Verify Razorpay Payment
/**
 * @swagger
 * /api/v1/payments/verify:
 *   post:
 *     summary: Verify a Razorpay payment and confirm the booking
 *     description: Validate Razorpay's payment signature and mark the related booking as confirmed.
 *     tags:
 *       - Payments
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - razorpay_order_id
 *               - razorpay_payment_id
 *               - razorpay_signature
 *             properties:
 *               razorpay_order_id:
 *                 type: string
 *               razorpay_payment_id:
 *                 type: string
 *               razorpay_signature:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment verified and booking confirmed
 *       400:
 *         description: Invalid or incomplete payment signature
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Payment order not found
 *       409:
 *         description: Seat reservation expired and payment was refunded
 *       500:
 *         description: Internal server error
 */
router.post(
  "/payments/verify",
  checkAuth,
  paymentController.verifyPayment,
);

// Get Current Customer Payment History
/**
 * @swagger
 * /api/v1/payments:
 *   get:
 *     summary: Get the current customer's payment history
 *     description: Return a paginated list of payments made by the authenticated user.
 *     tags:
 *       - Payments
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
 *         description: Payment history returned successfully
 *       401:
 *         description: Authentication required
 */
router.get(
  "/payments",
  checkAuth,
  paymentController.myPayments,
);

// List Payments for Staff and Admin
/**
 * @swagger
 * /api/v1/admin/payments:
 *   get:
 *     summary: List payments for administration
 *     description: Return a paginated list of payments with an optional payment status filter.
 *     tags:
 *       - Payments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [created, captured, failed, refunded]
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
 *         description: Payment records returned successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Staff or admin role required
 */
router.get(
  "/admin/payments",
  checkAuth,
  authorizeRoles("admin", "staff"),
  paymentController.adminPayments,
);

// Refund Captured Payment
/**
 * @swagger
 * /api/v1/admin/payments/{id}/refund:
 *   post:
 *     summary: Refund a captured payment through Razorpay
 *     tags:
 *       - Payments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Refund processed successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Captured payment not found
 *       503:
 *         description: Razorpay is not configured
 */
router.post(
  "/admin/payments/:id/refund",
  checkAuth,
  authorizeRoles("admin"),
  paymentController.refundPayment,
);

// Razorpay Webhook
/**
 * @swagger
 * /api/v1/payments/webhook:
 *   post:
 *     summary: Receive signed Razorpay payment webhook events
 *     description: Validate Razorpay's webhook signature and process captured payments.
 *     tags:
 *       - Payments
 *     parameters:
 *       - in: header
 *         name: x-razorpay-signature
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook event accepted
 *       400:
 *         description: Missing or invalid webhook signature
 *       503:
 *         description: Webhook secret is not configured
 */
router.post(
  "/payments/webhook",
  paymentController.webhook,
);

/**
 * @swagger
 * /api/v1/payments/stripe/webhook:
 *   post:
 *     summary: Receive signed Stripe Checkout events
 *     tags: [Payments]
 *     parameters:
 *       - in: header
 *         name: stripe-signature
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: Webhook accepted }
 *       400: { description: Invalid signature or event }
 *       503: { description: Stripe webhook secret is not configured }
 */
router.post("/payments/stripe/webhook", paymentController.stripeWebhook);

module.exports = router;
