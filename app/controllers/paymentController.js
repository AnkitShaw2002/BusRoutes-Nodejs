const crypto = require("crypto");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const logger = require("../utils/logger");
const {
  send,
  fail,
  paginated,
  validId,
  emit,
  logActivity,
} = require("../utils/api");

const getRazorpayClient = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    return null;
  }

  return require("../config/razorpay");
};

const stripeRequest = async (path, method = "POST", values = {}) => {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.STRIPE_SECRET_KEY}:`).toString("base64")}`,
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(method === "POST" ? { body: new URLSearchParams(values) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message || "Stripe request failed.");
  return result;
};

class PaymentController {
  /**
   * Create a Razorpay order for a customer's active seat reservation.
   */
  async createOrder(req, res) {
    try {
      const { bookingId } = req.body;
      if (!validId(bookingId)) {
        return fail(res, 400, "A valid bookingId is required.");
      }

      const booking = await Booking.findOne({
        _id: bookingId,
        userId: req.user._id,
        isDeleted: false,
        bookingStatus: "pending",
        paymentStatus: "pending",
        expiresAt: { $gt: new Date() },
      });

      if (!booking) {
        return fail(res, 404, "Unpaid booking not found or reservation expired.");
      }

      if (!process.env.RAZORPAY_KEY_SECRET) return fail(res, 503, "Razorpay is not configured.");

      const razorpay = getRazorpayClient();
      if (!razorpay) {
        return fail(res, 503, "Razorpay is not configured.");
      }

      const order = await razorpay.orders.create({
        amount: Math.round(booking.totalAmount * 100),
        currency: "INR",
        receipt: booking.bookingReference,
        notes: {
          bookingId: String(booking._id),
          userId: String(req.user._id),
        },
      });

      const payment = await Payment.create({
        bookingId: booking._id,
        userId: req.user._id,
        razorpayOrderId: order.id,
        amount: booking.totalAmount,
        currency: order.currency,
        provider: "razorpay",
        status: "created",
      });

      booking.paymentId = payment._id;
      await booking.save();

      return send(
        res,
        { payment, order, keyId: process.env.RAZORPAY_KEY_ID },
        "Razorpay order created.",
        201,
      );
    } catch (error) {
      logger.error(`Create Payment Order API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while creating the payment order.",
      });
    }
  }

  async createStripeCheckout(req, res) {
    try {
      const { bookingId } = req.body;
      if (!validId(bookingId)) return fail(res, 400, "A valid bookingId is required.");
      const booking = await Booking.findOne({ _id: bookingId, userId: req.user._id, isDeleted: false, bookingStatus: "pending", paymentStatus: "pending", expiresAt: { $gt: new Date() } });
      if (!booking) return fail(res, 404, "Unpaid booking not found or reservation expired.");
      if (!process.env.STRIPE_SECRET_KEY) return fail(res, 503, "Stripe is not configured.");
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const session = await stripeRequest("checkout/sessions", "POST", {
        mode: "payment",
        success_url: `${frontendUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${frontendUrl}/payment/cancel?booking_id=${booking._id}`,
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "inr",
        "line_items[0][price_data][unit_amount]": String(Math.round(booking.totalAmount * 100)),
        "line_items[0][price_data][product_data][name]": `Bus ticket ${booking.bookingReference}`,
        "metadata[bookingId]": String(booking._id),
        "metadata[userId]": String(req.user._id),
      });
      const payment = await Payment.create({ bookingId: booking._id, userId: req.user._id, razorpayOrderId: `stripe_${session.id}`, stripeCheckoutSessionId: session.id, amount: booking.totalAmount, currency: "INR", provider: "stripe", status: "created" });
      booking.paymentId = payment._id;
      booking.paymentMethod = "stripe";
      await booking.save();
      return send(res, { payment, checkoutUrl: session.url }, "Stripe checkout session created.", 201);
    } catch (error) {
      logger.error(`Create Stripe Checkout API Error: ${error.message}`);
      return res.status(502).json({ success: false, message: "Stripe checkout could not be created." });
    }
  }

  async stripeWebhook(req, res) {
    try {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      const signatureHeader = req.get("stripe-signature");
      if (!secret) return fail(res, 503, "Stripe webhook secret is not configured.");
      if (!signatureHeader || !req.rawBody) return fail(res, 400, "Stripe signature or raw request body is missing.");
      const parts = Object.fromEntries(signatureHeader.split(",").map((part) => part.split("=")));
      const timestamp = Number(parts.t);
      if (!timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300 || !parts.v1) return fail(res, 400, "Stripe webhook signature is invalid or expired.");
      const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${req.rawBody.toString()}`).digest("hex");
      const expectedBuffer = Buffer.from(expected);
      const receivedBuffer = Buffer.from(parts.v1);
      if (expectedBuffer.length !== receivedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) return fail(res, 400, "Invalid Stripe webhook signature.");
      const event = JSON.parse(req.rawBody.toString());
      if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) {
        const session = event.data?.object;
        const payment = await Payment.findOne({ stripeCheckoutSessionId: session?.id, provider: "stripe", isDeleted: false });
        if (payment && (session.amount_total !== Math.round(payment.amount * 100) || String(session.currency).toUpperCase() !== payment.currency || session.metadata?.bookingId !== String(payment.bookingId) || session.metadata?.userId !== String(payment.userId))) return fail(res, 400, "Stripe checkout details do not match this booking.");
        if (payment && payment.status !== "captured" && session.payment_status === "paid") {
          const booking = await Booking.findOne({ _id: payment.bookingId, userId: payment.userId, bookingStatus: "pending", paymentStatus: "pending", expiresAt: { $gt: new Date() } });
          if (!booking) {
            if (!session.payment_intent) return fail(res, 409, "Expired booking has no Stripe payment intent to refund.");
            const refund = await stripeRequest("refunds", "POST", { payment_intent: session.payment_intent });
            payment.status = "refunded";
            payment.refundId = refund.id;
            payment.refundedAmount = payment.amount;
            payment.refundedAt = new Date();
            payment.stripePaymentIntentId = session.payment_intent;
            await payment.save();
            return res.status(200).json({ received: true, refunded: true });
          }
          payment.status = "captured";
          payment.stripePaymentIntentId = session.payment_intent;
          await payment.save();
          booking.paymentId = payment._id;
          booking.paymentStatus = "paid";
          booking.bookingStatus = "confirmed";
          booking.expiresAt = null;
          await booking.save();
          emit(`user_${booking.userId}`, "booking_confirmed", { booking });
          try {
            const user = await require("../models/User").findById(booking.userId).select("name email").lean();
            const trip = await require("../models/Trip").findById(booking.tripId).populate("routeId").lean();
            if (user?.email && trip?.routeId) await require("../services/emailService").sendBookingConfirmationEmail(user, booking, trip, trip.routeId);
          } catch (emailError) { logger.warn(`Stripe confirmation email skipped: ${emailError.message}`); }
        }
      }
      if (event.type === "checkout.session.async_payment_failed") {
        const session = event.data?.object;
        await Payment.updateOne({ stripeCheckoutSessionId: session?.id, provider: "stripe", status: "created" }, { status: "failed" });
      }
      return res.status(200).json({ received: true });
    } catch (error) {
      logger.error(`Stripe Webhook API Error: ${error.message}`);
      return res.status(400).json({ success: false, message: "Stripe webhook could not be processed." });
    }
  }

