const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const stopSchema = new Schema(
  {
    cityName: {
      type: String,
      required: true,
      trim: true,
    },
    stopName: {
      type: String,
      required: true,
      trim: true,
    },
    arrivalOffsetMinutes: {
      type: Number,
      required: true,
      min: 0,
    },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    sequenceOrder: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

const routeSchema = new Schema(
  {
    sourceCity: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    destinationCity: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    distanceKm: {
      type: Number,
      required: true,
      min: 0,
    },
    estimatedDurationMinutes: {
      type: Number,
      required: true,
      min: 0,
    },
    boardingPoints: [
      {
        type: String,
        trim: true,
      },
    ],
    droppingPoints: [
      {
        type: String,
        trim: true,
      },
    ],
    intermediateStops: [stopSchema],
    status: {
      type: String,
      enum: ["active", "inactive", "paused"],
      default: "active",
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

// High-performance index for route search aggregations
routeSchema.index({ sourceCity: 1, destinationCity: 1 });

const RouteModel = mongoose.model("Route", routeSchema);
module.exports = RouteModel;