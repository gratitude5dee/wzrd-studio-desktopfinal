---
name: testing-wzrd-ui
description: How to run and browser-test the WZRD Studio Vite/React app and the Next.js web app locally — dev server flags, bypassing auth to reach protected dashboard/studio/observability/billing/QCut-editor routes, route map, known pre-existing console errors, the QCut web diagnostics globals, and how to exercise data-gated charts.
---

# Browser-testing WZRD Studio locally

## Start the dev server

```bash
bun install                       # covered by the repo blueprint's maintenance step
VITE_BYPASS_AUTH_FOR_TESTS=true VITE_USE_MOCK_ASSETS=true bun run dev
# serves on http://localhost:8080 (NOT 5173)
```

## The Next.js web app (QCut editor browser path)

There is a second app surface served by Next.js (`bun run web:dev`), used for the browser
render/export path of the QCut editor. It uses `NEXT_PUBLIC_*` flags, not `VITE_*`:

```bash
NEXT_PUBLIC_BYPASS_AUTH_FOR_TESTS=true NEXT_PUBLIC_USE_MOCK_ASSETS=true \
  bun run web:dev --port 3400 --hostname 127.0.0.1
# then http://127.0.0.1:3400/projects/diagnostic-project/editor
```

Gotchas:

* The auth/local-project bypass on the Next path needs a **dev build AND a NON-UUID project id**
  (e.g. `diagnostic-project`). With a UUID the editor queries Supabase, gets `PGRST116`, and no
  project ever activates — the editor mounts but every agent command is rejected. (The Vite path is
  the opposite: `ProjectAccessGate` wants a UUID-shaped id.)
* The editor first paints a "Preparing studio" skeleton; the webpack dev build can take 30–60s to
  compile the editor chunk on a cold start. Wait and re-view before concluding it is broken.
* Drive the editor from the console via the agent API instead of fighting canvas selectors:
  `window.wzrd.editor.commands.execute("addText", {content:"hi", startTime:0, duration:3})`
  (also `importMediaByUrl`, `addClip`, `export`, `getExportStatus`, `undo`, `redo`, `seek`).
  Wrap in an IIFE — a bare `const x = ...` statement evaluates to `undefined`.
* Undo/redo work with `Ctrl+Z` / `Ctrl+Shift+Z` after clicking into the timeline area; clicking the
  timeline ruler seeks the playhead.

### QCut web diagnostics globals

In dev builds (or with `?wzrdBaseline=1`) the editor collects a runtime baseline:

* `window.__wzrdQcutWebBaseline` — `{platform, isElectron, crossOriginIsolated, capabilities,
  browserCapabilities, webCodecsProbe, ffmpegWasmFallback, gracefulStubCalls}`.
* `window.__wzrdQcutGracefulStubCalls` — namespaced list of platform calls that silently resolved
  to `null` (e.g. `screenRecording.getStatus`, `projectJson.write`), also `console.warn`ed as
  `[QCut/web] platform.<ns>.<method> resolved to a graceful null stub`.

### Per-browser baseline harness

```bash
mkdir -p public/diagnostics && ffmpeg -y -f lavfi -i testsrc=size=640x360:rate=30:duration=3 \
  -f lavfi -i "sine=frequency=440:duration=3" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
  public/diagnostics/sample.mp4
node scripts/diagnostics/qcut-web-baseline.mjs --base-url http://127.0.0.1:3400 \
  --project-id diagnostic-project --media-url http://127.0.0.1:3400/diagnostics/sample.mp4 \
  --browsers chromium --out /tmp/qcut-baseline
rm -rf public/diagnostics    # sample media is intentionally not committed
```

* **Do not run `--browsers webkit`** on Linux VMs — the WebKit content process crashes with a
  GStreamer host-library error. Chromium (and usually Firefox) are the usable targets.
* Chromium currently *fails* export with
  `This specific encoder configuration (mp4a.40.2, 128000 bps, 2 channels, 48000 Hz) is not
  supported by this browser` and `exportBytes: 0`. As of the Phase-1 diagnostics work this is the
  **documented baseline**, not a regression — a future phase may change the audio codec, so
  re-check `docs/qcut-editor-web.md` before treating it either way.
* Expected non-fatal noise in the harness JSON: aborted `/ffmpeg/ffmpeg-core.{js,wasm}` requests
  and `ERR_REQUEST_RANGE_NOT_SATISFIABLE` on blob URLs.

Dark theme is the app default, so no theme toggling is needed for dark-mode checks. The theme
toggle button lives in the dashboard header (`aria-label="Toggle theme"`).

## Reaching protected routes without credentials

