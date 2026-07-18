// Cloudflare Pages Function backing the survey at /api/responses.
// Requires a KV namespace bound as BENCH_KV (see README.md for setup).
//
// Storage layout in KV:
//   bench:aggregate  -> { count, sums: { design, comfort, finish, value, again } }
//   bench:responses  -> JSON array of the last MAX_RESPONSES raw records
//                        (kept for the site owner to read qualitative
//                        feedback; only exposed via the admin-key GET path)

const SCORE_KEYS = ["design", "comfort", "finish", "value", "again"];
const CHANNEL_OPTIONS = [
  "지나가다 직접 봄",
  "현장 안내판 · QR",
  "SNS",
  "지인 추천",
  "전시 · 행사",
  "뉴스 · 기사",
];
const USE_OPTIONS = [
  "잠깐 앉아 쉼",
  "사람 기다림",
  "대화",
  "짐 놓기",
  "사진 촬영",
  "앉지 않고 구경만",
];
const AGE_OPTIONS = ["", "10대", "20대", "30대", "40대", "50대", "60대 이상"];
const PLACE_OPTIONS = [
  "",
  "공원 · 산책로",
  "해안 · 항구",
  "관공서 · 공공시설",
  "카페 · 상업 공간",
  "전시 · 행사장",
  "기타",
];
const OPINION_MAX_LEN = 500;
const MAX_RESPONSES = 500;

function json(data, init) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...(init && init.headers) },
  });
}

function sanitizeMulti(value, allowed) {
  if (!Array.isArray(value)) return [];
  const set = new Set();
  for (const v of value) {
    if (typeof v === "string" && allowed.includes(v)) set.add(v);
  }
  return [...set].slice(0, allowed.length);
}

function sanitizeRecord(body) {
  if (!body || typeof body !== "object") return null;

  const record = {};
  for (const k of SCORE_KEYS) {
    const v = body[k];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 5) return null;
    record[k] = v;
  }

  record.channel = sanitizeMulti(body.channel, CHANNEL_OPTIONS);
  record.use = sanitizeMulti(body.use, USE_OPTIONS);

  record.opinion =
    typeof body.opinion === "string" ? body.opinion.trim().slice(0, OPINION_MAX_LEN) : "";

  record.age = typeof body.age === "string" && AGE_OPTIONS.includes(body.age) ? body.age : "";
  record.place =
    typeof body.place === "string" && PLACE_OPTIONS.includes(body.place) ? body.place : "";

  record.at = new Date().toISOString();
  return record;
}

async function readAggregate(kv) {
  const raw = await kv.get("bench:aggregate");
  if (!raw) return { count: 0, sums: Object.fromEntries(SCORE_KEYS.map((k) => [k, 0])) };
  try {
    const parsed = JSON.parse(raw);
    return {
      count: typeof parsed.count === "number" ? parsed.count : 0,
      sums: Object.fromEntries(SCORE_KEYS.map((k) => [k, Number(parsed.sums && parsed.sums[k]) || 0])),
    };
  } catch {
    return { count: 0, sums: Object.fromEntries(SCORE_KEYS.map((k) => [k, 0])) };
  }
}

function toSummary(aggregate) {
  const { count, sums } = aggregate;
  const averages = Object.fromEntries(SCORE_KEYS.map((k) => [k, count ? sums[k] / count : 0]));
  return { count, averages };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.BENCH_KV) {
    return json({ error: "storage not configured" }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, { status: 400 });
  }

  const record = sanitizeRecord(body);
  if (!record) {
    return json({ error: "invalid payload" }, { status: 400 });
  }

  const kv = env.BENCH_KV;

  // NOTE: KV has no atomic increment, so concurrent submissions can race
  // on this read-modify-write and (rarely) drop a count. Acceptable for a
  // low-traffic survey; move to Durable Objects/D1 if exact counts matter.
  const aggregate = await readAggregate(kv);
  aggregate.count += 1;
  for (const k of SCORE_KEYS) aggregate.sums[k] += record[k];
  await kv.put("bench:aggregate", JSON.stringify(aggregate));

  const rawList = await kv.get("bench:responses");
  let list = [];
  try {
    list = rawList ? JSON.parse(rawList) : [];
  } catch {
    list = [];
  }
  list.push(record);
  if (list.length > MAX_RESPONSES) list = list.slice(-MAX_RESPONSES);
  await kv.put("bench:responses", JSON.stringify(list));

  return json(toSummary(aggregate));
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.BENCH_KV) {
    return json({ error: "storage not configured" }, { status: 500 });
  }

  const kv = env.BENCH_KV;
  const aggregate = await readAggregate(kv);

  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (env.ADMIN_KEY && key && key === env.ADMIN_KEY) {
    const rawList = await kv.get("bench:responses");
    let responses = [];
    try {
      responses = rawList ? JSON.parse(rawList) : [];
    } catch {
      responses = [];
    }
    return json({ ...toSummary(aggregate), responses });
  }

  return json(toSummary(aggregate));
}
