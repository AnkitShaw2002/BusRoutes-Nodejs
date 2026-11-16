const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const activityLogSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
    },
    module: {
      type: String,
      enum: [
        "Bus",
        "SeatLayout",
        "Route",
        "Stop",
        "Trip",
        "Booking",
        "Payment",
        "Coupon",
        "Customer",
        "Driver",
        "Staff",
        "Notification",
        "Banner",
        "Setting",
        "Auth",
        "Review",
      ],
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    ipAddress: {
      type: String,
      trim: true,
      default: null,
    },
    userAgent: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

// High-performance index for auditing user activity chronological feeds
activityLogSchema.index({ userId: 1, createdAt: -1 });
activityLogSchema.index({ module: 1, createdAt: -1 });

const ActivityLogModel = mongoose.model("ActivityLog", activityLogSchema);
module.exports = ActivityLogModel;