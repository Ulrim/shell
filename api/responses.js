const redis = require("../lib/redis");
const { SCORE_KEYS, sanitizeRecord } = require("../lib/validate");

const AGGREGATE_KEY = "bench:aggregate";
const RESPONSES_KEY = "bench:responses";
const MAX_RESPONSES = 500;

function summaryFromCounts(counts) {
  const count = counts.count || 0;
  const averages = {};
  for (const k of SCORE_KEYS) averages[k] = count ? counts[k] / count : 0;
  return { count, averages };
}

async function handlePost(req, res) {
  const record = sanitizeRecord(req.body);
  if (!record) return res.status(400).json({ error: "invalid payload" });
  record.at = new Date().toISOString();

  // HINCRBY is atomic per field, so concurrent submissions can't drop a
  // count the way a read-modify-write on a plain value would.
  const pipeline = redis.pipeline();
  pipeline.hincrby(AGGREGATE_KEY, "count", 1);
  for (const k of SCORE_KEYS) pipeline.hincrby(AGGREGATE_KEY, k, record[k]);
  pipeline.rpush(RESPONSES_KEY, JSON.stringify(record));
  pipeline.ltrim(RESPONSES_KEY, -MAX_RESPONSES, -1);
  const results = await pipeline.exec();

  const counts = { count: results[0] };
  SCORE_KEYS.forEach((k, i) => {
    counts[k] = results[1 + i];
  });
  return res.status(200).json(summaryFromCounts(counts));
}

async function handleGet(req, res) {
  const raw = (await redis.hgetall(AGGREGATE_KEY)) || {};
  const counts = { count: Number(raw.count) || 0 };
  for (const k of SCORE_KEYS) counts[k] = Number(raw[k]) || 0;
  const summary = summaryFromCounts(counts);

  const adminKey = process.env.ADMIN_KEY;
  if (adminKey && req.query.key === adminKey) {
    const responses = (await redis.lrange(RESPONSES_KEY, 0, -1)) || [];
    return res.status(200).json({ ...summary, responses });
  }

  return res.status(200).json(summary);
}

module.exports = async (req, res) => {
  if (req.method === "POST") return handlePost(req, res);
  if (req.method === "GET") return handleGet(req, res);

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "method not allowed" });
};
