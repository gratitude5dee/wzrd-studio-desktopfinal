# WZRD render worker

Production Node 22 worker for the asynchronous `web_render_jobs` contract in
`20260714213000_web_render_jobs_leasing.sql`. The worker is intentionally
self-contained and must be deployed as its own Railway service with this
directory configured as the service root.

## Runtime guarantees

- Claims only through `claim_web_render_jobs`; that RPC also sweeps abandoned
  exhausted/cancelled leases.
- Fences heartbeats and every terminal write by worker ID, attempt, and
  generation. A missing/timed-out heartbeat immediately sends `SIGKILL` to a
  running FFmpeg process.
- Revalidates the strict v1 manifest and owner-scoped storage objects after
  claim. Client URLs, commands, paths, filter graphs, and FFmpeg arguments are
  never executed.
- Uses native `spawn(command, argv, { shell: false })` for FFmpeg/FFprobe.
- Writes immutable attempt outputs to
  `render-outputs/<user>/<project>/<hash>/attempts/<attempt>-<generation>.mp4`.
- Streams downloads/uploads through bounded temporary files, probes and hashes
  completed MP4s, removes each attempt directory, and periodically sweeps old
  temp/output objects.
- Supports validated QCut video/audio/image/sticker/text/caption tracks, word
  cuts, transforms, fades, crossfade allowlists, vertical Clipper renders, and
  server-only Apify media ingestion.

## Required environment

| Variable | Purpose |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL; no public URL fallback is used. |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role used for claim RPCs and private storage. |

`APIFY_TOKEN` is additionally required when `media_ingest` jobs are claimed.
Non-Apify media hosts must be explicitly added to the comma-separated
`APIFY_MEDIA_HOST_ALLOWLIST`; redirects are revalidated and private network
addresses are rejected.

Useful tuning variables include `WORKER_CONCURRENCY` (default `2`, max `10`),
`LEASE_SECONDS` (`60`), `HEARTBEAT_MS` (`15000`), `CLAIM_POLL_MS` (`2000`),
`OUTPUT_RETENTION_HOURS` (`168`), and `TEMP_RETENTION_HOURS` (`24`).

Railway should use `railway.toml` and the included Dockerfile. The service health
endpoint is `GET /healthz` on `PORT` (default `3000`).

## Validation

```sh
npm ci
npm test
npm run typecheck
npm run build
docker build -t wzrd-render-worker .
```
