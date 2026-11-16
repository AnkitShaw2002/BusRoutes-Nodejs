const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const bannerSchema = new Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      required: true,
      trim: true,
    },
    imagePublicId: {
      type: String,
      trim: true,
      default: null, // For easy deletion/updates on Cloudinary
    },
    linkUrl: {
      type: String,
      trim: true,
      default: null, // Target URL or route when banner is clicked
    },
    order: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
      default: null,
    },
    endDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      lowercase: true,
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

// High-performance index for active banner queries sorted by order
bannerSchema.index({ status: 1, order: 1 });

const BannerModel = mongoose.model("Banner", bannerSchema);
module.exports = BannerModel;