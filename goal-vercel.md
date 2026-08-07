# WZRD.Studio — Web Migration Goal Spec: Browser-FFmpeg Rendering on Next.js + Vercel

> Sibling spec. The desktop/QCut-integration plan lives in `goal.md` and is unaffected by this document.

**Audience:** Codex (autonomous coding agent).
**Mission owner persona:** Senior principal architect / full-stack engineer.
**Scope:** Produce a Vercel-deployable web build of WZRD.Studio that performs **all media rendering in the browser** (no native/Electron FFmpeg), backed by Supabase + serverless functions for parity features. Target framework is **Next.js (App Router) on Bun**, deployed to **Vercel**.
**Status:** Authoritative plan. Execute phases in order. Each phase has acceptance criteria and must pass before the next begins. Do not skip the PROBE/VERIFY discipline in §11.

---

## 0. Decisions locked for this migration

These were decided by the product owner. Treat them as fixed inputs, not open questions.

1. **Framework target:** migrate the Vite + React 18 SPA to **Next.js (App Router) running on Bun**, optimized for Vercel. Electron is **dropped** as the deployment target (the desktop shell is not built or shipped from the web project).
2. **Render strategy:** **hybrid**. WebCodecs + `mediabunny` stays the primary full-timeline export path (hardware H.264 MP4). **`ffmpeg.wasm` is the universal fallback** and the engine for per-asset operations (probe, cut, transcode, audio extract, thumbnail, waveform) where it is strongest. Native CLI FFmpeg is removed from the web target.
3. **Feature posture:** **full web parity via serverless**. Desktop-only capabilities (YouTube ingest, agent/PTY sessions, heavy/long transcodes, file ops) are reimplemented as Vercel Route Handlers and/or Supabase Edge Functions rather than dropped.
4. **Backend:** Supabase stays the system of record (Postgres + Storage + Edge Functions). Local project-folder filesystem is replaced by **Supabase Storage + browser OPFS/IndexedDB**.
5. **Output filename:** this spec is `goal-vercel.md`. Do not overwrite `goal.md`.

---

## 1. Mission

Convert WZRD.Studio Desktop into a production web app that:

1. Boots as a Next.js App Router application on Vercel, package-managed and run with **Bun**.
2. Renders/export video entirely client-side via the **hybrid browser pipeline** (WebCodecs/mediabunny → `ffmpeg.wasm` fallback), with an **optional serverless render offload** for exports that exceed browser memory/time budgets.
3. Replaces every `window.wzrdDesktop.*` / `window.wzrdQcut.*` Electron IPC call with a **web platform adapter** that uses browser APIs and serverless endpoints.
4. Preserves the existing Supabase backend, auth model, and credits/billing flows, adapted from Electron deep-links to standard web redirects.
5. Ships fast: code-split, lazy-loaded FFmpeg core, cross-origin-isolated only where required, and tuned per the FFmpeg (§11) and Supabase/Postgres (§12) discipline appendices.

**Definition of success:** a Vercel production deployment where a user can sign in, open a project, edit a timeline, and export an MP4 — with no Electron, no native binaries, and no regression in the Supabase-backed feature set.

---

## 2. Ground truth — verified facts about this repo

Codex must treat the following as verified (confirmed by inspection on 2026-06-18). Do not re-derive or contradict without re-checking the file.

### 2.1 Build & runtime today
- Vite 5 + `@vitejs/plugin-react-swc`, TypeScript 5.5, **Bun** lockfile (`bun.lock`), Electron shell. `package.json` `"main": "electron/main.js"`; product is packaged as an unsigned macOS arm64 DMG via `electron-builder`.
- UI stack: React **19.2**, `react-router-dom` 6, Tailwind **3.4** + shadcn/radix, zustand 5, TanStack Query 5, framer-motion, Remotion **4.0.424 (pinned)**. FFmpeg deps already present: `@ffmpeg/core` ^0.12.10, `@ffmpeg/ffmpeg` ^0.12.15, `@ffmpeg/util` ^0.12.2, `mediabunny` ^1.46.0.
- Renderer entry: `index.html` → `src/main.tsx` → `src/App.tsx`. Routing via `react-router-dom` (`src/app/AuthenticatedRoutes.tsx`, route constants in `src/lib/routes.ts`).
- `vite.config.ts` defines aliases `@`, `@qcut-app`, `@qcut/editor-core`, `@qcut/platform-core`, `@qcut/platform-web`, `@qcut/platform-desktop`, `react-dnd`; uses `@editframe/vite-plugin`, `lovable-tagger`, and `vite-plugin-singlefile` (editframe mode only). It shims `process.env` to `{}` for the renderer.

