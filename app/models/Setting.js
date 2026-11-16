const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const settingSchema = new Schema(
  {
    siteName: {
      type: String,
      required: true,
      default: "Shamolly Express",
      trim: true,
    },
    supportEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    supportPhone: {
      type: String,
      required: true,
      trim: true,
    },
    logoUrl: {
      type: String,
      trim: true,
      default: null,
    },
    logoPublicId: {
      type: String,
      trim: true,
      default: null,
    },
    brandColor: {
      type: String,
      default: "#ff9e2c",
      trim: true,
    },
    socialLinks: {
      facebook: { type: String, trim: true, default: "" },
      instagram: { type: String, trim: true, default: "" },
      twitter: { type: String, trim: true, default: "" },
      linkedin: { type: String, trim: true, default: "" },
    },
    termsAndConditions: {
      type: String,
      default: "",
    },
    privacyPolicy: {
      type: String,
      default: "",
    },
    cancellationPolicy: {
      type: String,
      default: "",
    },
    maintenanceMode: {
      type: Boolean,
      default: false,
    },
  },
  {
    versionKey: false,
    timestamps: true,
  }
);

const SettingModel = mongoose.model("Setting", settingSchema);
module.exports = SettingModel;