const Bus = require("../models/Bus");
const SeatLayout = require("../models/SeatLayout");
const Route = require("../models/Route");
const Trip = require("../models/Trip");
const Coupon = require("../models/Coupon");
const Banner = require("../models/Banner");
const Setting = require("../models/Setting");
const Notification = require("../models/Notification");
const User = require("../models/User");
const Role = require("../models/Role");
const StaffSchedule = require("../models/StaffSchedule");
const FareRule = require("../models/FareRule");
const logger = require("../utils/logger");
const {
  send,
  fail,
  paginated,
  pageOptions,
  validId,
  logActivity,
  cache,
  emit,
} = require("../utils/api");

const uploadToCloudinary = async (files, folder) => {
  if (!files?.length) {
    return [];
  }

  return Promise.all(
    files.map((file) =>
      require("../middleware/Uploadchecker").uploadToCloudinary(
        file.buffer,
        folder,
      ),
    ),
  );
};

const getResourceById = async (Model, id, res) => {
  if (!validId(id)) {
    return fail(res, 400, "Invalid resource ID.");
  }

  const resource = await Model.findOne({
    _id: id,
    isDeleted: { $ne: true },
  }).lean();

  return resource
    ? send(res, resource)
    : fail(res, 404, "Resource not found.");
};

const softDeleteResource = async (Model, moduleName, req, res) => {
  if (!validId(req.params.id)) {
    return fail(res, 400, "Invalid resource ID.");
  }

  const resource = await Model.findOneAndUpdate(
    { _id: req.params.id, isDeleted: { $ne: true } },
    { isDeleted: true },
    { new: true },
  );

  if (!resource) {
    return fail(res, 404, "Resource not found.");
  }

  await cache.invalidate(`${moduleName.toLowerCase()}:*`);
  await logActivity(
    req,
    moduleName,
    "Delete",
    `Deleted ${moduleName} ${resource._id}`,
  );

  return send(res, resource, `${moduleName} deleted.`);
};

class ManagementController {
  constructor() {
    this.customers = this.customers.bind(this);
    this.drivers = this.drivers.bind(this);
    this.staff = this.staff.bind(this);
  }