### 2.2 The FFmpeg / native-media surface (what must be replaced)
- **Electron main-process FFmpeg** lives in `electron/`: `media-ffmpeg-runtime.js`, `media-ffmpeg-commands.js` (~54 KB filtergraph builder for the legacy WZRD editor), `clip-studio-ffmpeg.js`, `clip-studio-ffmpeg-runtime.js`, `clip-studio-youtube.js`, `qcut-bridge.js` (~43 KB). These shell out to native `ffmpeg`/`ffprobe`/`yt-dlp`.
- **Preload IPC bridge** `electron/preload.cjs` exposes two renderer globals:
  - `window.wzrdDesktop` — channels `wzrd:clip-studio:*` and `wzrd:media:*`: file pickers, `validate-ffmpeg`, `get-video-metadata`, `cut-clip`, `export-vertical-clip`, `generate-thumbnail`, `probe`, `cut`, `extract-thumbnail`, `extract-waveform-peaks`, `render-preview-proxy`, `render-timeline`, `run-studio-action`, `cache-remote`, YouTube validate/download, `extract-representative-frames`, plus `onFfmpegProgress`/`onMediaProgress`/`onYoutubeDownloadProgress` event subscriptions.
  - `window.wzrdQcut` — channels `wzrd:qcut:*`: `ffmpeg.{getPath,checkHealth,createExportSession,saveFrame,saveStickerForExport,exportVideoCLI,readOutputFile,cleanupExportSession,openFramesFolder,extractAudio}`, `files.getFileInfo`, `audio.saveTemp`, `video.{saveTemp,verifyFile}`, `pty.*`, `projectFolder.*`, `skills.*`, `mcp.*`.
- A full channel→replacement map is in **§7**.

### 2.3 The platform seam (this is why the migration is tractable)
- QCut code never calls Electron directly. All privileged operations route through a **`platform()` singleton** (`src/qcut/platform/core/provider.ts`) with capability flags and ~25 namespaced APIs.
- Adapters already exist: `src/qcut/platform/web/index.ts` (**"QCut Lite"** browser adapter — desktop-only namespaces throw `PlatformUnsupportedError`, web-capable gaps return graceful defaults) and `src/qcut/platform/wzrd/index.ts`.
- **Critical:** `createWzrdAdapter()` already calls `createWebAdapter()` and **returns the pure web adapter when `window.wzrdDesktop` is absent** (`isDesktopRenderer()` is false). So a browser deployment already lands on the web adapter — the seam is built for this migration. Our job is to make the web adapter *complete*, not to invent the seam.

### 2.4 Export engine reality (do not regress this)
- `src/qcut/app/lib/export/export-engine-factory.ts` selects the engine:
  - Electron → `CLI` (native FFmpeg). **Removed from web target.**
  - Browser + working WebCodecs → `MUXER` (mediabunny, hardware H.264 MP4). **Keep as primary.**
  - Browser w/ OffscreenCanvas+Workers → `OPTIMIZED` canvas engine. Browser fallback.
  - Else → `STANDARD` canvas engine (MediaRecorder/WebM).
  - The `FFMPEG` (wasm) engine is currently **disabled** (`isFFmpegAvailable()` always returns false; comment: "disabled due to timeout issues"). Re-enabling it as a **fallback** (not primary) is a Phase-3 task and must address the original timeout cause.
- `src/qcut/app/lib/ffmpeg/environment.ts` already checks `SharedArrayBuffer` + `Worker` and warns about missing COOP/COEP headers. FFmpeg deps already installed: `@ffmpeg/core` 0.12.10, `@ffmpeg/ffmpeg` 0.12.15, `@ffmpeg/util` 0.12.2.
- `mediabunny` is already a dependency and powers `export-engine-muxer.ts`.

### 2.5 Backend (stays, with adaptation)
- Supabase: **122 migrations** in `supabase/migrations/`, **~80+ Edge Functions** in `supabase/functions/` including `fal*`, `gemini-*`, `elevenlabs-*`, `billing-*` (Stripe), sharing/links, `create-project`, and — importantly for parity — `agent-session`, `agent-pty-token`, `agent-files`, `asset-upload`, `asset-processor`, `document-parse`, `download`.
- Client: `src/integrations/supabase/client`. Public env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_THIRDWEB_CLIENT_ID`.
- Auth: Thirdweb in-app wallet → Supabase session, today bridged through Electron deep-links `wzrd://auth/thirdweb`. On web this becomes a standard browser redirect/popup callback (Phase 6).

---

## 3. Target architecture (end state)

