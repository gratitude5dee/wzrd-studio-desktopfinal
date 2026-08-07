# WZRD Image Editor mini-app

A public, zero-auth image surface served from the same Vite SPA as the desktop
studio. Phase 1 ships the spine: import a photo, reframe it locally, and share
it as a permalink. No models, no sign-in, no wallet.

Spec: [`docs/goals/goal-image.md`](./goals/goal-image.md). Section numbers below
refer to it. It inherits a parent `goal.md` that is not in this repo, so the
palette and motion values in `src/styles/wzrd-tokens.css` remain provisional.

This is *not* the video mini-app. The only thing shared with QCut is the pure
history stack.

## Routes

| Route | Component | Notes |
| --- | --- | --- |
| `/image` | `src/mini/image/ImageEditorPage.tsx` | Editor |
| `/a/:id` | `src/mini/artifact/ArtifactPage.tsx` | Artifact permalink |

Both are matched in `src/App.tsx` **before** the `*` route that mounts
`AuthenticatedRoutes`, so they never enter the desktop provider stack
(`VoiceAgentProvider`, `SidebarProvider`, auth gates). `MiniShell` is the whole
shell: a dark-locked flex column, nothing else.

An ESLint boundary in `eslint.config.js` forbids `src/mini/**` from importing
QCut app/platform internals; the one shared module is the pure history stack at
`src/qcut/editor-core/commands/history.ts`.

The mini-app also does not import `@supabase/supabase-js`. Everything it needs
is a public edge function, reached with `fetch` from `src/mini/lib/mini-api.ts`.

## Reframe

`src/mini/image/lib/canvas-ops.ts` — crop, rotate, flip and straighten, all
Canvas 2D, all local. Imports are downscaled to a 4096px long edge on the way
in, which is also the ceiling for every subsequent snapshot.

Straighten rotates and then zooms by the ratio between the source and the
largest same-aspect rectangle that still fits inside the rotated frame, so no
empty corners are ever revealed.

## Controls

`src/mini/image/app-schema.ts` declares every control once as
`{id, label, type, group, cost, surface, default, options, range}` (§5.1), where
`type` is `segmented | slider | select | action | toggle | grid`, `group` is
`reframe | retouch | style`, `cost` is `local | job` and `surface` is
`expanded | desktop`. The desktop rail (`IntentRail`) and the mobile bottom
sheet (`ControlSheet`) both render through `ControlRenderer`, so the two
surfaces cannot drift. Controls whose backing path has not shipped are declared
with `available: false` and render disabled rather than being hidden.

Cost is visible before the control runs: local controls carry no marker, job
controls carry a blue dot and their credit count in mono. Reset is per-group
(`resetGroupValues`), never global (§5.2).

## History

`useImageEditor` keeps the working image as an object-URL snapshot and pushes
each operation onto the QCut history stack, capped at 20 entries. Undo restores
a snapshot; it never recomputes an operation, which is what makes generative
undo free once the reactor path lands.

`↺/↻` are permanently mounted and merely disable, so the bar never reflows.
Long-pressing `↺` opens `UndoFilmstrip`, the last eight states (§5.3);
selecting one calls `jumpToPast`, which leaves the history in exactly the state
repeated undos would have — the skipped snapshots land on the redo stack in
order, so `↻` walks back the way it came.

## Data model

`supabase/migrations/20260807090000_mini_image_editor_phase1.sql`.

The parent spec's names (`profiles`, `jobs`, `credits`) already exist in this
database for the desktop app, so the mini-app's tables carry a `mini_` prefix:
`mini_profiles`, `mini_artifacts`, `mini_jobs`, `mini_edits`, `mini_credits`.
All are keyed on `wzrd_uid` — the claim the Phase 2 session exchange will mint —
and RLS matches on it via `public.mini_current_wzrd_uid()`.

Storage: `uploads` (private, swept hourly for objects older than 24h) and
`artifacts` (private, signed URLs only). Neither bucket grants an
anon/authenticated policy; edge functions reach them with the service role.

## Endpoints

### `supabase/functions/mini-artifacts`

`verify_jwt = false` (see `supabase/config.toml`) because the surface must
complete a create-and-share flow with no sign-in. Artifacts are *unlisted*:
knowing the id is what grants access. `GET ?id=` returns metadata plus a 1h
signed URL; `POST` accepts a base64 data URL, stores the bytes and returns the
new id.

### `api/og/[id].ts`

1200×630 card: the artifact resized to cover the frame, with a 24px
`--wzrd-ink` bar at 85% opacity across the bottom — `WZRD` at 20px left, mono
`mini.wzrd.tech/image` at 12px `--wzrd-chrome` right, and nothing else (§4.5). Encoded as progressive JPEG and stepped down
through quality 82/70/58/46 until it fits the 300KB budget; a PNG of a
photograph at this size cannot. Cached immutably.

### `api/a/[id].ts` — per-artifact OG meta

**Chosen approach: rewrite every `/a/:id` request through a serverless function
that injects meta into the built shell.** `vercel.json` rewrites `/a/:id` to
`/api/a/:id` ahead of the SPA catch-all. The function fetches `/index.html`
from the same deployment, strips the shell's own `og:`/`twitter:` tags, injects
the artifact's, and returns the HTML.

Alternatives considered:

- *Prerendering at build time* — artifacts are created after deploy, so there
  is nothing to prerender.
- *User-agent sniffing* (serve the injected HTML only to crawlers) — needs a
  crawler list to stay current, and serves different bytes to different
  clients. The rewrite gives everyone identical HTML, and React hydrates the
  route exactly as it would from the static shell.

## Budgets (parent §8)

Measured from `bun run build`:

| Budget | Limit | Actual |
| --- | --- | --- |
| Shared entry chunk | 110KB gz | ~105KB gz |
| `/image` route JS on top of shared | 180KB gz | ~8KB gz |
| WebGL bytes in critical path | 0 | 0 (`three` is a separate chunk, unreferenced by the mini-app) |

The permalink reserves the image box before load, so the swap costs no layout
shift.

## Deploy

```bash
supabase db push
supabase functions deploy mini-artifacts   # needs SUPABASE_ACCESS_TOKEN
```

Vercel needs no new client env: `api/` reads `VITE_SUPABASE_URL` (falling back
to the project URL) and talks only to the public function. Server-only secrets
stay in Supabase Edge Function secrets.

## Canvas and states

The canvas is the only non-chrome area above the fold (§3.1): pinch to zoom to
6x, one finger to pan once zoomed, double-tap to fit. Empty, it is a
`DitherGradient` wash with three example prompts (§8). Import accepts a file
pick, a drop, a camera capture and a paste.

While the crop overlay is up, one finger belongs to the crop rect: pan and
double-tap-to-fit stand down so a precisely placed zoom is not thrown away, but
pinch still works, because zooming in to refine a crop is the reason to zoom.
A second finger cancels an in-flight crop drag.

Offline (§8), local controls stay live and the surface says so; the generative
controls are already disabled in this phase.

## Not yet shipped

Generation, retouch, style and the messages wrapper are later phases. Their
controls already exist in the schema, disabled.
