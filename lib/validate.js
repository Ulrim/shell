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

  return record;
}

module.exports = { SCORE_KEYS, sanitizeRecord };