```
wzrd-web/ (Next.js App Router project, Bun)
  app/
    layout.tsx                      ← root layout; sets COOP/COEP only on isolated routes (see §4.3)
    (marketing)/…                   ← public pages
    (app)/                          ← authenticated app shell (replaces react-router AuthenticatedRoutes)
      projects/[projectId]/editor/  ← editor route → mounts QCut editor (one React tree)
      …studio, storyboard, postz, billing, ip-vault… (ported pages)
    api/                            ← Vercel Route Handlers (serverless parity, §8)
      youtube/route.ts              ← yt-dlp ingest (fluid compute, streamed progress)
      render/route.ts               ← optional heavy-export offload
      media/probe/route.ts          ← server ffprobe for large/edge cases
      agent/…                       ← PTY/agent session proxy → Supabase functions
  src/
    qcut/                           ← vendored editor (unchanged domain code)
      platform/
        core/                       ← unchanged
        web/                        ← COMPLETED browser adapter (was "Lite")
        vercel/                     ← NEW thin adapter: web adapter + serverless endpoints
    lib/ffmpeg-web/                 ← browser FFmpeg orchestration (core load, MT/ST selection)
  public/ffmpeg/                    ← self-hosted @ffmpeg/core(+core-mt) wasm assets (CORP-safe)
  next.config.ts                    ← headers(), webpack/turbopack wasm handling, transpile aliases
  vercel.json                       ← function runtimes/durations/regions (only where needed)
```

**Three planes:**
- **Browser plane** — editor UI + all default rendering (WebCodecs/mediabunny primary, `ffmpeg.wasm` fallback, Web Audio for waveforms, canvas for thumbnails). Cross-origin isolation enabled only on routes that need SharedArrayBuffer.
- **Serverless plane (Vercel)** — Route Handlers for YouTube ingest, optional heavy render, server-side probe, and agent/PTY proxying. Long jobs use Vercel Workflows or a queue, not a single long request (see §8.3).
- **Supabase plane** — Postgres (system of record), Storage (media + project assets, replacing local FS), existing Edge Functions (fal/gemini/elevenlabs/billing/agent).

---

## 4. Non-negotiable constraints

1. **No native binaries in the web target.** No `ffmpeg`/`ffprobe`/`yt-dlp` invoked from the renderer; none bundled into the Vercel build. `electron/` is not imported by any `app/**` or web `src/**` module.
2. **One React, one Remotion** in the bundle. No iframes, no module federation.
3. **Platform discipline preserved.** New web/serverless behavior is added to `platform/web` and `platform/vercel` only. Application/editor code keeps calling `platform()`; it must not branch on `window.wzrdDesktop`.
4. **No secrets in the client.** Provider keys (fal, gemini, elevenlabs, Stripe, thirdweb secret) stay server-side in Vercel/Supabase env. The browser sees only public `NEXT_PUBLIC_*` values and short-lived signed URLs/tokens.
5. **Supabase safety:** no RLS loosening, no edits to existing migrations, no hand-edits to generated `types.ts`. New persistence = additive migration only. Follow §12.
6. **Cross-origin isolation is scoped, not global.** COOP/COEP that enables SharedArrayBuffer breaks third-party embeds (thirdweb, fal CDN, Stripe, YouTube thumbnails) unless they are CORP/CORS-clean. Apply isolation only where the multithread FFmpeg core runs; everywhere else stays non-isolated. See §4.3.
7. **Graceful degradation:** if `crossOriginIsolated` is false, fall back to the single-thread FFmpeg core (`@ffmpeg/core`) automatically — never hard-crash the export.
8. **Bun stays** the package manager and runtime for local/dev and CI; Vercel build uses Bun.
9. **Backwards-compatible env:** during migration, read both `VITE_*` and `NEXT_PUBLIC_*` so the desktop/Vite build (still governed by `goal.md`) keeps working until cutover.

### 4.3 Cross-origin isolation policy (the central web-FFmpeg constraint)
- Multithread `ffmpeg.wasm` (`@ffmpeg/core-mt`, ~32 MB, ~2× faster) requires `SharedArrayBuffer`, which requires the document be **cross-origin isolated**: `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp` (or `credentialless`).
- `require-corp` blocks any cross-origin subresource lacking `Cross-Origin-Resource-Policy`/CORS. `credentialless` (Chromium) is more forgiving but is **not supported in Safari**; treat it as progressive enhancement.
- **Policy:** enable isolation **only** on the editor/export surface (e.g. a route segment or a dedicated worker origin). Self-host the FFmpeg core under `public/ffmpeg/` so it is same-origin (no CORP problems). Detect `window.crossOriginIsolated` at runtime: true → load `core-mt`; false → load single-thread `@ffmpeg/core`. Set headers via `next.config.ts` `headers()` (respected on Vercel automatically; no extra Vercel config needed for headers).

---

## 5. Migration strategy — exploit the platform seam

The leverage point is §2.3: the editor already routes everything through `platform()`, and the WZRD adapter already degrades to the web adapter in a browser. So the migration is **not** a rewrite of editor logic — it is:

1. **Complete the web adapter** (`platform/web`) so every namespace the editor uses has a real browser implementation or a deliberate, user-visible graceful fallback (no silent `Promise.resolve(null)` for capabilities we now support).
2. **Add a `platform/vercel` adapter** = web adapter + overrides that call serverless endpoints for parity features (YouTube, heavy render, agent/PTY, server probe). Select it at bootstrap when running on the web build.
3. **Re-home the shell** from Vite/react-router into Next.js App Router, keeping the editor as a single client-rendered React tree (`"use client"`), so no editor component needs to become a server component.
4. **Replace IPC call sites** only where they bypass `platform()` (the legacy `src/components/editor/**` WZRD editor and any direct `window.wzrdDesktop` usage). Route them through the adapter too.

