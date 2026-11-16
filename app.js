require('dotenv').config();

const express = require('express');
const cookieParser = require('cookie-parser');
const setupSecurity = require('./app/config/security');
const errorHandler = require('./app/middleware/errorHandler');
const { swaggerUi, swaggerSpec } = require('./swagger');

// Initialize the optional Redis cache client without making API startup depend on Redis.
require('./app/config/redis');

const app = express();
setupSecurity(app);
app.use(express.json({ verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); } }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/auth', require('./app/routes/authRoutes'));
app.use('/api/v1/auth', require('./app/routes/authRoutes'));
app.use('/api/v1', require('./app/routes/managementRoutes'));
app.use('/api/v1', require('./app/routes/bookingRoutes'));
app.use('/api/v1', require('./app/routes/paymentRoutes'));
app.use('/api/v1', require('./app/routes/customerRoutes'));
app.use('/api/v1', require('./app/routes/adminRoutes'));

app.get('/health', (req, res) => res.status(200).json({ success: true, message: 'OK' }));
app.use((req, res) => res.status(404).json({ success: false, message: 'API endpoint not found.' }));
app.use(errorHandler);

module.exports = app;
