# WZRD.Studio — Production-Readiness Fix Spec (`goal-fix.md`)

> **Mission:** Take the Vercel web build of **WZRD.Studio** from "deploys but broken in
> production" to "promoted, reactive, and connectable." Fix four owner-reported defects and the
> issues found while reasoning through the app, with file-level tasks and acceptance gates.
>
> **Audience:** an autonomous build agent (**Codex**) working inside `WZRD.Studio-Desktop-v0-main`.
> Execute in workstream order (WS-0 first — it unblocks verification of the rest). Each workstream
> is independently shippable and has its own acceptance criteria.
>
> **Relationship to existing specs:**
> - `goal-vercel.md` — authoritative for the Next.js shell / platform seam / Vercel build. Still valid.
> - `goal-wzrd.md` — WZRDOS (wzrdclaw) Multi-Zones brain at `/dashboard/*` + **Composio**.
>   **Authoritative for the social-connect AND WZRDOS-zone path** (Composio is the primary social path — see D1).
> - `goal-social.md` — Postz **native** key-free OAuth posting. **Demoted to optional fallback / reference**
>   under D1; its providers stay in the tree but are not the default connect path.
> - **This doc supersedes all three for the specific runtime defects below** and resolves the
>   Composio-vs-native ambiguity (see §2, Decision D1: **Composio wins**). Where this doc and another
>   spec disagree on these defects, **this doc wins.**
>
> **Persona:** senior principal architect / full-stack + design engineer. Keep the PROBE → DECIDE →
> EXECUTE → VERIFY discipline (§8). Do not guess at file contents — re-read before editing.

---

## 0. Verified ground truth (confirmed by inspection, 2026-06-23)

Treat as fact. Re-check the file before contradicting.

**Build & deploy**
- `vercel.json`: `framework: nextjs`, `installCommand: bun install --frozen-lockfile`,
  `buildCommand: bun run web:build` (= `next build --webpack`), `bunVersion: 1.x`.
- Vercel project `wzrd-studio-web` (`prj_hbk6ccJSWObGLq3KMSNgFsudAP8T`, team `team_PYXAVq4jrHw8k0bNffmhc2jE`),
  `nodeVersion: 24.x`. **`live: false`.** Production domains exist (`wzrd-studio-web.vercel.app` + 2 aliases).
- The last 20 deployments are **all `state: READY`** and **all `target: null`** — i.e. every deploy
  is a **preview**; **nothing is promoted to production.** Builds are *not* failing.
- Latest deploys are on branch `codex/wzrdos-multizone-integration` ("Integrate WZRDOS dashboard zone UI");
  the local working tree is on the `codex/wzrd-vercel-web` lineage (latest: ffmpeg wasm resolver fixes).
- Vercel runtime-error aggregation for this project = **0 errors (7-day window)**. The 500s the owner
  sees originate **outside** this project (the wzrdclaw/WZRDOS backend or Supabase edge functions), not
  from `wzrd-studio-web` route handlers.

**Social / Postz (this repo)**
- Native providers live in `supabase/functions/_shared/postz/providers/`. **Implemented** (`implemented: true`,
  real OAuth + publish): `x`, `tiktok`, `youtube`, `instagram`. **Stubs** (`notImplementedProvider`):
  `instagram-standalone`, `linkedin`, `linkedin-page`, `facebook`, `threads`, `bluesky`, `mastodon`,
  `discord`, `telegram`.
- `postz-oauth/index.ts` `start` action returns **HTTP 400** for `Unsupported provider` /
  `Provider not implemented` / `Provider not configured` / `App return URL is not allowed`.
  `isProviderConfigured()` = every `requiredEnvVars` entry is set. So an implemented-but-unconfigured
  provider (missing secrets) is rejected with **400, not 500.**
- Required secrets per provider: `POSTZ_TIKTOK_CLIENT_ID/SECRET`, `POSTZ_YOUTUBE_CLIENT_ID/SECRET`,
  `POSTZ_X_*`, `POSTZ_INSTAGRAM_*`. OAuth redirect = `${SUPABASE_URL}/functions/v1/postz-oauth`.