  /**
   * Get paginated active buses for the public bus list.
   */
  async buses(req, res) {
    try {
      return await paginated(
        res,
        req.query,
        { isDeleted: false, status: "active" },
        Bus,
      );
    } catch (error) {
      logger.error(`Bus List API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading buses.",
      });
    }
  }

  /**
   * Get details for a bus by its ID.
   */
  async bus(req, res) {
    try {
      return await getResourceById(Bus, req.params.id, res);
    } catch (error) {
      logger.error(`Get Bus API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading the bus.",
      });
    }
  }

  /**
   * Create a bus and upload any supplied bus images to Cloudinary.
   */
  async createBus(req, res) {
    try {
      const {
        busNumber,
        registrationNumber,
        busName,
        busType,
        totalSeats,
        seatLayoutId,
        assignedDriver,
        amenities,
      } = req.body;

      if (
        !busNumber ||
        !registrationNumber ||
        !busType ||
        !Number.isInteger(Number(totalSeats)) ||
        Number(totalSeats) < 1 ||
        !seatLayoutId
      ) {
        return fail(
          res,
          400,
          "busNumber, registrationNumber, busType, totalSeats and seatLayoutId are required.",
        );
      }

      if (!validId(seatLayoutId)) {
        return fail(res, 400, "Invalid seatLayoutId.");
      }

      const layout = await SeatLayout.findOne({
        _id: seatLayoutId,
        isDeleted: false,
      });
      if (!layout) {
        return fail(res, 400, "Seat layout not found.");
      }

      if (layout.seats.length !== Number(totalSeats)) {
        return fail(
          res,
          400,
          "totalSeats must match the assigned seat layout.",
        );
      }

      if (assignedDriver) {
        const driverRole = await Role.findOne({ name: "driver" }).select("_id");
        const validDriver =
          validId(assignedDriver) &&
          driverRole &&
          (await User.exists({
            _id: assignedDriver,
            roleId: driverRole._id,
            status: "active",
            isDeleted: false,
          }));

        if (!validDriver) {
          return fail(
            res,
            400,
            "assignedDriver must reference an active driver account.",
          );
        }
      }

      const uploadedImages = await uploadToCloudinary(
        req.files,
        "busroutes/buses",
      );
      const images = uploadedImages.length
        ? uploadedImages.map((image) => ({
            url: image.secure_url,
            publicId: image.public_id,
          }))
        : Array.isArray(req.body.images)
          ? req.body.images
          : [];

      const bus = await Bus.create({
        busNumber,
        registrationNumber,
        busName,
        busType,
        totalSeats: Number(totalSeats),
        seatLayoutId,
        assignedDriver: assignedDriver || null,
        images,
        amenities: Array.isArray(amenities)
          ? amenities
          : amenities
            ? [amenities]
            : [],
      });

      await cache.invalidate("buses:*");
      await logActivity(req, "Bus", "Create", `Created bus ${bus.busNumber}`);
      return send(res, bus, "Bus created.", 201);
    } catch (error) {
      logger.error(`Create Bus API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while creating the bus.",
      });
    }
  }

  /**
   * Update a bus and optionally replace its uploaded images.
   */
  async updateBus(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid bus ID.");
      }

      const allowedFields = [
        "busNumber",
        "registrationNumber",
        "busName",
        "busType",
        "totalSeats",
        "seatLayoutId",
        "assignedDriver",
        "amenities",
        "images",
        "status",
      ];
      const updates = Object.fromEntries(
        Object.entries(req.body).filter(([key]) => allowedFields.includes(key)),
      );

      if (updates.totalSeats !== undefined) {
        updates.totalSeats = Number(updates.totalSeats);
      }

      const uploadedImages = await uploadToCloudinary(
        req.files,
        "busroutes/buses",
      );
      if (uploadedImages.length) {
        updates.images = uploadedImages.map((image) => ({
          url: image.secure_url,
          publicId: image.public_id,
        }));
      }

      const bus = await Bus.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        updates,
        { new: true, runValidators: true },
      );

      if (!bus) {
        return fail(res, 404, "Bus not found.");
      }

      await cache.invalidate("buses:*");
      await logActivity(req, "Bus", "Update", `Updated bus ${bus.busNumber}`);
      return send(res, bus, "Bus updated.");
    } catch (error) {
      logger.error(`Update Bus API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while updating the bus.",
      });
    }
  }

  /**
   * Soft-delete a bus.
   */
  async deleteBus(req, res) {
    try {
      return await softDeleteResource(Bus, "Bus", req, res);
    } catch (error) {
      logger.error(`Delete Bus API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while deleting the bus.",
      });
    }
  }

  /**
   * List active seat layouts.
   */
  async seatLayouts(req, res) {
    try {
      return await paginated(
        res,
        req.query,
        { isDeleted: false },
        SeatLayout,
      );
    } catch (error) {
      logger.error(`Seat Layout List API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading seat layouts.",
      });
    }
  }

  /**
   * Get a seat layout by its ID.
   */
  async seatLayout(req, res) {
    try {
      return await getResourceById(SeatLayout, req.params.id, res);
    } catch (error) {
      logger.error(`Get Seat Layout API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading the seat layout.",
      });
    }
  }

  /**
   * Create a seat layout from a seat grid configuration.
   */
  async createSeatLayout(req, res) {
    try {
      const { name, layoutType, totalRows, totalColumns, decks, seats } = req.body;
      if (!name || !Array.isArray(seats) || !seats.length) {
        return fail(res, 400, "name and a non-empty seats array are required.");
      }

      const seatNumbers = seats.map((seat) =>
        String(seat.seatNumber || "").trim(),
      );
      if (
        seatNumbers.some((seatNumber) => !seatNumber) ||
        new Set(seatNumbers).size !== seatNumbers.length
      ) {
        return fail(res, 400, "Seat numbers must be present and unique.");
      }

      const layout = await SeatLayout.create({
        name,
        layoutType,
        totalRows,
        totalColumns,
        decks,
        seats,
      });
      await logActivity(
        req,
        "SeatLayout",
        "Create",
        `Created seat layout ${name}`,
      );

      return send(res, layout, "Seat layout created.", 201);
    } catch (error) {
      logger.error(`Create Seat Layout API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while creating the seat layout.",
      });
    }
  }

  /**
   * Update a seat layout configuration.
   */
  async updateSeatLayout(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid seat layout ID.");
      }

      const allowedFields = [
        "name",
        "layoutType",
        "totalRows",
        "totalColumns",
        "decks",
        "seats",
      ];
      const updates = Object.fromEntries(
        Object.entries(req.body).filter(([key]) => allowedFields.includes(key)),
      );
      const layout = await SeatLayout.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        updates,
        { new: true, runValidators: true },
      );

      return layout
        ? send(res, layout, "Seat layout updated.")
        : fail(res, 404, "Seat layout not found.");
    } catch (error) {
      logger.error(`Update Seat Layout API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while updating the seat layout.",
      });
    }
  }

  /**
   * Soft-delete a seat layout.
   */
  async deleteSeatLayout(req, res) {
    try {
      return await softDeleteResource(SeatLayout, "SeatLayout", req, res);
    } catch (error) {
      logger.error(`Delete Seat Layout API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while deleting the seat layout.",
      });
    }
  }

  /**
   * List active bus routes.
   */
  async routes(req, res) {
    try {
      return await paginated(
        res,
        req.query,
        { isDeleted: false, status: "active" },
        Route,
      );
    } catch (error) {
      logger.error(`Route List API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading routes.",
      });
    }
  }

  /**
   * Get route details by ID.
   */
  async route(req, res) {
    try {
      return await getResourceById(Route, req.params.id, res);
    } catch (error) {
      logger.error(`Get Route API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading the route.",
      });
    }
  }

  /**
   * Create a route between two distinct cities.
   */
  async createRoute(req, res) {
    try {
      const {
        sourceCity,
        destinationCity,
        distanceKm,
        estimatedDurationMinutes,
      } = req.body;

      if (
        !sourceCity ||
        !destinationCity ||
        sourceCity.toLowerCase() === destinationCity.toLowerCase() ||
        distanceKm == null ||
        estimatedDurationMinutes == null
      ) {
        return fail(
          res,
          400,
          "Distinct sourceCity and destinationCity, distanceKm and estimatedDurationMinutes are required.",
        );
      }

      const route = await Route.create(req.body);
      await cache.invalidate("routes:*");
      await logActivity(
        req,
        "Route",
        "Create",
        `Created route ${route.sourceCity} to ${route.destinationCity}`,
      );

      return send(res, route, "Route created.", 201);
    } catch (error) {
      logger.error(`Create Route API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while creating the route.",
      });
    }
  }

  /**
   * Update route details and intermediate stops.
   */
  async updateRoute(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid route ID.");
      }

      const allowedFields = [
        "sourceCity",
        "destinationCity",
        "distanceKm",
        "estimatedDurationMinutes",
        "boardingPoints",
        "droppingPoints",
        "intermediateStops",
        "status",
      ];
      const updates = Object.fromEntries(
        Object.entries(req.body).filter(([key]) => allowedFields.includes(key)),
      );
      const route = await Route.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        updates,
        { new: true, runValidators: true },
      );

      if (!route) {
        return fail(res, 404, "Route not found.");
      }

      await cache.invalidate("routes:*");
      return send(res, route, "Route updated.");
    } catch (error) {
      logger.error(`Update Route API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while updating the route.",
      });
    }
  }

  /**
   * Soft-delete a route.
   */
  async deleteRoute(req, res) {
    try {
      return await softDeleteResource(Route, "Route", req, res);
    } catch (error) {
      logger.error(`Delete Route API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while deleting the route.",
      });
    }
  }

  /**
   * Search scheduled trips by source city, destination city, and date.
   */
  async searchTrips(req, res) {
    try {
      const { from, to, date } = req.query;
      if (!from || !to || !date || Number.isNaN(Date.parse(date))) {
        return fail(res, 400, "from, to and a valid date are required.");
      }

      await require("./bookingController").releaseExpiredReservations();

      const day = new Date(date);
      day.setHours(0, 0, 0, 0);
      const nextDay = new Date(day);
      nextDay.setDate(day.getDate() + 1);

      const cacheKey = [
        "trips:search",
        from.toLowerCase(),
        to.toLowerCase(),
        day.toISOString().slice(0, 10),
        req.query.page || 1,
        req.query.limit || 20,
      ].join(":");
      const cachedResult = await cache.get(cacheKey);
      if (cachedResult) {
        return res.json({
          success: true,
          data: cachedResult.data,
          pagination: cachedResult.pagination,
          cached: true,
        });
      }

      const { page, limit, skip } = pageOptions(req.query);
      const match = {
        isDeleted: false,
        status: { $in: ["scheduled", "boarding", "delayed"] },
        departureDate: { $gte: day, $lt: nextDay },
      };
      const pipeline = [
        { $match: match },
        {
          $lookup: {
            from: "routes",
            localField: "routeId",
            foreignField: "_id",
            as: "route",
          },
        },
        { $unwind: "$route" },
        {
          $match: {
            "route.sourceCity": from.toLowerCase(),
            "route.destinationCity": to.toLowerCase(),
            "route.status": "active",
          },
        },
        {
          $lookup: {
            from: "buses",
            localField: "busId",
            foreignField: "_id",
            as: "bus",
          },
        },
        { $unwind: "$bus" },
        { $match: { "bus.status": "active", "bus.isDeleted": false } },
        {
          $lookup: {
            from: "seatlayouts",
            localField: "bus.seatLayoutId",
            foreignField: "_id",
            as: "layout",
          },
        },
        {
          $unwind: {
            path: "$layout",
            preserveNullAndEmptyArrays: true,
          },
        },
        { $sort: { departureAt: 1, departureDate: 1 } },
        {
          $facet: {
            items: [
              { $skip: skip },
              { $limit: limit },
              {
                $project: {
                  routeId: 1,
                  busId: 1,
                  departureDate: 1,
                  departureAt: 1,
                  arrivalAt: 1,
                  departureTime: 1,
                  arrivalTime: 1,
                  baseFare: 1,
                  premiumFare: 1,
                  availableSeats: 1,
                  bookedSeatNumbers: 1,
                  status: 1,
                  route: {
                    sourceCity: "$route.sourceCity",
                    destinationCity: "$route.destinationCity",
                    distanceKm: "$route.distanceKm",
                    boardingPoints: "$route.boardingPoints",
                    droppingPoints: "$route.droppingPoints",
                  },
                  bus: {
                    busName: "$bus.busName",
                    busNumber: "$bus.busNumber",
                    busType: "$bus.busType",
                    amenities: "$bus.amenities",
                  },
                  seats: "$layout.seats",
                },
              },
            ],
            total: [{ $count: "count" }],
          },
        },
      ];

      const [result] = await Trip.aggregate(pipeline);
      const total = result?.total?.[0]?.count || 0;
      const fareService = require("../services/fareService");
      const items = await Promise.all((result?.items || []).map(async (trip) => {
        const rules = await fareService.getFareRules(trip.routeId, trip.departureAt || trip.departureDate);
        const seats = (trip.seats || []).map((seat) => ({
          ...seat,
          price: fareService.getSeatFare(trip, seat, trip.departureAt || trip.departureDate, null, rules),
        }));
        return { ...trip, seats };
      }));
      const responseData = {
        data: items,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };

      await cache.set(cacheKey, responseData, 90);
      return res.json({ success: true, ...responseData });
    } catch (error) {
      logger.error(`Trip Search API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while searching trips.",
      });
    }
  }

  /**
   * Get seat availability and prices for a trip.
   */
  async tripSeats(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid trip ID.");
      }

      await require("./bookingController").releaseExpiredReservations();

      const trip = await Trip.findOne({
        _id: req.params.id,
        isDeleted: false,
      }).lean();
      if (!trip) {
        return fail(res, 404, "Trip not found.");
      }

      const bus = await Bus.findById(trip.busId)
        .populate("seatLayoutId", "name seats")
        .lean();
      if (!bus?.seatLayoutId) {
        return fail(res, 404, "Seat layout not found.");
      }

      const occupiedSeats = new Set(trip.bookedSeatNumbers || []);
      const fareService = require("../services/fareService");
      const fareRules = await fareService.getFareRules(trip.routeId, trip.departureAt || trip.departureDate);
      const seats = bus.seatLayoutId.seats.map((seat) => ({
        ...seat,
        isAvailable:
          seat.seatType !== "blocked" &&
          seat.seatType !== "reserved" &&
          !occupiedSeats.has(seat.seatNumber),
        price: fareService.getSeatFare(trip, seat, trip.departureAt || trip.departureDate, null, fareRules),
      }));

      return send(res, {
        tripId: trip._id,
        availableSeats: trip.availableSeats,
        seats,
      });
    } catch (error) {
      logger.error(`Trip Seat Availability API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading seat availability.",
      });
    }
  }

  /**
   * List upcoming trips visible to customers.
   */
  async trips(req, res) {
    try {
      return await paginated(
        res,
        req.query,
        {
          isDeleted: false,
          status: { $in: ["scheduled", "boarding", "delayed"] },
        },
        Trip,
        { departureDate: 1 },
      );
    } catch (error) {
      logger.error(`Trip List API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading trips.",
      });
    }
  }

  /**
   * Get trip details by ID.
   */
  async trip(req, res) {
    try {
      return await getResourceById(Trip, req.params.id, res);
    } catch (error) {
      logger.error(`Get Trip API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading the trip.",
      });
    }
  }

  /**
   * Create a trip using an active route, bus, and optional driver.
   */
  async createTrip(req, res) {
    try {
      const {
        routeId,
        busId,
        departureDate,
        departureTime,
        arrivalTime,
        baseFare,
        driverId,
      } = req.body;

      if (
        ![routeId, busId].every(validId) ||
        !departureDate ||
        !departureTime ||
        !arrivalTime ||
        baseFare == null
      ) {
        return fail(
          res,
          400,
          "routeId, busId, departureDate, departureTime, arrivalTime and baseFare are required.",
        );
      }

      const [route, bus] = await Promise.all([
        Route.findOne({
          _id: routeId,
          status: "active",
          isDeleted: false,
        }),
        Bus.findOne({
          _id: busId,
          status: "active",
          isDeleted: false,
        }),
      ]);
      if (!route || !bus) {
        return fail(res, 400, "An active route and bus are required.");
      }

      if (driverId) {
        const driverRole = await Role.findOne({ name: "driver" }).select("_id");
        const validDriver =
          validId(driverId) &&
          driverRole &&
          (await User.exists({
            _id: driverId,
            roleId: driverRole._id,
            status: "active",
            isDeleted: false,
          }));

        if (!validDriver) {
          return fail(
            res,
            400,
            "driverId must reference an active driver account.",
          );
        }
      }

      const departureAt = new Date(departureDate);
      const [departureHour, departureMinute] = departureTime
        .split(":")
        .map(Number);
      const [arrivalHour, arrivalMinute] = arrivalTime.split(":").map(Number);
      const validTimes =
        Number.isInteger(departureHour) &&
        Number.isInteger(departureMinute) &&
        Number.isInteger(arrivalHour) &&
        Number.isInteger(arrivalMinute) &&
        departureHour <= 23 &&
        departureMinute <= 59 &&
        arrivalHour <= 23 &&
        arrivalMinute <= 59;

      if (Number.isNaN(departureAt.getTime()) || !validTimes) {
        return fail(res, 400, "Invalid departure date or time.");
      }

      departureAt.setHours(departureHour, departureMinute, 0, 0);
      const arrivalAt = new Date(departureAt);
      arrivalAt.setHours(arrivalHour, arrivalMinute, 0, 0);
      if (arrivalAt <= departureAt) {
        arrivalAt.setDate(arrivalAt.getDate() + 1);
      }

      const trip = await Trip.create({
        ...req.body,
        createdBy: req.user._id,
        departureDate: departureAt,
        departureAt,
        arrivalAt,
        availableSeats: bus.totalSeats,
      });

      await cache.invalidate("trips:*");
      await logActivity(req, "Trip", "Create", `Scheduled trip ${trip._id}`);
      return send(res, trip, "Trip scheduled.", 201);
    } catch (error) {
      logger.error(`Create Trip API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while scheduling the trip.",
      });
    }
  }

  /**
   * Update trip schedule, fare, driver assignment, or operating status.
   */
  async updateTrip(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid trip ID.");
      }

      const allowedFields = [
        "departureDate",
        "departureTime",
        "arrivalTime",
        "departureAt",
        "arrivalAt",
        "estimatedTravelTime",
        "baseFare",
        "premiumFare",
        "status",
        "driverId",
      ];
      const updates = Object.fromEntries(
        Object.entries(req.body).filter(([key]) => allowedFields.includes(key)),
      );

      if (updates.driverId) {
        const driverRole = await Role.findOne({ name: "driver" }).select("_id");
        const validDriver =
          validId(updates.driverId) &&
          driverRole &&
          (await User.exists({
            _id: updates.driverId,
            roleId: driverRole._id,
            status: "active",
            isDeleted: false,
          }));

        if (!validDriver) {
          return fail(
            res,
            400,
            "driverId must reference an active driver account.",
          );
        }
      }

      const trip = await Trip.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        updates,
        { new: true, runValidators: true },
      );
      if (!trip) {
        return fail(res, 404, "Trip not found.");
      }

      emit(`trip_${trip._id}`, "trip_update", {
        tripId: trip._id,
        status: trip.status,
      });
      await cache.invalidate("trips:*");
      return send(res, trip, "Trip updated.");
    } catch (error) {
      logger.error(`Update Trip API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while updating the trip.",
      });
    }
  }

  /**
   * Soft-delete a trip.
   */
  async deleteTrip(req, res) {
    try {
      return await softDeleteResource(Trip, "Trip", req, res);
    } catch (error) {
      logger.error(`Delete Trip API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while deleting the trip.",
      });
    }
  }

  /**
   * List trips assigned to the authenticated driver.
   */
  async driverTrips(req, res) {
    try {
      return await paginated(
        res,
        req.query,
        {
          driverId: req.user._id,
          isDeleted: false,
          departureDate: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
        Trip,
        { departureDate: 1 },
        "routeId busId",
      );
    } catch (error) {
      logger.error(`Driver Trip Schedule API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading the driver schedule.",
      });
    }
  }

  /**
   * Update the status of a trip assigned to the authenticated driver.
   */
  async driverUpdateTripStatus(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid trip ID.");
      }

      const driverStatuses = [
        "boarding",
        "departed",
        "running",
        "completed",
        "delayed",
      ];
      if (!driverStatuses.includes(req.body.status)) {
        return fail(res, 400, "Unsupported driver trip status.");
      }

      const trip = await Trip.findOneAndUpdate(
        {
          _id: req.params.id,
          driverId: req.user._id,
          isDeleted: false,
          status: { $nin: ["cancelled", "completed"] },
        },
        { status: req.body.status },
        { new: true, runValidators: true },
      );

      if (!trip) {
        return fail(
          res,
          404,
          "Assigned trip not found or its status cannot be changed.",
        );
      }

      emit(`trip_${trip._id}`, "trip_update", {
        tripId: trip._id,
        status: trip.status,
      });
      return send(res, trip, "Trip status updated.");
    } catch (error) {
      logger.error(`Driver Trip Status API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while updating the trip status.",
      });
    }
  }

  /**
   * List coupons available to administrators.
   */
  async coupons(req, res) {
    try {
      return await paginated(
        res,
        req.query,
        { isDeleted: false },
        Coupon,
      );
    } catch (error) {
      logger.error(`Coupon List API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading coupons.",
      });
    }
  }

  /**
   * Create a discount coupon with a valid date range.
   */
  async createCoupon(req, res) {
    try {
      const { code, discountType, discountValue, validFrom, validTill } = req.body;
      if (
        !code ||
        !["percentage", "flat"].includes(discountType) ||
        !Number.isFinite(Number(discountValue)) ||
        !validFrom ||
        !validTill ||
        new Date(validTill) <= new Date(validFrom)
      ) {
        return fail(
          res,
          400,
          "Provide a code, valid discount and a valid date range.",
        );
      }

      const coupon = await Coupon.create({
        ...req.body,
        code: code.toUpperCase(),
      });
      await logActivity(req, "Coupon", "Create", `Created coupon ${coupon.code}`);
      return send(res, coupon, "Coupon created.", 201);
    } catch (error) {
      logger.error(`Create Coupon API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while creating the coupon.",
      });
    }
  }

  /**
   * Update coupon discount details and validity dates.
   */
  async updateCoupon(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid coupon ID.");
      }

      const allowedFields = [
        "discountType",
        "discountValue",
        "minAmount",
        "maxDiscount",
        "validFrom",
        "validTill",
        "usageLimit",
        "status",
      ];
      const updates = Object.fromEntries(
        Object.entries(req.body).filter(([key]) => allowedFields.includes(key)),
      );
      const coupon = await Coupon.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        updates,
        { new: true, runValidators: true },
      );

      return coupon
        ? send(res, coupon, "Coupon updated.")
        : fail(res, 404, "Coupon not found.");
    } catch (error) {
      logger.error(`Update Coupon API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while updating the coupon.",
      });
    }
  }

  /**
   * Soft-delete a coupon.
   */
  async deleteCoupon(req, res) {
    try {
      return await softDeleteResource(Coupon, "Coupon", req, res);
    } catch (error) {
      logger.error(`Delete Coupon API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while deleting the coupon.",
      });
    }
  }

  /**
   * Validate a coupon against a requested booking total.
   */
  async validateCoupon(req, res) {
    try {
      const { code, amount } = req.body;
      const bookingAmount = Number(amount);
      if (!code || !Number.isFinite(bookingAmount) || bookingAmount < 0) {
        return fail(res, 400, "A coupon code and valid amount are required.");
      }

      const coupon = await Coupon.findOne({
        code: String(code).toUpperCase(),
        status: "active",
        isDeleted: false,
        validFrom: { $lte: new Date() },
        validTill: { $gte: new Date() },
        $expr: { $lt: ["$usedCount", "$usageLimit"] },
      });

      if (!coupon) {
        return fail(res, 404, "Coupon is unavailable or expired.");
      }
      if (bookingAmount < coupon.minAmount) {
        return fail(
          res,
          400,
          `Minimum booking amount is ${coupon.minAmount}.`,
        );
      }

      const rawDiscount =
        coupon.discountType === "percentage"
          ? (bookingAmount * coupon.discountValue) / 100
          : coupon.discountValue;
      const discountAmount = Math.round(
        Math.min(
          rawDiscount,
          coupon.maxDiscount ?? Infinity,
          bookingAmount,
        ) * 100,
      ) / 100;

      return send(
        res,
        { coupon, discountAmount },
        "Coupon is valid.",
      );
    } catch (error) {
      logger.error(`Validate Coupon API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while validating the coupon.",
      });
    }
  }

  /**
   * List active banners for the customer website.
   */
  async publicBanners(req, res) {
    try {
      const now = new Date();
      const banners = await Banner.find({
        status: "active",
        isDeleted: false,
        $and: [
          { $or: [{ startDate: null }, { startDate: { $lte: now } }] },
          { $or: [{ endDate: null }, { endDate: { $gte: now } }] },
        ],
      })
        .sort({ order: 1 })
        .lean();

      return send(res, banners);
    } catch (error) {
      logger.error(`Public Banner List API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading banners.",
      });
    }
  }

  /**
   * List banners for administration.
   */
  async banners(req, res) {
    try {
      return await paginated(
        res,
        req.query,
        { isDeleted: false },
        Banner,
        { order: 1 },
      );
    } catch (error) {
      logger.error(`Banner List API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading banners.",
      });
    }
  }

  /**
   * Create a banner and upload its image to Cloudinary when provided.
   */
  async createBanner(req, res) {
    try {
      let imageUrl = req.body.imageUrl;
      let imagePublicId = req.body.imagePublicId;

      if (req.file) {
        const uploadedImage = await require("../middleware/Uploadchecker").uploadToCloudinary(
          req.file.buffer,
          "busroutes/banners",
        );
        imageUrl = uploadedImage.secure_url;
        imagePublicId = uploadedImage.public_id;
      }

      if (!req.body.title || !imageUrl) {
        return fail(res, 400, "title and imageUrl or image file are required.");
      }

      const banner = await Banner.create({
        ...req.body,
        imageUrl,
        imagePublicId,
      });
      await logActivity(req, "Banner", "Create", `Created banner ${banner._id}`);
      return send(res, banner, "Banner created.", 201);
    } catch (error) {
      logger.error(`Create Banner API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while creating the banner.",
      });
    }
  }

  /**
   * Update banner content and optionally replace its image.
   */
  async updateBanner(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid banner ID.");
      }

      const allowedFields = [
        "title",
        "imageUrl",
        "imagePublicId",
        "linkUrl",
        "order",
        "startDate",
        "endDate",
        "status",
      ];
      const updates = Object.fromEntries(
        Object.entries(req.body).filter(([key]) => allowedFields.includes(key)),
      );

      if (req.file) {
        const uploadedImage = await require("../middleware/Uploadchecker").uploadToCloudinary(
          req.file.buffer,
          "busroutes/banners",
        );
        updates.imageUrl = uploadedImage.secure_url;
        updates.imagePublicId = uploadedImage.public_id;
      }

      const banner = await Banner.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        updates,
        { new: true, runValidators: true },
      );

      return banner
        ? send(res, banner, "Banner updated.")
        : fail(res, 404, "Banner not found.");
    } catch (error) {
      logger.error(`Update Banner API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while updating the banner.",
      });
    }
  }

  /**
   * Soft-delete a banner.
   */
  async deleteBanner(req, res) {
    try {
      return await softDeleteResource(Banner, "Banner", req, res);
    } catch (error) {
      logger.error(`Delete Banner API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while deleting the banner.",
      });
    }
  }

  /**
   * Get public website settings.
   */
  async getSettings(req, res) {
    try {
      return send(res, await Setting.findOne().lean());
    } catch (error) {
      logger.error(`Get Settings API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading website settings.",
      });
    }
  }

  /**
   * Update website settings.
   */
  async updateSettings(req, res) {
    try {
      const allowedFields = [
        "siteName",
        "supportEmail",
        "supportPhone",
        "logoUrl",
        "logoPublicId",
        "brandColor",
        "socialLinks",
        "termsAndConditions",
        "privacyPolicy",
        "cancellationPolicy",
        "maintenanceMode",
      ];
      const updates = Object.fromEntries(
        Object.entries(req.body).filter(([key]) => allowedFields.includes(key)),
      );
      const setting = await Setting.findOneAndUpdate({}, updates, {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
        setOnInsert: {
          supportEmail: process.env.SUPPORT_EMAIL || "support@shamolly.com",
          supportPhone: process.env.SUPPORT_PHONE || "Not configured",
        },
      });

      await logActivity(req, "Setting", "Update", "Updated website settings");
      return send(res, setting, "Settings updated.");
    } catch (error) {
      logger.error(`Update Settings API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while updating website settings.",
      });
    }
  }

  /**
   * Create and send a notification to a user, role, or all customers.
   */
  async createNotification(req, res) {
    try {
      const { title, message, audience = "specific_user", userId } = req.body;
      if (
        !title ||
        !message ||
        (audience === "specific_user" && !validId(userId))
      ) {
        return fail(
          res,
          400,
          "title, message and a valid userId for specific_user audience are required.",
        );
      }

      const notification = await Notification.create({
        title,
        message,
        audience,
        userId: audience === "specific_user" ? userId : null,
        sentBy: req.user._id,
        status: "sent",
        sentAt: new Date(),
      });

      if (userId) {
        emit(`user_${userId}`, "notification", notification.toObject());
      } else if (audience === "all") {
        try {
          require("../utils/socket")
            .getIO()
            .emit("notification", notification.toObject());
        } catch (error) {
          logger.warn(`Notification socket is unavailable: ${error.message}`);
        }
      } else {
        emit(`role:${audience}`, "notification", notification.toObject());
      }

      await logActivity(
        req,
        "Notification",
        "Create",
        `Sent notification ${notification._id}`,
      );
      return send(res, notification, "Notification sent.", 201);
    } catch (error) {
      logger.error(`Create Notification API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while sending the notification.",
      });
    }
  }

  /**
   * Get notifications addressed to the authenticated user or their role.
   */
  async myNotifications(req, res) {
    try {
      return await paginated(
        res,
        req.query,
        {
          isDeleted: false,
          $or: [
            { userId: req.user._id },
            {
              userId: null,
              audience: { $in: ["all", req.user.role] },
              status: "sent",
            },
          ],
        },
        Notification,
        { createdAt: -1 },
      );
    } catch (error) {
      logger.error(`Notification List API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading notifications.",
      });
    }
  }

  /**
   * Mark a notification as read by the authenticated user.
   */
  async markNotificationRead(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid notification ID.");
      }

      const notification = await Notification.findOneAndUpdate(
        {
          _id: req.params.id,
          isDeleted: false,
          $or: [{ userId: req.user._id }, { userId: null }],
        },
        { isRead: true },
        { new: true },
      );

      return notification
        ? send(res, notification, "Notification marked read.")
        : fail(res, 404, "Notification not found.");
    } catch (error) {
      logger.error(`Mark Notification Read API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while updating the notification.",
      });
    }
  }

  /**
   * List customer accounts for administration.
   */
  async customers(req, res) {
    return this.listPeopleByRole("customer", req, res);
  }

  /**
   * List driver accounts and license details for administration.
   */
  async drivers(req, res) {
    return this.listPeopleByRole("driver", req, res);
  }

  /**
   * List staff accounts for administration.
   */
  async staff(req, res) {
    return this.listPeopleByRole("staff", req, res);
  }

  /**
   * Find customer, driver, or staff records and paginate the result.
   */
  async listPeopleByRole(roleName, req, res) {
    try {
      const role = await Role.findOne({ name: roleName }).select("_id");
      if (!role) {
        return send(res, []);
      }

      const filter = { roleId: role._id, isDeleted: false };
      if (req.query.search) {
        const searchTerm = String(req.query.search).replace(
          /[.*+?^${}()|[\]\\]/g,
          "\\$&",
        );
        filter.$or = [
          { name: new RegExp(searchTerm, "i") },
          { email: new RegExp(searchTerm, "i") },
          { phone: new RegExp(searchTerm, "i") },
        ];
      }

      if (roleName === "driver") {
        const { page, limit, skip } = pageOptions(req.query);
        const [items, total] = await Promise.all([
          User.aggregate([
            { $match: filter },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
              $lookup: {
                from: "driverprofiles",
                localField: "_id",
                foreignField: "userId",
                as: "driverProfile",
              },
            },
            {
              $unwind: {
                path: "$driverProfile",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                name: 1,
                email: 1,
                phone: 1,
                status: 1,
                profileImage: 1,
                createdAt: 1,
                licenseNumber: "$driverProfile.licenseNumber",
                licenseExpiry: "$driverProfile.licenseExpiry",
                emergencyContact: "$driverProfile.emergencyContact",
              },
            },
          ]),
          User.countDocuments(filter),
        ]);

        return res.json({
          success: true,
          data: items,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        });
      }

      return await paginated(
        res,
        req.query,
        filter,
        User,
        { createdAt: -1 },
      );
    } catch (error) {
      logger.error(`People List API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while loading user records.",
      });
    }
  }

  /**
   * Update a customer, driver, or staff account.
   */
  async updatePerson(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid user ID.");
      }

      const allowedFields = ["name", "phone", "status", "profileImage"];
      const updates = Object.fromEntries(
        Object.entries(req.body).filter(([key]) => allowedFields.includes(key)),
      );
      const user = await User.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        updates,
        { new: true, runValidators: true },
      ).select("-password -refreshToken");

      return user
        ? send(res, user, "User updated.")
        : fail(res, 404, "User not found.");
    } catch (error) {
      logger.error(`Update User API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while updating the user.",
      });
    }
  }

  /**
   * Deactivate a customer, driver, or staff account.
   */
  async deletePerson(req, res) {
    try {
      if (!validId(req.params.id)) {
        return fail(res, 400, "Invalid user ID.");
      }

      const user = await User.findOneAndUpdate(
        { _id: req.params.id, isDeleted: false },
        { isDeleted: true, status: "inactive" },
        { new: true },
      ).select("-password -refreshToken");

      return user
        ? send(res, user, "User deactivated.")
        : fail(res, 404, "User not found.");
    } catch (error) {
      logger.error(`Deactivate User API Error: ${error.message}`);
      return res.status(500).json({
        success: false,
        message: "An error occurred while deactivating the user.",
      });
    }
  }

  async staffSchedule(req, res) {
    try {
      if (!validId(req.params.id)) return fail(res, 400, "Invalid staff ID.");
      const staffRole = await Role.findOne({ name: "staff" }).select("_id");
      const staffUser = staffRole && await User.findOne({ _id: req.params.id, roleId: staffRole._id, isDeleted: false }).select("_id");
      if (!staffUser) return fail(res, 404, "Staff member not found.");
      const filter = { staffId: staffUser._id };
      if (req.query.from || req.query.to) {
        filter.workDate = {};
        if (req.query.from) filter.workDate.$gte = new Date(req.query.from);
        if (req.query.to) filter.workDate.$lte = new Date(req.query.to);
        if (Object.values(filter.workDate).some((date) => Number.isNaN(date.getTime()))) return fail(res, 400, "Date filters must be valid.");
      }
      return await paginated(res, req.query, filter, StaffSchedule, { workDate: -1 }, "staffId recordedBy");
    } catch (error) {
      logger.error(`Staff Schedule API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while loading staff schedule." });
    }
  }

  async upsertStaffSchedule(req, res) {
    try {
      if (!validId(req.params.id)) return fail(res, 400, "Invalid staff ID.");
      const staffRole = await Role.findOne({ name: "staff" }).select("_id");
      const staffUser = staffRole && await User.findOne({ _id: req.params.id, roleId: staffRole._id, isDeleted: false }).select("_id");
      if (!staffUser) return fail(res, 404, "Staff member not found.");
      const workDate = new Date(req.body.workDate);
      if (Number.isNaN(workDate.getTime())) return fail(res, 400, "A valid workDate is required.");
      const updates = {};
      for (const key of ["shiftStart", "shiftEnd", "attendanceStatus", "clockInAt", "clockOutAt", "notes"]) {
        if (Object.hasOwn(req.body, key)) updates[key] = req.body[key];
      }
      if (updates.clockInAt) updates.clockInAt = new Date(updates.clockInAt);
      if (updates.clockOutAt) updates.clockOutAt = new Date(updates.clockOutAt);
      if ([updates.clockInAt, updates.clockOutAt].some((date) => date && Number.isNaN(date.getTime()))) return fail(res, 400, "Clock in/out times must be valid dates.");
      const record = await StaffSchedule.findOneAndUpdate(
        { staffId: staffUser._id, workDate: new Date(workDate.toISOString().slice(0, 10)) },
        { $set: updates, $setOnInsert: { recordedBy: req.user._id } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      );
      return send(res, record, "Staff shift and attendance saved.", 201);
    } catch (error) {
      logger.error(`Save Staff Schedule API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while saving staff schedule." });
    }
  }

  async fareRules(req, res) {
    try {
      const filter = { isDeleted: false };
      if (req.query.active === "true") filter.isActive = true;
      return await paginated(res, req.query, filter, FareRule, { createdAt: -1 }, "routeId");
    } catch (error) {
      logger.error(`Fare Rules API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while loading fare rules." });
    }
  }

  async createFareRule(req, res) {
    try {
      const allowed = ["name", "ruleType", "routeId", "seatType", "validFrom", "validTill", "daysOfWeek", "minAge", "maxAge", "operation", "adjustmentType", "adjustmentValue", "isActive"];
      const data = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
      if (!data.name || !data.ruleType || !["percentage", "flat"].includes(data.adjustmentType) || !Number.isFinite(Number(data.adjustmentValue)) || Number(data.adjustmentValue) < 0) return fail(res, 400, "name, ruleType, adjustmentType and a non-negative adjustmentValue are required.");
      if (data.routeId && !validId(data.routeId)) return fail(res, 400, "Invalid routeId.");
      if (data.routeId && !(await Route.exists({ _id: data.routeId, isDeleted: false }))) return fail(res, 404, "Route not found.");
      const rule = await FareRule.create(data);
      await cache.invalidate("trips:search:*");
      return send(res, rule, "Fare rule created.", 201);
    } catch (error) {
      logger.error(`Create Fare Rule API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while creating the fare rule." });
    }
  }

  async updateFareRule(req, res) {
    try {
      if (!validId(req.params.id)) return fail(res, 400, "Invalid fare rule ID.");
      const allowed = ["name", "ruleType", "routeId", "seatType", "validFrom", "validTill", "daysOfWeek", "minAge", "maxAge", "operation", "adjustmentType", "adjustmentValue", "isActive"];
      const updates = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowed.includes(key)));
      if (updates.routeId && !validId(updates.routeId)) return fail(res, 400, "Invalid routeId.");
      const rule = await FareRule.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, updates, { new: true, runValidators: true });
      if (!rule) return fail(res, 404, "Fare rule not found.");
      await cache.invalidate("trips:search:*");
      return send(res, rule, "Fare rule updated.");
    } catch (error) {
      logger.error(`Update Fare Rule API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while updating the fare rule." });
    }
  }

  async deleteFareRule(req, res) {
    try {
      if (!validId(req.params.id)) return fail(res, 400, "Invalid fare rule ID.");
      const rule = await FareRule.findOneAndUpdate({ _id: req.params.id, isDeleted: false }, { isDeleted: true, isActive: false }, { new: true });
      if (!rule) return fail(res, 404, "Fare rule not found.");
      await cache.invalidate("trips:search:*");
      return send(res, rule, "Fare rule deleted.");
    } catch (error) {
      logger.error(`Delete Fare Rule API Error: ${error.message}`);
      return res.status(500).json({ success: false, message: "An error occurred while deleting the fare rule." });
    }
  }
}

module.exports = new ManagementController();