  /**
   * Verify Razorpay's payment signature and confirm the related booking.
   */
  async verifyPayment(req, res) {
    try {
      const {
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      } = req.body;

      if (!orderId || !paymentId || !signature) {
        return fail(
          res,
          400,
          "razorpay_order_id, razorpay_payment_id and razorpay_signature are required.",
        );
      }

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
        .update(`${orderId}|${paymentId}`)
        .digest("hex");
      const expectedBuffer = Buffer.from(expectedSignature);
      const receivedBuffer = Buffer.from(String(signature));

      if (
        expectedBuffer.length !== receivedBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
      ) {
        return fail(res, 400, "Invalid payment signature.");
      }

      const payment = await Payment.findOne({
        razorpayOrderId: orderId,
        userId: req.user._id,
        isDeleted: false,
      });

      if (!payment) {
        return fail(res, 404, "Payment order not found.");
      }

      const razorpay = getRazorpayClient();
      if (!razorpay) return fail(res, 503, "Razorpay payment verification is not configured.");
      const providerPayment = await razorpay.payments.fetch(paymentId);
      const expectedAmount = Math.round(payment.amount * 100);
      if (providerPayment.order_id !== orderId || providerPayment.amount !== expectedAmount || providerPayment.currency !== payment.currency) {
        return fail(res, 400, "Razorpay payment details do not match this booking.");
      }
      if (providerPayment.status === "authorized") await razorpay.payments.capture(paymentId, expectedAmount, payment.currency);
      else if (providerPayment.status !== "captured") return fail(res, 400, "Razorpay payment has not been captured.");

      if (payment.status === "captured") {
        return send(res, payment, "Payment already verified.");
      }

      const activeBooking = await Booking.findOne({
        _id: payment.bookingId,
        userId: req.user._id,
        bookingStatus: "pending",
        paymentStatus: "pending",
        expiresAt: { $gt: new Date() },
      });

      if (!activeBooking) {
        const razorpay = getRazorpayClient();
        if (!razorpay) {
          return fail(res, 503, "Payment refund processing is not configured.");
        }

        const refund = await razorpay.payments.refund(paymentId, {
          amount: Math.round(payment.amount * 100),
        });
        payment.razorpayPaymentId = paymentId;
        payment.razorpaySignature = signature;
        payment.status = "refunded";
        payment.refundId = refund.id;
        payment.refundedAmount = payment.amount;
        payment.refundedAt = new Date();
        await payment.save();

        return fail(res, 409, "The seat reservation expired. Payment was refunded.");
      }

      payment.razorpayPaymentId = paymentId;
      payment.razorpaySignature = signature;
      payment.status = "captured";
      await payment.save();

      const booking = await Booking.findOneAndUpdate(
        {
          _id: payment.bookingId,
          userId: req.user._id,
          bookingStatus: "pending",
          paymentStatus: "pending",
          expiresAt: { $gt: new Date() },
        },
        {
          paymentId: payment._id,
          paymentStatus: "paid",
          bookingStatus: "confirmed",
          expiresAt: null,
        },
        { new: true },
      );

      if (!booking) {
        const razorpay = getRazorpayClient();
        if (!razorpay) {
          return fail(res, 503, "Payment refund processing is not configured.");
        }

        const refund = await razorpay.payments.refund(paymentId, {
          amount: Math.round(payment.amount * 100),
        });
        payment.status = "refunded";
        payment.refundId = refund.id;
        payment.refundedAmount = payment.amount;
        payment.refundedAt = new Date();
        await payment.save();

        return fail(res, 409, "The seat reservation expired. Payment was refunded.");
      }

      await logActivity(
        req,
        "Payment",
        "Capture",
        `Captured payment for ${booking.bookingReference}`,
      );

      const result = { payment, booking };
      try {
        const user = await require("../models/User").findById(req.user._id).select("name email").lean();
        const trip = await Trip.findById(booking.tripId).populate("routeId").lean();
        if (user?.email && trip?.routeId) {
          await require("../services/emailService").sendBookingConfirmationEmail(user, booking, trip, trip.routeId);
        }
      } catch (emailError) {
        logger.warn(`Booking confirmation email skipped: ${emailError.message}`);
      }
      emit(`user_${req.user._id}`, "booking_confirmed", result);
      emit(`trip_${booking.tripId}`, "booking_confirmed", {
        bookingId: booking._id,
        seatNumbers: booking.seatNumbers,
      });

      return send(res, result, "Payment verified and booking confirmed.");
    } catch (error) {
      logger.error(`Verify Payment API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while verifying the payment.",
      });
    }
  }

  /**
   * Get paginated payment history for the authenticated user.
   */
  async myPayments(req, res) {
    try {
      return await paginated(
        res,
        req.query,
        { userId: req.user._id, isDeleted: false },
        Payment,
        { createdAt: -1 },
        "bookingId",
      );
    } catch (error) {
      logger.error(`Payment History API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading payment history.",
      });
    }
  }

  /**
   * Get paginated payments for the admin payment-management screen.
   */
  async adminPayments(req, res) {
    try {
      const filter = { isDeleted: false };
      if (req.query.status) {
        filter.status = req.query.status;
      }

      return await paginated(
        res,
        req.query,
        filter,
        Payment,
        { createdAt: -1 },
        "bookingId userId",
      );
    } catch (error) {
      logger.error(`Admin Payment List API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading payments.",
      });
    }
  }

  /**
   * Refund a captured payment through Razorpay and release its reserved seats.
   */
  async refundPayment(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid payment ID.");
      }

      const payment = await Payment.findOne({
        _id: req.params.id,
        status: "captured",
        isDeleted: false,
      });

      if (!payment) {
        return fail(res, 404, "Captured payment not found.");
      }

      let refund;
      if (payment.provider === "stripe") {
        if (!process.env.STRIPE_SECRET_KEY) return fail(res, 503, "Stripe is not configured.");
        if (!payment.stripePaymentIntentId) return fail(res, 409, "Stripe payment intent is missing.");
        refund = await stripeRequest("refunds", "POST", { payment_intent: payment.stripePaymentIntentId, amount: String(Math.round(payment.amount * 100)) });
      } else {
        const razorpay = getRazorpayClient();
        if (!razorpay) return fail(res, 503, "Razorpay is not configured.");
        if (!payment.razorpayPaymentId) return fail(res, 409, "Razorpay payment ID is missing.");
        refund = await razorpay.payments.refund(payment.razorpayPaymentId, { amount: Math.round(payment.amount * 100) });
      }

      payment.status = "refunded";
      payment.refundId = refund.id;
      payment.refundedAmount = payment.amount;
      payment.refundedAt = new Date();
      await payment.save();

      await Booking.updateOne(
        { _id: payment.bookingId },
        {
          paymentStatus: "refunded",
          bookingStatus: "cancelled",
          cancelledAt: new Date(),
        },
      );

      const booking = await Booking.findById(payment.bookingId);
      if (booking) {
        await require("../models/Trip").updateOne(
          { _id: booking.tripId },
          {
            $pull: { bookedSeatNumbers: { $in: booking.seatNumbers } },
            $inc: { availableSeats: booking.totalSeats },
          },
        );
        emit(`trip_${booking.tripId}`, "seat_update", {
          tripId: booking.tripId,
          releasedSeatNumbers: booking.seatNumbers,
        });
      }

      return send(res, payment, "Refund processed.");
    } catch (error) {
      logger.error(`Refund Payment API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while processing the refund.",
      });
    }
  }

  /**
   * Verify and process signed Razorpay payment-captured webhook events.
   */
  async webhook(req, res) {
    try {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!webhookSecret) {
        return fail(res, 503, "Razorpay webhook secret is not configured.");
      }

      const signature = req.get("x-razorpay-signature");
      const rawBody = req.rawBody;
      if (!signature || !rawBody) {
        return fail(res, 400, "Webhook signature or raw request body is missing.");
      }

      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");
      const expectedBuffer = Buffer.from(expectedSignature);
      const receivedBuffer = Buffer.from(signature);

      if (
        expectedBuffer.length !== receivedBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
      ) {
        return fail(res, 400, "Invalid webhook signature.");
      }

      if (req.body?.event === "payment.captured") {
        const paymentEntity = req.body.payload?.payment?.entity;
        const payment = await Payment.findOne({
          razorpayOrderId: paymentEntity?.order_id,
        });

        if (payment && (paymentEntity?.amount !== Math.round(payment.amount * 100) || paymentEntity?.currency !== payment.currency)) return fail(res, 400, "Razorpay webhook payment does not match its order.");

        if (payment && payment.status !== "captured") {
          payment.razorpayPaymentId = paymentEntity.id;
          payment.status = "captured";
          await payment.save();

          const booking = await Booking.findOneAndUpdate(
            {
              _id: payment.bookingId,
              bookingStatus: "pending",
              paymentStatus: "pending",
              expiresAt: { $gt: new Date() },
            },
            {
              paymentId: payment._id,
              paymentStatus: "paid",
              bookingStatus: "confirmed",
              expiresAt: null,
            },
            { new: true },
          );

          if (booking) {
            emit(`user_${booking.userId}`, "booking_confirmed", { booking });
            try {
              const user = await require("../models/User").findById(booking.userId).select("name email").lean();
              const trip = await require("../models/Trip").findById(booking.tripId).populate("routeId").lean();
              if (user?.email && trip?.routeId) await require("../services/emailService").sendBookingConfirmationEmail(user, booking, trip, trip.routeId);
            } catch (emailError) {
              logger.warn(`Webhook confirmation email skipped: ${emailError.message}`);
            }
          } else {
            const razorpay = getRazorpayClient();
            if (!razorpay) {
              return fail(res, 503, "Payment refund processing is not configured.");
            }

            const refund = await razorpay.payments.refund(paymentEntity.id, {
              amount: Math.round(payment.amount * 100),
            });
            payment.status = "refunded";
            payment.refundId = refund.id;
            payment.refundedAmount = payment.amount;
            payment.refundedAt = new Date();
            await payment.save();
          }
        }
      }

      return res.status(200).json({ received: true });
    } catch (error) {
      logger.error(`Razorpay Webhook API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while processing the payment webhook.",
      });
    }
  }
}

module.exports = new PaymentController();
module.exports.stripeRequest = stripeRequest;
