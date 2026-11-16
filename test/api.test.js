process.env.NODE_ENV = "test";
require("dotenv").config();
process.env.RAZORPAY_WEBHOOK_SECRET = "razorpay-test-secret";
process.env.STRIPE_WEBHOOK_SECRET = "stripe-test-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const app = require("../app");
const { getSeatFare } = require("../app/services/fareService");

let server;
let baseUrl;

test.before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
});

test("health, Swagger and protected route are available", async () => {
  assert.equal((await fetch(`${baseUrl}/health`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/api-docs`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/v1/customer/profile`)).status, 401);
});

test("Swagger includes new scope routes", () => {
  const { swaggerSpec } = require("../swagger");
  for (const path of [
    "/api/v1/bookings/{id}/reschedule",
    "/api/v1/customer/favorite-routes",
    "/api/v1/customer/saved-passengers",
    "/api/v1/admin/fare-rules",
    "/api/v1/admin/staff/{id}/schedule",
    "/api/v1/payments/stripe/checkout",
  ]) assert.ok(swaggerSpec.paths[path], `missing Swagger path ${path}`);
});

test("fare rules calculate weekend price increases and child discounts", () => {
  const fare = getSeatFare(
    { baseFare: 100, premiumFare: 0 },
    { seatNumber: "A1", seatType: "seater" },
    new Date("2026-11-21T00:00:00.000Z"),
    8,
    [
      { ruleType: "weekend", daysOfWeek: [], operation: "increase", adjustmentType: "percentage", adjustmentValue: 20 },
      { ruleType: "child", maxAge: 12, operation: "decrease", adjustmentType: "percentage", adjustmentValue: 50 },
    ],
  );
  assert.equal(fare, 60);
});

test("new model schemas validate schedule, fare rule and cash bookings", async () => {
  const id = new mongoose.Types.ObjectId();
  const StaffSchedule = require("../app/models/StaffSchedule");
  const FareRule = require("../app/models/FareRule");
  const Booking = require("../app/models/Booking");
  await new StaffSchedule({ staffId: id, workDate: new Date(), shiftStart: "09:00", shiftEnd: "17:00", recordedBy: id }).validate();
  await new FareRule({ name: "Child discount", ruleType: "child", operation: "decrease", adjustmentType: "percentage", adjustmentValue: 50 }).validate();
  await new Booking({ bookingReference: "BNTEST1", userId: id, tripId: id, seats: [{ seatNumber: "A1", price: 100 }], seatNumbers: ["A1"], totalSeats: 1, baseAmount: 100, totalAmount: 100, bookingStatus: "confirmed", paymentStatus: "paid", paymentMethod: "cash" }).validate();
});

test("Razorpay and Stripe webhook handlers verify signatures", async () => {
  const raw = JSON.stringify({ event: "smoke.test" });
  const razorpaySignature = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex");
  const razorpay = await fetch(`${baseUrl}/api/v1/payments/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "x-razorpay-signature": razorpaySignature }, body: raw });
  assert.equal(razorpay.status, 200);

  const timestamp = Math.floor(Date.now() / 1000);
  const stripeSignature = crypto.createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest("hex");
  const stripe = await fetch(`${baseUrl}/api/v1/payments/stripe/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": `t=${timestamp},v1=${stripeSignature}` }, body: raw });
  assert.equal(stripe.status, 200);

  const rejected = await fetch(`${baseUrl}/api/v1/payments/stripe/webhook`, { method: "POST", headers: { "Content-Type": "application/json", "stripe-signature": `t=${timestamp},v1=bad` }, body: raw });
  assert.equal(rejected.status, 400);
});
