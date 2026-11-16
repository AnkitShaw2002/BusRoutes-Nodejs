const winston = require('winston');
const path = require('path');

// Define log levels and colors
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

// Define different colors for the console output
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

winston.addColors(colors);
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    // Define the format for the logs
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss:ms',
        }),
        winston.format.printf(
            (info) => `${info.timestamp} ${info.level.toUpperCase()}: ${info.message}`,
        ),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
    ),
    defaultMeta: { service: "air-india-service" },

    // Define which logs to store where
    transports: [
        // 1. Output to the console
        // new winston.transports.Console({
        //     format: winston.format.combine(
        //         winston.format.colorize({ all: true }),
        //         format
        //     ),
        // }),
        // 2. Save all errors to error.log
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/error.log'),
            level: 'error',
        }),
        // 3. Save all logs (info, warn, error) to combined.log
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/combined.log')
        }),
    ],

});

// Create the logger instance
// const logger = winston.createLogger({
//     level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
//     levels,
//     format,
//     transports,
// });

// Always log to console in addition to files
logger.add(
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    ),
  })
);

module.exports = logger;