- `getDefaultRedirect()` app-return default is `wzrd://postz/connected` (a **desktop deep link**).
  `isAllowedAppReturnUrl()` only allows `wzrd:`, localhost, and origins listed in **`PUBLIC_WEB_URL`**.
  On the web build the client sends `${window.location.origin}/postz/connected`
  (`src/components/postz/AddChannelDialog.tsx` `getAppReturnUrl()`), so **the Vercel production origin
  must be in `PUBLIC_WEB_URL` or web connects fail with 400.**
- `AddChannelDialog.tsx` renders provider status as `Coming soon` (not implemented),
  `Admin setup required` (not configured), `Ready` (connectable). Connect button is disabled unless `connectable`.

**WZRDOS (the screenshots: "Integrations" grid, "Choose my brain" model picker, "WZRDOS returned 500")**
- The strings `WZRDOS`, `Choose my brain`, `Agentic studio intelligence`, and the integrations grid
  (Perplexity/Firecrawl/SerpApi/etc.) **do not exist anywhere in this repo's source** — they appear only
  in `goal-wzrd.md`. They are served by the **separate `wzrdclaw2.0` app** (the WZRDOS brain).
- There is **no `middleware.ts`** and **no `/dashboard` rewrite / Multi-Zones config** in this working
  tree (`next.config.ts`, `src/next`, `src/app/api` all clean). The zone integration described in
  `goal-wzrd.md` is **not wired in this tree** (it exists only on the `codex/wzrdos-multizone-integration` branch).

**Kanvas layout**
- Route `/kanvas` → `@/next/RouteShellPage` → `src/legacy-pages/KanvasPage.tsx`, inside `SidebarProvider`.
- `SidebarContext` (`src/contexts/SidebarContext.tsx`): expanded `256px`, collapsed `64px`, persisted to
  `localStorage`, toggled with ⌘/Ctrl-B.
- `AppSidebarInset` (`src/components/home/AppSidebarInset.tsx`) **correctly** offsets content reactively:
  `md:ml-[var(--app-sidebar-offset)]` driven by `useSidebar()`.
- `KanvasPage.tsx`: root `relative h-screen overflow-hidden`; `<Sidebar/>` is a fixed overlay (L1528);
  content is wrapped in `<AppSidebarInset>` (L1531); the **bottom status bar is correct** — `fixed bottom-0
  right-0` with `style={{ left: sidebarOffset }}` (L1846–1860, `sidebarOffset` from `useSidebar`, L1523).
- **BUG:** the studio sections (lazy-loaded) render their own **viewport-anchored** overlays that ignore
  the sidebar. `src/components/kanvas/ImageStudioSection.tsx` L410: the prompt/Generate bar is
  `fixed bottom-16 left-3 right-3 md:bottom-8 md:left-8 md:right-8` — anchored to the viewport, **not**
  offset by the sidebar, so on ≥`md` it underlaps the left nav. **No file in `src/components/kanvas/*`
  imports `useSidebar`** — every overlay in those sections is sidebar-unaware.

---

## 1. Symptom → root cause map

| # | Owner-reported symptom | Verified root cause | Workstream |
|---|---|---|---|
| 1 | "Vercel deployment is broken" | Builds succeed; **no production promotion** (`live:false`, all `target:null`) + missing runtime env (`PUBLIC_WEB_URL`, zone URL, provider secrets) | **WS-0** |
| 2 | "Kanvas cut off by left nav; bottom bar broken" | Studio-section overlays are `position: fixed` to the **viewport**, ignore `--app-sidebar-offset` (`ImageStudioSection.tsx:410` et al.) | **WS-1** |
| 3 | "Only Instagram works; need TikTok/YouTube/etc." | Composio is the chosen path (D1), but the **Composio connect is served by wzrdclaw**, whose zone/auth wiring is **absent in this tree** (no `/dashboard` rewrite, no shared cookie session, no `connection_mode` column) → the connect call 404/500s. Instagram "works" via the leftover native path; the rest don't. | **WS-2 (needs WS-3)** |
| 4 | "WZRDOS page dead after model selection (500s)" | Same wzrdclaw zone is unreachable from Studio: no Multi-Zones rewrite, no JWT handoff, no graceful error UI; plus wzrdclaw backend 500s | **WS-3** |
| 5 | (audit) | Misc hardening — see WS-4 | **WS-4** |