Branching rule for Codex: prefer adding a capability to the adapter over editing 40 call sites. If you find code reading `window.wzrdDesktop`/`window.wzrdQcut` directly, refactor it to call `platform()`.

---

## 6. Phased execution plan

Each phase: **Goal → Work → Acceptance criteria (AC)**. Do not advance until ACs pass. Keep a running `docs/migration/PROGRESS.md`.

### Phase 0 — Baseline, inventory, guardrails
**Goal:** known-good starting point and automated boundaries.
**Work:**
- Snapshot current state; create branch `feat/web-vercel`.
- Generate an inventory: every `window.wzrdDesktop`/`window.wzrdQcut` reference, every `platform().<ns>` call, every `import` from `electron/`. Save to `docs/migration/inventory.md`.
- Add ESLint `no-restricted-imports` forbidding `electron` and `electron/**` from `app/**` and web `src/**`. Add a CI check that the web build contains no `node:`-only modules.
**AC:** inventory committed; lint rule fails on a deliberate `import "electron"` test; `bun run lint` green otherwise.

### Phase 1 — Next.js shell on Bun
**Goal:** the app loads on Next.js App Router with routing parity, no editor/FFmpeg work yet.
**Work:**
- Scaffold Next.js (App Router, TypeScript, Bun). Port Tailwind 3.4 config, shadcn setup, global CSS, fonts, and the `@/*` + `@qcut/*` path aliases into `tsconfig.json` + `next.config.ts` (`transpilePackages`/aliases as needed).
- Recreate the route tree from `src/lib/routes.ts` and `AuthenticatedRoutes.tsx` as App Router segments. The whole authenticated app may be a client shell initially (`"use client"`) to minimize churn; refactor to RSC opportunistically later.
- Port providers (TanStack Query, theme, Supabase client, Thirdweb provider) into `app/layout.tsx` / a client `Providers` component.
- Implement `next.config.ts` `headers()` for the isolation policy (§4.3) — isolated headers scoped to the editor segment only.
- Replace Vite-only shims: `process.env` define, `vite-env.d.ts`, `@editframe/vite-plugin`, `vite-plugin-singlefile`, `lovable-tagger`. Map Editframe to its non-Vite usage or gate it behind a dynamic import; if Editframe requires Vite, isolate it behind the adapter and feature-flag it off for web until addressed.
**AC:** `bun run dev` (next dev) serves every top-level route without runtime errors; auth-gated routes redirect correctly; no `electron` import resolves; Lighthouse loads the editor route shell.

### Phase 2 — Web platform adapter completion + `platform/vercel`
**Goal:** `platform()` is fully functional in the browser; no `PlatformUnsupportedError` for capabilities we commit to supporting.
**Work:**
- Implement, in `platform/web`, the namespaces the editor actually uses (per inventory): `files`, `storage` (upgrade from localStorage to IndexedDB/OPFS), `ffmpeg` (see Phase 3), `audio`/`video` temp (OPFS blobs), `screenshot`, `transcription`, `fal`, `project-json`, `project-folder` (virtual FS over Supabase Storage + OPFS — see Phase 5).
- Add `platform/vercel/index.ts`: spreads the web adapter, overrides `youtube`, heavy `ffmpeg.render`, `pty`/agent, and server `probe` with `fetch` calls to `app/api/*` (Phase 8). Wire bootstrap (`platform-init`) to select this adapter on the web build.
- Keep `createUnsupportedNamespace` only for genuinely unsupported things, and surface them as disabled UI, not thrown errors.
**AC:** unit tests in `platform/web/__tests__` extended and green; a smoke test exercises each capability flag; opening the editor on web throws zero `PlatformUnsupportedError` in the console.

