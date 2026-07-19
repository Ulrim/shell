const { getClient } = require("../lib/redis");
const { SCORE_KEYS, sanitizeRecord } = require("../lib/validate");

const AGGREGATE_KEY = "bench:aggregate";
const RESPONSES_KEY = "bench:responses";
const MAX_RESPONSES = 500;
const DELETE_PASSWORD = "culiver123!";

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

  const redis = await getClient();

  // MULTI/EXEC batches these into one round trip; HINCRBY is atomic per
  // field, so concurrent submissions can't drop a count the way a plain
  // read-modify-write would.
  const multi = redis.multi();
  multi.hIncrBy(AGGREGATE_KEY, "count", 1);
  for (const k of SCORE_KEYS) multi.hIncrBy(AGGREGATE_KEY, k, record[k]);
  multi.rPush(RESPONSES_KEY, JSON.stringify(record));
  multi.lTrim(RESPONSES_KEY, -MAX_RESPONSES, -1);
  const results = await multi.exec();

  const counts = { count: results[0] };
  SCORE_KEYS.forEach((k, i) => {
    counts[k] = results[1 + i];
  });
  return res.status(200).json(summaryFromCounts(counts));
}

async function handleGet(req, res) {
  const redis = await getClient();

  const raw = (await redis.hGetAll(AGGREGATE_KEY)) || {};
  const counts = { count: Number(raw.count) || 0 };
  for (const k of SCORE_KEYS) counts[k] = Number(raw[k]) || 0;
  const summary = summaryFromCounts(counts);

  const adminKey = process.env.ADMIN_KEY;
  if (adminKey && req.query.key === adminKey) {
    const rawResponses = (await redis.lRange(RESPONSES_KEY, 0, -1)) || [];
    const responses = rawResponses
      .map((r) => {
        try {
          return JSON.parse(r);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    return res.status(200).json({ ...summary, responses });
  }

  return res.status(200).json(summary);
}

async function handleDelete(req, res) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || req.query.key !== adminKey) {
    return res.status(403).json({ error: "invalid admin key" });
  }

  const { at, password } = req.body || {};
  if (password !== DELETE_PASSWORD) {
    return res.status(403).json({ error: "invalid password" });
  }
  if (!at || typeof at !== "string") {
    return res.status(400).json({ error: "missing at" });
  }

  const redis = await getClient();

  const rawList = (await redis.lRange(RESPONSES_KEY, 0, -1)) || [];
  const target = rawList.find((r) => {
    try {
      return JSON.parse(r).at === at;
    } catch {
      return false;
    }
  });
  if (!target) return res.status(404).json({ error: "not found" });
  const record = JSON.parse(target);

  const multi = redis.multi();
  multi.lRem(RESPONSES_KEY, 1, target);
  multi.hIncrBy(AGGREGATE_KEY, "count", -1);
  for (const k of SCORE_KEYS) multi.hIncrBy(AGGREGATE_KEY, k, -record[k]);
  const results = await multi.exec();

  const counts = { count: results[1] };
  SCORE_KEYS.forEach((k, i) => {
    counts[k] = results[2 + i];
  });
  return res.status(200).json(summaryFromCounts(counts));
}

module.exports = async (req, res) => {
  if (req.method === "POST") return handlePost(req, res);
  if (req.method === "GET") return handleGet(req, res);
  if (req.method === "DELETE") return handleDelete(req, res);

  res.setHeader("Allow", "GET, POST, DELETE");
  return res.status(405).json({ error: "method not allowed" });
};
