const crypto = require("crypto");
const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Passenger = require("../models/Passenger");
const Payment = require("../models/Payment");
const Trip = require("../models/Trip");
const Coupon = require("../models/Coupon");
const logger = require("../utils/logger");
const {
  send,
  fail,
  paginated,
  validId,
  logActivity,
  emit,
} = require("../utils/api");

const releaseExpiredReservations = async () => {
  const expiredBookings = await Booking.find({
    bookingStatus: "pending",
    paymentStatus: "pending",
    expiresAt: { $lte: new Date() },
    isDeleted: false,
  }).select("_id tripId seatNumbers totalSeats couponId");

  for (const booking of expiredBookings) {
    const result = await Booking.updateOne(
      { _id: booking._id, bookingStatus: "pending" },
      {
        bookingStatus: "cancelled",
        cancelledAt: new Date(),
        expiresAt: null,
      },
    );

    if (!result.modifiedCount) {
      continue;
    }

    await Trip.updateOne(
      { _id: booking.tripId },
      {
        $pull: { bookedSeatNumbers: { $in: booking.seatNumbers } },
        $inc: { availableSeats: booking.totalSeats },
      },
    );

    if (booking.couponId) {
      await Coupon.updateOne(
        { _id: booking.couponId, usedCount: { $gt: 0 } },
        { $inc: { usedCount: -1 } },
      );
    }

    emit(`trip_${booking.tripId}`, "seat_update", {
      tripId: booking.tripId,
      releasedSeatNumbers: booking.seatNumbers,
    });
  }
};

const createTicketCode = (booking) => {
  const secret = process.env.TICKET_SECRET || process.env.JWT_SECRET_KEY;
  if (!secret) throw new Error("Set TICKET_SECRET or JWT_SECRET_KEY before generating ticket codes.");
  return crypto
    .createHmac("sha256", secret)
    .update(`${booking._id}:${booking.bookingReference}`)
    .digest("hex");
};

