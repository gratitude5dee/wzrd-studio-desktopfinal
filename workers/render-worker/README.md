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

`APIFY_API_TOKEN` is additionally required when `media_ingest` jobs are claimed.
Non-Apify media hosts must be explicitly added to the comma-separated
`APIFY_MEDIA_HOST_ALLOWLIST`; redirects are revalidated and private network
addresses are rejected.

## Railway configuration

Create a Railway service from this directory, keep `railway.toml` as the service
configuration, and add secrets through Railway service variables rather than
committing them. Supported runtime variables are:

| Variable | Default | Purpose |
| --- | --- | --- |
| `WORKER_ID` | Generated from hostname and process ID | Stable worker identity used for lease fencing. |
| `MAX_CONCURRENT` | `2` (max `10`) | Maximum jobs processed concurrently. |
| `LEASE_SECONDS` | `120` | Claim lease duration. |
| `HEARTBEAT_INTERVAL_MS` | `15000` | Lease heartbeat interval; must be shorter than the lease. |
| `CLAIM_POLL_MS` | `2000` | Idle claim polling delay. |
| `RENDER_TIMEOUT_MS` | `2700000` (45 minutes) | Per-attempt render deadline; timeout failures are retryable. |
| `WORK_DIR` | `/tmp/wzrd-render-worker` | Attempt-specific temporary file root. |
| `MIN_FREE_DISK_BYTES` | `5368709120` (5 GiB) | Minimum free space required before the worker claims another job. |
| `PORT` | `3000` | HTTP health server port. |

Legacy aliases `APIFY_TOKEN`, `WORKER_CONCURRENCY`, `HEARTBEAT_MS`, and
`WORK_ROOT` remain supported, but the names above take precedence.

Retention runs hourly by default. Unreferenced attempt outputs use
`UNREFERENCED_ATTEMPT_RETENTION_HOURS` (default `24`), winning outputs referenced
by `web_render_jobs.output_storage_path` use `WINNING_OUTPUT_RETENTION_DAYS`
(default `14`), and terminal job rows use `JOB_RETENTION_DAYS` (default `30`).
Local attempt directories use `TEMP_RETENTION_HOURS` (default `24`).

Railway should use `railway.toml` and the included Dockerfile. The service health
endpoint is `GET /healthz` on `PORT`. Its JSON includes `diskFreeBytes` and
`minFreeDiskBytes`; it returns HTTP 503 with `status: "insufficient_disk"` when
free space is below the admission threshold.

## Validation

```sh
npm ci
npm test
npm run typecheck
npm run build
docker build -t wzrd-render-worker .
```
