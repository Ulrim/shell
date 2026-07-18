const { Redis } = require("@upstash/redis");

// Reads UPSTASH_REDIS_REST_URL/TOKEN, falling back to KV_REST_API_URL/TOKEN
// (the names used by Vercel's legacy KV integration). Either is set
// automatically once a Redis store is connected to the Vercel project.
module.exports = Redis.fromEnv();
