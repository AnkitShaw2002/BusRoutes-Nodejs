const express = require("express");
const router = express.Router();

const managementController = require("../controllers/managementController");
const { checkAuth, authorizeRoles } = require("../middleware/checkAuth");
const upload = require("../middleware/Uploadchecker");

const adminOnly = [checkAuth, authorizeRoles("admin")];

// ==========================================
// BUS, ROUTE, TRIP, AND MANAGEMENT ROUTES
// ==========================================

/**
 * @swagger
 * tags:
 *   - name: Buses
 *     description: Bus fleet and assigned seat layouts
 *   - name: Seat layouts
 *     description: Seat grid configuration
 *   - name: Routes
 *     description: Bus routes and intermediate stops
 *   - name: Trips
 *     description: Trip schedules, search, and seat availability
 *   - name: Coupons
 *     description: Coupon creation and validation
 *   - name: Banners
 *     description: Customer website banners
 *   - name: Settings
 *     description: Website and company settings
 *   - name: Notifications
 *     description: Customer and staff notifications
 *   - name: People
 *     description: Customer, driver, and staff accounts
 *
 * /api/v1/buses:
 *   get:
 *     summary: Get active buses
 *     description: Return a paginated list of buses available to customers.
 *     tags:
 *       - Buses
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Active buses returned successfully
 *   post:
 *     summary: Create a bus
 *     description: Create a bus and optionally upload up to eight images.
 *     tags:
 *       - Buses
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - busNumber
 *               - registrationNumber
 *               - busType
 *               - totalSeats
 *               - seatLayoutId
 *             properties:
 *               busNumber:
 *                 type: string
 *               registrationNumber:
 *                 type: string
 *               busName:
 *                 type: string
 *               busType:
 *                 type: string
 *               totalSeats:
 *                 type: integer
 *               seatLayoutId:
 *                 type: string
 *               assignedDriver:
 *                 type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       201:
 *         description: Bus created successfully
 *       400:
 *         description: Required bus details are invalid
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 * /api/v1/buses/{id}:
 *   get:
 *     summary: Get bus details
 *     tags:
 *       - Buses
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bus details returned successfully
 *       404:
 *         description: Bus not found
 *   patch:
 *     summary: Update a bus
 *     tags:
 *       - Buses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Bus updated successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Bus not found
 *   delete:
 *     summary: Soft-delete a bus
 *     tags:
 *       - Buses
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Bus deleted successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Bus not found
 *
 * /api/v1/seat-layouts:
 *   get:
 *     summary: List seat layouts
 *     tags:
 *       - Seat layouts
 *     responses:
 *       200:
 *         description: Seat layouts returned successfully
 * /api/v1/seat-layouts/{id}:
 *   get:
 *     summary: Get a seat layout
 *     tags:
 *       - Seat layouts
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Seat layout returned successfully
 *       404:
 *         description: Seat layout not found
 * /api/v1/admin/seat-layouts:
 *   post:
 *     summary: Create a seat layout
 *     tags:
 *       - Seat layouts
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
 *               - seats
 *             properties:
 *               name:
 *                 type: string
 *               layoutType:
 *                 type: string
 *               totalRows:
 *                 type: integer
 *               totalColumns:
 *                 type: integer
 *               decks:
 *                 type: integer
 *               seats:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Seat layout created successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 * /api/v1/admin/seat-layouts/{id}:
 *   patch:
 *     summary: Update a seat layout
 *     tags:
 *       - Seat layouts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Seat layout updated successfully
 *       404:
 *         description: Seat layout not found
 *   delete:
 *     summary: Soft-delete a seat layout
 *     tags:
 *       - Seat layouts
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Seat layout deleted successfully
 *       404:
 *         description: Seat layout not found
 *
 * /api/v1/routes:
 *   get:
 *     summary: List active routes
 *     tags:
 *       - Routes
 *     responses:
 *       200:
 *         description: Routes returned successfully
 * /api/v1/routes/{id}:
 *   get:
 *     summary: Get route details
 *     tags:
 *       - Routes
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Route returned successfully
 *       404:
 *         description: Route not found
 * /api/v1/admin/routes:
 *   post:
 *     summary: Create a route
 *     tags:
 *       - Routes
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sourceCity
 *               - destinationCity
 *               - distanceKm
 *               - estimatedDurationMinutes
 *             properties:
 *               sourceCity:
 *                 type: string
 *               destinationCity:
 *                 type: string
 *               distanceKm:
 *                 type: number
 *               estimatedDurationMinutes:
 *                 type: integer
 *               boardingPoints:
 *                 type: array
 *                 items:
 *                   type: string
 *               droppingPoints:
 *                 type: array
 *                 items:
 *                   type: string
 *               intermediateStops:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Route created successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 * /api/v1/admin/routes/{id}:
 *   patch:
 *     summary: Update a route
 *     tags:
 *       - Routes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Route updated successfully
 *       404:
 *         description: Route not found
 *   delete:
 *     summary: Soft-delete a route
 *     tags:
 *       - Routes
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Route deleted successfully
 *       404:
 *         description: Route not found
 *
 * /api/v1/trips/search:
 *   get:
 *     summary: Search trips by city and departure date
 *     description: Return matching trips with bus details, route stops, and seat availability.
 *     tags:
 *       - Trips
 *     parameters:
 *       - in: query
 *         name: from
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: to
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Matching trips returned successfully
 *       400:
 *         description: Required search parameters are invalid
 * /api/v1/trips:
 *   get:
 *     summary: List scheduled trips
 *     tags:
 *       - Trips
 *     responses:
 *       200:
 *         description: Trips returned successfully
 * /api/v1/trips/{id}:
 *   get:
 *     summary: Get trip details
 *     tags:
 *       - Trips
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trip details returned successfully
 *       404:
 *         description: Trip not found
 * /api/v1/trips/{id}/seats:
 *   get:
 *     summary: Get trip seat availability
 *     tags:
 *       - Trips
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Seat availability returned successfully
 *       404:
 *         description: Trip or seat layout not found
 * /api/v1/admin/trips:
 *   post:
 *     summary: Schedule a trip
 *     tags:
 *       - Trips
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - routeId
 *               - busId
 *               - departureDate
 *               - departureTime
 *               - arrivalTime
 *               - baseFare
 *             properties:
 *               routeId:
 *                 type: string
 *               busId:
 *                 type: string
 *               driverId:
 *                 type: string
 *               departureDate:
 *                 type: string
 *                 format: date-time
 *               departureTime:
 *                 type: string
 *               arrivalTime:
 *                 type: string
 *               baseFare:
 *                 type: number
 *               premiumFare:
 *                 type: number
 *     responses:
 *       201:
 *         description: Trip scheduled successfully
 *       400:
 *         description: Invalid route, bus, or schedule details
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 * /api/v1/admin/trips/{id}:
 *   patch:
 *     summary: Update a scheduled trip
 *     tags:
 *       - Trips
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Trip updated successfully
 *       404:
 *         description: Trip not found
 *   delete:
 *     summary: Soft-delete a trip
 *     tags:
 *       - Trips
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Trip deleted successfully
 *       404:
 *         description: Trip not found
 * /api/v1/driver/trips:
 *   get:
 *     summary: Get the current driver's assigned trips
 *     tags:
 *       - Trips
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Assigned trips returned successfully
 *       403:
 *         description: Driver role required
 * /api/v1/driver/trips/{id}/status:
 *   patch:
 *     summary: Update the status of an assigned trip
 *     tags:
 *       - Trips
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [boarding, departed, running, completed, delayed]
 *     responses:
 *       200:
 *         description: Trip status updated successfully
 *       403:
 *         description: Driver role required or trip is not assigned
 *       404:
 *         description: Assigned trip not found
 *
 * /api/v1/coupons/validate:
 *   post:
 *     summary: Validate a coupon and calculate its discount
 *     tags:
 *       - Coupons
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - amount
 *             properties:
 *               code:
 *                 type: string
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Coupon is valid and discount is calculated
 *       400:
 *         description: Amount does not meet the coupon minimum
 *       404:
 *         description: Coupon is unavailable or expired
 * /api/v1/admin/coupons:
 *   get:
 *     summary: List coupons
 *     tags:
 *       - Coupons
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Coupons returned successfully
 *   post:
 *     summary: Create a coupon
 *     tags:
 *       - Coupons
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - discountType
 *               - discountValue
 *               - validFrom
 *               - validTill
 *             properties:
 *               code:
 *                 type: string
 *               discountType:
 *                 type: string
 *                 enum: [percentage, flat]
 *               discountValue:
 *                 type: number
 *               validFrom:
 *                 type: string
 *                 format: date-time
 *               validTill:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Coupon created successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 * /api/v1/admin/coupons/{id}:
 *   patch:
 *     summary: Update a coupon
 *     tags:
 *       - Coupons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Coupon updated successfully
 *       404:
 *         description: Coupon not found
 *   delete:
 *     summary: Soft-delete a coupon
 *     tags:
 *       - Coupons
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Coupon deleted successfully
 *       404:
 *         description: Coupon not found
 *
 * /api/v1/banners:
 *   get:
 *     summary: Get active customer website banners
 *     tags:
 *       - Banners
 *     responses:
 *       200:
 *         description: Active banners returned successfully
 * /api/v1/admin/banners:
 *   get:
 *     summary: List banners for administration
 *     tags:
 *       - Banners
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Banners returned successfully
 *   post:
 *     summary: Create a website banner
 *     tags:
 *       - Banners
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *               image:
 *                 type: string
 *                 format: binary
 *               imageUrl:
 *                 type: string
 *               linkUrl:
 *                 type: string
 *               order:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Banner created successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 * /api/v1/admin/banners/{id}:
 *   patch:
 *     summary: Update a website banner
 *     tags:
 *       - Banners
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Banner updated successfully
 *       404:
 *         description: Banner not found
 *   delete:
 *     summary: Soft-delete a banner
 *     tags:
 *       - Banners
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Banner deleted successfully
 *       404:
 *         description: Banner not found
 *
 * /api/v1/settings:
 *   get:
 *     summary: Get public website settings
 *     tags:
 *       - Settings
 *     responses:
 *       200:
 *         description: Website settings returned successfully
 * /api/v1/admin/settings:
 *   patch:
 *     summary: Update website settings
 *     tags:
 *       - Settings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Website settings updated successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 * /api/v1/notifications:
 *   get:
 *     summary: Get the current user's notifications
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications returned successfully
 *       401:
 *         description: Authentication required
 * /api/v1/notifications/{id}/read:
 *   patch:
 *     summary: Mark a notification as read
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       404:
 *         description: Notification not found
 * /api/v1/admin/notifications:
 *   post:
 *     summary: Send a notification
 *     tags:
 *       - Notifications
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - message
 *             properties:
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               audience:
 *                 type: string
 *                 enum: [all, customer, driver, staff, specific_user]
 *               userId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Notification sent successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *
 * /api/v1/admin/customers:
 *   get:
 *     summary: List customer accounts
 *     tags:
 *       - People
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Customer accounts returned successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 * /api/v1/admin/drivers:
 *   get:
 *     summary: List driver accounts and license details
 *     tags:
 *       - People
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Driver accounts returned successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 * /api/v1/admin/staff:
 *   get:
 *     summary: List staff accounts
 *     tags:
 *       - People
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Staff accounts returned successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 * /api/v1/admin/people/{id}:
 *   patch:
 *     summary: Update a customer, driver, or staff account
 *     tags:
 *       - People
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: User record updated successfully
 *       404:
 *         description: User not found
 *   delete:
 *     summary: Deactivate a customer, driver, or staff account
 *     tags:
 *       - People
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User account deactivated successfully
 *       404:
 *         description: User not found
 */