### Phase 3 — Browser FFmpeg rendering (hybrid)
**Goal:** all rendering works in-browser; WebCodecs primary, `ffmpeg.wasm` fallback + per-asset ops.
**Work:**
- Build `src/lib/ffmpeg-web/`: core loader that picks `core-mt` vs `core` from `crossOriginIsolated`, lazy-loads on first use, caches the wasm blob in IndexedDB, shows fetch progress, and exposes a typed API (`probe`, `cut`, `transcode`, `extractAudio`, `thumbnail`, `concat`, `toMp4`). Wrap with the PROBE→DECIDE→EXECUTE→VERIFY discipline of §11.
- Re-enable the FFmpeg export engine **as a fallback only** in `export-engine-factory.ts`: keep MUXER (WebCodecs/mediabunny) primary; route to wasm when WebCodecs is unavailable/non-functional or muxer fails. Fix the original "timeout" root cause (likely missing COI/SAB + main-thread blocking) by running FFmpeg in a worker and chunking long timelines; add a hard time budget that escalates to the serverless render offload (Phase 8) instead of hanging.
- Replace `window.wzrdQcut.ffmpeg.*` export-session/frame APIs with an in-memory MEMFS/OPFS implementation inside the wasm orchestrator.
- Wire per-asset ops to the adapter: `extract-waveform-peaks` → Web Audio `decodeAudioData`; `generate-thumbnail`/`extract-thumbnail`/`extract-representative-frames` → `<video>`/`canvas` seek-and-grab (wasm fallback); `get-video-metadata`/`probe` → mediabunny/`<video>` metadata, wasm or server probe for awkward formats.
**AC:** export a 30 s multi-track timeline (video+audio+text+sticker) to MP4 in Chrome via MUXER; force WebCodecs off and re-export via wasm fallback; both outputs verified by re-probe (duration ±1 frame, has audio+video, plays in `<video>` and QuickTime). Waveforms, thumbnails, and metadata render without Electron.

### Phase 4 — Storage & project persistence on Supabase + OPFS
**Goal:** remove the local project-folder filesystem dependency.
**Work:**
- Implement `project-folder` and project-json namespaces over a **virtual FS**: source of truth in Supabase Storage (per-project bucket/prefix), with OPFS/IndexedDB as the local working cache; reads prefer cache then signed URL; writes go to OPFS immediately and sync to Storage.
- Media import: `<input type=file>` / drag-drop / File System Access API (where available) → OPFS → optional upload to Storage via existing `asset-upload`/`asset-processor` functions.
- `cache-remote-media` → `fetch` + Cache Storage/OPFS; respect CORP under isolation (proxy through `app/api` if a remote asset lacks CORS).
**AC:** create → edit → reload → reopen a project with media on a clean browser profile; assets persist via Storage; no `project-folder` IPC remains; quota-exceeded path shows a graceful message.

### Phase 5 — Auth & deep-link replacement
**Goal:** web-native auth; no `wzrd://` deep-links.
**Work:**
- Replace Electron deep-link auth bridge with a standard web callback route (`app/auth/callback`) for Thirdweb → Supabase session exchange. Postz OAuth `connected` callback becomes a normal redirect URL.
- Audit `src/lib/desktop.ts`/thirdweb wallet code; gate desktop-only branches behind the adapter.
**AC:** full sign-in/out on web; Postz channel connect returns to the app; session persists across reload; no `wzrd://` scheme referenced in the web build.

### Phase 6 — Serverless parity (Vercel functions + Supabase)
**Goal:** YouTube ingest, heavy render offload, server probe, agent/PTY available on web. (Detail in §8.)
**AC:** §8 ACs.

### Phase 7 — Optimization
**Goal:** fast, cheap, stable. (Detail in §9–§12.)
**AC:** §9 ACs.

### Phase 8 — Deploy to Vercel
**Goal:** reproducible preview + production deploys. (Detail in §10.)
**AC:** §10 ACs.

### Phase 9 — Verification & cutover
**Goal:** prove parity, then make web the default.
**Work:** run §13 verification matrix; fix regressions; document known web-vs-desktop differences in `docs/migration/PARITY.md`.
**AC:** verification matrix all-green on the latest production deploy.

---

## 7. IPC → web/serverless replacement map (authoritative)

Codex implements each row inside `platform/web` or `platform/vercel`. "Browser" = pure client; "Serverless" = `app/api/*` Route Handler (or existing Supabase function).

