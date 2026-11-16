const Booking = require("../models/Booking");
const Payment = require("../models/Payment");
const User = require("../models/User");
const Bus = require("../models/Bus");
const Route = require("../models/Route");
const Trip = require("../models/Trip");
const Role = require("../models/Role");
const logger = require("../utils/logger");
const { send } = require("../utils/api");

class AdminController {
  /**
   * Get dashboard booking, revenue, bus, route, trip, and customer statistics.
   */
  async dashboard(req, res) {
    try {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const customerRoleIds = await Role.find({ name: "customer" }).distinct("_id");

      const [
        bookingStats,
        revenueStats,
        dailyStats,
        monthlyRevenue,
        busCount,
        routeCount,
        customerCount,
        tripStats,
        recentBookings,
        topRoutes,
      ] = await Promise.all([
        Booking.aggregate([
          {
            $match: {
              isDeleted: false,
              bookingStatus: { $in: ["confirmed", "CONFIRMED", "completed"] },
            },
          },
          {
            $group: {
              _id: null,
              totalBookings: { $sum: 1 },
              totalSeats: { $sum: "$totalSeats" },
            },
          },
        ]),
        Booking.aggregate([
          { $match: { isDeleted: false, paymentStatus: "paid", bookingStatus: { $in: ["confirmed", "CONFIRMED", "completed"] } } },
          { $group: { _id: null, totalRevenue: { $sum: "$totalAmount" } } },
        ]),
        Booking.aggregate([
          {
            $match: {
              isDeleted: false,
              createdAt: { $gte: dayStart },
              bookingStatus: { $in: ["confirmed", "CONFIRMED", "completed"] },
            },
          },
          { $count: "count" },
        ]),
        Booking.aggregate([
          {
            $match: {
              isDeleted: false,
              paymentStatus: "paid",
              bookingStatus: { $in: ["confirmed", "CONFIRMED", "completed"] },
              createdAt: { $gte: monthStart },
            },
          },
          {
            $group: {
              _id: null,
              revenue: { $sum: "$totalAmount" },
              payments: { $sum: 1 },
            },
          },
        ]),
        Bus.countDocuments({ isDeleted: false }),
        Route.countDocuments({ isDeleted: false }),
        User.countDocuments({ isDeleted: false, roleId: { $in: customerRoleIds } }),
        Trip.aggregate([
          { $match: { isDeleted: false } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
          { $sort: { count: -1 } },
        ]),
        Booking.find({ isDeleted: false })
          .sort({ createdAt: -1 })
          .limit(10)
          .populate("userId", "name email")
          .populate("tripId", "departureDate departureTime")
          .lean(),
        Booking.aggregate([
          {
            $match: {
              isDeleted: false,
              bookingStatus: { $in: ["confirmed", "CONFIRMED", "completed"] },
            },
          },
          {
            $lookup: {
              from: "trips",
              localField: "tripId",
              foreignField: "_id",
              as: "trip",
            },
          },
          { $unwind: "$trip" },
          {
            $lookup: {
              from: "routes",
              localField: "trip.routeId",
              foreignField: "_id",
              as: "route",
            },
          },
          { $unwind: "$route" },
          {
            $group: {
              _id: {
                source: "$route.sourceCity",
                destination: "$route.destinationCity",
              },
              bookings: { $sum: 1 },
              revenue: { $sum: "$totalAmount" },
              seats: { $sum: "$totalSeats" },
            },
          },
          { $sort: { bookings: -1 } },
          { $limit: 10 },
          {
            $project: {
              _id: 0,
              source: "$_id.source",
              destination: "$_id.destination",
              bookings: 1,
              revenue: 1,
              seats: 1,
            },
          },
        ]),
      ]);

      return send(res, {
        totalBookings: bookingStats[0]?.totalBookings || 0,
        totalBookedSeats: bookingStats[0]?.totalSeats || 0,
        totalRevenue: revenueStats[0]?.totalRevenue || 0,
        dailyBookings: dailyStats[0]?.count || 0,
        monthlyRevenue: monthlyRevenue[0]?.revenue || 0,
        monthlyPayments: monthlyRevenue[0]?.payments || 0,
        totalBuses: busCount,
        totalRoutes: routeCount,
        totalCustomers: customerCount,
        tripStats,
        recentBookings,
        topRoutes,
      });
    } catch (error) {
      logger.error(`Dashboard API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading dashboard statistics.",
      });
    }
  }

  /**
   * Build booking, payment, coupon, and route reports for a date range.
   */
  async reports(req, res) {
    try {
      const start = req.query.startDate
        ? new Date(req.query.startDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = req.query.endDate ? new Date(req.query.endDate) : new Date();

      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
        return res.status(400).json({
          success: false,
          message: "Valid startDate and endDate are required.",
        });
      }

      const [dailyBookings, paymentSummary, paymentStatuses, couponUsage, routeRevenue, busOccupancy, customerReport, driverReport, monthlyBookings] =
        await Promise.all([
          Booking.aggregate([
            {
              $match: {
                isDeleted: false,
                createdAt: { $gte: start, $lte: end },
              },
            },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                bookings: { $sum: 1 },
                revenue: { $sum: "$totalAmount" },
                seats: { $sum: "$totalSeats" },
              },
            },
            { $sort: { _id: 1 } },
          ]),
          Payment.aggregate([
            {
              $match: {
                isDeleted: false,
                createdAt: { $gte: start, $lte: end },
              },
            },
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
                amount: { $sum: "$amount" },
              },
            },
            { $sort: { count: -1 } },
          ]),
          Payment.aggregate([
            {
              $match: {
                isDeleted: false,
                createdAt: { $gte: start, $lte: end },
              },
            },
            { $group: { _id: "$status", count: { $sum: 1 } } },
          ]),
          Booking.aggregate([
            {
              $match: {
                isDeleted: false,
                couponId: { $ne: null },
                createdAt: { $gte: start, $lte: end },
              },
            },
            {
              $group: {
                _id: "$couponCode",
                uses: { $sum: 1 },
                discount: { $sum: "$discountAmount" },
              },
            },
            { $sort: { uses: -1 } },
          ]),
          Booking.aggregate([
            {
              $match: {
                isDeleted: false,
                bookingStatus: { $in: ["confirmed", "CONFIRMED", "completed"] },
                createdAt: { $gte: start, $lte: end },
              },
            },
            {
              $lookup: {
                from: "trips",
                localField: "tripId",
                foreignField: "_id",
                as: "trip",
              },
            },
            { $unwind: "$trip" },
            {
              $lookup: {
                from: "routes",
                localField: "trip.routeId",
                foreignField: "_id",
                as: "route",
              },
            },
            { $unwind: "$route" },
            {
              $group: {
                _id: {
                  source: "$route.sourceCity",
                  destination: "$route.destinationCity",
                },
                bookings: { $sum: 1 },
                revenue: { $sum: "$totalAmount" },
              },
            },
            { $sort: { revenue: -1 } },
          ]),
          Trip.aggregate([
            { $match: { isDeleted: false, departureAt: { $gte: start, $lte: end }, status: { $ne: "cancelled" } } },
            { $lookup: { from: "buses", localField: "busId", foreignField: "_id", as: "bus" } },
            { $unwind: "$bus" },
            { $lookup: { from: "bookings", let: { tripId: "$_id" }, pipeline: [{ $match: { $expr: { $eq: ["$tripId", "$$tripId"] }, isDeleted: false, bookingStatus: { $in: ["confirmed", "CONFIRMED", "completed"] } } }], as: "bookings" } },
            { $addFields: { occupied: { $sum: "$bookings.totalSeats" }, capacity: "$bus.totalSeats" } },
            { $group: { _id: "$busId", busNumber: { $first: "$bus.busNumber" }, busName: { $first: "$bus.busName" }, trips: { $sum: 1 }, occupiedSeats: { $sum: "$occupied" }, capacity: { $sum: "$capacity" } } },
            { $project: { busNumber: 1, busName: 1, trips: 1, occupiedSeats: 1, capacity: 1, occupancyPercent: { $cond: [{ $gt: ["$capacity", 0] }, { $multiply: [{ $divide: ["$occupiedSeats", "$capacity"] }, 100] }, 0] } } },
            { $sort: { occupancyPercent: -1 } },
          ]),
          Booking.aggregate([
            { $match: { isDeleted: false, bookingStatus: { $in: ["confirmed", "CONFIRMED", "completed"] }, createdAt: { $gte: start, $lte: end } } },
            { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "customer" } },
            { $unwind: "$customer" },
            { $group: { _id: "$userId", name: { $first: "$customer.name" }, email: { $first: "$customer.email" }, bookings: { $sum: 1 }, seats: { $sum: "$totalSeats" }, revenue: { $sum: "$totalAmount" } } },
            { $sort: { bookings: -1 } },
          ]),
          Trip.aggregate([
            { $match: { isDeleted: false, driverId: { $ne: null }, departureAt: { $gte: start, $lte: end } } },
            { $lookup: { from: "users", localField: "driverId", foreignField: "_id", as: "driver" } },
            { $unwind: "$driver" },
            { $lookup: { from: "bookings", let: { tripId: "$_id" }, pipeline: [{ $match: { $expr: { $eq: ["$tripId", "$$tripId"] }, isDeleted: false, bookingStatus: { $in: ["confirmed", "CONFIRMED", "completed"] } } }], as: "bookings" } },
            { $group: { _id: "$driverId", name: { $first: "$driver.name" }, email: { $first: "$driver.email" }, trips: { $sum: 1 }, passengers: { $sum: { $sum: "$bookings.totalSeats" } } } },
            { $sort: { trips: -1 } },
          ]),
          Booking.aggregate([
            { $match: { isDeleted: false, createdAt: { $gte: start, $lte: end } } },
            { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, bookings: { $sum: 1 }, revenue: { $sum: "$totalAmount" }, seats: { $sum: "$totalSeats" } } },
            { $sort: { _id: 1 } },
          ]),
        ]);

      return send(res, {
        period: { start, end },
        dailyBookings,
        paymentSummary,
        paymentStatuses,
        couponUsage,
        routeRevenue,
        busOccupancy,
        customerReport,
        driverReport,
        monthlyBookings,
      });
    } catch (error) {
      logger.error(`Reports API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while generating reports.",
      });
    }
  }
}

module.exports = new AdminController();
