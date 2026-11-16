const FareRule = require("../models/FareRule");

async function getFareRules(routeId, date) {
  return FareRule.find({
    isActive: true,
    isDeleted: false,
    validFrom: { $lte: date },
    validTill: { $gte: date },
    $or: [{ routeId: null }, { routeId }],
  }).lean();
}

function getSeatFare(baseFare, seat, date, passengerAge, rules) {
  let price = Number(seat.ticketPrice ?? (seat.isPremium ? baseFare.premiumFare || baseFare.baseFare : baseFare.baseFare));
  for (const rule of rules) {
    if (rule.seatType && rule.seatType !== seat.seatType) continue;
    if (rule.daysOfWeek?.length && !rule.daysOfWeek.includes(new Date(date).getDay())) continue;
    if (rule.ruleType === "weekend" && ![0, 6].includes(new Date(date).getDay())) continue;
    if (rule.ruleType === "child" && (passengerAge == null || passengerAge > (rule.maxAge ?? 12))) continue;
    if (rule.ruleType === "senior" && (passengerAge == null || passengerAge < (rule.minAge ?? 60))) continue;
    if (rule.minAge != null && passengerAge < rule.minAge) continue;
    if (rule.maxAge != null && passengerAge > rule.maxAge) continue;
    const adjustment = rule.adjustmentType === "percentage" ? price * rule.adjustmentValue / 100 : rule.adjustmentValue;
    price += rule.operation === "decrease" ? -adjustment : adjustment;
  }
  return Math.round(Math.max(0, price) * 100) / 100;
}

module.exports = { getFareRules, getSeatFare };