Everything except `/` and `/login` is behind `AuthenticatedRoutes`. Instead of hunting for real
Supabase credentials, use the repo's own dev-only bypass:

* `src/providers/AuthProvider.tsx` and `src/components/ProjectAccessGate.tsx` both check
  `import.meta.env.DEV && import.meta.env.VITE_BYPASS_AUTH_FOR_TESTS === 'true'`.
* With the flag on, `ProjectAccessGate` accepts **any** UUID-shaped project id and registers it as
  "Test Project", so per-project routes render immediately.
* A convenient synthetic id: `00000000-0000-4000-8000-000000000abc`.

Note that with the bypass enabled, `/login?mode=signup` redirects straight to `/home`. That still
proves a landing CTA is clickable (URL leaves `/`), but you cannot test the real signup form this
way — disable the flag if the login UI itself is under test.

## Route map (`src/lib/routes.ts`)

| Page | Path |
|---|---|
| Landing | `/` |
| Login | `/login` (`?mode=signup`) |
| Dashboard / Home | `/home` |
| Billing | `/settings/billing` |
| Studio (ReactFlow canvas) | `/projects/:projectId/studio` |
| Timeline | `/projects/:projectId/timeline` |
| Observability | `/projects/:projectId/observability` |

Protected pages first paint a "Preparing studio" skeleton while the lazy bundle loads — wait and
re-view before concluding a page is broken.

## Known pre-existing console noise (do NOT report as new regressions)

Verify against the base branch before blaming a PR; these all reproduce on a synthetic/anon project:

* Landing: framer-motion warning *"Please ensure that the container has a non-static position…"*.
* Studio: `Error initializing project`, `Error loading graph` / `Error saving graph`
  (`FunctionsHttpError: Edge Function returned a non-2xx status code`).
* Billing: toast "Edge Function returned a non-2xx status code" (Stripe catalog not configured).
* `/projects/:id/timeline`: "Error Loading Project" + "Failed to load storyboard: Cannot coerce the
  result to a single JSON object". The timeline route requires a **real** project with storyboard
  rows, so timeline behaviour is effectively untestable with a synthetic id — say so explicitly
  rather than implying it passed. If a cheap mock is acceptable, add a temporary `?mockStoryboard=1`
  URL-flag branch in `StoryboardPage.tsx`'s `fetchData` (synthetic project + scenes) and in
  `supabaseService.ts` `shots.listByScene` (fake shots) — this renders full scene rows and shot
  cards; revert both files after. Expect `Error updating shot` console errors whenever anything
  autosaves on mock data — not a regression.
* Timeline mock: `Failed to load scene objects` / `Failed to load enabled state` also fire on load.

## Data-gated UI (charts, lists)

Several panels only render when backend data exists, e.g. the Observability **Runs** tab chart is
guarded by `timelineItems.length > 0` in `src/pages/ProjectObservabilityPage.tsx` and otherwise
shows "No runs yet." The anon Supabase project has no rows.

Workaround that keeps the code under test untouched: add a *temporary* URL-flag mock in the service
layer (e.g. `src/services/observabilityService.ts`, returning rows only when
`?mockRuns=1` is present), exercise the UI, then `git checkout --` the file and confirm
`git status --porcelain` is clean. Always disclose in the report that such a panel was verified
against seeded data, not real data.

## Interaction tips

* ReactFlow pan: a synthetic click is not enough — use a real held drag
  (`xdotool mousedown 1` → `mousemove` → screenshot **while still held** → `mouseup`) so the
  screenshot proves the viewport translated. This is the assertion that catches an overlay stealing
  pointer events.
* Studio nodes: the "Start WZRD example" preset on the empty-canvas state seeds a graph quickly
  (toast "WZRD example inserted"); then click a node to check the selection outline.
* Canvas-rendered visuals (dither washes, dither charts/avatars) do not appear in the DOM text, so
  assert on screenshots — and crop/zoom with PIL to make the pattern legible. Saved browser
  screenshots are 1600px wide while browser coordinates are 1024px wide: scale crop boxes by
  `img.width / 1024`.
* dnd-kit shot reorder (timeline): drag listeners are on the small handle at the shot card's
  top-left (`.cursor-grab`, appears on hover). Do a real held xdotool drag over the handle;
  verify activation via `onDragStart`/`onDragEnd` (temporarily instrument `DndContext` in
  `ShotsRow.tsx` with console.log, then revert). The sortable transform lands on the
  `[data-voice-shot-id]` motion.div, not `[data-shot-id]`. Activation can be flaky on the first
  attempts; retry after the instrumented HMR reload.
