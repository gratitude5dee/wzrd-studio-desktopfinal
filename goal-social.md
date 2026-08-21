# Postz Social — Vercel Build Spec (`goal-social.md`)

> **Mission:** Take the partially-built **Postz** social scheduler in
> `WZRD.Studio-Desktop-v0-main` from "connects + composes" to **connect socials →
> schedule → reliably auto-post**, running on **Vercel (Next.js App Router)**.
> No Postiz API key. No self-hosted Postiz server. Works out of the box.
>
> **Audience:** an autonomous build agent (**Codex**) working inside this repo. Build in
> phase order (Section 12). Each phase is independently shippable and has its own acceptance
> criteria.
>
> **Relationship to other specs:** `postizgoal.md` is the original desktop port spec (still
> accurate for the data model and provider porting method). `goal-vercel.md` is the web/Vercel
> migration spec (authoritative for Next.js shell, platform seam, and Vercel deploy). **This doc
> supersedes both for the Postz feature** and resolves the desktop-only assumptions (`wzrd://`
> deep links, local media paths) that break on Vercel. Where this doc and `postizgoal.md`
> disagree, **this doc wins.**

---

## 0. Decisions locked (do not re-litigate)

1. **Native, key-free posting.** Posting happens through WZRD's own per-platform OAuth + REST
   integrations (already scaffolded under `supabase/functions/_shared/postz/providers/`). There is
   **no dependency on `api.postiz.com`, no Postiz API key, and no self-hosted Postiz instance.** The
   Postiz public API is used **only as a design reference** (Section 3.4) — never called at runtime.
2. **Backend stays on Supabase.** Postz server logic remains **Deno edge functions** under
   `supabase/functions/postz-*`, called from the browser via `supabase.functions.invoke(...)` (the
   pattern `src/services/postzService.ts` already uses). Do **not** port Postz to Next.js route
   handlers. The Vercel app serves the React shell; Supabase serves the API.
3. **Auto-post engine = `pg_cron` → `pg_net` → `postz-scheduler` edge function.** Not Vercel Cron.
   `pg_cron` and `pg_net` are **already enabled** (see `20260609080000_postz_phase1_tables.sql`).
4. **"Out of the box" = operator sets platform app keys once; end users never enter a key.** The
   deployer adds each platform's OAuth app credentials as Supabase function secrets (Appendix B).
   End users just click **Connect TikTok / X / Instagram** and authorize. The page is fully
   functional on deploy; providers without configured keys degrade gracefully (Section 4).
5. **Deploy target = Vercel + Next.js App Router.** `vercel.json` → `framework: nextjs`,
   `buildCommand: bun run web:build`. `/postz` is served by `src/app/postz/page.tsx`
   (→ `@/next/RouteShellPage` → `NextClientShell`).
