const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { authLimiter } = require('../middleware/rateLimiter');
const { checkAuth, authorizeRoles } = require('../middleware/checkAuth');
const {
    registerValidation,
    loginValidation,
    verifyOtpValidation,
    resendOtpValidation,
    forgotPasswordValidation,
    resetPasswordValidation,
    changePasswordValidation,
    createStaffOrDriverValidation,
    validate
} = require('../middleware/validator');

// ==========================================
// PUBLIC AUTHENTICATION ROUTES (Rate-Limited)
// ==========================================

// Customer Registration
/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a new customer account
 *     description: Create a new customer account on Shamolly Express. Triggers an email verification OTP.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - phone
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@yopmail.com
 *               phone:
 *                 type: string
 *                 example: "9876543210"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: User@123
 *     responses:
 *       201:
 *         description: User registered successfully. OTP sent to email.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: User registered successfully. Please check your email for the verification OTP.
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: 65f1a2b3c4d5e6f7a8b9c0d1
 *                     name:
 *                       type: string
 *                       example: John Doe
 *                     email:
 *                       type: string
 *                       example: john@example.com
 *                     phone:
 *                       type: string
 *                       example: "9876543210"
 *       400:
 *         description: Validation error, email already exists, or phone already registered
 *       500:
 *         description: Internal server error
 */
router.post(
    '/register',
    authLimiter,
    registerValidation,
    validate,
    authController.register
);

// Verify Email via OTP
/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     summary: Verify email using OTP
 *     description: Verify a newly registered user's email address using the 6-digit OTP sent via email.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - otp
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@yopmail.com
 *               otp:
 *                 type: string
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Email verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Email verified successfully. You can now log in.
 *       400:
 *         description: Invalid OTP, expired OTP, or already verified
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post(
    '/verify-otp',
    authLimiter,
    verifyOtpValidation,
    validate,
    authController.verifyOtp
);

// Resend Verification OTP
/**
 * @swagger
 * /auth/resend-otp:
 *   post:
 *     summary: Resend verification OTP
 *     description: Generate and email a new 6-digit verification OTP to an unverified user.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@yopmail.com
 *     responses:
 *       200:
 *         description: New verification OTP sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: New verification OTP sent to your email address.
 *       400:
 *         description: Email is already verified
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post(
    '/resend-otp',
    authLimiter,
    resendOtpValidation,
    validate,
    authController.resendOtp
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticate a user (Customer, Driver, Staff, or Admin) and return JWT tokens.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: user@yopmail.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: User@123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: CUSTOMER login successful.
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: 65f1a2b3c4d5e6f7a8b9c0d1
 *                     name:
 *                       type: string
 *                       example: John Doe
 *                     email:
 *                       type: string
 *                       example: john@example.com
 *                     role:
 *                       type: string
 *                       example: customer
 *                 accessToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 refreshToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       401:
 *         description: Invalid email or password
 *       403:
 *         description: Account not verified
 *       500:
 *         description: Internal server error
 */
router.post(
    '/login',
    authLimiter,
    loginValidation,
    validate,
    authController.login
);

// Google OAuth Sign-In / Sign-Up (Token verification from Next.js frontend)
/**
 * @swagger
 * /auth/google:
 *   post:
 *     summary: Google OAuth authentication
 *     description: Authenticate or register a user using a Google ID token issued to the configured client ID.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *             properties:
 *               idToken:
 *                 type: string
 *                 description: Google ID token obtained by the client application.
 *                 example: eyJhbGciOiJSUzI1NiIs...
 *     responses:
 *       200:
 *         description: Google authentication successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Google authentication successful
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: 65f1a2b3c4d5e6f7a8b9c0d1
 *                     name:
 *                       type: string
 *                       example: John Doe
 *                     email:
 *                       type: string
 *                       example: john@example.com
 *                     role:
 *                       type: string
 *                       example: customer
 *                 accessToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 refreshToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         description: Google ID token is missing
 *       401:
 *         description: Google ID token is invalid or expired
 *       503:
 *         description: Google authentication is not configured or temporarily unavailable
 *       500:
 *         description: Internal server error
 */
router.post(
    '/google',
    authLimiter,
    authController.googleAuth
);

// Refresh Access Token
/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     summary: Refresh access token
 *     description: Generate a new access token and refresh token using a valid refresh token.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *     responses:
 *       200:
 *         description: Token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Token refreshed successfully
 *                 accessToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 refreshToken:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       401:
 *         description: Refresh token required
 *       403:
 *         description: Invalid or expired refresh token / Mismatch
 *       500:
 *         description: Internal server error
 */
