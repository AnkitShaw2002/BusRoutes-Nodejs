const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const bookingSchema = new Schema(
  {
    bookingReference: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    bookingCode: {
      type: String,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    tripId: {
      type: Schema.Types.ObjectId,
      ref: "Trip",
      required: true,
    },
    seats: [
      {
        seatNumber: { type: String, required: true, trim: true },
        seatType: { type: String, trim: true },
        price: { type: Number, required: true, min: 0 },
      },
    ],
    seatNumbers: [
      {
        type: String,
        trim: true,
      },
    ],
    totalSeats: {
      type: Number,
      required: true,
      min: 1,
    },
    baseAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    ticketPrice: {
      type: Number,
      min: 0,
    },
    couponCode: {
      type: String,
      trim: true,
      default: null,
    },
    couponId: {
      type: Schema.Types.ObjectId,
      ref: "Coupon",
      default: null,
    },
    boardingPoint: {
      type: String,
      trim: true,
    },
    droppingPoint: {
      type: String,
      trim: true,
    },
    bookingStatus: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed", "PENDING_PAYMENT", "CONFIRMED"],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["razorpay", "stripe", "cash", "manual", "unknown"],
      default: "unknown",
    },
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null, // Used for temporary seat reservation locks (e.g., 10 minutes)
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    reminderSentAt: { type: Date, default: null },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

// High-performance indexes for user booking history and trip lookups
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ tripId: 1, bookingStatus: 1 });

// Prevent overlapping active reservations on the same trip seats
bookingSchema.index(
  {
    tripId: 1,
    seatNumbers: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      bookingStatus: {
        $in: ["pending", "confirmed", "PENDING_PAYMENT", "CONFIRMED"],
      },
    },
  }
);

const BookingModel = mongoose.model("Booking", bookingSchema);
module.exports = BookingModel;