6. **Provider rollout — video-first, auth-complete first.** Only **4 providers have working auth
   today: `tiktok`, `x`, `youtube`, `instagram`** (these cover the user's named platforms). They are
   the v1 publish targets — Phase 2 just needs their `post()`. The other 9 (`instagram-standalone`,
   `linkedin`, `linkedin-page`, `facebook`, `threads`, `bluesky`, `mastodon`, `discord`, `telegram`)
   are **`notImplementedProvider` stubs** (auth *and* post throw) and require a full provider build
   in Phase 4/6 — they are **not** quick wins.

---

## 1. Objective & product outcome

A WZRD user opens **Postz** from the left nav and can:

- **Connect** one or more social channels via real OAuth — one click, no keys.
- **Compose** a post once and tailor it per channel (per-platform copy, media, and settings).
- **Attach media** — especially `finalized` video assets from Sourcify/Clipper, or new uploads.
- **Schedule** on a calendar (month/week/day), pick a recommended slot, set recurrence, or **Post now**.
- Have WZRD **reliably auto-publish** at the scheduled time and record the live URL (or the failure).
- Review per-post / per-channel **analytics** (later phase).

**"Done" for the user:**

- The calendar is the primary surface; posts are color-coded by state
  (`DRAFT` / `QUEUE` / `PUBLISHING` / `PUBLISHED` / `ERROR`) with per-channel avatars.
- A **Channels** rail lists connected accounts with status (`connected` / `needs_reauth` /
  `disabled` / `error`) and an **+ Add channel** flow that runs real OAuth on the **deployed Vercel
  URL** and stores tokens server-side (encrypted).
- A scheduled post **actually goes live** without the user keeping the app open.
- Everything respects WZRD's auth, app shell, sidebar, mobile drawer, loading/error states, and
  visual language. No marketing page — Postz opens straight into the calendar.

---

## 2. Ground truth — what already exists (verified)

> Codex: trust this inventory; re-verify before extending. Most of Postz is built. The gaps are
> **(a) web OAuth callback, (b) the publish core, (c) the scheduler** — that's the work.

### 2.1 Stack & deploy
- Vite 5 + React 18 + TS 5 + Tailwind v3 + shadcn/ui + framer-motion + `react-router-dom` +
  TanStack Query. **Also Next.js (App Router)** for the web build (`bun run web:build` =
  `next build --webpack`). Packaged as Electron for desktop.
- Supabase project ref **`ixkkrousepsiorwlaycp`**. Edge functions in Deno under
  `supabase/functions/<name>/index.ts`.
- Deploy: **Vercel**, `framework: nextjs`, `installCommand: bun install --frozen-lockfile`,
  `buildCommand: bun run web:build`, `bunVersion: 1.x` (`vercel.json`).

### 2.2 Routing (both shells)
- **Next.js (Vercel):** `src/app/postz/page.tsx` → `export { default } from "@/next/RouteShellPage"`
  → `NextClientShell` mounts the React app. This is the surface that ships on Vercel.
- **Legacy (Vite/Electron):** `src/app/AuthenticatedRoutes.tsx` lazy-loads `@/legacy-pages/Postz`
  at `appRoutes.postz`, wrapped in `StudioErrorBoundary`. Sidebar item id `postz`
  (`src/components/home/navConfig.ts`), after `sourcify`.
- The **Postz UI is shared** across both shells. Build web behavior so it works under
  `NextClientShell`; do not fork the page.

### 2.3 Data model — `postz_*` tables (all present; **do not edit these migrations**)
`supabase/migrations/20260609080000_postz_phase1_tables.sql` creates, with RLS (owner-scoped) and
the `set_updated_at` trigger:

- **`postz_channels`** — a connected account. Cols incl. `provider`, `provider_account_id`,
  `name`, `username`, `picture`, `profile` (jsonb), `token_ref`, `refresh_token_ref`,
  `token_expires_at`, `status` (`connected` default), `disabled`, `posting_times`
  (default `[{"time":120},{"time":400},{"time":700}]`), `additional_settings`,
  `custom_instance_url`, soft-delete `deleted_at`. Unique `(owner_id, provider, provider_account_id)`.
- **`postz_posts`** — one row **per channel per logical post**, joined by `group_id`. Cols:
  `channel_id`, `group_id`, `state` (`QUEUE` default), `publish_date`, `content`, `title`,
  `description`, `settings` (jsonb), `media` (jsonb, default `[]`), `poll` (jsonb),
  `parent_post_id` (threads), `first_comment`, `release_url`, `release_provider_id`, `error`,
  `attempts` (int, default 0), `interval_in_days` (recurrence), `creation_method` (`ui` default),
  `deleted_at`. Indexed on `(state, publish_date)` — the scheduler's query path.
- **`postz_tags`**, **`postz_post_tags`**, **`postz_sets`**, **`postz_signatures`** — supporting.
- **`postz_analytics`** — `metric`, `value`, `captured_for`, unique `(channel_id, post_id, metric, captured_for)`.
- **`postz_oauth_state`** (server-only, RLS deny-all) — `provider`, `state`, `code_verifier`,
  `redirect`, `expires_at`, plus `access_token_ref`, `refresh_token_ref`, `token_expires_at`,
  `auth_details` (added in `20260617075500_postz_oauth_state_tokens.sql`).
- **`postz_publish_log`** (server-only, RLS deny-all) — `post_id`, `channel_id`, `attempt`,
  `outcome`, `detail` (jsonb). **This is the audit trail the publish core/scheduler must write to.**
- **Extensions already enabled:** `pgcrypto`, **`pg_cron`**, **`pg_net`**. The scheduler needs no
  new extension.

**State machine:** `DRAFT → QUEUE → PUBLISHING → PUBLISHED`, or `… → ERROR` (retryable).

### 2.4 Edge functions (present)
- **`postz-channels`** — `list` (returns non-token columns only) and `seed` (creates 3 demo
  channels for first-run UX before real OAuth is configured).
- **`postz-oauth`** — `list-providers`, `start` (PKCE, inserts `postz_oauth_state`, returns auth
  `url`), `list-targets`, `finalize`; plus a **GET callback** that exchanges the code, encrypts
  tokens, upserts `postz_channels`, and redirects. ⚠️ **The GET callback redirects to
  `wzrd://postz/connected?...` — Electron-only. This breaks on Vercel and is the Phase 1 fix.**
- **`postz-posts`** — `list`, `get`, `get-group`, `create`, `update`, `update-date`, `delete`,
  `duplicate`, `validate`, `find-slot`, `post-now`. Writes one `postz_posts` row per channel under
  a shared `group_id`. `find-slot` uses `computeNextSlot(posting_times, now)`.

### 2.5 Providers (present, under `supabase/functions/_shared/postz/providers/`)
Registry `index.ts` exports `getProvider`, `isProviderConfigured` (checks
`provider.requiredEnvVars` against `Deno.env`), and `listProviders()` → `{identifier, name,
configured}[]`. Two tiers exist:
- **Auth-complete (4):** `x`, `tiktok`, `youtube`, `instagram` — real `generateAuthUrl` /
  `authenticate` / `refreshToken`; **only `post()` is a stub.**
- **Stubs (9):** `instagram-standalone`, `linkedin`, `linkedin-page`, `facebook`, `threads`,
  `bluesky`, `mastodon`, `discord`, `telegram` — built via `notImplementedProvider(...)`, so
  **every method (`generateAuthUrl`, `authenticate`, `refreshToken`, `post`) throws** `"<name>
  provider not implemented yet"`.

Token crypto in `crypto.ts` (`encryptToken` / `decryptToken`).

**Provider contract** (`providers/types.ts` — the real, authoritative interface):
```ts
interface PostzProvider {
  identifier: string; name: string; capabilities: ProviderCapabilities;
  requiredEnvVars?: string[];                               // e.g. POSTZ_TIKTOK_CLIENT_ID, _SECRET
  generateAuthUrl(input): Promise<{ url; codeVerifier; state }>;
  authenticate(input): Promise<AuthTokenDetails>;           // ✅ implemented (video-first set)
  refreshToken(refreshToken): Promise<AuthTokenDetails>;    // ✅ implemented (video-first set)
  post(channel: ChannelRow, accessToken: string, posts: PostDetails[]): Promise<PostResponse[]>;
  analytics?(...); listTargets?(...); finalizeTarget?(...);
}
```
> ⚠️ For the **4 auth-complete providers**, `post()` is the only stub (e.g. `tiktok.ts` → `throw new
> Error("TikTok publishing not implemented yet")`) — implementing it is the heart of Phase 2. The
> **9 stub providers** need their full interface built (auth + post) before they can connect at all.

### 2.6 Client surface (present)
- `src/services/postzService.ts` — typed wrappers over the three edge functions (channels, oauth,
  posts). ⚠️ Gap: `postzService` does **not** expose a `postNow(group_id)` method even though the
  `post-now` action exists server-side and is in the `InvokeBody` union — add it in Phase 2.
- `src/hooks/usePostz.ts`, `src/types/postz.ts` (full type set: `PostzProvider` union,
  `PostzChannel`, `PostzPost`, `PostzMediaRef`, `PostzPoll`, states, etc.).
- Components under `src/components/postz/`: `PostzCalendar`, `PostComposer`, `ChannelRail`,
  `AddChannelDialog`, `CompleteChannelDialog`, `SchedulePopover`, `MediaPicker`, `PostPreview`,
  `StatePills`, `postzMeta.ts`. ⚠️ `legacy-pages/Postz.tsx:101` consumes the `wzrd://` callback
  (`status === "needs_target"`) — must also handle the **web** callback (Section 5).
- Media: `useAssets({ assetCategory:['finalized'], assetType:['video'] })` over `project_assets`
  (`cdn_url`, `storage_path`, `media_metadata`). A web media-URL helper already exists at
  `src/app/api/_lib/media-url.ts`.

---

## 3. Target architecture (end state on Vercel)

```
                 Browser (Vercel-served Next.js shell, NextClientShell)
                 /postz  →  PostzCalendar + PostComposer + ChannelRail
                        |  supabase.functions.invoke(...)  (Bearer = Supabase session JWT)
                        v
   Supabase Edge Functions (Deno)                       Supabase Postgres (RLS)
   ├─ postz-channels   list / seed                      ├─ postz_channels (tokens: *_ref, encrypted)
   ├─ postz-oauth      start / callback(GET) / finalize ├─ postz_posts (group_id, state, publish_date)
   ├─ postz-posts      CRUD / validate / find-slot /    ├─ postz_oauth_state (deny-all RLS)
   │                   post-now → invokes postz-publish  ├─ postz_publish_log (deny-all RLS)
   ├─ postz-publish    [NEW] publish core (per post)    └─ postz_analytics, tags, sets, signatures
   └─ postz-scheduler  [NEW] drain due posts            
                        ^
                        |  pg_net.http_post (service-role)         Social platform APIs
   pg_cron (every min) ─┘                                ──────────►  TikTok / X / Meta / YouTube / …
                                                          provider.post() pulls media by HTTPS URL
```

Key web-specific seams:

### 3.1 Web OAuth callback (replaces `wzrd://`)
- The **provider redirect_uri** (registered in each platform's developer app) stays the Supabase
  function URL: `https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/postz-oauth`.
- The **app return** must be environment-aware. The client passes its own origin when starting
  OAuth; the GET callback 302s back to it:
  - Web/Vercel → `https://<app-origin>/postz/connected?status=…&provider=…&channel=…`
  - Desktop/Electron → `wzrd://postz/connected?status=…` (unchanged)
- See Section 5 for the exact mechanism.

### 3.2 Media resolution (pull model)
Social platforms fetch media **by public HTTPS URL** (TikTok `PULL_FROM_URL`, IG container
`video_url`, etc.). There is no `wzrd://media` on the web. The publish core must resolve each
`postz_posts.media[].asset_id` → a **publicly fetchable** URL (prefer `project_assets.cdn_url`; else
a time-boxed Supabase signed URL). Reuse/extend `src/app/api/_lib/media-url.ts` logic server-side.
Media must be **pre-resolved to URLs**, never base64-inlined (mirrors Postiz's 413 guidance, 3.4).

### 3.3 Auth & secrets
- Client auth unchanged: Thirdweb wallet → Supabase session; edge functions call
  `authenticateRequest(req.headers)` (`_shared/auth.ts`).
- Token material is encrypted at rest (`crypto.ts`) and stored as `*_ref` on `postz_channels`;
  `postz-channels.list` never returns it. Platform app secrets live as **Supabase function
  secrets** (Appendix B), never in the client bundle, never in Vercel public env.

### 3.4 What to borrow from the Postiz public API (reference only — never called)
The hosted Postiz API (`api.postiz.com`, requires a key — **we do not use it**) documents a clean
post model worth adopting natively for the composer + `postz_posts.settings`:

- **Post envelope:** `{ type: "schedule" | "now", date, shortLink, tags[], posts: [...] }`.
  Map `type:"now"` → `post-now`; `type:"schedule"` → `state:"QUEUE"` at `publish_date`.
- **Per-channel entry:** `{ integration:{id}, value: [{ content, image:[{id,path}] }], settings:{ __type, … } }`.
  `value[]` is a **thread** (one element per thread segment) → maps to `postz_posts.parent_post_id`
  chains. `image[]` is **pre-uploaded** media (`{id, path}`) → our resolved media URLs.
- **`settings.__type` discriminator** per platform — adopt this exact shape in
  `postz_posts.settings` so the composer and `validateAgainstCapabilities` are platform-aware:
  - `x`: `who_can_reply_post`, `community`
  - `tiktok`: `privacy_level`, `duet`, `stitch`, `comment`, `autoAddMusic`,
    `brand_content_toggle`, `brand_organic_toggle`, `content_posting_method`
  - `youtube`: `title`, `type`, `selfDeclaredMadeForKids`, `thumbnail`, `tags`
  - `instagram` / `instagram-standalone`: `post_type`, `collaborators`
  - `linkedin` / `linkedin-page`: `post_as_images_carousel`
  - `facebook`: `url` (optional)
  - `threads` / `mastodon` / `bluesky` / `telegram`: `{ "__type": "<name>" }` only
- **Media discipline:** pre-upload, reference by URL; a >50 MB JSON body means media was inlined
  (don't). This validates the pull-model design in 3.2.

---

## 4. "Works out of the box" — exact behavior

The page must be **useful on a fresh deploy** and **never crash** when a provider's keys are absent.

1. **Provider availability** is driven by `listProviders()`. ⚠️ Today it returns only
   `{identifier, name, configured}`, where `configured` just means env vars are present — a **stub**
   provider with keys set would still show a Connect button that throws on `generateAuthUrl`. **Add
   an `implemented` flag** to the registry/`ProviderSummary` (true only for auth-complete providers)
   and gate on `implemented && configured`. `AddChannelDialog` shows:
   - `implemented && configured` → active **Connect** button (runs real OAuth).
   - `implemented && !configured` → disabled with a quiet "Add API keys to enable" operator hint,
     **never** an error. Never expose key fields to end users.
   - `!implemented` → hidden or shown as "Coming soon"; never connectable.
2. **First-run with zero providers configured:** the calendar still renders; `postz-channels.seed`
   can populate demo channels so the composer/calendar are explorable. A dismissible banner:
   "Connect a real account to start publishing."
3. **No Postiz key, ever.** There is no Postiz-account concept, no `api.postiz.com` call, no
   `POSTIZ_API_KEY`. The only secrets are the per-platform OAuth app credentials the operator sets
   once (Appendix B).
4. **Operator setup is documented, not coded into the UX.** Adding `POSTZ_TIKTOK_CLIENT_ID` +
   `POSTZ_TIKTOK_CLIENT_SECRET` (and the redirect URI in TikTok's dev console) is all it takes for
   "Connect TikTok" to light up for every end user.

---

## 5. Phase 1 detail — Web OAuth callback (the Vercel unblock)

**Problem:** `postz-oauth` GET callback hardcodes `redirectResponse("wzrd://postz/connected?…")`.
On Vercel the browser can't follow `wzrd://`.

**Fix (environment-aware app return):**

1. **Client (`startOauth`)** passes its return origin. Extend the `start` body with
   `app_return_url` (e.g. `${window.location.origin}/postz/connected`). On desktop this stays
   `wzrd://postz/connected`. `postzService.startOauth` and `AddChannelDialog` set it.
2. **`postz-oauth` `start`** persists `app_return_url` into `postz_oauth_state` (add a nullable
   `app_return_url text` column via a **new** migration — never edit existing ones; keep using the
   existing `redirect` column for the provider's `redirect_uri`).
3. **`postz-oauth` GET callback** builds the final redirect from the stored `app_return_url`
   (fallback `wzrd://postz/connected` if null, so desktop is unchanged). Preserve all query params
   (`status`, `provider`, `channel`, `state_id`, `error`). Validate `app_return_url` against an
   **allow-list** (`PUBLIC_WEB_URL`, `wzrd://`, localhost in dev) to prevent open-redirect.
4. **Client landing route `/postz/connected`** under `NextClientShell`: reads the query params,
   finalizes `needs_target` (calls `list-targets` + `finalize` via `CompleteChannelDialog`), shows
   success/error toast, invalidates the channels query, and routes back to `/postz`. Generalize the
   existing `legacy-pages/Postz.tsx:101` handler so it fires from the web query params too (not only
   the Electron deep-link event).
5. **Per-platform redirect URI** (`PUBLIC_OAUTH_CALLBACK_URL`, default the Supabase function URL)
   must be registered in each provider's developer console. Document in Appendix B.

**Acceptance:** On the deployed Vercel URL, clicking **Connect** for one configured provider (start
with **X** or **TikTok**) completes OAuth, returns to `/postz/connected`, and the account appears in
the Channels rail with `status:"connected"`. Desktop deep-link flow still works.

---

## 6. Phase 2 detail — Publish core (`postz-publish`)

New edge function `supabase/functions/postz-publish/index.ts`. Authenticated for `post-now`
(user JWT); callable by the scheduler with the **service-role key** (internal).

**Contract (action-dispatch, like `sourcify-apify`):**
- `{ action: "publish-post"; post_id }` — publish one `postz_posts` row.
- `{ action: "publish-group"; group_id }` — publish all due rows in a group (the `post-now` path).

**Per-post algorithm:**
1. **Claim** the row idempotently: conditional update `state = 'PUBLISHING'` **only if** current
   state ∈ {`QUEUE`,`DRAFT`(for post-now)} and `deleted_at is null`. If no row updated, another
   worker owns it — skip (prevents double-publish under scheduler/post-now overlap).
2. Load `postz_channels` row; `decryptToken(token_ref)`. If `token_expires_at` is near/past and a
   `refresh_token_ref` exists, call `provider.refreshToken(...)`, re-encrypt, persist.
3. **Resolve media:** map `media[].asset_id` → public/signed HTTPS URLs (Section 3.2). Validate
   against `provider.capabilities` (`validateAgainstCapabilities`); fail fast with a clear `error`.
4. Build `PostDetails[]` (content, resolved media, `settings` incl. `__type`, poll). Handle
   **threads** via `parent_post_id` ordering and **first_comment** via `provider.comment?.(...)`.
5. Call `provider.post(channel, accessToken, postDetails)`.
6. **On success:** `state='PUBLISHED'`, set `release_url` + `release_provider_id`; write
   `postz_publish_log` (`outcome:'success'`, `attempt`).
7. **On failure:** `state='ERROR'`, set `error`, increment `attempts`; write `postz_publish_log`
   (`outcome:'error'`, `detail`). Distinguish retryable (5xx/429/network) from terminal (4xx/auth)
   so the scheduler's retry policy can act.

**Phase 2 builds `post()` for the 4 auth-complete providers only** (`tiktok`, `x`, `youtube`,
`instagram`) — their connect flow already works, so this is the fastest path to a live post. Follow
each platform's publishing API and the patterns in `postizgoal.md` Appendix A / the Postiz source model:
- **TikTok:** `/v2/post/publish/video/init/` with `PULL_FROM_URL` → poll `/v2/post/publish/status/fetch/`; apply `privacy_level`, `disable_duet/stitch/comment`, brand toggles from `settings`.
- **Instagram (Reels):** create media container (`media_type=REELS`, `video_url`) → poll container status → `media_publish`. Honor `post_type`, `collaborators`.
- **YouTube:** resumable upload / `videos.insert` (`snippet.title/description/tags`, `status.selfDeclaredMadeForKids`); optional `thumbnail`.
- **X:** chunked media upload (v1.1 `media/upload` INIT/APPEND/FINALIZE for video) → create post (v2 `tweets`) with `who_can_reply_post`; threads via `reply.in_reply_to_tweet_id`.

> The remaining providers (`linkedin`, `linkedin-page`, `facebook`, `threads`, `instagram-standalone`,
> `bluesky`, `mastodon`, `discord`, `telegram`) are `notImplementedProvider` stubs — they need their
> **full** interface (`generateAuthUrl`/`authenticate`/`refreshToken`/`post`) built before they
> connect or publish. That work lands in Phase 4/6 (Appendix A), using the porting method in
> `postizgoal.md` §7. Don't assume any of them is a quick win.

**Wire `post-now`:** `postz-posts` `post-now` action invokes `postz-publish` `publish-group`. Add
`postzService.postNow(group_id)` and a **Post now** affordance in `PostComposer`/calendar.

**Acceptance:** A user composes to one connected channel, hits **Post now**, and the content appears
live on the platform within seconds; `release_url` is stored and surfaced; a `postz_publish_log` row
exists. Failure shows a clear error state and is retryable.

---

## 7. Phase 3 detail — Scheduler / auto-post (`postz-scheduler` + pg_cron)

New edge function `supabase/functions/postz-scheduler/index.ts` + a **new migration** that schedules
a `pg_cron` job (do not edit existing migrations).

**Cron → drain (every minute):**
```sql
-- new migration, e.g. 2026MMDDHHMMSS_postz_scheduler_cron.sql
select cron.schedule(
  'postz-drain',
  '* * * * *',
  $$
    select net.http_post(
      url     := 'https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/postz-scheduler',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
      ),
      body    := jsonb_build_object('action','drain')
    );
  $$
);
```
> Use the project's existing pattern for injecting the service-role key into pg_cron (a Vault
> secret or DB setting) — do **not** hardcode it in the migration. If the repo already has a
> pg_cron→edge-function example, mirror it exactly.

**`postz-scheduler` `drain`:**
1. Select due work: `postz_posts` where `state='QUEUE'` and `publish_date <= now()` and
   `deleted_at is null`, ordered by `publish_date`, **limited** per tick (e.g. 50) — uses the
   existing `(state, publish_date)` index.
2. For each due post, invoke `postz-publish` `publish-post` (service-role). The publish core's
   conditional `QUEUE→PUBLISHING` claim guarantees idempotency if ticks overlap.
3. **Retries:** re-`QUEUE` `ERROR` rows with `attempts < MAX_ATTEMPTS` (e.g. 3) and a backoff
   window; leave terminal failures in `ERROR`.
4. **Recurrence:** after a `PUBLISHED` post with `interval_in_days`, clone the next occurrence
   (`publish_date += interval_in_days`, fresh `group_id`/rows, `state='QUEUE'`).
5. **Maintenance (same drain or a second cron):** refresh tokens nearing expiry and mark channels
   `needs_reauth` when refresh fails.

**Acceptance:** A post scheduled 2 minutes out **publishes automatically with the app closed**;
calendar reflects `QUEUE → PUBLISHING → PUBLISHED`; a transient failure retries and eventually
succeeds or lands in `ERROR` with detail; a recurring post spawns its next occurrence.

---

## 8. Phase 4 detail — Composer enrichment & media

- Adopt the **`settings.__type`** model (3.4) in `postz_posts.settings`; render per-platform setting
  panels in `PostComposer` only for selected channels; drive `validate` from
  `provider.capabilities`.
- **Threads** (`value[]` → `parent_post_id` chain), **first comment**, and **polls** where the
  platform supports them.
- **Finalized-asset media picker on web:** `MediaPicker` lists `useAssets({ assetCategory:
  ['finalized'] })`; selection stores `{asset_id}` refs; the publish core resolves URLs server-side.
  Add an upload path for new media (Supabase Storage → `project_assets`).
- **Per-platform live previews** (`PostPreview`) that mimic each network.
- **Recommended slots:** surface `find-slot` (`computeNextSlot` over `posting_times`) in
  `SchedulePopover`.

---

## 9. Phase 5+ — Analytics & AI copilot (after the pipe is solid)

- **`postz-analytics`** edge function + a cron pass writing `postz_analytics` rows from each
  provider's `analytics?()`; per-post and per-channel views in the UI.
- **`postz-ai`** copilot/generator reusing the repo's AI gateway pattern (GMI/fal/Groq) to draft
  and adapt copy per platform. Set `creation_method='ai'`.

---

## 10. Non-negotiable guardrails (from `agents.md` — violations fail review)

- **Do not** modify `src/integrations/supabase/types.ts` (auto-generated).
- **Do not** edit any file under `supabase/migrations/` after creation — **add new** timestamped
  migrations only (the OAuth `app_return_url` column and the cron job are new migrations).
- **No** raw SQL via `supabase.rpc('execute_sql', …)`; **no** direct `auth.users` queries from
  client or edge functions.
- Keep all provider secrets and tokens **server-side**; never ship them to the browser or to Vercel
  public env. `postz-channels.list` must keep excluding token columns.
- Reuse `_shared/auth.ts` (`authenticateRequest`) and `_shared/response.ts` (`corsHeaders`,
  `handleCors`, `successResponse`, `errorResponse`, `safeErrorResponse`). New functions follow the
  single action-dispatch shape of `sourcify-apify`/`postz-posts`.
- Respect RLS: `postz_oauth_state` and `postz_publish_log` are deny-all to clients (service role
  only).
- Don't fork the Postz page for web vs desktop — branch on the platform seam, not the component.

---

## 11. Vercel deployment notes

- Postz adds **no new Vercel route handlers** and no long-running serverless work — the heavy/async
  posting runs in **Supabase** (edge functions + pg_cron), so Vercel function time limits
  (`goal-vercel.md` §8.3) are not a constraint here.
- Set **`PUBLIC_WEB_URL`** to the production Vercel origin (and include preview origins in the OAuth
  allow-list as needed). The OAuth callback allow-list (Section 5) must include it.
- Platform OAuth apps must register the **Supabase function callback** as the redirect URI
  (Appendix B), not the Vercel URL — the Vercel URL is only the *app return* after the callback.
- Confirm `/postz` renders the real calendar under `NextClientShell` in a production build
  (`bun run web:build && bun run web:start`) before wiring providers.

---

## 12. Phased delivery plan (build in order)

| Phase | Outcome | Key acceptance |
|------|---------|----------------|
| **0 — Baseline** | `/postz` renders the real UI on Vercel under `NextClientShell`; inventory confirmed; no regressions. | `web:build` clean; calendar + channels render on the deployed URL with demo seed. |
| **1 — Web OAuth** | Env-aware callback; `/postz/connected` landing; connect 1 real provider on Vercel. | One configured provider connects end-to-end on the deployed URL; desktop deep-link unbroken; out-of-box provider gating works. |
| **2 — Publish core** | `postz-publish` + `post()` for the video-first set; **Post now** path. | Post-now goes live on ≥3 providers; `release_url` + `postz_publish_log` recorded; clean error states. |
| **3 — Scheduler** | `pg_cron` → `pg_net` → `postz-scheduler`; auto-publish; retries; recurrence. | Scheduled post publishes with app closed; `QUEUE→PUBLISHING→PUBLISHED`; retry + recurrence verified. |
| **4 — Composer enrich** | `settings.__type` panels, threads, first-comment, polls, finalized-asset media + upload, previews, recommended slots. | Per-platform validation; finalized video posts to TikTok/IG/YouTube. |
| **5 — Analytics + AI** | `postz-analytics` + `postz-ai`. | Per-post metrics populate; AI drafts per-platform copy. |
| **6 — Long-tail + hardening** | Remaining providers; rate-limit/backoff; reauth UX; load test. | Added providers connect + publish; scheduler stable under volume. |

---

## 13. Testing & verification

Run from repo root: `bun run lint`, `bun run build`, `bun run web:build`, `bunx vitest run`.

- **Unit:** `validateAgainstCapabilities` per platform; `computeNextSlot`; OAuth `app_return_url`
  allow-list (reject open-redirects); publish-core state transitions (claim/idempotency); recurrence
  date math; media-URL resolution (cdn vs signed).
- **Provider `post()`** against mocked platform HTTP (success, 4xx terminal, 429/5xx retryable).
- **Scheduler:** due-selection query; overlap idempotency; retry/backoff; recurrence cloning.
- **E2E (Playwright, `tests/e2e`):** `/postz` renders on web shell; AddChannel gating
  (configured vs not); connect flow returns to `/postz/connected`; compose → Post now → published
  state; schedule → (fast-forwarded) auto-publish.
- **Manual smoke on deployed Vercel URL:** connect one real account; post-now a small media item;
  schedule one 2 min out and confirm auto-post.

---

## 14. Definition of done

A user on the deployed Vercel app connects TikTok/X/Instagram with one click (no keys), composes and
schedules a post with a finalized video, and WZRD **auto-publishes it at the scheduled time with the
app closed**, recording the live URL — with **no Postiz API key and no self-hosted Postiz anywhere**,
and `lint` / `build` / `web:build` / `vitest` green.

---

## Appendix A — Provider matrix

| Provider | `identifier` | `__type` | Auth today | Phase 2 work | Later work | Notes |
|---|---|---|---|---|---|---|
| TikTok | `tiktok` | `tiktok` | ✅ real | build `post()` | — | `PULL_FROM_URL` + status poll; privacy/brand toggles |
| X | `x` | `x` | ✅ real | build `post()` | — | chunked video upload; `who_can_reply_post`; threads |
| YouTube | `youtube` | `youtube` | ✅ real | build `post()` | — | resumable upload; madeForKids |
| Instagram (FB) | `instagram` | `instagram` | ✅ real | build `post()` | — | Reels container → publish |
| Instagram standalone | `instagram-standalone` | `instagram-standalone` | ❌ stub | — | build full provider | container → publish |
| LinkedIn | `linkedin` | `linkedin` | ❌ stub | — | build full provider | asset register/upload |
| LinkedIn Page | `linkedin-page` | `linkedin-page` | ❌ stub | — | build full provider | page token via `finalizeTarget` |
| Facebook | `facebook` | `facebook` | ❌ stub | — | build full provider | page video/feed |
| Threads | `threads` | `threads` | ❌ stub | — | build full provider | settings-light |
| Bluesky | `bluesky` | `bluesky` | ❌ stub | — | build full provider | settings-light |
| Mastodon | `mastodon` | `mastodon` | ❌ stub | — | build full provider | `custom_instance_url` |
| Discord | `discord` | `discord` | ❌ stub | — | build full provider | webhook |
| Telegram | `telegram` | `telegram` | ❌ stub | — | build full provider | bot send |

"Auth today" = whether `generateAuthUrl`/`authenticate`/`refreshToken` are implemented. ✅ real = the
provider connects now and only needs `post()`. ❌ stub = `notImplementedProvider` (all methods throw);
needs the full interface built via the `postizgoal.md` §7 porting method before it connects or posts.

## Appendix B — Supabase function secrets (operator sets once; no Postiz key)

Exact env var names are declared by each provider's `requiredEnvVars` (verified in-repo). Set only
the providers you want enabled — others degrade gracefully (Section 4).

**Auth-complete (set these for v1 — note X uses `API_KEY/API_SECRET`, not `CLIENT_ID`):**
```
POSTZ_TIKTOK_CLIENT_ID / POSTZ_TIKTOK_CLIENT_SECRET
POSTZ_X_API_KEY / POSTZ_X_API_SECRET                          # X is OAuth1.0a-style here
POSTZ_YOUTUBE_CLIENT_ID / POSTZ_YOUTUBE_CLIENT_SECRET         (Google app)
POSTZ_INSTAGRAM_CLIENT_ID / POSTZ_INSTAGRAM_CLIENT_SECRET     (Meta app)
```
**Stub providers (only meaningful once the provider is implemented):**
```
POSTZ_INSTAGRAM_STANDALONE_CLIENT_ID / POSTZ_INSTAGRAM_STANDALONE_CLIENT_SECRET
POSTZ_LINKEDIN_CLIENT_ID / POSTZ_LINKEDIN_CLIENT_SECRET
POSTZ_LINKEDIN_PAGE_CLIENT_ID / POSTZ_LINKEDIN_PAGE_CLIENT_SECRET
POSTZ_FACEBOOK_CLIENT_ID / POSTZ_FACEBOOK_CLIENT_SECRET       (Meta app)
POSTZ_THREADS_CLIENT_ID / POSTZ_THREADS_CLIENT_SECRET
POSTZ_BLUESKY_CLIENT_ID / POSTZ_BLUESKY_CLIENT_SECRET
POSTZ_MASTODON_CLIENT_ID / POSTZ_MASTODON_CLIENT_SECRET
POSTZ_DISCORD_CLIENT_ID / POSTZ_DISCORD_CLIENT_SECRET
POSTZ_TELEGRAM_CLIENT_ID / POSTZ_TELEGRAM_CLIENT_SECRET
```
Platform/infra:
```
PUBLIC_WEB_URL                 # production Vercel origin, e.g. https://app.wzrd.studio
PUBLIC_OAUTH_CALLBACK_URL      # default https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/postz-oauth
POSTZ_TOKEN_ENC_KEY            # symmetric key used by _shared/postz/crypto.ts
SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   # already present; used by edge fns + pg_cron drain
```
**Register `PUBLIC_OAUTH_CALLBACK_URL` as the redirect URI in each platform's developer console.**
There is intentionally **no `POSTIZ_API_KEY`** — Postz never calls a Postiz service.

## Appendix C — Source → target file map

| Path | State | Action |
|---|---|---|
| `src/app/postz/page.tsx` → `@/next/RouteShellPage` | ✅ exists | Verify renders real UI on Vercel (Phase 0) |
| `src/app/AuthenticatedRoutes.tsx` (`/postz`, `/postz/connected`) | ✅ `/postz` | **Add** `/postz/connected` route (Phase 1) |
| `src/services/postzService.ts` | ✅ exists | **Add** `postNow`; pass `app_return_url` in `startOauth` |
| `src/components/postz/*` | ✅ exists | Enrich composer/settings/media/previews (Phase 4) |
| `src/legacy-pages/Postz.tsx` | ✅ exists | Generalize callback handler for web query params (Phase 1) |
| `supabase/functions/postz-oauth/index.ts` | ✅ exists | Env-aware redirect + allow-list (Phase 1) |
| `supabase/functions/postz-posts/index.ts` | ✅ exists | `post-now` → invoke `postz-publish` (Phase 2) |
| `supabase/functions/_shared/postz/providers/*.ts` | ✅ auth only | Implement `post()` (Phase 2) |
| `supabase/functions/postz-publish/index.ts` | ❌ new | Publish core (Phase 2) |
| `supabase/functions/postz-scheduler/index.ts` | ❌ new | Drain + retries + recurrence (Phase 3) |
| `supabase/functions/postz-analytics/index.ts` | ❌ new | Analytics polling (Phase 5) |
| `supabase/functions/postz-ai/index.ts` | ❌ new | AI copilot (Phase 5) |
| `supabase/migrations/<new>_postz_oauth_app_return.sql` | ❌ new | `app_return_url` column (Phase 1) |
| `supabase/migrations/<new>_postz_scheduler_cron.sql` | ❌ new | `cron.schedule('postz-drain', …)` (Phase 3) |
| `src/app/api/_lib/media-url.ts` | ✅ exists | Reuse for server-side media resolution (Phase 2) |

## Appendix D — Codex working agreement

- Read `agents.md` and `.codex/codex.md` first. Build in phase order; keep each phase green
  (`lint`, `build`, `web:build`, `vitest`) before moving on.
- New edge functions mirror `sourcify-apify`/`postz-posts` structure and reuse `_shared` helpers.
- New DB changes = **new migrations only**; never touch existing migrations or
  `src/integrations/supabase/types.ts`.
- Treat the Postiz public API as a **design reference only** — no runtime calls, no API key.
- When a platform's publishing API is ambiguous, prefer the smallest correct call that produces a
  live post, log the raw provider response into `postz_publish_log.detail`, and iterate.
