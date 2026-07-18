# shell

"자원순환 쉼표 벤치" landing page with an embedded satisfaction survey
(`index.html`). Survey responses are collected server-side so the
"cumulative average" shown after submitting reflects every visitor, not
just the current browser.

## How it works

- `index.html` — static page. On submit it `POST`s the answers to
  `/api/responses` and renders the returned running average.
- `api/responses.js` — a Vercel serverless function backed by Redis
  (`@upstash/redis`, via `lib/redis.js`).
  - `POST /api/responses` validates the payload, atomically increments a
    `count`/per-question-sum hash (`HINCRBY`, so concurrent submissions
    can't drop a count), appends the raw record to a capped list (last
    500) for the site owner to review, and returns `{count, averages}`.
  - `GET /api/responses` returns the same `{count, averages}` summary.
    Add `?key=<ADMIN_KEY>` (see below) to also get the raw response list,
    including free-text opinions — this is intentionally not public.
- `lib/validate.js` — shared input validation/sanitization (score range,
  allow-listed multi-choice values, opinion length cap).

## Deploying (Vercel)

1. Import this repo as a Vercel project (framework preset: "Other", no
   build command needed — `index.html` is served as-is and `api/` is
   auto-detected as serverless functions).
2. Add a Redis store: Project → Storage → Marketplace Database Providers
   → a Redis provider (e.g. Upstash) → connect it to the project. This
   injects `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or the
   legacy `KV_REST_API_URL` / `KV_REST_API_TOKEN` names — `lib/redis.js`
   reads either) as environment variables automatically.
3. (Optional) Add an environment variable `ADMIN_KEY` (Project →
   Settings → Environment Variables) with a secret value of your choice,
   to enable the admin-only raw-response export at
   `/api/responses?key=<ADMIN_KEY>`.
4. Deploy.

## Local development

```
npm install
vercel link          # first time only, links this dir to a Vercel project
vercel env pull       # pulls the Redis env vars from step 2 above into .env.local
npm run dev           # vercel dev
```

## Known limitations

- The raw response list is capped at the last 500 entries.
