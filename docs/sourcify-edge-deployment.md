# Sourcify Edge Function deployment and verification

The `sourcify-apify` function keeps provider credentials server-side and must be deployed separately from the Vercel frontend. Do not put any value below in a `NEXT_PUBLIC_*`/`VITE_*` variable, source file, test fixture, shell transcript, or commit.

## Supabase Edge Function secrets

Set values through Supabase Secrets using values already supplied by the environment or your secret manager:

- `APIFY_API_TOKEN` — required for actor runs, dataset reads, and finalize provenance checks.
- `WZRD_AGENT_PROVIDER` — `codex` or `groq`; planning falls back deterministically when the configured provider is unavailable.
- `WZRD_AGENT_MODEL` — required when `WZRD_AGENT_PROVIDER=codex`.
- `WZRD_AGENT_FALLBACK_MODEL` — configured fallback model identifier.
- `OPENAI_API_KEY` — required for Codex planning.
- `GROQ_API_KEY` — required when the Groq provider/fallback is enabled.
- `SOURCIFY_TIKTOK_ACTOR_ID` — optional override; the existing TikTok actor default remains `GdWCkxBtKWOsKjdch`.
- `SOURCIFY_<ACTOR_KEY>_ACTOR_ID` — optional per-actor overrides supported by the existing registry.
- `SOURCIFY_MAX_MEDIA_BYTES` — optional decimal byte cap. Values are always capped at 2 GiB (`2147483648`) by the function.

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are supplied to deployed Edge Functions by Supabase and are not frontend secrets.

Example using pre-populated shell variables (values intentionally omitted):

```bash
supabase secrets set --project-ref ixkkrousepsiorwlaycp \
  APIFY_API_TOKEN="$APIFY_API_TOKEN" \
  WZRD_AGENT_PROVIDER="$WZRD_AGENT_PROVIDER" \
  WZRD_AGENT_MODEL="$WZRD_AGENT_MODEL" \
  WZRD_AGENT_FALLBACK_MODEL="$WZRD_AGENT_FALLBACK_MODEL" \
  OPENAI_API_KEY="$OPENAI_API_KEY" \
  GROQ_API_KEY="$GROQ_API_KEY"
```

Confirm every required shell variable is non-empty before running the command. Do not paste secret values into documentation or command history.

## Deploy

From the repository root, after tests pass and the target Supabase project is confirmed:

```bash
supabase functions deploy sourcify-apify --project-ref ixkkrousepsiorwlaycp
```

Task 6 implementation does not run this deployment automatically.

## Verification

1. Confirm the shared CORS helper handles preflight:

   ```bash
   curl -i -X OPTIONS \
     'https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/sourcify-apify' \
     -H 'Origin: https://your-preview-origin.example' \
     -H 'Access-Control-Request-Method: POST' \
     -H 'Access-Control-Request-Headers: authorization, content-type'
   ```

   Expect `Access-Control-Allow-Origin: *`, the shared allowed headers, and `POST` in `Access-Control-Allow-Methods`.

2. From an authenticated preview session, verify `plan`, then `run`, then `results` with both `runId` and `datasetId`. Result rows should retain `runId`, `datasetId`, and `actorId`.
3. Finalize a fresh YouTube/TikTok result. The client sends only item/run/dataset references; the Edge Function re-fetches the run and dataset and uses the trusted dataset URL.
4. Verify a mismatched item ID or dataset ID returns HTTP 400 with a rerun prompt and performs no outbound media download.
5. Verify valid media saves successfully and that unsupported content types, missing/oversized `Content-Length`, redirects to private IPs, and over-limit streams are skipped with safe user-facing reasons.
6. Verify an expired Google Video `videoplayback` URL prompts the user to rerun the downloader.

Focused local checks:

```bash
bunx vitest run \
  src/features/sourcify/sourcify-client.test.ts \
  src/features/sourcify/sourcify-model.test.ts \
  src/legacy-pages/Sourcify.test.tsx \
  supabase/functions/sourcify-apify/finalize-media.spec.ts

bunx eslint \
  src/features/sourcify/sourcify-client.ts \
  src/features/sourcify/sourcify-client.test.ts \
  src/legacy-pages/Sourcify.tsx \
  supabase/functions/sourcify-apify/index.ts \
  supabase/functions/sourcify-apify/finalize-media.ts \
  supabase/functions/sourcify-apify/finalize-media.spec.ts

node scripts/check-web-boundaries.mjs
```