---

## 2. Decisions locked (do not re-litigate)

- **D1 — Social-connect & publish source of truth = Composio (via wzrdclaw), not native Postz OAuth.**
  (Owner decision, 2026-06-23.) Connect, publish, and agent tools all use **wzrdclaw's single Composio
  client** per `goal-wzrd.md` §3.4. Studio's `/postz` connect UI and the onboarding integrations step call
  wzrdclaw to authorize (Composio managed OAuth, toolkits: **gmail, tiktok, instagram, twitter (X)**;
  youtube/linkedin later). On `isActive`, wzrdclaw `upsertComposioChannel` writes a `postz_channels` row
  (`connection_mode='composio'`, `composio_account_id`, display fields) into Supabase, so the **existing**
  Studio calendar/composer renders it with no second integration. Autopost is wzrdclaw's Vercel cron
  draining due `postz_posts` → Composio publish.
  - **D1a — One Composio owner.** Do **not** add a Composio SDK/client to the Studio repo. Studio never
    holds `COMPOSIO_API_KEY`. All Composio calls go through wzrdclaw (same-origin via the `/dashboard` zone).
  - **D1b — Native providers become fallback, not deleted.** Keep `supabase/functions/_shared/postz/providers/*`
    and `postz-oauth` for `connection_mode='native'` channels (and desktop), but the **default UI path is
    Composio.** Gate native connect behind a flag/admin-only; do not surface "Admin setup required" provider
    rows to end users.
  - **D1c — Composio social depends on the zone.** Because Composio lives in wzrdclaw, **WS-2 is blocked by
    WS-3** (Multi-Zones + shared Supabase cookie session must exist first).
- **D2 — Deploy target = Vercel + Next.js App Router.** No Electron in the web build. Keep `vercel.json` as-is.
- **D3 — Backend stays Supabase.** Postz logic stays in Deno edge functions invoked via
  `supabase.functions.invoke`. Do **not** port Postz to Next.js route handlers.
- **D4 — Never edit `src/integrations/supabase/types.ts` or `supabase/migrations/`** by hand (per
  `.claude/CLAUDE.md`). New DB changes go in **new** migration files; regenerate types via the documented flow.
- **D5 — Sidebar offset is a single source of truth.** All fixed/sticky chrome must derive its left edge
  from `useSidebar()` + `APP_SIDEBAR_*_WIDTH` (or the `--app-sidebar-offset` CSS var). No hard-coded `left`.

---

## 3. WS-0 — Make the Vercel deployment real (P0, unblocks everything)

**Problem.** The app builds (`READY`) but is never promoted; production serves a stale/empty target and
in-app calls 500/404 because runtime env is missing.

**Tasks**
1. **Promote a production deployment.**
   - Set the project's **Production Branch** in Vercel project settings to the branch you intend to ship
     (recommend `main`; merge the verified fix branch into it). Confirm `git push` to that branch creates
     a deployment with `target: "production"`.
   - For an immediate ship, run `vercel --prod` (or "Promote to Production" on a known-good preview).
   - **Acceptance:** `get_project` shows `live: true` and a `latestDeployment` with `target: "production"`;
     `https://wzrd-studio-web.vercel.app` serves the new build.
2. **Configure runtime environment variables** (Vercel → Project → Settings → Environment Variables,
   Production + Preview). Use the **§7 matrix**. At minimum: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and the `VITE_`-named fallbacks `next.config.ts` maps), `PUBLIC_WEB_URL`
   (set to the production origin **and** preview origins, comma-separated), thirdweb client id, and — if
   WS-3 is in scope — the WZRDOS zone URL.
   - **Acceptance:** a production page load shows no missing-env console errors; auth + a Supabase read succeed.