router.post(
    '/refresh-token',
    authController.refreshToken
);

// Request Password Reset Link
/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request password reset link
 *     description: Send a password reset link to the user's registered email address.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *     responses:
 *       200:
 *         description: Password reset link sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Password reset link sent to your email address.
 *       500:
 *         description: Internal server error
 */
router.post(
    '/forgot-password',
    authLimiter,
    forgotPasswordValidation,
    validate,
    authController.forgotPassword
);

// Reset Password with Token
/**
 * @swagger
 * /auth/reset-password/{token}:
 *   post:
 *     summary: Reset password with token
 *     description: Set a new password using the reset token received via email.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: JWT password reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *                 format: password
 *                 example: NewPassword@123
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Password reset successfully. You can now log in with your new password.
 *       400:
 *         description: Invalid or expired password reset token / validation error
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */
router.post(
    '/reset-password/:token',
    authLimiter,
    resetPasswordValidation,
    validate,
    authController.resetPassword
);

// ==========================================
// PROTECTED AUTHENTICATION ROUTES
// ==========================================

// Get Current Authenticated User Profile
/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get current authenticated user profile
 *     description: Retrieve the profile details of the currently logged-in user using a valid JWT access token.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Profile fetched successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: 65f1a2b3c4d5e6f7a8b9c0d1
 *                     name:
 *                       type: string
 *                       example: John Doe
 *                     email:
 *                       type: string
 *                       example: john@example.com
 *                     phone:
 *                       type: string
 *                       example: "9876543210"
 *                     role:
 *                       type: string
 *                       example: customer
 *                     isVerified:
 *                       type: boolean
 *                       example: true
 *       401:
 *         description: Unauthorized / Missing token
 *       404:
 *         description: User profile not found
 *       500:
 *         description: Internal server error
 */
router.get(
    '/me',
    checkAuth,
    authController.getProfile
);

// Change Password (Authenticated Users)
/**
 * @swagger
 * /auth/change-password:
 *   put:
 *     summary: Change user password
 *     description: Update password for the currently logged-in user by verifying their current password.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 format: password
 *                 example: OldPassword@123
 *               newPassword:
 *                 type: string
 *                 format: password
 *                 example: NewSecurePassword@123
 *     responses:
 *       200:
 *         description: Password changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Password changed successfully. Please log in again.
 *       400:
 *         description: Incorrect current password or validation failure
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put(
    '/change-password',
    checkAuth,
    changePasswordValidation,
    validate,
    authController.changePassword
);

// Logout User (Invalidate Refresh Token / Clear Cookie)
/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Logout user
 *     description: Invalidate the refresh token session, clear the auth cookie, and log the user out.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Logged out successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/logout', checkAuth, authController.logout);

// ==========================================
// ADMIN PROVISIONING ROUTES
// ==========================================

// Create Staff or Driver Account (Admin Only)
/**
 * @swagger
 * /auth/admin/create-account:
 *   post:
 *     summary: Create staff or driver account (Admin only)
 *     description: Provision a new staff or driver account by an administrator. Generates a secure temporary password, hashes it, and emails credentials to the employee.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - phone
 *               - role
 *             properties:
 *               name:
 *                 type: string
 *                 example: Jane Smith
 *               email:
 *                 type: string
 *                 format: email
 *                 example: jane.driver@shamolly.com
 *               phone:
 *                 type: string
 *                 example: "9876543210"
 *               role:
 *                 type: string
 *                 enum: [driver, staff]
 *                 example: driver
 *               licenseNumber:
 *                 type: string
 *                 example: "DL-1234567890123"
 *                 description: Required only when role is 'driver'
 *     responses:
 *       201:
 *         description: Employee account created successfully and credentials emailed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Driver account created successfully. Credentials have been emailed.
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: 65f1a2b3c4d5e6f7a8b9c0d1
 *                     name:
 *                       type: string
 *                       example: Jane Smith
 *                     email:
 *                       type: string
 *                       example: jane.driver@shamolly.com
 *                     phone:
 *                       type: string
 *                       example: "9876543210"
 *                     role:
 *                       type: string
 *                       example: driver
 *       400:
 *         description: Email or phone already registered, or validation error
 *       401:
 *         description: Unauthorized / Missing access token
 *       403:
 *         description: Forbidden / User is not an administrator
 *       500:
 *         description: Internal server error
 */
router.post(
    '/admin/create-account',
    checkAuth,
    authorizeRoles('admin'),
    createStaffOrDriverValidation,
    validate,
    authController.createStaffOrDriver
);

module.exports = router;
