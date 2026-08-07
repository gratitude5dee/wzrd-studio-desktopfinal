# WZRD Studio Desktop Goal Spec: Sourcify And Postz

> Archived 2026-06-10. This goal is complete — `/sourcify` and `/postz` are implemented (see `src/legacy-pages/Sourcify.tsx`, `src/legacy-pages/Postz.tsx`, routes in `src/app/AuthenticatedRoutes.tsx`). Preserved here for reference; the live `goal.md` at repo root now covers the QCut editor import.

## Objective

Add two new authenticated app pages to WZRD Studio Desktop:

- `Sourcify`: a social video sourcing workflow that lets users define a topic, person, keyword, hashtag, or URL, then uses an AI-assisted prompt plan to choose and run Apify actors for video scraping.
- `Postz`: a placeholder calendar interface for a future social media scheduler for finalized assets.

The implementation should fit the existing Vite, React, TypeScript, Tailwind, Supabase, and Electron desktop app architecture. Keep provider secrets server-side.

## Product Outcome

Users should be able to open Sourcify from the left navigation after `Clipper`, enter a topic/person/keyword, review the selected scrape sources, configure scrape settings, run selected Apify actors, inspect categorized results, add chosen videos to the WZRD library, download selected results locally, or finalize selected assets for future social posting.

Users should also see `Postz` listed after `Sourcify` in the left navigation. The page should provide a polished but clearly placeholder calendar UI for upcoming social scheduling work.

## Navigation And Routes

- Add a canonical route for Sourcify, preferably `/sourcify` unless existing route conventions require a project-scoped path.
- Add a canonical route for Postz, preferably `/postz` unless existing route conventions require a project-scoped path.
- Add both pages to the authenticated route graph.
- Add Sourcify to the left nav immediately after `Clipper`.
- Add Postz immediately after Sourcify.
- Keep mobile navigation/drawer behavior consistent with the current app shell.

## Sourcify Page

The Sourcify UI should include:

- A topic/person/keyword input that can accept free text, hashtags, profile URLs, video URLs, playlist/search URLs, or channel-like identifiers.
- A `Plan sources` action that converts the user prompt into a proposed actor plan.
- A source/actor selection area where users can enable or disable individual planned scrapes.
- Scrape settings for at least:
  - maximum items/results,
  - maximum total charge in USD,
  - wait-for-finish seconds, capped to Apify's API limit,
  - content/download preference where supported,
  - platform/source filters.
- A `Run selected scrapes` action.
- A results area grouped by source/category/platform.
- Result cards or rows showing enough metadata to evaluate each item:
  - title/caption,
  - creator/channel/author,
  - platform,
  - source URL,
  - downloadable media URL when available,
  - thumbnail when available,
  - duration,
  - metrics such as views, likes, comments, shares when present,
  - actor/run/dataset provenance.
- Multi-select controls for batch actions.
- Actions for:
  - add selected results to the existing asset library,
  - download selected results locally,
  - finalize selected results into the `finalized` asset category for social posting prep.

## AI-Assisted Source Planning

Implement a small planning layer that maps a user's topic/person/keyword into actor run inputs. This can be local deterministic logic first, with an optional server-side model step later if the repo already has a suitable AI gateway pattern.

The planner should:

- Classify whether the input looks like a URL, hashtag, handle, person, topic, keyword, or channel query.
- Choose relevant platforms from YouTube, YouTube Shorts, TikTok, Instagram/Reels, and Twitch.
- Generate actor-specific inputs rather than sending a raw prompt directly to all actors.
- Explain briefly why each actor was selected.
- Surface when an actor is unavailable, missing configuration, or unsupported for the provided input.

## Apify Integration

Apify calls must run through a Supabase Edge Function or another existing server-side integration boundary. Do not expose `APIFY_API_TOKEN` to the browser.

Use the Apify run API shape from the pasted reference:

- Run an actor with `POST https://api.apify.com/v2/actors/:actorId/runs`.
- Pass actor input as JSON request body.
- Use query parameters where appropriate:
  - `maxItems`,
  - `maxTotalChargeUsd`,
  - `waitForFinish` with a maximum of 60 seconds,
  - optional `timeout`, `memory`, `build`, or restart settings only if needed.
- Read `defaultDatasetId` from the returned run object.
- Fetch dataset items from the Apify dataset API after a terminal or pollable run state.
- Preserve run status, usage, usage cost, dataset ID, actor ID, and source platform in normalized result metadata.

Candidate actors from the pasted reference:

- TikTok Scraper: `GdWCkxBtKWOsKjdch`.
- Instagram Reels Downloader: `Fj1zYgto86GELL443`.
- Fast Instagram Scraper API: `VLKR1emKm1YGLmiuZ`.
- YouTube Video Downloader: `y1IMcEPawMQPafm02`.
- Fast YouTube Scraper API: `gXSReGYeawn5nwDhI`.
- Twitch Video Downloader placeholder/reference actor: `bqneowjFSQBmAkILW`.

