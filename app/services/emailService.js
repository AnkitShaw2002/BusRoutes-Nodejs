const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter = null;
const FORCE_EMAIL_TO = process.env.FORCE_EMAIL_TO || (process.env.NODE_ENV === 'test' ? 'test@yopmail.com' : '');

function getTransporter() {
    if (process.env.NODE_ENV === 'test') {
        logger.info('Email transport disabled in test environment');
        return null;
    }
    if (transporter) return transporter;
    if (!process.env.MAIL_HOST || !process.env.MAIL_USER || !process.env.MAIL_PASS) return null;

    transporter = nodemailer.createTransport({
        host: process.env.MAIL_HOST,
        port: Number(process.env.MAIL_PORT) || 587,
        secure: false,
        auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
    });
    return transporter;
}

async function send(to, subject, html, attachments = []) {
    const recipient = FORCE_EMAIL_TO || to;
    const t = getTransporter();
    if (!t) {
        logger.warn(`[EMAIL - no SMTP] TO: ${recipient} | SUBJECT: ${subject}`);
        return false;
    }
    try {
        const from = process.env.MAIL_FROM || `"Shamolly Express" <${process.env.MAIL_USER}>`;
        await t.sendMail({ from, to: recipient, subject, html, attachments });
        return true;
    } catch (err) {
        logger.error('Email send failed: ' + err.message);
        return false;
    }
}

