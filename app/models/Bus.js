const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const busSchema = new Schema(
  {
    busNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    registrationNumber: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    busName: {
      type: String,
      required: true,
      default: "Shamolly Express",
      trim: true,
    },
    busType: {
      type: String,
      enum: ["ac", "non-ac", "sleeper", "seater", "ac-sleeper", "semi_sleeper"],
      required: true,
      lowercase: true,
    },
    totalSeats: {
      type: Number,
      required: true,
      min: 1,
    },
    seatLayoutId: {
      type: Schema.Types.ObjectId,
      ref: "SeatLayout",
      required: true,
    },
    assignedDriver: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    amenities: [
      {
        type: String,
        trim: true,
      },
    ],
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String }, // Useful for Cloudinary file deletion/updates
      },
    ],
    status: {
      type: String,
      enum: ["active", "maintenance", "inactive"],
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
  },
);

const BusModel = mongoose.model("Bus", busSchema);
module.exports = BusModel;