3. **Confirm Supabase Function secrets** (separate from Vercel env — these live in Supabase):
   `PUBLIC_WEB_URL` must include the Vercel production origin so `postz-oauth` accepts the web
   `app_return_url`. Provider secrets per WS-2.
   - **Acceptance:** `POST postz-oauth {action:"list-providers"}` returns the provider list; `instagram`,
     `tiktok`, `youtube`, `x` report `configured: true` once secrets are set.
4. **Sanity-check `.vercelignore`** — it currently excludes `.next`, `dist`, `release`, the stray
   `Sidebar-*.js` / `MobileSidebarDrawer-*.js` root bundles, and `worldlabsedit.mp4` (30 MB). Keep these
   excluded; confirm nothing the build needs is ignored.

**Gate:** WS-0 passes when production is live, env is set, and the app loads authenticated with a working
Supabase round-trip. WS-1..WS-4 are verified against this production (or a `--prod`-promoted) URL.

---

## 4. WS-1 — Kanvas responsive layout (P0, fully in-repo, high confidence)

**Problem.** Studio-section overlays sit under the left nav and the bottom prompt bar is misaligned because
they are `position: fixed` to the viewport and never read the sidebar width. The page shell itself is already
correct (`AppSidebarInset`, status bar at `KanvasPage.tsx:1846`).

**Root cause (evidence).** `src/components/kanvas/ImageStudioSection.tsx:410` —
`fixed bottom-16 left-3 right-3 md:bottom-8 md:left-8 md:right-8`. No `src/components/kanvas/*` component
consumes `useSidebar`. The same viewport-anchored pattern recurs in the sibling studio sections.

**Tasks**
1. **Create one reusable, sidebar-aware footer container.** Add
   `src/components/kanvas/KanvasDockedBar.tsx` (or a `useKanvasDockOffset()` hook) that reads `useSidebar()`
   + `APP_SIDEBAR_COLLAPSED_WIDTH` / `APP_SIDEBAR_EXPANDED_WIDTH` and renders a `fixed bottom-0` bar whose
   `left` = the sidebar offset on `md+` (and `left-0` below `md`, matching the mobile bottom nav), with
   `transition-[left] duration-300 ease-out` (mirror the status-bar pattern at `KanvasPage.tsx:1848-1849`).
   - Account for the mobile bottom nav height (`KanvasPage.tsx:1863`): on mobile the prompt bar must sit
     **above** it (current `bottom-16` is the right instinct — keep a token for it).
2. **Refactor every studio-section prompt/overlay to use it.** Replace the hard-coded `fixed … left-* right-*`
   wrappers in `ImageStudioSection.tsx` (L410) and the equivalents in `VideoStudioSection.tsx`,
   `EditStudioSection.tsx`, `LipsyncStudioSection.tsx`, `CinemaStudioSection.tsx`. Sections rendered
   **inside** `AppSidebarInset` may instead use `sticky bottom-0` (no manual offset needed) — prefer sticky
   where the bar is part of the scroll container; use the docked `fixed`+offset bar only for true overlays.
3. **Prevent horizontal clipping of main content.** Ensure each section's top-level wrapper is
   `min-w-0 w-full` (no fixed `w-screen`/`100vw` or negative margins) so the inset's `md:ml-[offset]` is
   respected and the left rail (filmstrip / "Change" / model dropdown visible in the screenshots) is not
   pushed under the nav.