| Electron channel | Replacement | Plane |
|---|---|---|
| `wzrdDesktop.openExternal` | `window.open(url, "_blank", "noopener")` | Browser |
| `selectVideoFile` / `selectLogoFile` / `selectImageFiles` | `<input type=file>` (+ File System Access API where available) | Browser |
| `selectExportFolder` | `showDirectoryPicker()` or per-file download | Browser |
| `revealInFinder` | no-op on web (download instead) | Browser |
| `resolveMediaFileUrl` | OPFS blob URL or Supabase signed URL | Browser/Supabase |
| `cacheRemoteMedia` / `wzrd:media:cache-remote` | `fetch` → Cache Storage/OPFS; proxy via `api/media/proxy` if no CORS | Browser/Serverless |
| `validateFfmpegAvailable` / `validateMediaToolchain` / `qcut.ffmpeg.checkHealth` | `ffmpeg-web` capability probe (COI + core load) | Browser |
| `getVideoMetadata` / `wzrd:media:probe` | mediabunny / `<video>` metadata; wasm probe; `api/media/probe` for edge formats | Browser/Serverless |
| `cutClip` / `wzrd:media:cut` / `exportVerticalClip` | `ffmpeg.wasm` cut/crop/scale (9:16 etc.) | Browser |
| `generateThumbnail` / `extractThumbnail` / `extractRepresentativeFrames` | `<video>`+`canvas` seek-grab; wasm fallback | Browser |
| `extractWaveformPeaks` | Web Audio `decodeAudioData` → peaks | Browser |
| `renderPreviewProxy` | low-res WebCodecs/canvas proxy | Browser |
| `wzrd:media:render-timeline` / `qcut.ffmpeg.exportVideoCLI` | export engine: MUXER primary → wasm fallback → `api/render` offload | Browser/Serverless |
| `runStudioMediaAction` | dispatch per action to the rows above | Browser |
| `validateYoutubeDownloaderAvailable` / `downloadYoutubeVideo` | `api/youtube` (yt-dlp on fluid compute, streamed progress) | Serverless |
| `qcut.ffmpeg.{createExportSession,saveFrame,saveStickerForExport,readOutputFile,cleanupExportSession,openFramesFolder}` | in-memory MEMFS/OPFS in `ffmpeg-web` | Browser |
| `qcut.ffmpeg.extractAudio` | `ffmpeg.wasm` or Web Audio | Browser |
| `qcut.files.getFileInfo` / `audio.saveTemp` / `video.{saveTemp,verifyFile}` | File API + OPFS | Browser |
| `qcut.pty.*` | `api/agent/*` → existing `agent-session` / `agent-pty-token` / `agent-files` functions; xterm over WebSocket/SSE | Serverless/Supabase |
| `qcut.projectFolder.*` | virtual FS over Supabase Storage + OPFS (Phase 4) | Browser/Supabase |
| `qcut.skills.*` | skills in Supabase (Storage/DB) via `agent-files` + new additive table | Supabase |
| `qcut.mcp.*` | web MCP over HTTP/SSE | Serverless |
| `onFfmpegProgress` / `onMediaProgress` | `ffmpeg.wasm` `on("progress")` callbacks | Browser |
| `onYoutubeDownloadProgress` | SSE/stream from `api/youtube` | Serverless |

---

## 8. Serverless parity detail (Vercel Route Handlers + Supabase)

### 8.1 YouTube ingest — `app/api/youtube/route.ts`
- Runs `yt-dlp` server-side. yt-dlp needs a binary + sometimes ffmpeg for muxing; the Vercel Node runtime can run a bundled static `yt-dlp`/`ffmpeg` via `includeFiles`, **or** offload to a Supabase Edge Function / container if binary size or licensing is a problem. Decide by size budget; document the choice.
- Stream progress to the client via SSE/`ReadableStream`. Persist the result to Supabase Storage and return a signed URL — do not stream large media back through the function body.
- Enforce `maxDuration` (see §8.3), input validation, and an auth check (Supabase JWT). Never accept arbitrary shell input — pass URL as an argv array, not a shell string.

### 8.2 Heavy render offload — `app/api/render/route.ts`
- Triggered only when the browser export exceeds a memory/time budget or the user opts into "cloud render". Accepts the timeline JSON + asset references (Storage keys), renders with server ffmpeg, writes the MP4 to Storage, returns a signed URL. Reuse the existing CLI filtergraph logic from `electron/media-ffmpeg-commands.js` / `export-cli/**` as the server renderer's basis (it already encodes the same timeline model).
- Idempotent + resumable: key jobs by a content hash; store job status in Postgres.

### 8.3 Function limits & long jobs (verified June 2026)
- Vercel **fluid compute** is the default; default function `maxDuration` is **300 s**, up to **800 s** GA (Pro/Enterprise) and **1800 s** in beta with per-function config on supported runtimes.
- Renders/ingests that may exceed these must **not** be a single long HTTP request. Use **Vercel Workflows** (pause/resume/state) or a job queue + polling (`api/render/status`), with the function only kicking off and reporting. Long exports should prefer the browser or a dedicated container worker over a maxed-out function.
- Set `export const maxDuration` / `runtime` per route; pick a region near the Supabase project to cut egress latency.

### 8.4 Agent/PTY parity — `app/api/agent/*`
- The desktop PTY (node-pty) cannot run in the browser. Reuse the existing `agent-session`, `agent-pty-token`, `agent-files` Edge Functions: the web client opens a token-authed WebSocket/SSE to a session host; `xterm` renders client-side. If no remote PTY host exists yet, scope this to "view/stream only" and document the gap in `PARITY.md`.

**§8 AC:** YouTube URL ingests to Storage with live progress; an oversized export routes to `api/render` and returns a playable MP4; agent terminal connects and streams on web (or is explicitly documented as degraded); all `api/*` routes reject unauthenticated calls.

---

## 9. Optimization (Phase 7 detail)

Apply after parity is proven; measure before/after.