// Bus Management
router.get("/buses", managementController.buses);
router.get("/buses/:id", managementController.bus);
router.post(
  "/buses",
  ...adminOnly,
  upload.array("images", 8),
  managementController.createBus,
);
router.patch(
  "/buses/:id",
  ...adminOnly,
  upload.array("images", 8),
  managementController.updateBus,
);
router.delete("/buses/:id", ...adminOnly, managementController.deleteBus);

// Keep the admin-prefixed bus endpoints available for existing clients.
router.post(
  "/admin/buses",
  ...adminOnly,
  upload.array("images", 8),
  managementController.createBus,
);
router.patch(
  "/admin/buses/:id",
  ...adminOnly,
  upload.array("images", 8),
  managementController.updateBus,
);
router.delete(
  "/admin/buses/:id",
  ...adminOnly,
  managementController.deleteBus,
);

// Seat Layout Management
router.get("/seat-layouts", managementController.seatLayouts);
router.get("/seat-layouts/:id", managementController.seatLayout);
router.post(
  "/admin/seat-layouts",
  ...adminOnly,
  managementController.createSeatLayout,
);
router.patch(
  "/admin/seat-layouts/:id",
  ...adminOnly,
  managementController.updateSeatLayout,
);
router.delete(
  "/admin/seat-layouts/:id",
  ...adminOnly,
  managementController.deleteSeatLayout,
);

