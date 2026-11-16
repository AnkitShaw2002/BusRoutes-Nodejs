const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const passengerSchema = new Schema(
  {
    bookingId: {
      type: Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
    },
    title: {
      type: String,
      enum: ["Mr", "Ms", "Mrs", "Dr", "Prof"],
      default: "Mr",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    age: {
      type: Number,
      required: true,
      min: 1,
      max: 120,
    },
    gender: {
      type: String,
      enum: ["male", "female", "other"],
      lowercase: true,
      trim: true,
    },
    seatNumber: {
      type: String,
      required: true,
      trim: true,
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

// High-performance index for passenger manifest lookups by booking
passengerSchema.index({ bookingId: 1 });

const PassengerModel = mongoose.model("Passenger", passengerSchema);
module.exports = PassengerModel;