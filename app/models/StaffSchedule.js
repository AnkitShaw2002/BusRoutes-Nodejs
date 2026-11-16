const mongoose = require("mongoose");

const staffScheduleSchema = new mongoose.Schema({
  staffId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  workDate: { type: Date, required: true },
  shiftStart: { type: String, trim: true, default: null },
  shiftEnd: { type: String, trim: true, default: null },
  attendanceStatus: { type: String, enum: ["not_marked", "present", "absent", "leave"], default: "not_marked" },
  clockInAt: { type: Date, default: null },
  clockOutAt: { type: Date, default: null },
  notes: { type: String, trim: true, default: "" },
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, versionKey: false });

staffScheduleSchema.index({ staffId: 1, workDate: 1 }, { unique: true });

module.exports = mongoose.model("StaffSchedule", staffScheduleSchema);