- **FFmpeg loading:** lazy-load core on first media op only; cache wasm in IndexedDB; show progress (mobile 4G ≈ 10–20 s for `core-mt` ~32 MB). Default to single-thread core off the editor route; upgrade to `core-mt` only where isolated.
- **Bundle:** route-level code splitting (App Router does this), dynamic-import heavy panels (Remotion, export engines, terminal, AI views). Keep the initial editor chunk lean; tree-shake lucide and radix. Target first-load JS for the editor route under a documented budget.
- **Rendering:** prefer WebCodecs (hardware) > wasm `core-mt` > wasm `core`. Run wasm in a Worker; never block the main thread. Chunk long timelines; stream frames rather than buffering all.
- **Caching/CDN:** immutable, hashed assets; long `Cache-Control` for `public/ffmpeg/*`; Vercel Edge cache for static. Signed-URL TTLs tuned so media caches but doesn't leak.
- **Supabase/Postgres:** apply §12 — index foreign keys and RLS predicate columns, avoid N+1 in project/asset loads, use connection pooling (Supavisor) for serverless, keep RLS policies `select`-wrapped and sargable.
- **Web Vitals:** measure LCP/INP/CLS on marketing + editor; fix the worst offender each pass.

**§9 AC:** editor route first-load JS within budget; FFmpeg not fetched until first media op; documented before/after on bundle size, export time, and Web Vitals; no main-thread long-tasks > 200 ms during export.

---

## 10. Deploy to Vercel (Phase 8 detail)

- **Project:** import the repo; framework preset Next.js; **Bun** install/build (`bun install`, `bun run build`); set the Bun version. Output is Next.js (not static export — Route Handlers are used).
- **Env:** define `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` (public) and server-only secrets (`SUPABASE_SERVICE_ROLE` if needed by functions, provider keys, Stripe) in Vercel envs, scoped per environment. Mirror to `.env.example`.
- **Headers:** isolation headers via `next.config.ts` `headers()` (§4.3), scoped to the editor segment; verify `crossOriginIsolated === true` only there.
- **Functions:** set `runtime`/`maxDuration`/`regions` for `api/youtube`, `api/render`, `api/agent/*`; bundle any required binaries with `includeFiles`/`outputFileTracingIncludes`.
- **Supabase:** point the deployment at the existing project; update Auth redirect URLs and OAuth callbacks to the Vercel domains (preview + prod). Do not run destructive migrations from CI.
- **Observability:** enable Vercel Analytics + Speed Insights; structured logs in Route Handlers; Sentry (or equivalent) for client + function errors.

**§10 AC:** a preview deploy builds with Bun and serves all routes; an export completes on the preview URL; functions respect their `maxDuration`; production deploy green; rollback path documented.

---

## 11. FFmpeg discipline appendix (browser context)

Adapted from broadcast-grade FFmpeg practice. Codex applies this to **every** `ffmpeg-web` operation and the server renderer.

**Always think PROBE → DECIDE → EXECUTE → VERIFY:**
1. **PROBE** — never assume a file's codec/sample-rate/pixfmt/duration/fps. In-browser, read metadata via mediabunny/`<video>` or a wasm `ffprobe`-equivalent before building a command. Wrong assumptions are the #1 source of wrong-aspect/wrong-sample-rate bugs.
2. **DECIDE** — prefer stream-copy (`-c copy`) when only cutting/concatenating compatible streams (faster, lossless). Re-encode only when filters/format demand it.
3. **EXECUTE** — build commands from verified parameters, not from memory. Keep filtergraph construction in one place; reuse the existing timeline→filter logic in `export-cli/**`.
4. **VERIFY** — re-probe every output: duration within ±1 frame, expected codec, audio present when expected, plays back. Treat silent truncation as a release blocker.

**Web delivery defaults:**
- **Max compatibility:** H.264 `libx264`-equivalent, **`yuv420p`**, `+faststart` (moov atom at front) so MP4s stream and play everywhere, including Safari/iOS. WebCodecs `avc1.42001f`/`avc1.42E01E` (baseline/main) for the MUXER path.
- **Audio:** AAC-LC, 48 kHz stereo for delivery; normalize to ~-14 LUFS for social platforms when the user asks for "loud enough for TikTok/Reels/YouTube".
- **Vertical/social:** 9:16 = scale+pad/crop to 1080×1920; document the crop vs pad choice in the export UI.
- **Browser realities:** `core-mt` ≈ 2× faster but needs SAB + isolation; single-thread core is the safe fallback. Run in a Worker; cap memory by chunking; escalate to `api/render` when a job would exceed the browser budget rather than freezing the tab.

---

## 12. Supabase / Postgres best-practices appendix

System-of-record stays Supabase; apply these (priority order) during Phases 4–7. Never loosen RLS for convenience.

