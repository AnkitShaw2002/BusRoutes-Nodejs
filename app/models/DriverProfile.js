const mongoose = require('mongoose');

const driverProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  licenseNumber: { type: String, required: true, unique: true, trim: true, uppercase: true },
  licenseExpiry: { type: Date, default: null },
  emergencyContact: { type: String, trim: true, default: null },
}, { versionKey: false, timestamps: true });

module.exports = mongoose.model('DriverProfile', driverProfileSchema);
