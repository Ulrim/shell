# shell

"자원순환 쉼표 벤치" landing page with an embedded satisfaction survey
(`index.html`). Survey responses are collected server-side so the
"cumulative average" shown after submitting reflects every visitor, not
just the current browser.

## How it works

- `index.html` — static page. On submit it `POST`s the answers to
  `/api/responses` and renders the returned running average.
- `functions/api/responses.js` — a Cloudflare Pages Function.
  - `POST /api/responses` validates the payload, updates a running
    `{count, sums}` aggregate in KV, appends the raw record (capped at the
    last 500) for the site owner to review, and returns
    `{count, averages}`.
  - `GET /api/responses` returns the same `{count, averages}` summary.
    Add `?key=<ADMIN_KEY>` (see below) to also get the raw response list,
    including free-text opinions — this is intentionally not public.

## Deploying (Cloudflare Pages)

1. Create a KV namespace: `npx wrangler kv namespace create BENCH_KV`.
2. In the Cloudflare dashboard, create a Pages project from this repo
   (build output directory: `/`, no build command needed).
3. Under Pages project → Settings → Functions → KV namespace bindings, add
   a binding named `BENCH_KV` pointing at the namespace from step 1.
4. (Optional) Add an environment variable `ADMIN_KEY` (Settings →
   Environment variables) with a secret value of your choice, to enable
   the admin-only raw-response export at `/api/responses?key=<ADMIN_KEY>`.
5. Deploy. Cloudflare Pages auto-detects the `functions/` directory.

## Local development

```
npm install
npm run dev   # wrangler pages dev . --kv BENCH_KV
```

`wrangler pages dev` provides an in-memory KV store automatically, no
namespace id required for local testing.

## Known limitations

- KV has no atomic increment, so the read-modify-write in
  `onRequestPost` can (rarely) drop a count under concurrent submissions.
  Fine for a low-traffic survey; move to Durable Objects or D1 if exact
  counts become important.
- The raw response list is capped at the last 500 entries.
