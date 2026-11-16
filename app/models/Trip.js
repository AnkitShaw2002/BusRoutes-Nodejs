const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const tripSchema = new Schema(
  {
    routeId: {
      type: Schema.Types.ObjectId,
      ref: "Route",
      required: true,
    },
    busId: {
      type: Schema.Types.ObjectId,
      ref: "Bus",
      required: true,
    },
    driverId: {
      type: Schema.Types.ObjectId,
      ref: "User", // References User model with 'driver' role
      default: null,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User", // References User model with 'admin' role
      required: true,
    },
    departureDate: {
      type: Date,
      required: true,
    },
    departureTime: {
      type: String,
      required: true,
      trim: true,
    },
    arrivalTime: {
      type: String,
      required: true,
      trim: true,
    },
    departureAt: {
      type: Date,
    },
    arrivalAt: {
      type: Date,
    },
    estimatedTravelTime: {
      type: String,
      trim: true,
    },
    baseFare: {
      type: Number,
      required: true,
      min: 0,
    },
    premiumFare: {
      type: Number,
      default: 0,
      min: 0,
    },
    availableSeats: {
      type: Number,
      required: true,
      min: 0,
    },
    bookedSeatNumbers: [
      {
        type: String,
        trim: true,
      },
    ],
    status: {
      type: String,
      enum: [
        "scheduled",
        "boarding",
        "departed",
        "running",
        "completed",
        "delayed",
        "cancelled",
      ],
      default: "scheduled",
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

// High-performance indexes for search and scheduling queries
tripSchema.index({ departureDate: 1, status: 1 });
tripSchema.index({ busId: 1, departureDate: 1 });
tripSchema.index({ routeId: 1, departureDate: 1 });

const TripModel = mongoose.model("Trip", tripSchema);
module.exports = TripModel;