function baseTemplate(body) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f3f4f6;margin:0;padding:0;}
.wrapper{max-width:580px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);}
.header{background:linear-gradient(135deg,#ff9e2c,#ff7a00);padding:28px 32px;color:#fff;}
.header h2{margin:0;font-size:1.4rem;font-weight:700;}
.header p{margin:4px 0 0;opacity:.9;font-size:.9rem;}
.body{padding:28px 32px;}
.body p{color:#374151;line-height:1.6;margin:0 0 14px;}
.btn{display:inline-block;background:#ff7a00;color:#fff!important;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:.9rem;margin:10px 0;}
.btn-secondary{display:inline-block;background:#4b5563;color:#fff!important;text-decoration:none;padding:10px 22px;border-radius:8px;font-weight:600;font-size:.85rem;margin:6px 6px 6px 0;}
.footer{padding:18px 32px;background:#f9fafb;font-size:.78rem;color:#9ca3af;border-top:1px solid #e5e7eb;}
.tag{display:inline-block;background:#fff7ed;color:#c2410c;padding:4px 12px;border-radius:99px;font-size:.85rem;font-weight:600;}
.otp-box{font-size:1.8rem;letter-spacing:6px;font-weight:bold;color:#1f2937;background:#f3f4f6;padding:14px 20px;border-radius:8px;text-align:center;margin:16px 0;}
.card{background:#fdf8f6;border:1px solid #fed7aa;padding:16px 20px;border-radius:8px;margin:16px 0;}
.card p{margin:6px 0;font-size:.9rem;}
</style></head><body>
<div class="wrapper">
  <div class="header"><h2>🚌 Shamolly Express</h2><p>Safe & Reliable Bus Journey</p></div>
  <div class="body">${body}</div>
  <div class="footer">You received this email because of your account activity on Shamolly Express.<br>&copy; ${new Date().getFullYear()} Shamolly Express. All rights reserved.</div>
</div></body></html>`;
}

/**
 * 1. OTP Verification Email (Registration / Login)
 */
exports.sendOtpEmail = async (email, name, otp) => {
    const subject = 'Your Verification Code - Shamolly Express';
    const html = baseTemplate(`
        <p>Hi <strong>${name}</strong>,</p>
        <p>Please use the verification code below to complete your authentication process:</p>
        <div class="otp-box">${otp}</div>
        <p>This code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.</p>
        <p>If you did not request this, please ignore this email.</p>
    `);
    await send(email, subject, html);
};

/**
 * 2. Admin Created Account Credentials Email (Driver / Staff)
 */
exports.sendCredentialsEmail = async (user, temporaryPassword, role) => {
    const subject = `Your Shamolly Express ${role.toUpperCase()} Account Credentials`;
    const html = baseTemplate(`
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>An administrator has created a <strong>${role}</strong> account for you on Shamolly Express.</p>
        <div class="card">
            <p><strong>Email:</strong> ${user.email}</p>
            <p><strong>Temporary Password:</strong> <span style="font-family:monospace;background:#fff;padding:2px 6px;border:1px solid #ddd;border-radius:4px;">${temporaryPassword}</span></p>
            <p><strong>Role:</strong> ${role.toUpperCase()}</p>
        </div>
        <p>Please log in using the link below and change your password immediately for security reasons:</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" class="btn">Login to Portal →</a>
    `);
    await send(user.email, subject, html);
};

/**
 * 3. Password Reset Email
 */
exports.sendResetPasswordEmail = async (user, resetLink) => {
    const subject = 'Reset Your Password - Shamolly Express';
    const html = baseTemplate(`
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>You requested a password reset for your Shamolly Express account. Click the button below to set a new password:</p>
        <a href="${resetLink}" class="btn">Reset Password →</a>
        <p>This link will expire in <strong>1 hour</strong>.</p>
        <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
    `);
    await send(user.email, subject, html);
};

/**
 * 4. Booking Confirmation & Ticket Email
 */
exports.sendBookingConfirmationEmail = async (user, booking, trip, route) => {
    const subject = `Booking Confirmed! Ticket #${booking.bookingReference}`;
    const ticketLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/bookings/${booking._id}`;
    const downloadPdfLink = `${process.env.API_BASE_URL || 'http://localhost:4000'}/api/v1/bookings/${booking._id}/ticket`;

    const html = baseTemplate(`
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>Your bus booking has been successfully <span class="tag">CONFIRMED</span>!</p>
        
        <div class="card">
            <p><strong>Booking Reference:</strong> ${booking.bookingReference}</p>
            <p><strong>Route:</strong> ${route.sourceCity.toUpperCase()} → ${route.destinationCity.toUpperCase()}</p>
            <p><strong>Travel Date:</strong> ${new Date(trip.departureDate).toLocaleDateString('en-IN', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}</p>
            <p><strong>Departure Time:</strong> ${trip.departureTime}</p>
            <p><strong>Seat Number(s):</strong> ${booking.seats.map(s => s.seatNumber).join(', ')}</p>
            <p><strong>Boarding Point:</strong> ${booking.boardingPoint}</p>
            <p><strong>Total Paid:</strong> ₹${booking.totalAmount}</p>
        </div>

        <p>You can view your digital ticket, scan your QR code during boarding, or download the printable PDF copy below:</p>
        <a href="${ticketLink}" class="btn">View Ticket & QR Code →</a>
        <br>
        <a href="${downloadPdfLink}" class="btn-secondary">Download PDF Ticket</a>
    `);
    await send(user.email, subject, html);
};

/**
 * 5. Trip Reminder Email (Sent the day before the trip)
 */
exports.sendTripReminderEmail = async (user, booking, trip, route) => {
    const subject = `Reminder: Your Trip Tomorrow! (${route.sourceCity} to ${route.destinationCity})`;
    const ticketLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/bookings/${booking._id}`;

    const html = baseTemplate(`
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>This is a friendly reminder that your bus journey with Shamolly Express is scheduled for <strong>tomorrow</strong>!</p>
        
        <div class="card">
            <p><strong>Booking Reference:</strong> ${booking.bookingReference}</p>
            <p><strong>From:</strong> ${route.sourceCity.toUpperCase()} &nbsp;|&nbsp; <strong>To:</strong> ${route.destinationCity.toUpperCase()}</p>
            <p><strong>Departure Date & Time:</strong> ${new Date(trip.departureDate).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })} at ${trip.departureTime}</p>
            <p><strong>Seat(s):</strong> ${booking.seats.map(s => s.seatNumber).join(', ')}</p>
            <p><strong>Boarding Point:</strong> ${booking.boardingPoint}</p>
        </div>

        <p>Please arrive at the boarding point at least 15 minutes before departure time with your digital or printed ticket and a valid ID proof.</p>
        <a href="${ticketLink}" class="btn">Open Ticket & QR Code →</a>
    `);
    return send(user.email, subject, html);
};

/**
 * 6. Booking Cancellation & Refund Email
 */
exports.sendBookingCancellationEmail = async (user, booking, refundAmount) => {
    const subject = `Booking Cancelled - Ref: ${booking.bookingReference}`;
    const html = baseTemplate(`
        <p>Hi <strong>${user.name}</strong>,</p>
        <p>Your booking <strong>${booking.bookingReference}</strong> has been successfully cancelled.</p>
        <div class="card">
            <p><strong>Refund Status:</strong> ${refundAmount > 0 ? `₹${refundAmount} will be credited to your original payment method within 3-5 business days.` : (refundAmount < 0 ? 'A cash refund must be handled by the agency. Please contact the booking office.' : 'No refund is currently due for this booking.')}</p>
        </div>
        <p>We hope to serve you better next time. Feel free to book another trip with Shamolly Express.</p>
        <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/search" class="btn">Explore Buses →</a>
    `);
    await send(user.email, subject, html);
};

exports.sendBookingTicketEmail = async (email, booking, pdfBuffer) => {
    return send(
        email,
        `Your ticket and invoice - ${booking.bookingReference}`,
        baseTemplate(`<p>Your confirmed ticket for <strong>${booking.bookingReference}</strong> is attached as a PDF.</p>`),
        [{ filename: `ticket-${booking.bookingReference}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    );
};
