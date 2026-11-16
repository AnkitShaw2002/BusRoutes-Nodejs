const User = require("../models/User");
const Otp = require("../models/Otp");
const Role = require("../models/Role");
const DriverProfile = require("../models/DriverProfile");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const emailService = require("../utils/sendEmail");
const logger = require("../utils/logger");
const tokensConfigured = () => Boolean(process.env.JWT_SECRET_KEY && process.env.REFRESH_TOKEN_SECRET);

class AuthApiController {
  /**
   * User Registration
   */
  async register(req, res) {
    try {
      const { name, email, phone, password } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email already registered.",
        });
      }

      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: "Phone number already registered.",
        });
      }

      const customerRole = await Role.findOne({ name: "customer" });
      if (!customerRole) {
        throw new Error("Customer role not found. Run npm run seed.");
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = await User.create({
        name,
        email: normalizedEmail,
        phone,
        password: hashedPassword,
        isVerified: false,
        roleId: customerRole._id,
      });

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await Otp.deleteMany({ userId: newUser._id.toString() });
      await Otp.create({
        userId: newUser._id.toString(),
        otp: otpCode,
        expiresAt,
      });

      await emailService.sendOtpEmail(newUser.email, newUser.name, otpCode);

      logger.info(`New customer registered via API: ${newUser.email}`);
      return res.status(201).json({
        success: true,
        message: "User registered successfully. Please check your email for the verification OTP.",
        data: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          phone: newUser.phone,
        },
      });
    } catch (error) {
      logger.error("API Registration Error: " + error.message);
      return res.status(500).json({
        success: false,
        message: "An error occurred during registration.",
      });
    }
  }

  /**
   * Verify Email via OTP
   */
  async verifyOtp(req, res) {
    try {
      const { email, otp } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      const user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "No account found with that email address.",
        });
      }

      if (user.isVerified) {
        return res.status(400).json({
          success: false,
          message: "Email is already verified.",
        });
      }

      const checkOtp = await Otp.findOne({
        userId: user._id.toString(),
        otp: String(otp),
      });

      if (!checkOtp) {
        return res.status(400).json({
          success: false,
          message: "Invalid OTP. Please check and try again.",
        });
      }

      if (new Date() > checkOtp.expiresAt) {
        await Otp.deleteMany({ userId: user._id.toString() });
        return res.status(400).json({
          success: false,
          message: "OTP has expired. Please request a new one.",
        });
      }

      user.isVerified = true;
      await user.save();
      await Otp.deleteMany({ userId: user._id.toString() });

      logger.info(`Email verified via OTP for user: ${user.email}`);
      return res.status(200).json({
        success: true,
        message: "Email verified successfully. You can now log in.",
      });
    } catch (error) {
      logger.error("API Verify OTP Error: " + error.message);
      return res.status(500).json({
        success: false,
        message: "An error occurred while verifying OTP.",
      });
    }
  }

  /**
   * Resend Verification OTP
   */
  async resendOtp(req, res) {
    try {
      const { email } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      const user = await User.findOne({ email: normalizedEmail });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "No account found with that email address.",
        });
      }

      if (user.isVerified) {
        return res.status(400).json({
          success: false,
          message: "Email is already verified.",
        });
      }

      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      await Otp.deleteMany({ userId: user._id.toString() });
      await Otp.create({
        userId: user._id.toString(),
        otp: otpCode,
        expiresAt,
      });

      await emailService.sendOtpEmail(user.email, user.name, otpCode);

      logger.info(`Verification OTP resent via API: ${user.email}`);
      return res.status(200).json({
        success: true,
        message: "New verification OTP sent to your email address.",
      });
    } catch (error) {
      logger.error("API Resend OTP Error: " + error.message);
      return res.status(500).json({
        success: false,
        message: "An error occurred while resending OTP.",
      });
    }
  }

  /**
   * User Login (Customer, Driver, Staff, Admin)
   */
  async login(req, res) {
    try {
      if (!tokensConfigured()) return res.status(503).json({ success: false, message: "Authentication token secrets are not configured." });
      const { email, password } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      const user = await User.findOne({ email: normalizedEmail })
        .select("+password +refreshToken")
        .populate("roleId");

      if (!user || !user.password) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password.",
        });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          message: "Invalid email or password.",
        });
      }

      if (!user.isVerified) {
        return res.status(403).json({
          success: false,
          message: "Account not verified. Please verify your email first.",
        });
      }

      const roleName = user.roleId?.name || "customer";

      const accessToken = jwt.sign(
        { id: user._id, role: roleName },
        process.env.JWT_SECRET_KEY,
        { expiresIn: "15m" }
      );

      const refreshToken = jwt.sign(
        { id: user._id, role: roleName },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: "7d" }
      );

      const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
      user.refreshToken = hashedRefreshToken;
      user.lastLoginAt = new Date();
      await user.save();

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      logger.info(`${roleName.toUpperCase()} logged in via API: ${user.email}`);
      return res.status(200).json({
        success: true,
        message: `${roleName.toUpperCase()} login successful.`,
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: roleName,
        },
        accessToken,
        refreshToken,
      });
    } catch (error) {
      logger.error("API Login Error: " + error.message);
      return res.status(500).json({
        success: false,
        message: "An error occurred during login.",
      });
    }
  }

  /**
   * Google OAuth Sign-In / Sign-Up using a verified Google ID token
   */
  async googleAuth(req, res) {
    try {
      if (!tokensConfigured()) return res.status(503).json({ success: false, message: "Authentication token secrets are not configured." });
      const { idToken } = req.body;

      if (!process.env.GOOGLE_CLIENT_ID) {
        return res.status(503).json({
          success: false,
          message: "Google authentication is not configured.",
        });
      }

      if (!idToken) {
        return res.status(400).json({
          success: false,
          message: "A Google ID token is required.",
        });
      }

      let googleProfile;
      try {
        const googleResponse = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
          { signal: AbortSignal.timeout(5000) },
        );

        if (!googleResponse.ok) {
          return res.status(401).json({
            success: false,
            message: "Google ID token is invalid or expired.",
          });
        }

        googleProfile = await googleResponse.json();
      } catch (error) {
        logger.error(`Google token verification failed: ${error.message}`);
        return res.status(503).json({
          success: false,
          message: "Google token verification is temporarily unavailable.",
        });
      }

      if (
        googleProfile.aud !== process.env.GOOGLE_CLIENT_ID ||
        googleProfile.email_verified !== "true" ||
        !googleProfile.email ||
        !googleProfile.sub
      ) {
        return res.status(401).json({
          success: false,
          message: "Google account or ID token could not be verified.",
        });
      }

      const normalizedEmail = googleProfile.email.toLowerCase().trim();
      let user = await User.findOne({ email: normalizedEmail }).populate("roleId");

      if (!user) {
        const customerRole = await Role.findOne({ name: "customer" });
        if (!customerRole) {
          throw new Error("Customer role not found. Run npm run seed.");
        }

        user = await User.create({
          name: googleProfile.name || normalizedEmail.split("@")[0],
          email: normalizedEmail,
          googleId: googleProfile.sub,
          authProvider: "google",
          isVerified: true,
          roleId: customerRole._id,
        });

        user = await User.findById(user._id).populate("roleId");
      } else {
        if (user.isDeleted || user.status !== "active") {
          return res.status(403).json({
            success: false,
            message: "This account is inactive.",
          });
        }

        if (user.googleId && user.googleId !== googleProfile.sub) {
          return res.status(401).json({
            success: false,
            message: "This email is linked to a different Google account.",
          });
        }

        user.googleId = googleProfile.sub;
        await user.save();
      }

      const roleName = user.roleId?.name || "customer";

      const accessToken = jwt.sign(
        { id: user._id, role: roleName },
        process.env.JWT_SECRET_KEY,
        { expiresIn: "15m" }
      );

      const refreshToken = jwt.sign(
        { id: user._id, role: roleName },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: "7d" }
      );

      const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
      user.refreshToken = hashedRefreshToken;
      user.lastLoginAt = new Date();
      await user.save();

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      logger.info(`Google OAuth login successful via API: ${user.email}`);
      return res.status(200).json({
        success: true,
        message: "Google authentication successful.",
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: roleName,
        },
        accessToken,
        refreshToken,
      });
    } catch (error) {
      logger.error("API Google Auth Error: " + error.message);
      return res.status(500).json({
        success: false,
        message: "An error occurred during Google authentication.",
      });
    }
  }

  /**
   * Refresh Access Token
   */
  async refreshToken(req, res) {
    try {
      if (!tokensConfigured()) return res.status(503).json({ success: false, message: "Authentication token secrets are not configured." });
      const token = req.body.refreshToken || req.cookies?.refreshToken;

      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Refresh token required.",
        });
      }

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);
      } catch (err) {
        return res.status(403).json({
          success: false,
          message: "Invalid or expired refresh token.",
        });
      }

      const user = await User.findById(decoded.id)
        .select("+refreshToken")
        .populate("roleId");

      if (!user || !user.refreshToken) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized or invalid session.",
        });
      }

      const isMatch = await bcrypt.compare(token, user.refreshToken);
      if (!isMatch) {
        return res.status(403).json({
          success: false,
          message: "Refresh token mismatch.",
        });
      }

      const roleName = user.roleId?.name || "customer";

      const newAccessToken = jwt.sign(
        { id: user._id, role: roleName },
        process.env.JWT_SECRET_KEY,
        { expiresIn: "15m" }
      );

      const newRefreshToken = jwt.sign(
        { id: user._id, role: roleName },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: "7d" }
      );

      const hashedRefreshToken = await bcrypt.hash(newRefreshToken, 10);
      user.refreshToken = hashedRefreshToken;
      await user.save();

      res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      logger.info(`Access token refreshed via API for user: ${user.email}`);
      return res.status(200).json({
        success: true,
        message: "Token refreshed successfully.",
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      });
    } catch (error) {
      logger.error("API Refresh Token Error: " + error.message);
      return res.status(500).json({
        success: false,
        message: "An error occurred while refreshing token.",
      });
    }
  }

  /**
   * Request Password Reset Link
   */
  async forgotPassword(req, res) {
    try {
      if (!process.env.JWT_SECRET_KEY) return res.status(503).json({ success: false, message: "Authentication token secret is not configured." });
      const { email } = req.body;
      const user = await User.findOne({
        email: email.toLowerCase().trim(),
        isDeleted: false,
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "No account found with that email address.",
        });
      }

      const resetToken = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET_KEY,
        { expiresIn: "15m" }
      );

      const resetLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password/${resetToken}`;

      await emailService.sendPasswordResetEmail(user.email, resetLink);

      logger.info(`Password reset requested via API: ${user.email}`);
      return res.status(200).json({
        success: true,
        message: "Password reset link sent to your email address.",
      });
    } catch (error) {
      logger.error("API Forgot Password Error: " + error.message);
      return res.status(500).json({
        success: false,
        message: "An error occurred.",
      });
    }
  }

  /**
   * Reset Password with Token
   */
  async resetPassword(req, res) {
    try {
      const { token } = req.params;
      const { password } = req.body;

      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired password reset token.",
        });
      }

      const user = await User.findById(decoded.id).select("+password");
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      user.password = hashedPassword;
      user.refreshToken = undefined;
      await user.save();

      logger.info(`Password reset completed via API for user: ${user.email}`);
      return res.status(200).json({
        success: true,
        message: "Password reset successfully. You can now log in with your new password.",
      });
    } catch (error) {
      logger.error("API Reset Password Error: " + error.message);
      return res.status(500).json({
        success: false,
        message: "An error occurred while resetting password.",
      });
    }
  }

  /**
   * Get Current Authenticated User Profile
   */
  async getProfile(req, res) {
    try {
      const userId = req.user.id;

      const user = await User.findById(userId).populate("roleId");
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User profile not found.",
        });
      }

      const roleName = user.roleId?.name || "customer";

      return res.status(200).json({
        success: true,
        message: "Profile fetched successfully.",
        data: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          role: roleName,
          roleId: user.roleId,
          isVerified: user.isVerified,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      logger.error("API Get Profile Error: " + error.message);
      return res.status(500).json({
        success: false,
        message: "An error occurred while fetching profile.",
      });
    }
  }

  /**
   * Change Password (Authenticated Users)
   */
  async changePassword(req, res) {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(userId).select("+password");
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found.",
        });
      }

      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) {
        return res.status(400).json({
          success: false,
          message: "Incorrect current password.",
        });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      user.refreshToken = undefined;
      await user.save();

      logger.info(`Password changed via API for user: ${user.email}`);
      return res.status(200).json({
        success: true,
        message: "Password changed successfully. Please log in again.",
      });
    } catch (error) {
      logger.error("API Change Password Error: " + error.message);
      return res.status(500).json({
        success: false,
        message: "An error occurred while changing password.",
      });
    }
  }

  /**
   * Logout User (Invalidate Refresh Token & Clear Cookie)
   */
  async logout(req, res) {
    try {
      const userId = req.user.id;

      await User.findByIdAndUpdate(userId, {
        $unset: { refreshToken: 1 },
      });

      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      logger.info(`User logged out via API: ${userId}`);
      return res.status(200).json({
        success: true,
        message: "Logged out successfully.",
      });
    } catch (error) {
      logger.error("API Logout Error: " + error.message);
      return res.status(500).json({
        success: false,
        message: "An error occurred during logout.",
      });
    }
  }

  /**
   * Admin Provisioning: Create Staff or Driver Account
   */
  async createStaffOrDriver(req, res) {
    try {
      const { name, email, phone, role, licenseNumber } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      const existingUser = await User.findOne({ email: normalizedEmail });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: "Email is already registered in the system.",
        });
      }

      const existingPhone = await User.findOne({ phone });
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: "Phone number is already registered in the system.",
        });
      }

      const targetRole = await Role.findOne({ name: role });
      if (!targetRole) {
        return res.status(400).json({
          success: false,
          message: `Role '${role}' not found in the system.`,
        });
      }

      const randomChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@$!%*?&";
      let temporaryPassword = "";
      for (let i = 0; i < 10; i++) {
        temporaryPassword += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
      }
      temporaryPassword = "Ab1@" + temporaryPassword;

      const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

      const newEmployee = await User.create({
        name,
        email: normalizedEmail,
        phone,
        password: hashedPassword,
        roleId: targetRole._id,
        isVerified: true,
      });

      if (role === "driver") {
        await DriverProfile.create({ userId: newEmployee._id, licenseNumber, licenseExpiry: req.body.licenseExpiry || null });
      }

      await emailService.sendCredentialsEmail(
        newEmployee.email,
        newEmployee.name,
        temporaryPassword,
        role
      );

      logger.info(`Admin created ${role} account via API: ${newEmployee.email}`);
      return res.status(201).json({
        success: true,
        message: `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully. Credentials have been emailed.`,
        data: {
          id: newEmployee._id,
          name: newEmployee.name,
          email: newEmployee.email,
          phone: newEmployee.phone,
          role,
        },
      });
    } catch (error) {
      logger.error("API Create Staff/Driver Error: " + error.message);
      return res.status(500).json({
        success: false,
        message: "An error occurred while creating the account.",
      });
    }
  }
}

module.exports = new AuthApiController();
