require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./app/config/db');
const { initSocket } = require('./app/utils/socket');
const logger = require('./app/utils/logger');

const PORT = process.env.PORT || 4000;
const server = http.createServer(app);

// connectDB().then(() => {
const startServer = async () => {

    try {
        await connectDB();
        initSocket(server);
        if (process.env.NODE_ENV !== 'test') {
            require('./app/services/tripReminderService').startTripReminderScheduler();
        }
        server.listen(PORT, () => {
            logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
            console.log(`🚀 BusRoutes active at http://localhost:${PORT}`);
            console.log(
                `Swagger Docs: http://localhost:${PORT}/api-docs`
            );
        });
        // }).catch((error) => {

    }
    catch (error) {
        logger.error('Startup error', error);
        console.error(
            "Server startup failed:",
            error.message
        );
        process.exit(1);
    // });
    }
};

    // module.exports = server;

    startServer();