* `react-resizable-panels` is v4: numeric `defaultSize`/`minSize`/`maxSize` are PIXELS; use
  strings like `"20%"` for percentages. If a resizable sidebar looks like a ~30px sliver, this
  is likely the cause — measure panel widths via `getBoundingClientRect` and report it.
* Landing anchor nav links (Features/Pricing/Testimonials) do not always scroll; scroll manually or
  press `End` then scroll up to reach lower sections such as the testimonials grid.

## QCut browser export testing (Next `web:dev` surface)

* Editor route: `http://127.0.0.1:3400/projects/diagnostic-project/editor` (NON-UUID project id, dev
  build only). Cold start shows a "Preparing studio" skeleton for ~25s before the shell mounts.
* Import media through the hidden `<input type="file" aria-label="Upload media files">` in the media
  panel (`select_file` on it works even though it is `class="hidden"`). Real bytes are provable in
  the UI: the media card renders a decoded JPEG thumbnail plus a duration badge (`0:04`). A
  0-byte placeholder cannot produce either, and the console would log
  "importing a placeholder with no bytes".
* Add to timeline: hover the media card → a `+` button appears (it also selects the card and shows
  an "Add to Timeline" bulk-action bar).
* Export panel cards: File Name (click the card to reveal `input[placeholder="Enter filename"]`;
  set it with the native value setter + `input` event so React picks it up), Quality
  (1920×1080 / 1280×720 / 854×480), Export Engine, Format (WebM / MP4).
* **Several very different engines; always state which one produced an artifact.** The Export
  dialog's "Export Engine" card offers `Standard` (MediaRecorder), `FFmpeg WASM`, and — in any
  browser exposing `VideoEncoder`/`VideoFrame` — `WebCodecs (H.264) (recommended)` (internal value
  `muxer`, mediabunny), which is the default selection in browsers. Electron defaults to `cli`; a
  browser without WebCodecs falls back to `standard` and the option is hidden. Behaviour observed
  on Chromium/Linux:
  - Standard/MediaRecorder: real-time capture → duration equals wall-clock render time
    (e.g. ~102s for a 4s timeline) and no audio stream, even with "Include audio in export" on.
    Slow: budget ~1.2 fps, so cap Quality at 854×480 when regression-testing it.
  - Muxer/WebCodecs: correct timeline duration and keeps audio.
* **Container/audio negotiation.** The muxer only accepts a container that can carry *all* required
  tracks (`{mp4: [aac], webm: [opus, vorbis]}`). Chromium/Linux has no AAC encoder, so a timeline
  *with audio* falls back to **WebM/Opus even when Format=MP4 is requested**, and the saved file is
  renamed to `.webm` from the blob MIME type. A no-audio timeline stays MP4/H.264. Probe the actual
  encoder support from the page console before asserting:
  ```js
  window.__probe = null;
  (async () => { const c = async (cfg, k) => (await (k==="audio"?AudioEncoder:VideoEncoder).isConfigSupported(cfg)).supported;
    window.__probe = { aac: await c({codec:"mp4a.40.2",sampleRate:48000,numberOfChannels:2,bitrate:128000},"audio"),
      opus: await c({codec:"opus",sampleRate:48000,numberOfChannels:2,bitrate:128000},"audio"),
      h264: await c({codec:"avc1.42001f",width:854,height:480}), vp9: await c({codec:"vp09.00.10.08",width:854,height:480}) }; })();
  ```
  (read `window.__probe` in a *second* console call — the first returns before the promise settles).
* **The agent API hardcodes `engineType: "auto"`** (`export-dialog.tsx` `__exportActions.export`), so
  `window.wzrd.editor.commands.execute("export", …)` and the Playwright harness go through factory
  auto-selection and do **not** exercise the dialog's engine picker. Anything about the picker or
  its default must be tested by clicking the real UI.
* Forcing a WebM fallback without touching source: in the page console override
  `MediaRecorder.isTypeSupported` to return false for `/mp4|quicktime/i` (Standard engine), or for
  the muxer engine set `localStorage.qcut_force_webcodecs_off = "true"` + the same MIME stub +
  404 the `/ffmpeg/ffmpeg-core.*` fetches. Rejecting only H.264 in
  `VideoEncoder.isConfigSupported` is NOT enough — mediabunny then muxes VP8 into an MP4
  container. Also note the engine factory probes `avc1.42001f` at 854×480: rejecting that too
  sends the run to the FFmpeg WASM fallback and yields 0 bytes.
* Verify downloads with `ffprobe -v error -show_entries format=format_name,duration,size
  -show_entries stream=index,codec_type,codec_name,width,height,sample_rate,channels -of json <f>`.
  Browser-tool downloads land in `/tmp/chisel_browser_downloads/`.
