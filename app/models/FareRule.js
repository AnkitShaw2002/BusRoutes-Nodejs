const mongoose = require("mongoose");

const fareRuleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  ruleType: { type: String, enum: ["weekend", "holiday", "festival", "seat_type", "child", "senior", "discount"], required: true },
  routeId: { type: mongoose.Schema.Types.ObjectId, ref: "Route", default: null },
  seatType: { type: String, trim: true, default: null },
  validFrom: { type: Date, default: new Date("1970-01-01T00:00:00.000Z") },
  validTill: { type: Date, default: new Date("2999-12-31T23:59:59.999Z") },
  daysOfWeek: [{ type: Number, min: 0, max: 6 }],
  minAge: { type: Number, min: 0, max: 120, default: null },
  maxAge: { type: Number, min: 0, max: 120, default: null },
  operation: { type: String, enum: ["increase", "decrease"], default: "increase" },
  adjustmentType: { type: String, enum: ["percentage", "flat"], required: true },
  adjustmentValue: { type: Number, min: 0, required: true },
  isActive: { type: Boolean, default: true },
  isDeleted: { type: Boolean, default: false },
}, { timestamps: true, versionKey: false });

fareRuleSchema.index({ isActive:  1, validFrom: 1, validTill: 1 });
module.exports = mongoose.model("FareRule", fareRuleSchema);