// Route Management
router.get("/routes", managementController.routes);
router.get("/routes/:id", managementController.route);
router.post(
  "/admin/routes",
  ...adminOnly,
  managementController.createRoute,
);
router.patch(
  "/admin/routes/:id",
  ...adminOnly,
  managementController.updateRoute,
);
router.delete(
  "/admin/routes/:id",
  ...adminOnly,
  managementController.deleteRoute,
);

// Trip Search, Scheduling, and Driver Schedule
router.get("/trips/search", managementController.searchTrips);
router.get("/trips", managementController.trips);
router.get("/trips/:id/seats", managementController.tripSeats);
router.get("/trips/:id", managementController.trip);
router.post(
  "/admin/trips",
  ...adminOnly,
  managementController.createTrip,
);
router.patch(
  "/admin/trips/:id",
  ...adminOnly,
  managementController.updateTrip,
);
router.delete(
  "/admin/trips/:id",
  ...adminOnly,
  managementController.deleteTrip,
);
router.get(
  "/driver/trips",
  checkAuth,
  authorizeRoles("driver"),
  managementController.driverTrips,
);
router.patch(
  "/driver/trips/:id/status",
  checkAuth,
  authorizeRoles("driver"),
  managementController.driverUpdateTripStatus,
);

// Coupon Management
router.post("/coupons/validate", managementController.validateCoupon);
router.get("/admin/coupons", ...adminOnly, managementController.coupons);
router.post("/admin/coupons", ...adminOnly, managementController.createCoupon);
router.patch(
  "/admin/coupons/:id",
  ...adminOnly,
  managementController.updateCoupon,
);
router.delete(
  "/admin/coupons/:id",
  ...adminOnly,
  managementController.deleteCoupon,
);