* Firefox (Playwright build present) mounts fine and project activation returns a real project, but
  the harness/agent-API auto path there has been seen to pick the FFmpeg WASM fallback
  (`crossOriginIsolated` is false, no SharedArrayBuffer) and fail with
  `Cannot find module 'blob:…'` → `exportBytes: 0`. That is the auto path, not the UI muxer path; to
  test Firefox's real export you have to drive the Firefox UI and pick the engine. WebKit still
  crashes (GStreamer) — skip.
* `crossOriginIsolated` has been observed both `true` and `false` on the same dev server across
  runs; if FFmpeg WASM fallback is being chosen unexpectedly, check it.
* Requires system `ffmpeg`/`ffprobe` to generate and validate test media.

## QCut browser export testing (Next `web:dev` surface)

* Editor route: `http://127.0.0.1:3400/projects/diagnostic-project/editor` (NON-UUID project id, dev
  build only). Cold start shows a "Preparing studio" skeleton for ~25s before the shell mounts.
* Import media through the hidden `<input type="file" aria-label="Upload media files">` in the media
  panel (`select_file` on it works even though it is `class="hidden"`). Real bytes are provable in
  the UI: the media card renders a decoded JPEG thumbnail plus a duration badge (`0:04`). A
  0-byte placeholder cannot produce either, and the console would log
  "importing a placeholder with no bytes".
* Add to timeline: hover the media card → a `+` button appears (it also selects the card and shows
  an "Add to Timeline" bulk-action bar).
* Export panel cards: File Name (click the card to reveal `input[placeholder="Enter filename"]`;
  set it with the native value setter + `input` event so React picks it up), Quality
  (1920×1080 / 1280×720 / 854×480), Export Engine, Format (WebM / MP4).
* **Two very different engines.** The Export dialog's "Export Engine" card only offers
  `Standard` (MediaRecorder) and `FFmpeg WASM`; the WebCodecs/mediabunny muxer engine is NOT
  selectable there but IS what the agent API path (`window.wzrd.editor.commands.execute("export", …)`)
  picks. Consequences observed on Chromium/Linux:
  - Standard/MediaRecorder: real-time capture → duration equals wall-clock render time
    (e.g. 102s for a 4s timeline) and no audio stream, even with "Include audio in export" on.
  - Muxer: correct duration, keeps audio (MP4 with h264 + **Opus**, since Chromium/Linux has no
    AAC encoder).
  Always state which engine produced an artifact; test both.
* Forcing a WebM fallback without touching source: in the page console override
  `MediaRecorder.isTypeSupported` to return false for `/mp4|quicktime/i` (Standard engine), or for
  the muxer engine set `localStorage.qcut_force_webcodecs_off = "true"` + the same MIME stub +
  404 the `/ffmpeg/ffmpeg-core.*` fetches. Rejecting only H.264 in
  `VideoEncoder.isConfigSupported` is NOT enough — mediabunny then muxes VP8 into an MP4
  container. Also note the engine factory probes `avc1.42001f` at 854×480: rejecting that too
  sends the run to the FFmpeg WASM fallback and yields 0 bytes.
* Verify downloads with `ffprobe -v error -show_entries format=format_name,duration,size
  -show_entries stream=index,codec_type,codec_name,width,height,sample_rate,channels -of json <f>`.
  Browser-tool downloads land in `/tmp/chisel_browser_downloads/`.
* Firefox (Playwright build present) works on this surface: project activation returns a real
  project and export yields MP4 h264+Opus. WebKit still crashes (GStreamer) — skip.
* Requires system `ffmpeg`/`ffprobe` to generate and validate test media.

## QCut editor (`/projects/:projectId/editor`)

* Under `VITE_BYPASS_AUTH_FOR_TESTS`, use a **non-UUID** project id for the editor route (e.g.
  `/projects/diagnostic-project/editor`) — UUID-shaped ids result in "No active project" in the
  editor even though other project routes accept them.
* The lazy editor bundle takes ~25 s to load; wait and re-view before concluding it's broken.
* The media panel's context menu offers "Add as Overlay" but no plain "add to a specific track";
  drag-to-a-new-track is unreliable via automation, so use the overlay path when a second layer is
  enough and disclose the caveat.
* Clicking the main timeline ruler while a Properties panel is open can deselect the clip and close
  the panel — re-select the clip before asserting on panel contents.

## Devin Secrets Needed

None — the `VITE_BYPASS_AUTH_FOR_TESTS` dev flag removes the need for login credentials. Real
Supabase/Stripe keys would only be needed to exercise backend-dependent flows (timeline storyboard,
Stripe checkout, real observability runs).
