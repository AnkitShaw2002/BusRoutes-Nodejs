const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Booking = require("../models/Booking");
const Route = require("../models/Route");
const logger = require("../utils/logger");
const { send, fail, paginated } = require("../utils/api");

class CustomerController {
  /**
   * Get the authenticated customer's profile.
   */
  async getProfile(req, res) {
    try {
      const user = await User.findById(req.user._id)
        .select("-password -refreshToken")
        .populate("roleId", "name")
        .lean();

      if (!user) {
        return fail(res, 404, "Profile not found.");
      }

      return send(res, user);
    } catch (error) {
      logger.error(`Get Profile API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading the profile.",
      });
    }
  }

  /**
   * Update the authenticated customer's profile information and image.
   */
  async updateProfile(req, res) {
    try {
      const allowedFields = [
        "name",
        "phone",
        "profileImage",
        "profileImagePublicId",
      ];
      const updates = Object.fromEntries(
        Object.entries(req.body).filter(([key]) => allowedFields.includes(key)),
      );

      if (req.file) {
        const uploadedImage = await require("../middleware/Uploadchecker").uploadToCloudinary(
          req.file.buffer,
          "busroutes/profiles",
        );
        updates.profileImage = uploadedImage.secure_url;
        updates.profileImagePublicId = uploadedImage.public_id;
      }

      const user = await User.findOneAndUpdate(
        { _id: req.user._id, isDeleted: false },
        updates,
        { new: true, runValidators: true },
      ).select("-password -refreshToken");

      if (!user) {
        return fail(res, 404, "Profile not found.");
      }

      return send(res, user, "Profile updated.");
    } catch (error) {
      logger.error(`Update Profile API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while updating the profile.",
      });
    }
  }

  /**
   * Get paginated booking history for the authenticated customer.
   */
  async bookingHistory(req, res) {
    try {
      return await paginated(
        res,
        req.query,
        { userId: req.user._id, isDeleted: false },
        Booking,
        { createdAt: -1 },
        "tripId",
      );
    } catch (error) {
      logger.error(`Booking History API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading booking history.",
      });
    }
  }

  async upcomingTrips(req, res) {
    try {
      const futureTrips = await require("../models/Trip").find({ departureAt: { $gte: new Date() } }).distinct("_id");
      return await paginated(res, req.query, {
        userId: req.user._id, isDeleted: false,
        bookingStatus: { $in: ["confirmed", "CONFIRMED"] }, tripId: { $in: futureTrips },
      }, Booking, { createdAt: -1 }, "tripId");
    } catch (error) {
      logger.error(`Upcoming Trips API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while loading upcoming trips." });
    }
  }

  async cancelledTrips(req, res) {
    try {
      return await paginated(res, req.query, {
        userId: req.user._id, isDeleted: false, bookingStatus: "cancelled",
      }, Booking, { cancelledAt: -1 }, "tripId");
    } catch (error) {
      logger.error(`Cancelled Trips API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while loading cancelled trips." });
    }
  }

  async favoriteRoutes(req, res) {
    try {
      const user = await User.findById(req.user._id).select("favoriteRoutes").populate("favoriteRoutes").lean();
      return send(res, user?.favoriteRoutes || []);
    } catch (error) {
      logger.error(`Favorite Routes API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while loading favorite routes." });
    }
  }

  async addFavoriteRoute(req, res) {
    try {
      if (!require("../utils/api").validId(req.params.routeId)) return fail(res, 400, "Invalid route ID.");
      const route = await Route.findOne({ _id: req.params.routeId, status: "active", isDeleted: false }).select("_id");
      if (!route) return fail(res, 404, "Route not found.");
      await User.updateOne({ _id: req.user._id }, { $addToSet: { favoriteRoutes: route._id } });
      return send(res, { routeId: route._id }, "Favorite route saved.", 201);
    } catch (error) {
      logger.error(`Add Favorite Route API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while saving the favorite route." });
    }
  }

  async removeFavoriteRoute(req, res) {
    try {
      if (!require("../utils/api").validId(req.params.routeId)) return fail(res, 400, "Invalid route ID.");
      await User.updateOne({ _id: req.user._id }, { $pull: { favoriteRoutes: req.params.routeId } });
      return send(res, null, "Favorite route removed.");
    } catch (error) {
      logger.error(`Remove Favorite Route API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while removing the favorite route." });
    }
  }

  async savedPassengers(req, res) {
    try {
      const user = await User.findById(req.user._id).select("savedPassengers").lean();
      return send(res, user?.savedPassengers || []);
    } catch (error) {
      logger.error(`Saved Passengers API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while loading saved passengers." });
    }
  }

  async addSavedPassenger(req, res) {
    try {
      const { name, age, gender = "unspecified", title = "" } = req.body;
      if (!String(name || "").trim() || !Number.isInteger(Number(age)) || Number(age) < 0 || Number(age) > 120 || !["male", "female", "other", "unspecified"].includes(gender)) {
        return fail(res, 400, "Valid name, age (0-120), and gender are required.");
      }
      const passenger = { name: String(name).trim(), age: Number(age), gender, title: String(title).trim() };
      const user = await User.findByIdAndUpdate(req.user._id, { $push: { savedPassengers: passenger } }, { new: true, runValidators: true }).select("savedPassengers");
      return send(res, user.savedPassengers.at(-1), "Passenger saved.", 201);
    } catch (error) {
      logger.error(`Save Passenger API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while saving the passenger." });
    }
  }

  async removeSavedPassenger(req, res) {
    try {
      if (!require("../utils/api").validId(req.params.passengerId)) return fail(res, 400, "Invalid passenger ID.");
      await User.updateOne({ _id: req.user._id }, { $pull: { savedPassengers: { _id: req.params.passengerId } } });
      return send(res, null, "Saved passenger removed.");
    } catch (error) {
      logger.error(`Remove Saved Passenger API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while removing the passenger." });
    }
  }

  /**
   * Change the authenticated customer's password.
   */
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword || String(newPassword).length < 8) {
        return fail(
          res,
          400,
          "currentPassword and a new password of at least 8 characters are required.",
        );
      }

      const user = await User.findById(req.user._id).select("+password");
      if (!user?.password) {
        return fail(res, 400, "Password login is not enabled for this account.");
      }

      const passwordMatches = await bcrypt.compare(
        currentPassword,
        user.password,
      );
      if (!passwordMatches) {
        return fail(res, 400, "Current password is incorrect.");
      }

      user.password = await bcrypt.hash(newPassword, 10);
      user.refreshToken = undefined;
      await user.save();

      return send(
        res,
        null,
        "Password changed. Log in again to refresh your session.",
      );
    } catch (error) {
      logger.error(`Change Password API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while changing the password.",
      });
    }
  }
}

module.exports = new CustomerController();