const createTicketPdf = async (booking, passengers) => {
  const ticketCode = createTicketCode(booking);
  const qrCode = await require("qrcode").toDataURL(JSON.stringify({ bookingReference: booking.bookingReference, ticketCode }));
  const PDFDocument = require("pdfkit");
  const document = new PDFDocument({ margin: 48, size: "A4" });
  const chunks = [];
  document.on("data", (chunk) => chunks.push(chunk));
  const completed = new Promise((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  document.fontSize(22).text("Shamolly Express", { align: "center" }).moveDown(0.5);
  document.fontSize(16).text("Bus Ticket / Invoice", { align: "center" }).moveDown();
  document.fontSize(11).text(`Booking reference: ${booking.bookingReference}`);
  document.text(`Passenger: ${booking.userId?.name || "Customer"} (${booking.userId?.email || ""})`);
  document.text(`Route: ${booking.tripId?.routeId?.sourceCity || ""} to ${booking.tripId?.routeId?.destinationCity || ""}`);
  const departure = booking.tripId?.departureAt ? new Date(booking.tripId.departureAt).toLocaleString("en-IN", { timeZone: process.env.APP_TIMEZONE || "Asia/Kolkata" }) : "TBA";
  document.text(`Departure: ${departure}`);
  document.text(`Bus: ${booking.tripId?.busId?.busName || ""} (${booking.tripId?.busId?.busNumber || ""})`);
  document.text(`Seats: ${(booking.seatNumbers || []).join(", ")}`);
  document.text(`Boarding: ${booking.boardingPoint || "As selected"}    Dropping: ${booking.droppingPoint || "As selected"}`);
  document.text(`Payment: ${(booking.paymentMethod || "unknown").toUpperCase()} / ${(booking.paymentStatus || "").toUpperCase()}`);
  document.text(`Total: INR ${Number(booking.totalAmount || 0).toFixed(2)}`).moveDown();
  document.fontSize(13).text("Passengers").moveDown(0.3).fontSize(10);
  passengers.forEach((passenger) => document.text(`${passenger.seatNumber}  ${passenger.title || ""} ${passenger.name}  Age ${passenger.age}  ${passenger.gender || ""}`));
  const imageBuffer = Buffer.from(qrCode.split(",")[1], "base64");
  document.image(imageBuffer, document.page.width - 145, document.page.height - 190, { width: 95, height: 95 });
  document.fontSize(8).text("Show this ticket and QR code when boarding.", 48, document.page.height - 70);
  document.end();
  return completed;
};

class BookingController {
  /**
   * Reserve seats and create a pending booking for the authenticated customer.
   */
  async createBooking(req, res) {
    try {
      await releaseExpiredReservations();

      const {
        tripId,
        seats,
        passengers,
        boardingPoint,
        droppingPoint,
        couponCode,
      } = req.body;
      const isStaffSale = req.path.startsWith("/admin/bookings") && ["admin", "staff"].includes(req.user.role);
      if (isStaffSale && !["cash", "manual"].includes(req.body.paymentMethod || "cash")) return fail(res, 400, "Offline bookings accept cash or manual payment only.");

      if (
        !validId(tripId) ||
        !Array.isArray(seats) ||
        !seats.length ||
        !Array.isArray(passengers) ||
        passengers.length !== seats.length
      ) {
        return fail(
          res,
          400,
          "tripId, seats and one passenger per seat are required.",
        );
      }

      let bookingUserId = req.user._id;
      if (isStaffSale && req.body.customerId) {
        if (!validId(req.body.customerId)) return fail(res, 400, "Invalid customerId.");
        const customerRole = await require("../models/Role").findOne({ name: "customer" }).select("_id");
        const customer = customerRole && await require("../models/User").findOne({ _id: req.body.customerId, roleId: customerRole._id, isDeleted: false, status: "active" }).select("_id");
        if (!customer) return fail(res, 404, "Customer account not found.");
        bookingUserId = customer._id;
      }

      const seatNumbers = seats.map((seat) =>
        String(seat.seatNumber || "").trim(),
      );
      if (
        seatNumbers.some((seatNumber) => !seatNumber) ||
        new Set(seatNumbers).size !== seatNumbers.length
      ) {
        return fail(res, 400, "Seat numbers must be present and unique.");
      }

      const trip = await Trip.findOne({
        _id: tripId,
        isDeleted: false,
        status: { $in: ["scheduled", "boarding", "delayed"] },
        departureAt: { $gt: new Date() },
      });
      if (!trip) {
        return fail(res, 404, "Trip is unavailable for booking.");
      }

      const bus = await require("../models/Bus")
        .findById(trip.busId)
        .populate("seatLayoutId");
      if (!bus?.seatLayoutId) {
        return fail(res, 409, "Trip seat layout is unavailable.");
      }

      const seatMap = new Map(
        bus.seatLayoutId.seats.map((seat) => [seat.seatNumber, seat]),
      );
      const fareService = require("../services/fareService");
      const fareRules = await fareService.getFareRules(trip.routeId, trip.departureAt || trip.departureDate);
      const pricedSeats = [];

      for (let index = 0; index < seats.length; index++) {
        const requestedSeat = seats[index];
        const seat = seatMap.get(String(requestedSeat.seatNumber).trim());
        if (
          !seat ||
          seat.seatType === "blocked" ||
          seat.seatType === "reserved"
        ) {
          return fail(
            res,
            400,
            `Seat ${requestedSeat.seatNumber} cannot be booked.`,
          );
        }

        const price = fareService.getSeatFare(trip, seat, trip.departureAt || trip.departureDate, Number(passengers[index].age), fareRules);
        pricedSeats.push({
          seatNumber: seat.seatNumber,
          seatType: seat.seatType,
          price,
        });
      }

      const baseAmount = pricedSeats.reduce(
        (total, seat) => total + seat.price,
        0,
      );
      let coupon = null;
      let discountAmount = 0;

      if (couponCode) {
        coupon = await Coupon.findOneAndUpdate(
          {
            code: String(couponCode).toUpperCase(),
            status: "active",
            isDeleted: false,
            validFrom: { $lte: new Date() },
            validTill: { $gte: new Date() },
            $expr: { $lt: ["$usedCount", "$usageLimit"] },
          },
          { $inc: { usedCount: 1 } },
          { new: true },
        );

        if (!coupon) {
          return fail(res, 400, "Coupon is unavailable or expired.");
        }

        if (baseAmount < coupon.minAmount) {
          await Coupon.updateOne(
            { _id: coupon._id },
            { $inc: { usedCount: -1 } },
          );
          return fail(
            res,
            400,
            `Minimum booking amount is ${coupon.minAmount}.`,
          );
        }

        const requestedDiscount =
          coupon.discountType === "percentage"
            ? (baseAmount * coupon.discountValue) / 100
            : coupon.discountValue;
        discountAmount = Math.min(
          requestedDiscount,
          coupon.maxDiscount ?? Infinity,
          baseAmount,
        );
      }

      const reservedTrip = await Trip.findOneAndUpdate(
        {
          _id: tripId,
          availableSeats: { $gte: seatNumbers.length },
          bookedSeatNumbers: { $nin: seatNumbers },
        },
        {
          $addToSet: { bookedSeatNumbers: { $each: seatNumbers } },
          $inc: { availableSeats: -seatNumbers.length },
        },
        { new: true },
      );

      if (!reservedTrip) {
        if (coupon) {
          await Coupon.updateOne(
            { _id: coupon._id },
            { $inc: { usedCount: -1 } },
          );
        }
        return fail(
          res,
          409,
          "One or more seats were just booked. Refresh availability and try again.",
        );
      }

      const bookingReference = `BN${Date.now()
        .toString(36)
        .toUpperCase()}${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
      let booking;

      try {
        booking = await Booking.create({
          bookingReference,
          userId: bookingUserId,
          tripId,
          seats: pricedSeats,
          seatNumbers,
          totalSeats: seatNumbers.length,
          baseAmount,
          discountAmount,
          totalAmount: Math.max(0, baseAmount - discountAmount),
          couponCode: coupon?.code || null,
          couponId: coupon?._id || null,
          boardingPoint,
          droppingPoint,
          bookingStatus: isStaffSale ? "confirmed" : "pending",
          paymentStatus: isStaffSale ? "paid" : "pending",
          paymentMethod: isStaffSale ? (req.body.paymentMethod || "cash") : "razorpay",
          expiresAt: isStaffSale ? null : new Date(Date.now() + 10 * 60 * 1000),
        });

        await Passenger.insertMany(
          passengers.map((passenger, index) => ({
            bookingId: booking._id,
            title: passenger.title || "Mr",
            name: passenger.name,
            age: Number(passenger.age),
            gender: passenger.gender,
            seatNumber: seatNumbers[index],
          })),
        );

        if (isStaffSale) {
          const recipient = await require("../models/User").findById(bookingUserId).select("name email").lean();
          const tripDetails = await Trip.findById(tripId).populate("routeId").lean();
          if (recipient?.email && tripDetails?.routeId) {
            await require("../services/emailService").sendBookingConfirmationEmail(recipient, booking, tripDetails, tripDetails.routeId);
          }
        }

        await logActivity(
          req,
          "Booking",
          "Create",
          `Created booking ${bookingReference}`,
        );
        emit(`trip_${tripId}`, "seat_update", {
          tripId,
          bookedSeatNumbers: reservedTrip.bookedSeatNumbers,
          availableSeats: reservedTrip.availableSeats,
        });

        return send(
          res,
          booking,
          isStaffSale ? "Cash booking created and confirmed." : "Seats reserved. Complete payment within 10 minutes.",
          201,
        );
      } catch (error) {
        if (booking) {
          await Passenger.deleteMany({ bookingId: booking._id });
          await Booking.deleteOne({ _id: booking._id });
        }

        await Trip.updateOne(
          { _id: tripId },
          {
            $pull: { bookedSeatNumbers: { $in: seatNumbers } },
            $inc: { availableSeats: seatNumbers.length },
          },
        );
        if (coupon) {
          await Coupon.updateOne(
            { _id: coupon._id },
            { $inc: { usedCount: -1 } },
          );
        }
        throw error;
      }
    } catch (error) {
      logger.error(`Create Booking API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while creating the booking.",
      });
    }
  }

  /**
   * Get paginated bookings owned by the authenticated customer.
   */
  async listMyBookings(req, res) {
    try {
      return await paginated(
        res,
        req.query,
        { userId: req.user._id, isDeleted: false },
        Booking,
        { createdAt: -1 },
        "tripId",
      );
    } catch (error) {
      logger.error(`Customer Booking List API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading bookings.",
      });
    }
  }

  /**
   * Get a booking and its passenger details.
   */
  async getBooking(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid booking ID.");
      }

      const filter = { _id: req.params.id, isDeleted: false };
      if (req.user.role === "customer") {
        filter.userId = req.user._id;
      }

      const booking = await Booking.findOne(filter)
        .populate({
          path: "tripId",
          populate: [{ path: "routeId" }, { path: "busId" }],
        })
        .populate("paymentId")
        .lean();

      if (!booking) {
        return fail(res, 404, "Booking not found.");
      }

      const passengers = await Passenger.find({
        bookingId: booking._id,
        isDeleted: false,
      }).lean();

      return send(res, { ...booking, passengers });
    } catch (error) {
      logger.error(`Get Booking API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading the booking.",
      });
    }
  }

  /**
   * Download a confirmed booking as a PDF ticket with its QR verification code.
   */
  async downloadTicket(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid booking ID.");
      }

      const filter = {
        _id: req.params.id,
        isDeleted: false,
        bookingStatus: { $in: ["confirmed", "CONFIRMED", "completed"] },
      };
      if (req.user.role === "customer") {
        filter.userId = req.user._id;
      }

      const booking = await Booking.findOne(filter)
        .populate({
          path: "tripId",
          populate: [{ path: "routeId" }, { path: "busId" }],
        })
        .populate("userId", "name email phone")
        .lean();

      if (!booking) {
        return fail(res, 404, "Confirmed ticket not found.");
      }

      const passengers = await Passenger.find({
        bookingId: booking._id,
        isDeleted: false,
      })
        .sort({ seatNumber: 1 })
        .lean();
      const pdfBuffer = await createTicketPdf(booking, passengers);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="ticket-${booking.bookingReference}.pdf"`,
      );

      res.end(pdfBuffer);
    } catch (error) {
      logger.error(`Download Ticket API Error: ${error.message}`);
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          message: "An error occurred while generating the ticket.",
        });
      }
    }
  }

  async emailTicket(req, res) {
    try {
      if (!validId(req.params.id)) return fail(res, 400, "Invalid booking ID.");
      const filter = { _id: req.params.id, isDeleted: false, bookingStatus: { $in: ["confirmed", "CONFIRMED", "completed"] } };
      if (req.user.role === "customer") filter.userId = req.user._id;
      const booking = await Booking.findOne(filter).populate("userId", "name email").populate({ path: "tripId", populate: [{ path: "routeId" }, { path: "busId" }] }).lean();
      if (!booking) return fail(res, 404, "Confirmed booking not found.");
      if (!booking.userId?.email) return fail(res, 400, "Booking customer has no email address.");
      const passengers = await Passenger.find({ bookingId: booking._id, isDeleted: false }).sort({ seatNumber: 1 }).lean();
      const pdfBuffer = await createTicketPdf(booking, passengers);
      const sent = await require("../services/emailService").sendBookingTicketEmail(booking.userId.email, booking, pdfBuffer);
      if (!sent) return fail(res, 503, "Email delivery is unavailable. Configure SMTP and retry.");
      return send(res, null, "Ticket email sent.");
    } catch (error) {
      logger.error(`Email Ticket API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while emailing the ticket." });
    }
  }

  /**
   * Verify a ticket QR code for an assigned driver or operations staff member.
   */
  async verifyTicket(req, res) {
    try {
      const { bookingReference, ticketCode } = req.body;
      if (!bookingReference || !ticketCode) {
        return fail(res, 400, "bookingReference and ticketCode are required.");
      }

      const booking = await Booking.findOne({
        bookingReference: String(bookingReference).toUpperCase(),
        isDeleted: false,
        bookingStatus: { $in: ["confirmed", "CONFIRMED", "completed"] },
      })
        .populate("tripId", "driverId")
        .lean();

      if (!booking) {
        return fail(res, 404, "Valid ticket not found.");
      }

      if (
        req.user.role === "driver" &&
        String(booking.tripId?.driverId) !== String(req.user._id)
      ) {
        return fail(res, 403, "This trip is not assigned to you.");
      }

      const expected = createTicketCode(booking);
      const expectedBuffer = Buffer.from(expected);
      const receivedBuffer = Buffer.from(String(ticketCode));
      if (
        expectedBuffer.length !== receivedBuffer.length ||
        !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
      ) {
        return fail(res, 400, "Ticket QR code is invalid.");
      }

      return send(
        res,
        {
          valid: true,
          bookingReference: booking.bookingReference,
          seatNumbers: booking.seatNumbers,
          tripId: booking.tripId?._id,
        },
        "Ticket verified.",
      );
    } catch (error) {
      logger.error(`Verify Ticket API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while verifying the ticket.",
      });
    }
  }

  /**
   * Cancel a booking, refund its captured payment, and release its seats.
   */
  async cancelBooking(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid booking ID.");
      }

      const filter = {
        _id: req.params.id,
        isDeleted: false,
        bookingStatus: {
          $in: ["pending", "confirmed", "PENDING_PAYMENT", "CONFIRMED"],
        },
      };
      if (req.user.role === "customer") {
        filter.userId = req.user._id;
      }

      const existingBooking = await Booking.findOne(filter);
      if (!existingBooking) {
        return fail(res, 404, "Active booking not found.");
      }

      if (existingBooking.paymentStatus === "paid" && existingBooking.paymentId) {
        const payment = await Payment.findById(existingBooking.paymentId);
        if (payment?.status === "captured") {
          let refund;
          if (payment.provider === "stripe") {
            if (!process.env.STRIPE_SECRET_KEY || !payment.stripePaymentIntentId) return fail(res, 503, "Stripe refund processing is unavailable.");
            refund = await require("./paymentController").stripeRequest("refunds", "POST", { payment_intent: payment.stripePaymentIntentId, amount: String(Math.round(payment.amount * 100)) });
          } else {
            if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET || !payment.razorpayPaymentId) return fail(res, 503, "Refund processing is unavailable. Contact support to cancel this paid booking.");
            refund = await require("../config/razorpay").payments.refund(payment.razorpayPaymentId, { amount: Math.round(payment.amount * 100) });
          }
          payment.status = "refunded";
          payment.refundId = refund.id;
          payment.refundedAmount = payment.amount;
          payment.refundedAt = new Date();
          await payment.save();
        }
      }

      const booking = await Booking.findOneAndUpdate(
        { ...filter, bookingStatus: existingBooking.bookingStatus },
        {
          bookingStatus: "cancelled",
          paymentStatus:
            existingBooking.paymentStatus === "paid" && existingBooking.paymentId
              ? "refunded"
              : existingBooking.paymentStatus,
          cancelledAt: new Date(),
          expiresAt: null,
        },
        { new: true },
      );

      if (!booking) {
        return fail(res, 404, "Active booking not found.");
      }

      await Trip.updateOne(
        { _id: booking.tripId },
        {
          $pull: { bookedSeatNumbers: { $in: booking.seatNumbers } },
          $inc: { availableSeats: booking.totalSeats },
        },
      );
      if (booking.couponId) {
        await Coupon.updateOne(
          { _id: booking.couponId, usedCount: { $gt: 0 } },
          { $inc: { usedCount: -1 } },
        );
      }

      emit(`trip_${booking.tripId}`, "seat_update", {
        tripId: booking.tripId,
        releasedSeatNumbers: booking.seatNumbers,
      });
      await logActivity(
        req,
        "Booking",
        "Cancel",
        `Cancelled booking ${booking.bookingReference}`,
      );

      try {
        const customer = await require("../models/User").findById(booking.userId).select("name email").lean();
        if (customer?.email) {
          const refundNotice = booking.paymentStatus === "refunded" ? booking.totalAmount : (booking.paymentStatus === "paid" && ["cash", "manual"].includes(booking.paymentMethod) ? -1 : 0);
          await require("../services/emailService").sendBookingCancellationEmail(customer, booking, refundNotice);
        }
      } catch (emailError) {
        logger.warn(`Booking cancellation email skipped: ${emailError.message}`);
      }

      return send(res, booking, "Booking cancelled.");
    } catch (error) {
      logger.error(`Cancel Booking API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while cancelling the booking.",
      });
    }
  }

  /** Move an active booking to another trip without changing the fare paid. */
  async rescheduleBooking(req, res) {
    let targetTrip;
    let reservedSeats;
    try {
      if (!validId(req.params.id) || !validId(req.body.tripId)) return fail(res, 400, "Valid booking ID and target tripId are required.");
      const bookingFilter = { _id: req.params.id, isDeleted: false, bookingStatus: { $in: ["confirmed", "CONFIRMED"] } };
      if (req.user.role === "customer") bookingFilter.userId = req.user._id;
      const booking = await Booking.findOne(bookingFilter);
      if (!booking) return fail(res, 404, "Confirmed booking not found.");
      if (String(booking.tripId) === String(req.body.tripId)) return fail(res, 400, "Choose a different trip.");

      targetTrip = await Trip.findOne({ _id: req.body.tripId, isDeleted: false, status: { $in: ["scheduled", "boarding", "delayed"] }, departureAt: { $gt: new Date() } });
      if (!targetTrip) return fail(res, 404, "Target trip is unavailable.");
      const seatNumbers = Array.isArray(req.body.seats) ? req.body.seats.map((seat) => String(seat.seatNumber || seat).trim()) : booking.seatNumbers;
      if (seatNumbers.length !== booking.totalSeats || seatNumbers.some((seat) => !seat) || new Set(seatNumbers).size !== seatNumbers.length) return fail(res, 400, "Provide one unique target seat per passenger.");
      const bus = await require("../models/Bus").findById(targetTrip.busId).populate("seatLayoutId");
      if (!bus?.seatLayoutId) return fail(res, 409, "Target trip seat layout is unavailable.");
      const passengers = await Passenger.find({ bookingId: booking._id }).sort({ seatNumber: 1 }).lean();
      const fareService = require("../services/fareService");
      const fareRules = await fareService.getFareRules(targetTrip.routeId, targetTrip.departureAt || targetTrip.departureDate);
      const seatsByNumber = new Map(bus.seatLayoutId.seats.map((seat) => [seat.seatNumber, seat]));
      const newSeats = seatNumbers.map((number, index) => {
        const seat = seatsByNumber.get(number);
        if (!seat || ["blocked", "reserved"].includes(seat.seatType)) return null;
        return { seatNumber: number, seatType: seat.seatType, price: fareService.getSeatFare(targetTrip, seat, targetTrip.departureAt || targetTrip.departureDate, passengers[index]?.age, fareRules) };
      });
      if (newSeats.some((seat) => !seat)) return fail(res, 400, "One or more target seats cannot be booked.");
      const newTotal = newSeats.reduce((sum, seat) => sum + seat.price, 0) - booking.discountAmount;
      if (Math.abs(newTotal - booking.totalAmount) > 0.01) return fail(res, 409, "The target trip has a different fare. Rescheduling requires the same total fare; contact support for fare changes.");

      const reservation = await Trip.updateOne({ _id: targetTrip._id, availableSeats: { $gte: seatNumbers.length }, bookedSeatNumbers: { $nin: seatNumbers } }, { $addToSet: { bookedSeatNumbers: { $each: seatNumbers } }, $inc: { availableSeats: -seatNumbers.length } });
      if (!reservation.modifiedCount) return fail(res, 409, "One or more target seats are no longer available.");
      reservedSeats = seatNumbers;

      const oldTripId = booking.tripId;
      const updated = await Booking.findOneAndUpdate({ _id: booking._id, tripId: oldTripId, bookingStatus: booking.bookingStatus }, { $set: { tripId: targetTrip._id, seats: newSeats, seatNumbers, baseAmount: newSeats.reduce((sum, seat) => sum + seat.price, 0), expiresAt: null } }, { new: true, runValidators: true });
      if (!updated) {
        await Trip.updateOne({ _id: targetTrip._id }, { $pull: { bookedSeatNumbers: { $in: seatNumbers } }, $inc: { availableSeats: seatNumbers.length } });
        reservedSeats = null;
        return fail(res, 409, "Booking changed while rescheduling. Please retry.");
      }
      reservedSeats = null;

      await Passenger.bulkWrite(passengers.map((passenger, index) => ({ updateOne: { filter: { _id: passenger._id }, update: { $set: { seatNumber: seatNumbers[index] } } } })));
      await Trip.updateOne({ _id: oldTripId }, { $pull: { bookedSeatNumbers: { $in: booking.seatNumbers } }, $inc: { availableSeats: booking.totalSeats } });
      emit(`trip_${oldTripId}`, "seat_update", { tripId: oldTripId, releasedSeatNumbers: booking.seatNumbers });
      emit(`trip_${targetTrip._id}`, "seat_update", { tripId: targetTrip._id, bookedSeatNumbers: seatNumbers });
      await logActivity(req, "Booking", "Reschedule", `Rescheduled booking ${booking.bookingReference}`);
      return send(res, updated, "Booking rescheduled.");
    } catch (error) {
      if (targetTrip && reservedSeats) {
        await Trip.updateOne({ _id: targetTrip._id }, { $pull: { bookedSeatNumbers: { $in: reservedSeats } }, $inc: { availableSeats: reservedSeats.length } }).catch(() => {});
      }
      logger.error(`Reschedule Booking API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while rescheduling the booking." });
    }
  }

  /**
   * List and filter bookings for authorized staff and administrators.
   */
  async adminBookings(req, res) {
    try {
      const filter = { isDeleted: false };
      if (req.query.status) {
        filter.bookingStatus = req.query.status;
      }
      if (req.query.tripId && validId(req.query.tripId)) {
        filter.tripId = req.query.tripId;
      }

      return await paginated(
        res,
        req.query,
        filter,
        Booking,
        { createdAt: -1 },
        "userId tripId paymentId",
      );
    } catch (error) {
      logger.error(`Admin Booking List API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading bookings.",
      });
    }
  }

  /**
   * Update booking status and boarding or dropping points.
   */
  async adminUpdateBooking(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid booking ID.");
      }

      const allowedFields = ["bookingStatus", "boardingPoint", "droppingPoint"];
      const updates = Object.fromEntries(
        Object.entries(req.body).filter(([key]) => allowedFields.includes(key)),
      );
      if (updates.bookingStatus && !["confirmed", "completed"].includes(updates.bookingStatus)) {
        return fail(res, 400, "Use the booking cancellation endpoint for cancellations; payment status can only be changed by a verified payment or refund.");
      }
      const booking = await Booking.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false, ...(updates.bookingStatus === "completed" ? { paymentStatus: "paid", bookingStatus: { $in: ["confirmed", "CONFIRMED"] } } : {}) },
        updates,
        { new: true, runValidators: true },
      );

      return booking
        ? send(res, booking, "Booking updated.")
        : fail(res, 404, "Booking not found.");
    } catch (error) {
      logger.error(`Update Booking API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while updating the booking.",
      });
    }
  }

  /**
   * Get the passenger manifest for a trip assigned to the current driver.
   */
  async manifest(req, res) {
    try {
      if (!validId(req.params.tripId)) {
        return fail(res, 400, "Invalid trip ID.");
      }

      const trip = await Trip.findById(req.params.tripId);
      if (!trip) {
        return fail(res, 404, "Trip not found.");
      }

      if (
        req.user.role === "driver" &&
        String(trip.driverId) !== String(req.user._id)
      ) {
        return fail(res, 403, "This trip is not assigned to you.");
      }

      const passengerRows = await Booking.aggregate([
        {
          $match: {
            tripId: new mongoose.Types.ObjectId(req.params.tripId),
            bookingStatus: { $in: ["confirmed", "CONFIRMED", "completed"] },
            isDeleted: false,
          },
        },
        {
          $lookup: {
            from: "passengers",
            localField: "_id",
            foreignField: "bookingId",
            as: "passengers",
          },
        },
        { $unwind: "$passengers" },
        {
          $project: {
            bookingReference: 1,
            seatNumber: "$passengers.seatNumber",
            name: "$passengers.name",
            age: "$passengers.age",
            gender: "$passengers.gender",
            userId: 1,
          },
        },
        { $sort: { seatNumber: 1 } },
      ]);

      return send(res, passengerRows);
    } catch (error) {
      logger.error(`Trip Passenger Manifest API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading the passenger manifest.",
      });
    }
  }
}

const bookingController = new BookingController();
bookingController.releaseExpiredReservations = releaseExpiredReservations;

module.exports = bookingController;