4. **Reserve scroll space** so the docked bar never covers content: add bottom padding to the scroll area
   equal to the bar height (a `pb-*` token; ImageStudioSection already hints this at its "Bottom padding for
   prompt bar" comment).
5. **Respect collapse state live.** Because offsets now come from `useSidebar()`, toggling ⌘/Ctrl-B (or the
   collapse control) must reflow the bars without reload.

**Acceptance**
- At ≥`md`, no studio bar/overlay overlaps the left nav in either expanded (256) or collapsed (64) state;
  toggling collapse animates the bar's left edge to match.
- The Image/Video/Cinema/Edit/Lip-Sync prompt bars are fully visible and centered within the content inset.
- At `<md`, bars span full width and the prompt bar sits above the mobile bottom nav (nothing clipped by the
  iOS safe-area inset).
- No horizontal scrollbar on the page at 1280/1440/1920 widths; the left rail is fully visible.
- Add a Playwright case under `tests/` that loads `/kanvas`, toggles the sidebar, and asserts the prompt
  bar's bounding box `left ≥ sidebar width` at `md+`.

---

## 5. WS-2 — Composio social: connect + publish via wzrdclaw (P1, **blocked by WS-3**)

> **Per D1, Composio is the primary social path. Do NOT add a Composio client to this repo (D1a).**
> All Composio OAuth + publishing happens in wzrdclaw; Studio reads/writes the shared Supabase `postz_*`
> tables and proxies connect calls to the zone. This follows `goal-wzrd.md` §3.4 / §3.6. **WS-2 cannot be
> verified until WS-3 (the `/dashboard` zone + shared cookie session) is live (D1c).**

**Problem.** Only Instagram "connects" today (via the leftover native path). TikTok/YouTube/X/etc. must
connect through Composio, but the wzrdclaw connect bridge isn't reachable from Studio and `postz_channels`
can't yet represent a Composio channel.

**Schema (this repo — new migration only, per D4)**
1. Add a migration `supabase/migrations/<ts>_postz_channels_composio.sql` adding to `postz_channels`:
   - `connection_mode text not null default 'native'` (`'composio' | 'native'`),
   - `composio_account_id text` (nullable), and a partial unique index
     `(owner_id, provider, composio_account_id) where connection_mode = 'composio'`.
   - Then **regenerate** `src/integrations/supabase/types.ts` via the documented codegen flow (do not hand-edit).
   **Acceptance:** a Composio channel row upserts without colliding with native rows; types compile.

**Connect path (Studio side)**
2. **Route the `/postz` "Add channel" UI to Composio (wzrdclaw), not `postz-oauth`.** Replace the
   `useStartPostzOauth` call in `src/components/postz/AddChannelDialog.tsx` (`handleConnect`) with a call to
   the wzrdclaw connect endpoint exposed under the same-origin zone (`/dashboard/api/...`, e.g. a tRPC
   `studio.getIntegrationAuthLinks`/`checkConnectionStatus` per `goal-wzrd.md` §3.3–§3.4). Open the returned
   Composio auth link; poll `checkConnectionStatus` until `isActive`.
3. **List from `postz_channels`, not provider summaries.** The dialog's toolkit list = Composio toolkits
   (gmail, tiktok, instagram, X; youtube/linkedin later). Drop the native "Admin setup required"/"Coming soon"
   provider rows from the default UI (D1b). Keep `usePostzChannels` as the connected-state source of truth.
4. **On success, wzrdclaw writes the channel.** wzrdclaw's `upsertComposioChannel` inserts the
   `postz_channels` row (`connection_mode='composio'`, `composio_account_id`, name/username/picture) and
   recomputes `profiles.connected_accounts`. Studio simply re-queries channels. **No token handling in Studio.**
5. **Connect-error UX.** Replace the generic "Unable to start OAuth" toast with mapped, actionable copy for
   zone-down / not-authenticated / Composio-denied. Never surface raw 500/404 strings.

**Publish path (drains shared `postz_posts`)**
6. **Publishing for Composio channels happens in wzrdclaw**, not the Supabase `postz-publish`/`postz-scheduler`
   edge functions. Per `goal-wzrd.md` §3.4 + decision #6: wzrdclaw's Vercel cron (1/min, Redis lock) drains
   due `postz_posts` whose channel is `connection_mode='composio'`, resolves `media[]` → **public HTTPS URLs**
   (`project_assets.cdn_url`/signed URL — never base64-inline, §3.4), calls the Composio platform tool, writes
   `postz_publish_log`, and flips `QUEUE→PUBLISHING→PUBLISHED|ERROR`.
7. **Demote the native scheduler safely.** Update `postz-scheduler`/`postz-publish` to **skip
   `connection_mode='composio'` rows** (so the two engines never double-publish). Native rows (if any) keep
   working. Document which engine owns which channel.
8. **Media must be web-resolvable.** Ensure scheduled posts store asset URLs that are publicly fetchable by
   wzrdclaw (Supabase Storage signed/public URLs), since Composio pulls media by URL.

**Coordinate in wzrdclaw (track, don't silently skip)** — expose the connect bridge under `/dashboard/api`,
implement `upsertComposioChannel` + `src/server/postz/publish.ts`, and extend the cron drain to Supabase
`postz_posts`. These are wzrdclaw changes; file them per `goal-wzrd.md`.

**Acceptance**
- From production, a user clicks **Connect TikTok / YouTube / Instagram / X**, completes Composio OAuth, and
  the channel appears in the Postz calendar/composer (`postz_channels.connection_mode='composio'`).
- A scheduled post to a Composio channel is drained by wzrdclaw cron and reaches the platform; `postz_posts`
  ends `PUBLISHED` with a `postz_publish_log` entry; failures end `ERROR` with a readable reason.
- Studio holds **no** `COMPOSIO_API_KEY` and makes no direct Composio calls (grep the repo to confirm).
- Native and Composio engines never double-publish the same row.

---

## 6. WS-3 — WZRDOS zone: Multi-Zones + shared auth (P1, **prerequisite for WS-2**)

> **This is now the foundation for the Composio social path (D1c), not just the model picker.** The same
> `/dashboard` zone + shared Supabase cookie session that fixes "WZRDOS dead after model selection" also
> carries the Composio connect bridge WS-2 calls. Ship WS-3 **before** WS-2.

**Problem.** The "Choose my brain" model picker and "Integrations" grid (served by the separate **wzrdclaw**
app) 500 after selection, and the Studio-side surfacing is incomplete in this tree. Two failure layers:
(a) the wzrdclaw backend returns 500 / "resource not found"; (b) Studio has no `/dashboard` Multi-Zones
wiring or graceful degradation here.

> **Scope note.** wzrdclaw is a different repo; Codex working in *this* repo can fix the **Studio-side**
> surfacing and resilience (rewrite, cookie auth, error UI) and the Composio **connect bridge call sites**,
> and must coordinate the wzrdclaw backend fix. Follow `goal-wzrd.md` §3.1–§3.4 for the full design.

**Tasks (Studio side, this repo)**
1. **Wire the Multi-Zones rewrite** per `goal-wzrd.md` §3.1: add a `next.config.ts` `async rewrites()` mapping
   `{ source:'/dashboard/:path*', destination:'${WZRDCLAW_ZONE_URL}/dashboard/:path*' }` (server-only env
   `WZRDCLAW_ZONE_URL`, **not** `NEXT_PUBLIC_*`). Keep the existing editor COEP/COOP headers untouched. There
   is currently **no** such rewrite and **no `middleware.ts`** — add them. wzrdclaw must run with
   `basePath:'/dashboard'` + `assetPrefix:'/dashboard'`. **Acceptance:** `/dashboard` and `/dashboard/api/*`
   proxy to the zone same-origin (shared cookies), not a 404.
2. **Shared session / JWT handoff.** Per `goal-wzrd.md` D3, move the Supabase browser client to cookie
   storage (`@supabase/ssr`) at the apex domain so the zone can verify the Supabase JWT. Do not duplicate auth.
3. **Graceful degradation for zone failures.** The model picker and integrations grid must not hard-crash on
   a zone 500/404. Add an error boundary + retry + "WZRDOS is unavailable" state around the `/dashboard`
   surface, and a health check before the onboarding "model selection" step advances. **Acceptance:** when the
   zone is down, the user sees a recoverable message, not a dead screen or raw "WZRDOS returned 500" toast.
4. **Onboarding "after model selection" flow.** Identify the onboarding step component (Step 7/10 "Choose my
   brain") on the integration branch; ensure model selection persists and the next step loads even if optional
   zone calls fail. Gate "continue" on the *required* call only.
5. **Env contract.** Add the zone URL + any `WZRDOS_*` keys to §7 and to `.env.example`. Validate presence at
   boot with a clear error (don't silently 500).

**Backend coordination (wzrdclaw repo — track, don't silently skip)**
- Reproduce "Unable to start WZRDOS connection — WZRDOS returned 500" and "resource not found" and capture the
  failing endpoint. Likely causes: missing Composio/Neon/Redis env in the wzrdclaw deploy, an unmigrated DB,
  or a wrong base path/asset prefix for the `/dashboard` zone. File the fix against wzrdclaw per `goal-wzrd.md`.

**Acceptance**
- `/dashboard/*` resolves through the zone with a shared session; the integrations grid renders real connect
  buttons (Composio) without 404/500.
- Completing "Choose my brain" advances onboarding; transient zone errors are recoverable.

---

## 7. Environment variable matrix

> Vercel env (build/runtime) and Supabase Function secrets are **separate stores**. Set in both where noted.

| Variable | Where | Purpose | Blast radius if missing |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `VITE_SUPABASE_URL` | Vercel | Supabase REST/Realtime base | App can't reach backend |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` | Vercel | anon client | Auth + reads fail |
| `WZRDCLAW_ZONE_URL` | **Studio** Vercel (server-only) | `/dashboard/*` Multi-Zones rewrite target → carries WZRDOS **and** Composio connect (WS-3/WS-2) | WZRDOS page + social connect 404/500 |
| `COMPOSIO_API_KEY` | **wzrdclaw** Vercel | Composio managed OAuth + publish + agent tools (the social path) | No social connect/publish at all |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **wzrdclaw** Vercel | service-role client to read/write Studio `postz_*` / `project_assets` / `profiles` | wzrdclaw can't write channels/posts |
| `SUPABASE_JWT_SECRET` | **wzrdclaw** Vercel | verify the shared Supabase session in tRPC | Zone calls 401 |
| `STUDIO_APP_ORIGIN` | **wzrdclaw** Vercel | build public media URLs / redirects back to Studio | Publish media resolves wrong |
| `CRON_SECRET`, `REDIS_URL`, `DATABASE_URL` | **wzrdclaw** Vercel (already deployed) | autopost cron auth + Redis lock + Neon | Autopost drain breaks |
| `PUBLIC_WEB_URL`, `POSTZ_*_CLIENT_ID/SECRET` | Supabase (functions) | **native fallback only (D1b)** — `app_return_url` allow-list + per-provider OAuth | Native path only; not the default |
| `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` / `VITE_THIRDWEB_CLIENT_ID` | Vercel | wallet/auth | login issues |

Add/refresh `.env.example` to match. `next.config.ts` already maps the legacy `VITE_*` keys to
`NEXT_PUBLIC_*` fallbacks — set the `NEXT_PUBLIC_*` form on Vercel.

---

## 8. PROBE → DECIDE → EXECUTE → VERIFY discipline

1. **PROBE.** Before editing, re-read the target file and run the relevant probe (e.g. `POST postz-oauth
   {action:"list-providers"}`; load `/kanvas` and inspect computed styles; `get_project`/`list_deployments`
   for Vercel state). Never assume a value this doc didn't verify.
2. **DECIDE.** Confirm the change respects the locked decisions (§2), especially D1 (no second Composio social
   path), D4 (no hand-editing types/migrations), D5 (single offset source).
3. **EXECUTE.** Smallest change that fixes the root cause. Reuse the existing correct patterns
   (`AppSidebarInset`, the status-bar offset) rather than inventing new ones.
4. **VERIFY.** Run the acceptance checks for the workstream against the **promoted production / `--prod`**
   URL, plus: `bunx vitest run`, `bun run lint` (includes `check:web-boundaries`), and `bun run web:build`
   locally before pushing.

---

## 9. WS-4 — Broader audit (P2, fix opportunistically)

- **Single source for sidebar chrome (D5).** Audit all pages (not just Kanvas) for hard-coded `left`/`ml`
  offsets that duplicate `AppSidebarInset`; converge on `useSidebar()` + the CSS var. Candidates:
  `StudioSidebar`, storyboard sidebars, `LeftSidebar`.
- **Repo hygiene.** Stray root bundles `Sidebar-B6WGnj68.js`, `MobileSidebarDrawer-DoeCmc5e.js`, and
  `worldlabsedit.mp4` (30 MB) sit at repo root and are only `.vercelignore`d. Move build artifacts out of VCS;
  keep large media in storage, not the repo.
- **Dual build systems.** Both Vite (`vite.config.ts`, desktop) and Next (`next.config.ts`, web) exist. The
  Vercel build uses Next only — ensure no Vite-only assumptions leak into web routes (`import.meta.env` is
  shimmed in `next.config.ts`; keep that list in sync when adding env keys).
- **Error surfacing.** Replace remaining raw `error.message` toasts on user-facing connect/zone failures with
  mapped, actionable copy (WS-2.6, WS-3.3).
- **Branch convergence.** The WZRDOS zone work (`codex/wzrdos-multizone-integration`) and the web-migration
  work (`codex/wzrd-vercel-web`) are diverged. Reconcile onto the production branch before promoting, so the
  promoted build contains both the Kanvas fix and the (resilient) zone wiring.

---

## 10. Supabase / Postgres appendix (apply when touching Postz DB)

From the Supabase Postgres best-practices guidance — apply to `postz_oauth_state`, `postz_channels`,
`postz_posts` if you add migrations (new files only, per D4):

- **Index every column used in `WHERE`/`JOIN`/RLS.** Hot lookups to cover:
  `postz_oauth_state(state)` (callback lookup), `postz_oauth_state(owner_id, provider, expires_at)`
  (start/list), and the existing unique `postz_channels(owner_id, provider, provider_account_id)` used by
  `upsert(onConflict)`. Missing indexes turn these into sequential scans as tables grow (100–1000× slower).
- **Composio channel columns (WS-2).** Add `postz_channels.connection_mode` (default `'native'`) +
  `composio_account_id`; index the path the cron uses to find Composio work, e.g.
  `postz_posts(state, publish_date)` already exists — add `postz_channels(connection_mode)` (or a partial
  index) so the drain can filter Composio channels cheaply. Use a **partial unique** index
  `(owner_id, provider, composio_account_id) where connection_mode = 'composio'` so it can't collide with
  native rows.
- **Index foreign keys.** Postgres does **not** auto-index FK columns; index the referencing side
  (e.g. `postz_posts.channel_id`, any `*_owner_id`) for fast joins and `ON DELETE CASCADE`.
- **Optimize RLS.** Wrap auth calls in a subselect so they evaluate once, not per row:
  `using ((select auth.uid()) = owner_id)` — not `using (auth.uid() = owner_id)`. For team/shared checks use a
  `security definer` helper with `set search_path = ''`. Ensure the RLS column (`owner_id`) is indexed.
- **Short transactions / `FOR UPDATE SKIP LOCKED`.** The autopost drain (now **wzrdclaw's Vercel cron** for
  Composio channels, with a Redis lock) claims due `postz_posts` with `SELECT … FOR UPDATE SKIP LOCKED` to
  avoid worker contention; keep the publish transaction short (do Composio network I/O outside the row lock).
  The native `postz-scheduler` must filter to `connection_mode='native'` so the two engines don't race.
- **Expire OAuth state.** `postz_oauth_state` rows have `expires_at`; add a periodic cleanup (the codebase
  already deletes on success) so abandoned flows don't accumulate.

---

## 11. Suggested execution order & PR slicing

1. **PR-1 (WS-0):** production promotion + env matrix + `.env.example`. *Smallest, unblocks verifying the rest.*
2. **PR-2 (WS-1):** Kanvas sidebar-aware docked bar + section refactor + Playwright test. *Highest-confidence, fully in-repo.*
3. **PR-3 (WS-3):** `/dashboard` Multi-Zones rewrite + shared Supabase cookie session + graceful degradation
   (coordinate wzrdclaw backend). **Ships before WS-2** — it carries the Composio connect bridge (D1c).
4. **PR-4 (WS-2):** `postz_channels` composio columns migration + types regen + route `/postz` connect to the
   wzrdclaw Composio bridge + wzrdclaw `upsertComposioChannel`/publish + native scheduler guard. *Depends on PR-3.*
5. **PR-5 (WS-4 / §10):** hygiene, offset convergence, DB indexes/RLS.

Each PR must pass §8 VERIFY before merge. Do not mark a workstream done with failing tests, a partial
implementation, or unresolved 4xx/5xx on its acceptance path.
