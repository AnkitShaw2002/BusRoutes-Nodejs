const Booking = require("../models/Booking");
const Notification = require("../models/Notification");
const emailService = require("./emailService");
const logger = require("../utils/logger");

async function sendTripReminders() {
  const now = new Date();
  const from = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 25 * 60 * 60 * 1000);
  const bookings = await Booking.find({
    bookingStatus: { $in: ["confirmed", "CONFIRMED"] },
    paymentStatus: "paid",
    reminderSentAt: null,
    isDeleted: false,
  }).populate("userId", "name email").populate({ path: "tripId", match: { departureAt: { $gte: from, $lte: to }, isDeleted: false }, populate: { path: "routeId" } });

  let sent = 0;
  for (const booking of bookings) {
    if (!booking.tripId?.routeId || !booking.userId?.email) continue;
    const delivered = await emailService.sendTripReminderEmail(booking.userId, booking, booking.tripId, booking.tripId.routeId);
    if (!delivered) continue;
    booking.reminderSentAt = new Date();
    await booking.save();
    await Notification.create({
      title: "Your bus trip is tomorrow",
      message: `Trip ${booking.bookingReference} departs ${booking.tripId.departureTime}. Please arrive 15 minutes early.`,
      audience: "specific_user",
      userId: booking.userId._id,
      status: "sent",
      sentAt: new Date(),
    });
    sent++;
  }
  return { checked: bookings.length, sent };
}

function startTripReminderScheduler() {
  const run = () => sendTripReminders().catch((error) => logger.error(`Trip reminder job failed: ${error.message}`));
  const timer = setInterval(run, 15 * 60 * 1000);
  timer.unref();
  run();
  return timer;
}

module.exports = { sendTripReminders, startTripReminderScheduler };
