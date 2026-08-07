---
name: testing-wzrd-ui
description: How to run and browser-test the WZRD Studio Vite/React app locally — dev server flags, bypassing auth to reach protected dashboard/studio/observability/billing routes, route map, known pre-existing console errors, and how to exercise data-gated charts.
---

# Browser-testing WZRD Studio locally

## Start the dev server

```bash
bun install                       # covered by the repo blueprint's maintenance step
VITE_BYPASS_AUTH_FOR_TESTS=true VITE_USE_MOCK_ASSETS=true bun run dev
# serves on http://localhost:8080 (NOT 5173)
```

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

## Devin Secrets Needed

None — the `VITE_BYPASS_AUTH_FOR_TESTS` dev flag removes the need for login credentials. Real
Supabase/Stripe keys would only be needed to exercise backend-dependent flows (timeline storyboard,
Stripe checkout, real observability runs).
