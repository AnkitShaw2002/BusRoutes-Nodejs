const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const seatSchema = new Schema(
  {
    seatNumber: {
      type: String,
      required: true,
      trim: true,
    },
    seatType: {
      type: String,
      enum: ["regular", "vip", "sleeper", "ladies", "reserved", "blocked", "seater"],
      default: "regular",
      lowercase: true,
    },
    deck: {
      type: String,
      enum: ["lower", "upper"],
      default: "lower",
      lowercase: true,
    },
    row: {
      type: Number,
      required: true,
      min: 0,
    },
    column: {
      type: Number,
      required: true,
      min: 0,
    },
    isPremium: {
      type: Boolean,
      default: false,
    },
    isAisle: {
      type: Boolean,
      default: false,
    },
    ticketPrice: {
      type: Number,
      default: null, // Optional seat-specific pricing override
    },
  },
  { _id: false }
);

const seatLayoutSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    layoutType: {
      type: String,
      enum: ["2x1", "2x2", "sleeper", "custom"],
      default: "2x2",
      lowercase: true,
    },
    totalRows: {
      type: Number,
      required: true,
      min: 1,
    },
    totalColumns: {
      type: Number,
      required: true,
      min: 1,
    },
    decks: {
      type: Number,
      enum: [1, 2],
      default: 1,
    },
    seats: [seatSchema],
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

const SeatLayoutModel = mongoose.model("SeatLayout", seatLayoutSchema);
module.exports = SeatLayoutModel;