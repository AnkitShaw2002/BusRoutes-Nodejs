const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require("swagger-ui-express");

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'BusRoutes',
            version: '1.0.0',
            description: 'API documentation for BusRoutes platform',
        },
        servers: [
            {
                url: process.env.BASE_URL || 'http://localhost:4000',
                description: 'Local Server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
    },
    apis: [
        // './app/webroutes/*.js'
        "./app/routes/**/*.js",
    ], // Path to the API routes
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = {
    swaggerUi,
    swaggerSpec,
};
