// const transporter = require('../config/emailConfig');
// require('dotenv').config();


// // Send email verification link
// const sendEmail = async (user) => {
//     try {
//         if (!user || !user._id || !user.email) {
//             throw new Error("Invalid user object");
//         }
//         const verifyLink = `${process.env.BASE_URL}/verify/${user.verificationToken}`;
//         console.log('Verification Link:', verifyLink);

//         // await transporter.sendMail(


//         const mailOptions = {
//             // from: process.env.MAIL_FROM,
//             from: `"BusRoutes" <${process.env.MAIL_FROM || "busroutes@gmail.com"}>`,
//             to: user.email,
//             subject: "Verify Your Email - BusRoutes Agency",
//             html: `
//             <h2>Hello ${user.displayName},</h2>
//             <p>Thank you for registering. Please click the link below to verify your email address:</p>
//             <a href="${verifyLink}" style="background:#4F46E5;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Verify Account</a>
//             <p>This link will expire in 24 hours.</p>
//             <p>If you did not sign up, please ignore this email.</p>
//         `
//         }

//         await transporter.sendMail(mailOptions);
//         console.log(" OTP Email sent to:", user);

//         return saved;
//     } catch (err) {
//         console.error(" Failed to send OTP:", err);
//         throw err;
//     }
//     // );

// };

// module.exports = sendEmail;


// const nodemailer = require('nodemailer');

const transporter = require('../config/emailConfig');

/**
 * Generic core email sending function
 * @param {Object} options - { to, subject, html, text }
 */
const sendEmail = async ({ to, subject, html, text }) => {
    try {
        const mailOptions = {
            from: `"Shamolly Express" <${process.env.EMAIL_FROM || process.env.SMTP_USER}>`,
            to,
            subject,
            text,
            html,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`Email sent successfully: ${info.messageId}`);
        return true;
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Email dispatch failed');
    }
};

/**
 * Send OTP for email verification during customer registration
 * Updated to accept (email, name, otp) to match controller call
 */
const sendOtpEmail = async (email, name, otp) => {
    const subject = 'Email Verification OTP - Shamolly Express';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #2563eb; text-align: center;">Shamolly Express</h2>
            <p>Hello <strong>${name || 'Customer'}</strong>,</p>
            <p>Thank you for registering with Shamolly Express. Please use the following One-Time Password (OTP) to verify your email address:</p>
            <div style="background-color: #f3f4f6; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 4px; border-radius: 6px; margin: 20px 0;">
                ${otp}
            </div>
            <p>This OTP is valid for 10 minutes. Do not share this code with anyone.</p>
            <p>Best regards,<br><strong>Shamolly Express Team</strong></p>
        </div>
    `;
    return sendEmail({ to: email, subject, html });
};

/**
 * Send credentials to staff or drivers created by an admin
 */
const sendCredentialsEmail = async (email, name, password, role) => {
    const subject = `Your Shamolly Express ${role.toUpperCase()} Account Credentials`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #2563eb; text-align: center;">Shamolly Express</h2>
            <p>Hello <strong>${name}</strong>,</p>
            <p>An administrator has provisioned a <strong>${role}</strong> account for you on the Shamolly Express platform.</p>
            <p>You can now log in using the temporary credentials below:</p>
            <ul style="list-style-type: none; padding: 0; background-color: #f8fafc; padding: 15px; border-radius: 6px;">
                <li><strong>Email:</strong> ${email}</li>
                <li><strong>Temporary Password:</strong> ${password}</li>
            </ul>
            <p style="color: #dc2626;">Please change your password immediately after your first login for security purposes.</p>
            <p>Best regards,<br><strong>Shamolly Express Administration</strong></p>
        </div>
    `;
    return sendEmail({ to: email, subject, html });
};

/**
 * Send password reset link to user
 */
const sendPasswordResetEmail = async (email, resetUrl) => {
    const subject = 'Password Reset Request - Shamolly Express';
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #2563eb; text-align: center;">Shamolly Express</h2>
            <p>Hello,</p>
            <p>You requested a password reset for your Shamolly Express account. Click the button below to set a new password:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset Password</a>
            </div>
            <p>If you did not request this, please ignore this email. This link expires in 15 minutes.</p>
            <p>Best regards,<br><strong>Shamolly Express Team</strong></p>
        </div>
    `;
    return sendEmail({ to: email, subject, html });
};

/**
 * Send booking confirmation details to customer
 */
const sendBookingConfirmationEmail = async (email, bookingDetails) => {
    const subject = `Booking Confirmation #${bookingDetails.bookingReference} - Shamolly Express`;
    const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
            <h2 style="color: #2563eb; text-align: center;">Shamolly Express</h2>
            <p>Hello <strong>${bookingDetails.customerName}</strong>,</p>
            <p>Your bus ticket booking has been confirmed successfully!</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p><strong>Booking Reference:</strong> ${bookingDetails.bookingReference}</p>
                <p><strong>Route:</strong> ${bookingDetails.source} &rarr; ${bookingDetails.destination}</p>
                <p><strong>Trip Date:</strong> ${bookingDetails.tripDate}</p>
                <p><strong>Seats:</strong> ${bookingDetails.seats.join(', ')}</p>
                <p><strong>Total Amount Paid:</strong> ₹${bookingDetails.totalAmount}</p>
            </div>
            <p>Thank you for traveling with Shamolly Express. Have a safe journey!</p>
            <p>Best regards,<br><strong>Shamolly Express Team</strong></p>
        </div>
    `;
    return sendEmail({ to: email, subject, html });
};

module.exports = {
    sendEmail,
    sendOtpEmail,
    sendCredentialsEmail,
    sendPasswordResetEmail,
    sendBookingConfirmationEmail
};