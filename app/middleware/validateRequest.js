const { validationResult } = require('express-validator');

// /**
//  * Middleware to validate incoming request data using express-validator.
//  * Accepts either an array of validation chains or a single validation chain.
//  */
// const validateRequest = (validations) => {
//     // Ensure validations is always an array to prevent runtime errors
//     const validationArray = Array.isArray(validations) ? validations : [validations];

//     return async (req, res, next) => {
//         try {
//             await Promise.all(validationArray.map(validation => validation.run(req)));

//             const errors = validationResult(req);
//             if (errors.isEmpty()) {
//                 return next();
//             }

//             const extractedErrors = errors.array();
//             const firstError = extractedErrors[0]?.msg || 'Validation failed';

//             return res.status(400).json({
//                 status: false,
//                 message: firstError,
//                 errors: extractedErrors
//             });
//         } catch (error) {
//             return next(error);
//         }
//     };
// };

// module.exports = validateRequest;

const validateRequest = (req, res, next) => {
    const errors = validationResult(req);

    if (errors.isEmpty()) {
        return next();
    }

    const extractedErrors = errors.array();
    const firstError = extractedErrors[0]?.msg || 'Validation failed';

    return res.status(400).json({
        status: false,
        message: firstError,
        errors: extractedErrors
    });
};

module.exports = validateRequest;