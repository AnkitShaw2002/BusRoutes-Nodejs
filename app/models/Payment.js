const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const paymentSchema = new Schema(
  {
    // Link to app entities
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Razorpay Identifiers
    razorpayOrderId: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    provider: { type: String, enum: ["razorpay", "stripe"], default: "razorpay", required: true },
    stripeCheckoutSessionId: { type: String, unique: true, sparse: true, trim: true },
    stripePaymentIntentId: { type: String, trim: true },
    razorpayPaymentId: {
      type: String, // Populated ONLY after verification
      sparse: true,
      trim: true,
    },
    razorpaySignature: {
      type: String, // Populated ONLY after verification
      trim: true,
    },

    // Amount & Currency
    amount: {
      type: Number, // Stored in INR rupees
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },

    // Payment Details (Captured after verification)
    paymentMethod: {
      type: String,
      enum: ["upi", "card", "netbanking", "wallet", "emi", "unknown"],
      default: "unknown",
      lowercase: true,
    },

    // Payment Status Lifecycle
    status: {
      type: String,
      enum: ["created", "captured", "failed", "refunded"],
      default: "created",
    },

    // Refund Tracking
    refundId: {
      type: String,
      default: null,
      trim: true,
    },
    refundedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    refundedAt: {
      type: Date,
      default: null,
    },
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

// High-performance indexes for lookups and transaction history
paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index({ bookingId: 1 });

const PaymentModel = mongoose.model("Payment", paymentSchema);
module.exports = PaymentModel;
