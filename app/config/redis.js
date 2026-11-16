const Redis = require("ioredis");
const logger = require("../utils/logger");

let redisClient = null;
let isRedisAvailable = false;

// Sanitize Redis URL (handles Upstash, rediss:// upgrade, and redis-cli copy-paste errors)
const sanitizeRedisUrl = (url) => {
    if (!url) return "redis://127.0.0.1:6379";
    let cleanUrl = url.trim();
    
    if (cleanUrl.includes("redis-cli")) {
        const urlMatch = cleanUrl.match(/redis(s)?:\/\/[^\s]+/);
        if (urlMatch) {
            cleanUrl = urlMatch[0];
            if (url.includes("--tls") && cleanUrl.startsWith("redis:")) {
                cleanUrl = cleanUrl.replace("redis:", "rediss:");
            }
        }
    }
    
    if (!cleanUrl.startsWith("rediss:") && cleanUrl.includes("upstash.io")) {
        cleanUrl = cleanUrl.replace("redis:", "rediss:");
    }

    return cleanUrl;
};

// Initialize Redis only if not running in test mode
const isTest = process.env.NODE_ENV === "test";

if (!isTest) {
    try {
        const rawUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REDIS_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.REST_URL || "redis://127.0.0.1:6379";
        const redisUrl = sanitizeRedisUrl(rawUrl);
        const isTls = redisUrl.startsWith("rediss:");

        logger.info(
            `Connecting to Redis at ${redisUrl.replace(/:[^:@]+@/, ":***@")}...`
        );

        redisClient = new Redis(redisUrl, {
            maxRetriesPerRequest: 1,
            connectTimeout: 5000,
            // Enable TLS settings automatically if using Upstash rediss://
            ...(isTls && {
                tls: {
                    rejectUnauthorized: false
                }
            }),
            retryStrategy(times) {
                if (times > 3) {
                    if (isRedisAvailable) {
                        logger.warn(
                            "Redis connection attempts exhausted. Switching to Database fallback."
                        );
                        isRedisAvailable = false;
                    }
                    return 5000;
                }
                return Math.min(times * 500, 2000);
            },
        });

        redisClient.on("connect", () => {
            logger.info("Redis connection initiated.");
        });

        redisClient.on("ready", () => {
            logger.info("Redis client is ready and caching is active.");
            isRedisAvailable = true;
        });

        redisClient.on("error", (err) => {
            if (isRedisAvailable) {
                logger.warn(
                    `Redis client error encountered: ${err.message}. Graceful fallback active.`
                );
                isRedisAvailable = false;
            }
        });

        redisClient.on("end", () => {
            if (isRedisAvailable) {
                logger.warn("Redis client connection closed.");
                isRedisAvailable = false;
            }
        });
    } catch (err) {
        logger.error(
            `Failed to initialize Redis client: ${err.message}`
        );
        isRedisAvailable = false;
    }
} else {
    logger.info("Redis client disabled in test environment.");
}

// ==========================================
// CACHE HELPER FUNCTIONS
// ==========================================

async function getCache(key) {
    if (!isRedisAvailable || !redisClient) return null;

    try {
        const data = await redisClient.get(key);
        return data ? JSON.parse(data) : null;
    } catch (err) {
        logger.warn(
            `Redis getCache error for key "${key}": ${err.message}`
        );
        return null;
    }
}

async function setCache(key, value, ttlSeconds = 120) {
    if (!isRedisAvailable || !redisClient) return false;

    try {
        const stringified = JSON.stringify(value);
        if (ttlSeconds) {
            await redisClient.set(key, stringified, "EX", ttlSeconds);
        } else {
            await redisClient.set(key, stringified);
        }
        return true;
    } catch (err) {
        logger.warn(
            `Redis setCache error for key "${key}": ${err.message}`
        );
        return false;
    }
}

async function deleteCache(key) {
    if (!isRedisAvailable || !redisClient) return false;

    try {
        await redisClient.del(key);
        return true;
    } catch (err) {
        logger.warn(
            `Redis deleteCache error for key "${key}": ${err.message}`
        );
        return false;
    }
}

async function invalidatePattern(pattern) {
    if (!isRedisAvailable || !redisClient) return false;

    try {
        logger.info(`Invalidating Redis cache pattern: "${pattern}"`);
        const keys = await redisClient.keys(pattern);

        if (keys.length > 0) {
            logger.info(`Found ${keys.length} keys to delete.`);
            await redisClient.del(...keys);
        }

        return true;
    } catch (err) {
        logger.warn(
            `Redis invalidatePattern error for pattern "${pattern}": ${err.message}`
        );
        return false;
    }
}

function isCacheAvailable() {
    return isRedisAvailable;
}

// Attach helper functions directly to the redisClient instance 
// so app.js can use it for connect-redis AND controllers can destructure helpers.
if (redisClient) {
    redisClient.getCache = getCache;
    redisClient.setCache = setCache;
    redisClient.deleteCache = deleteCache;
    redisClient.invalidatePattern = invalidatePattern;
    redisClient.isCacheAvailable = isCacheAvailable;
}

module.exports = redisClient;