- **Query performance (critical):** index columns used in joins, `WHERE`, and `ORDER BY` — especially every foreign key and every column referenced inside an RLS policy. Avoid `SELECT *` on wide rows; select only needed columns. Eliminate N+1 in project/asset hydration (batch with `in (...)` or a single join).
- **RLS (critical):** keep policies sargable — wrap `auth.uid()` so it's evaluated once (`(select auth.uid())`), index the predicate columns, and avoid per-row function calls. New tables ship with RLS enabled and explicit policies. Verify with `get_advisors` before relying on a new table.
- **Connection management (critical):** serverless Route Handlers must use the **pooled** connection (Supavisor / transaction mode) — not a direct long-lived connection per invocation. Reuse clients across warm invocations.
- **Schema (high):** additive migrations only; new persistence (jobs, skills, web project metadata) as new tables/columns with sensible defaults and FKs. Don't edit existing migrations or generated `types.ts`.
- **Concurrency:** key long jobs idempotently; use `insert … on conflict` for job/state upserts; avoid lock contention on hot rows.
- **Monitoring:** run `get_advisors` (security + performance) and `get_logs` after schema changes; add the recommended indexes before launch.

---

## 13. Verification matrix (Phase 9 gate)

Run on the latest **production** Vercel deploy. All must pass.

1. **Build:** `bun install && bun run build` clean; no `electron` in the web bundle; lint + typecheck green.
2. **Auth:** sign-in/out; session persists; Postz OAuth callback returns; unauthenticated `api/*` rejected.
3. **Editor:** open a project, multi-track edit (video/audio/text/sticker/transition), autosave + reload survives.
4. **Export — primary:** 30 s timeline → MP4 via MUXER (WebCodecs); re-probe verifies duration/codec/audio; plays in Chrome, Safari, QuickTime.
5. **Export — fallback:** force WebCodecs off → wasm fallback produces an equivalent valid MP4; single-thread core path works with isolation disabled.
6. **Export — offload:** oversized timeline routes to `api/render`, returns a playable MP4 from Storage.
7. **Ingest:** YouTube URL → Storage with live progress; bad URL handled gracefully.
8. **Media ops:** waveform, thumbnails, metadata, cut, 9:16 vertical — all in-browser, no Electron.
9. **Storage/persistence:** clean-profile create→edit→reload→reopen with media; quota-exceeded handled.
10. **Isolation:** `crossOriginIsolated` true only on the editor surface; thirdweb/Stripe/fal still load elsewhere.
11. **Perf:** editor first-load JS within budget; FFmpeg lazy-loaded; no >200 ms main-thread long-tasks during export.
12. **DB:** `get_advisors` shows no new critical security/perf findings; new tables have RLS + indexes.

---

## 14. Risk register

- **COEP breaks third parties.** `require-corp` can blank out thirdweb/Stripe/fal/YT thumbnails. → Scope isolation to the editor route; self-host the FFmpeg core; use `credentialless` where supported; proxy stubborn cross-origin assets through `api/media/proxy`.
- **wasm export timeouts (the original reason it was disabled).** → Worker + chunking + hard time budget + offload escalation; never run wasm export on the main thread; keep WebCodecs primary.
- **yt-dlp on Vercel (binary size, runtime, ToS/region).** → Bundle static binary via file tracing, or offload to a container/Edge Function; validate input; document legal posture.
- **Function duration ceilings.** → Use Workflows/queue + polling for long jobs; don't rely on a single 30-min request.
- **Bun on Vercel parity.** → Pin Bun version; if a dependency mis-builds under Bun on Vercel, fall back to Node install for that step and document it.
- **Next.js vs editor client-only assumptions.** → Keep the editor a client tree (`"use client"`); guard all `window`/`document`/`SharedArrayBuffer` access; dynamic-import browser-only modules with `ssr: false`.
- **Safari gaps.** → No `credentialless`, partial WebCodecs/OPFS. Detect and fall back; document Safari limitations in `PARITY.md`.
- **Secret leakage via `NEXT_PUBLIC_`.** → Only public values get that prefix; audit before deploy.

---

## 15. Definition of done

- Production Vercel deployment (Next.js + Bun) where sign-in → edit → **export MP4** works entirely in-browser, with WebCodecs primary and `ffmpeg.wasm` fallback, and an opt-in serverless render offload.
- Zero Electron/native-binary dependency in the web target; `platform()` fully satisfied by `platform/web` + `platform/vercel`.
- YouTube ingest, agent/PTY (or documented degraded mode), storage, and auth all function on web.
- Supabase backend intact; only additive migrations; `get_advisors` clean.
- §13 verification matrix all-green; `docs/migration/PROGRESS.md` and `PARITY.md` complete.

---

## Appendix A — Codex working agreement

- Work the phases in order; commit per phase with the AC results in the message.
- After any media/FFmpeg change, run the PROBE/VERIFY step (§11) and paste the re-probe output into the PR.
- Prefer extending the platform adapter over editing call sites; never reintroduce `window.wzrdDesktop` branching into editor code.
- Never edit `goal.md`, existing Supabase migrations, generated `types.ts`, or the `electron/` shell (it remains the desktop product governed by `goal.md`).
- When a decision is genuinely ambiguous, default to the lower-blast-radius option and record the assumption in `PROGRESS.md`.