Prefer configurable actor IDs via environment variables so the app can swap actors without a code change.

## Edge Function Requirements

Add a new Edge Function only if there is not already an appropriate server function to reuse.

The server integration should support actions such as:

- `plan`: return a proposed actor plan for a topic/person/keyword.
- `run`: run a selected actor with settings and return run status plus dataset ID.
- `results`: fetch and normalize dataset items for a run/dataset.
- `finalize`: download or persist selected media into WZRD's existing asset pipeline with asset category `finalized`.

Security and correctness:

- Authenticate requests using the repo's existing Supabase auth/session pattern.
- Keep `APIFY_API_TOKEN` as a Supabase secret.
- Do not query `auth.users` directly from client or Edge Function code.
- Do not use raw SQL through `supabase.rpc('execute_sql', ...)`.
- Do not modify `src/integrations/supabase/types.ts`.
- Do not edit existing migrations.
- Avoid schema changes by default. If a schema change is truly required, create a new migration only.

## Asset Library And Finalized Category

Reuse the current WZRD asset/library model and storage conventions.

The implementation should:

- Add scraped assets to the normal library path without losing source metadata.
- Mark finalized assets using the existing asset category mechanism, metadata field, or category field used elsewhere in the app.
- Ensure the `finalized` category can be queried and displayed by future social scheduler workflows.
- Preserve provenance metadata:
  - source platform,
  - source URL,
  - actor ID,
  - Apify run ID,
  - dataset ID,
  - author/channel,
  - scrape topic,
  - scrape timestamp.
- Handle failures gracefully when a result has metadata but no downloadable media URL.

## Local Download Behavior

Mass download should work safely from the browser/Electron app:

- Allow selecting multiple results.
- Prefer direct media download URLs when available.
- Fall back to source URLs only when a direct media URL is absent and communicate that limitation.
- In Electron/desktop contexts, use existing desktop bridge or local file helpers if the repo already has them.
- In browser-only contexts, use standard browser download behavior and show clear states for unsupported local-only behavior.

## Postz Placeholder

Add a Postz page that feels like a real scheduler surface without implementing actual posting yet.

The page should include:

- Month/week-style calendar UI.
- Placeholder scheduled social slots.
- A side panel or rail for finalized assets ready to schedule.
- Platform labels for likely future destinations such as TikTok, Instagram Reels, YouTube Shorts, and Twitch/YouTube where appropriate.
- Empty states that point users toward finalizing assets in Sourcify.

Do not implement actual social account connections or posting workflows in this goal.

## UX Expectations

- Follow the existing WZRD Studio visual language and component patterns.
- Use the existing app shell, sidebar, mobile drawer, auth handling, loading states, and error boundaries.
- Avoid a marketing landing page. The first view should be the working Sourcify tool or the Postz calendar surface.
- Keep controls compact and operational: inputs, toggles, selects, checkboxes, tabs, and icon buttons where the design system already uses them.
- Make scraping cost/limits visible before users run actors.
- Show empty, loading, running, failed, succeeded, and partial-result states.

## Testing And Verification

Add focused coverage for the new behavior:

- Route registration for `/sourcify` and `/postz`.
- Sidebar/nav ordering: Clipper, Sourcify, Postz.
- Sourcify planner output for topic, hashtag, profile URL, video URL, and search URL inputs.
- Actor input construction for each configured platform.
- Result normalization from YouTube, TikTok, Instagram/Reels, and Twitch-like dataset shapes.
- Finalize/add-to-library payload shape, including `finalized` category metadata.
- Postz renders a calendar placeholder and can read/display finalized assets when available.

Run verification from the repo root:

- `bun run lint`
- `bun run build`
- `bunx vitest run` or the repo's available Vitest command if `bunx` is unavailable.

Also smoke test:

- Sourcify appears after Clipper in navigation.
- Postz appears after Sourcify in navigation.
- Sourcify can plan sources from a topic/person/keyword.
- Sourcify result states render without overlapping UI.
- Postz calendar placeholder renders on desktop and mobile.

## Non-Goals

- Do not build real social posting, OAuth account linking, or scheduling backends in this goal.
- Do not add a new database schema unless unavoidable.
- Do not expose Apify tokens or model provider tokens to the browser.
- Do not port unrelated editor, timeline, studio, or OpenCut features.

## Acceptance Criteria

- Sourcify and Postz routes are available to authenticated users.
- The left nav lists `Clipper`, then `Sourcify`, then `Postz`.
- Sourcify can produce an actor plan from a free-form topic/person/keyword.
- Configured Apify actors can be run through a server-side boundary using safe scrape limits.
- Scraped results are normalized, categorized, selectable, and actionable.
- Selected results can be added to the library, downloaded locally when possible, or finalized into the `finalized` asset category.
- Postz renders a polished calendar placeholder using finalized assets as future scheduling candidates.
- Tests, lint, and build pass, with any known pre-existing warnings clearly reported.