// Banner Management
router.get("/banners", managementController.publicBanners);
router.get("/admin/banners", ...adminOnly, managementController.banners);
router.post(
  "/admin/banners",
  ...adminOnly,
  upload.single("image"),
  managementController.createBanner,
);
router.patch(
  "/admin/banners/:id",
  ...adminOnly,
  upload.single("image"),
  managementController.updateBanner,
);
router.delete(
  "/admin/banners/:id",
  ...adminOnly,
  managementController.deleteBanner,
);

// Website Settings
router.get("/settings", managementController.getSettings);
router.patch(
  "/admin/settings",
  ...adminOnly,
  managementController.updateSettings,
);

// Notification Management
router.get(
  "/notifications",
  checkAuth,
  managementController.myNotifications,
);
router.patch(
  "/notifications/:id/read",
  checkAuth,
  managementController.markNotificationRead,
);
router.post(
  "/admin/notifications",
  ...adminOnly,
  managementController.createNotification,
);

// Customer, Driver, and Staff Management
router.get(
  "/admin/customers",
  ...adminOnly,
  managementController.customers,
);
router.get(
  "/admin/drivers",
  ...adminOnly,
  managementController.drivers,
);
router.get("/admin/staff", ...adminOnly, managementController.staff);
router.patch(
  "/admin/people/:id",
  ...adminOnly,
  managementController.updatePerson,
);
router.delete(
  "/admin/people/:id",
  ...adminOnly,
  managementController.deletePerson,
);
/**
 * @swagger
 * /api/v1/admin/staff/{id}/schedule:
 *   get:
 *     summary: List a staff member's shifts and attendance
 *     tags: [People]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Shift and attendance records returned }
 *   put:
 *     summary: Record a staff shift and attendance
 *     tags: [People]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [workDate]
 *             properties:
 *               workDate: { type: string, format: date }
 *               shiftStart: { type: string, example: "09:00" }
 *               shiftEnd: { type: string, example: "17:00" }
 *               attendanceStatus: { type: string, enum: [not_marked, present, absent, leave] }
 *               clockInAt: { type: string, format: date-time }
 *               clockOutAt: { type: string, format: date-time }
 *               notes: { type: string }
 *     responses:
 *       201: { description: Staff attendance and shift saved }
 */
router.get("/admin/staff/:id/schedule", ...adminOnly, managementController.staffSchedule);
router.put("/admin/staff/:id/schedule", ...adminOnly, managementController.upsertStaffSchedule);

/**
 * @swagger
 * /api/v1/admin/fare-rules:
 *   get:
 *     summary: List route, date, seat, and age based fare rules
 *     tags: [Fare rules]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Fare rules returned successfully }
 *   post:
 *     summary: Create a dynamic fare or passenger discount rule
 *     tags: [Fare rules]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, ruleType, adjustmentType, adjustmentValue]
 *             properties:
 *               name: { type: string }
 *               ruleType: { type: string, enum: [weekend, holiday, festival, seat_type, child, senior, discount] }
 *               routeId: { type: string, nullable: true }
 *               seatType: { type: string }
 *               validFrom: { type: string, format: date-time }
 *               validTill: { type: string, format: date-time }
 *               daysOfWeek: { type: array, items: { type: integer, minimum: 0, maximum: 6 } }
 *               minAge: { type: integer }
 *               maxAge: { type: integer }
 *               operation: { type: string, enum: [increase, decrease] }
 *               adjustmentType: { type: string, enum: [percentage, flat] }
 *               adjustmentValue: { type: number, minimum: 0 }
 *   patch:
 *     summary: Update a fare rule
 *     tags: [Fare rules]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: Fare rule updated successfully }
 * /api/v1/admin/fare-rules/{id}:
 *   delete:
 *     summary: Delete a fare rule
 *     tags: [Fare rules]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Fare rule deleted successfully }
 */
router.get("/admin/fare-rules", ...adminOnly, managementController.fareRules);
router.post("/admin/fare-rules", ...adminOnly, managementController.createFareRule);
router.patch("/admin/fare-rules/:id", ...adminOnly, managementController.updateFareRule);
router.delete("/admin/fare-rules/:id", ...adminOnly, managementController.deleteFareRule);

module.exports = router;
