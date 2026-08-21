# WZRDOS Integration Goal Spec (v2): wzrdclaw2.0 (Neon/Redis brain) ⇄ WZRD.Studio (Supabase) on one Vercel domain (`goal-wzrd.md`)

> Build doc for Codex. Same contract as `goal.md` / `goal-vercel.md` / `goal-social.md`: verified
> ground truth, then end-state architecture, then phased file-level tasks with acceptance gates.
> **v2 supersedes v1.** v1 assumed a single Supabase backend (porting wzrdclaw off Neon/Redis).
> That is reversed here: **wzrdclaw keeps its Neon + Redis backend** and is **extended with a
> Supabase integration layer**. Target is the **Vercel web deploy** (not the Electron desktop app).

---

## 0. Decisions locked (do not re-litigate)

1. **Two apps, two backends, one domain — web/Vercel only.**
   - **WZRD.Studio** (this repo, `WZRD.Studio-Desktop-v0-main`) = the host the user sees. Stays on
     **Supabase** (`ixkkrousepsiorwlaycp`). Owns the apex domain and everything **except** `/dashboard/*`.
     We build for the **Vercel web deploy**; ignore Electron/desktop parity for this work.
   - **wzrdclaw2.0** (`wzrdclaw2.0-main`, "trustclaw") = the **WZRDOS brain**. **Keeps** Next.js +
     tRPC + **Prisma/Neon** (Postgres + pgvector) + **Redis** + Composio + the AI agent. Deployed as
     its **own Vercel app**, mounted at **`/dashboard/*`** via **Next.js Multi-Zones**.
2. **Surfacing = Multi-Zones (same-origin), not iframe.** Studio rewrites `/dashboard/*` →
   the wzrdclaw zone; wzrdclaw runs with `basePath:'/dashboard'` + `assetPrefix`. Same origin ⇒
   shared cookies/session, real SSO, no postMessage gymnastics. (iframe is the fallback only.)
3. **One login: thirdweb → Supabase session is the sole identity.** **Drop better-auth** from
   wzrdclaw's request path. wzrdclaw's tRPC context **verifies the Supabase JWT** (from the shared
   cookie / `Authorization: Bearer`) and keys its Neon rows by the **Supabase user id**. The session
   is shared across both zones via **cookie storage (`@supabase/ssr`)** at the apex domain (Studio's
   browser client moves from localStorage → cookies; contained change in the Supabase client config).
4. **Supabase becomes wzrdclaw's integration layer (the "added functionality").** wzrdclaw gains a
   **service-role Supabase client** so its agent + tools can read/write the Studio's Supabase data:
   `postz_posts` (schedule/calendar), `project_assets` (clips/media), `postz_channels` (Composio
   channels), `profiles` (identity). Per-user scoping is enforced **in wzrdclaw** (service role
   bypasses RLS).
5. **Composio lives only in wzrdclaw** (it already does). Connect + publish + agent tools all use
   wzrdclaw's Composio client. The Studio `/postz` "connect socials" UI calls **wzrdclaw** to
   authorize; on success wzrdclaw writes a `postz_channels` row (`connection_mode='composio'`) into
   Supabase so the **existing** Studio calendar/composer shows it. No second Composio integration.
6. **Autopost worker runs in wzrdclaw.** Extend wzrdclaw's existing **Vercel-cron** worker (pattern
   of `src/app/api/cron/trustclaw/route.ts`, `CRON_SECRET`, Redis lock) to **drain due Supabase
   `postz_posts`** and publish via Composio, writing status + `postz_publish_log` back to Supabase.
   (Alternative noted in §8.6: Supabase `pg_cron` → call a wzrdclaw publish endpoint. We choose
   wzrdclaw-cron because Composio + Redis locks + cron all already live there.)
7. **Profiles are dual-written and synced.** Onboarding writes **both** Supabase `profiles` **and**
   wzrdclaw Neon (`OnboardingState` + `ComposioClawInstance`). Field ownership + a sync contract are
   defined in §3.5 (identity/display ← Supabase canonical; agent persona ← Neon canonical; mirror
   each way, last-write-wins by `updated_at`).
8. **Reuse, additive only.** Reuse the Studio's existing Postz tables/calendar/scheduler and the
   `profiles` table; reuse wzrdclaw's existing onboarding/agent/Composio code. Do **not** edit
   existing Supabase migrations. The only Supabase schema change is additive columns on
   `postz_channels`. wzrdclaw schema changes go through its own Prisma migrations.

---

## 1. Mission & product outcome

On one Vercel domain, a creator:

- Sees three new left-nav destinations — **WZRDOS** (`/dashboard`) and **Integrations**
  (`/dashboard/toolkits`) above **IP Vault**, and **Settings** (`/dashboard/settings`) above
  **Favorites**. All three are served by the **wzrdclaw zone** (multi-zone), inside the Studio chrome.
- **Onboards** on first sign-in (in the wzrdclaw dashboard): name, username, profile pic; 4–5
  context questions (goals/style/personality, from wzrdclaw's existing wizard); connect Gmail,
  TikTok, Instagram, X via Composio; personalized welcome animation. Onboarding **dual-writes** to
  Supabase `profiles` and Neon. The **profile pic + username replace the wallet address in the left
  nav**; the **wallet address moves to Settings**.
- Uses **WZRDOS** to chat naturally and have the agent **act across the app with their connected
  apps** — *"source/generate 10 clips for my launch and schedule them across my socials this week."*
  The agent (wzrdclaw, Neon/Redis) generates/sources clips into the Studio's `project_assets`,
  **schedules** them as Supabase `postz_posts` (they appear on the **Studio Postz calendar** for
  optional editing), and **autoposts** them via Composio at their times — **driven by wzrdclaw's
  cron, with the user's browser closed.**

**Outcome:** wzrdclaw is the agentic brain (Neon/Redis); Supabase is the shared studio data plane;
Composio is the secure bridge to the user's accounts; the user experiences one app on one domain.

---

## 2. Ground truth — verified facts

### 2.1 WZRD.Studio (host) — verified
- Triple-target repo, but **we ship the Vercel web build** here: Vite SPA (`src/App.tsx` →
  `src/app/AuthenticatedRoutes.tsx`, React Router) wrapped by Next.js ^16 shells
  (`src/app/**/page.tsx` = `export { default } from "@/next/RouteShellPage"` → client-loads `@/App`).
- Supabase project **`ixkkrousepsiorwlaycp`** (`supabase/config.toml`); browser client
  `src/integrations/supabase/client.ts` (**currently localStorage** session — moves to cookies, §0.3).
  Generated schema mirror `src/integrations/supabase/types.ts`.
- **Auth:** `src/providers/AuthProvider.tsx` — thirdweb `useActiveAccount()` → sign → edge function
  **`wallet-auth`** → `supabase.auth.setSession()`. Wallet address = `thirdwebAccount.address`,
  persisted to `profiles.wallet_address`.
- **`profiles` table** (RLS, owner = `auth.users.id`): `id, username, full_name, avatar_url,
  onboarding_completed, wallet_address, wallet_type, last_wallet_connection, personality_type,
  ai_preferences jsonb, connected_accounts jsonb, uploaded_files jsonb, created_at, updated_at`.
- **Postz pipeline already built** (`goal-social.md`): tables `postz_channels`, `postz_posts`
  (`group_id`, `state DRAFT→QUEUE→PUBLISHING→PUBLISHED|ERROR`, `publish_date`, `media jsonb`, idx
  `(state, publish_date)`), `postz_oauth_state`, `postz_publish_log`, `postz_analytics`. Edge fns
  `postz-channels`, `postz-oauth`, `postz-posts` (CRUD/validate/find-slot/post-now). Client
  `postzService.ts`, `usePostz.ts`, `components/postz/*` (incl. `PostzCalendar`, `PostComposer`,
  `AddChannelDialog`, `SchedulePopover`, `MediaPicker`). pg_cron/pg_net enabled; a native scheduler
  migration exists (`20260621151330_postz_native_scheduler_v1.sql`).
- **Nav** single source: `src/components/home/navConfig.ts` (`APP_NAV_ITEMS`; IP Vault in `main`,
  Favorites in `extra`); rendered by `Sidebar.tsx` / `MobileSidebarDrawer.tsx`; routes in
  `src/lib/routes.ts`. Nav footer identity = `WorkspaceSwitcher.tsx` (currently email-derived).
- Media for posts: `useAssets({ assetCategory:['finalized'], assetType:['video'] })` over
  `project_assets` (`cdn_url`, `storage_path`); web media-URL helper `src/app/api/_lib/media-url.ts`.

### 2.2 wzrdclaw2.0 (WZRDOS brain) — verified, KEPT
- Next.js App Router + tRPC + **Prisma/Neon** + **Redis** + better-auth + **Composio** + Vercel
  **`ai`** SDK. Routes under `src/app/(authenticated)/dashboard/`: `page.tsx` (onboarding **or**
  `TrustClawChat`), `toolkits/page.tsx`, `settings/page.tsx`; `_components/` (chat, onboarding,
  terminal, tool-results, `dashboard-navbar`).
- **Auth seam (single change point):** `src/server/api/trpc.ts` `createTRPCContext` →
  `auth.api.getSession({ headers })` → `ctx.session`; `protectedProcedure` requires it. **Swap this
  one function** to verify the Supabase JWT and produce `ctx.session.user.id = <supabase uid>`.
- **DB:** `src/server/clients/db.ts` = Prisma + `@prisma/adapter-pg` → Neon (`DATABASE_URL`,
  `sslmode=verify-full`). Models: `User, Session, Account, Verification` (better-auth — see §3.3),
  `ComposioClawInstance, Message, Memory(pgvector), CronJob, OnboardingState`.
- **Redis:** `src/server/clients/redis.ts` = ioredis (`REDIS_URL`, optional) — resumable streams,
  rate-limit storage, locks. Kept.
- **Cron:** `src/app/api/cron/trustclaw/route.ts` — Vercel cron (GET, `CRON_SECRET` bearer, fail
  closed), claims jobs with a `LOCK_TIMEOUT` lease, `computeNextRunSafe`. **The autopost drain
  extends this pattern.**
- **Composio:** `src/server/clients/composio.ts` (`new Composio({ apiKey, provider: VercelProvider })`).
  Connect flow (reused for /postz + onboarding):
  `getIntegrationAuthLinks.ts` (`session.authorize(slug) → redirectUrl`) + `checkConnectionStatus.ts`
  (`session.toolkits({toolkits}) → connection.isActive`). Onboarding toolkit set is swappable.
- **Agent:** `src/app/api/chat/route.ts` (AI SDK stream) → `routers/trustclaw/agent/{setup,
  system-prompt,tools}`; identity prompt assembled in `createInstance.ts:assembleIdentityPrompt`
  from onboarding fields. Models `src/lib/models.ts` (AI Gateway IDs; default
  `anthropic/claude-sonnet-4.5`).
- **Onboarding wizard** `dashboard/_components/onboarding/*` — steps `name, writing-style,
  personality, emoji, lore, model, integrations, telegram`; framer-motion + `OnboardingClawLogo` +
  `ProgressDots`; persists via tRPC `saveOnboardingState`.
- **`next.config.js`:** no `basePath`/rewrites yet (`transpilePackages: []`) — add multi-zone config (§3.1).
- Env (`src/env.js`): `COMPOSIO_API_KEY`, `CRON_SECRET`, `DATABASE_URL` (Neon), `REDIS_URL`,
  AI Gateway, `BETTER_AUTH_SECRET` (drop), Telegram (drop), rate-limit knobs.

### 2.3 The integration seam (why this is tractable)
- **One identity:** the Supabase JWT. Studio mints it (thirdweb→`wallet-auth`); wzrdclaw verifies
  it. A single tRPC-context edit (§2.2) removes better-auth from the path.
- **One data plane for studio objects:** Supabase. wzrdclaw reaches it with a service-role client.
- **One Composio owner:** wzrdclaw. Studio `/postz` and onboarding call wzrdclaw to connect.
- **One schedule store + calendar:** Supabase `postz_posts` (already rendered by `PostzCalendar`).
- **One autopost worker:** wzrdclaw cron (already exists; extend to drain Supabase posts).
- **Agent's private state stays in Neon** (instances, messages, pgvector memory, cron jobs, clip
  jobs) — no need to move it.

---

## 3. Target architecture (end state)

```
                         ONE VERCEL DOMAIN  (app.wzrd.studio)
   ┌──────────────────────────────────────────────────────────────────────────────┐
   │  WZRD.Studio zone (this repo)        rewrites /dashboard/* ─► wzrdclaw zone     │
   │  Vite SPA + Next shells              ┌───────────────────────────────────────┐ │
   │  /home /clipper /kanvas /postz …     │ wzrdclaw zone (basePath /dashboard)    │ │
   │  left-nav: WZRDOS·Integrations·      │ Next + tRPC + agent (AI SDK + Composio)│ │
   │            Settings ─────────────────►  /dashboard /dashboard/toolkits        │ │
   │  Postz calendar (reads postz_posts)  │  /dashboard/settings  + onboarding     │ │
   └───────────┬──────────────────────────┴───────────────┬───────────────────────┘ │
               │ Supabase JS (cookie session JWT)          │ tRPC (verifies Supabase JWT)
               ▼                                            ▼
   Supabase Postgres (ixkkrousepsiorwlaycp, RLS)   Neon Postgres (Prisma, pgvector) + Redis
   profiles · postz_channels(+composio) ·          ComposioClawInstance · Message · Memory ·
   postz_posts · postz_publish_log · project_assets CronJob · OnboardingState · ClipJob
               ▲                                            │  service-role Supabase client
               └──────────────── reads/writes ─────────────┘  (schedule posts, store clips, sync profile)
                                                            │  Composio (user's Gmail/TikTok/IG/X)
        wzrdclaw Vercel cron (1/min, Redis lock) ──drain due postz_posts──► Composio publish ─► platforms
```

### 3.1 Multi-zone surfacing (`/dashboard/*` → wzrdclaw)
- **Studio** (`next.config.ts`): add `async rewrites()` →
  `{ source:'/dashboard/:path*', destination:'https://<wzrdclaw-zone-url>/dashboard/:path*' }`
  (use a `WZRDCLAW_ZONE_URL` env). Keep the editor COEP headers untouched.
- **wzrdclaw** (`next.config.js`): set `basePath:'/dashboard'`, `assetPrefix:'/dashboard'`, and move
  its dashboard routes so they resolve under `/dashboard`. Its API stays under
  `/dashboard/api/*` (so the Studio can call it same-origin).
- Same origin ⇒ the Supabase **cookie** session (set by Studio) is sent to the wzrdclaw zone
  automatically. Sidebar items use plain `<a href="/dashboard…">` (hard nav into the zone);
  in-zone nav uses `next/link`.

### 3.2 Auth — one Supabase identity, better-auth removed from the path
- Studio: switch the Supabase browser client to **cookie storage** via `@supabase/ssr`
  (`createBrowserClient`), so the JWT is a cookie on the apex domain. `AuthProvider` keeps
  thirdweb→`wallet-auth`→`setSession`; only the storage adapter changes.
- wzrdclaw `src/server/api/trpc.ts`: replace `auth.api.getSession` with `verifySupabaseSession(headers)`:
  read the access token (cookie `sb-…-auth-token` or `Authorization: Bearer`), verify with
  `@supabase/supabase-js` `auth.getUser(token)` (or JWT-verify with the project JWT secret), then
  **upsert a Neon `User` row keyed by the Supabase uid** (so existing Prisma relations keep working)
  and return `ctx.session = { user: { id: supabaseUid, … } }`. `protectedProcedure` is unchanged.
- Remove `better-auth` usage (`src/server/auth.ts`, `/api/auth/[...all]`, `nextCookies`,
  `Account/Session/Verification` tables become inert — drop in a Prisma migration). Keep Redis for
  agent rate limits + resumable streams.

### 3.3 wzrdclaw's Supabase integration layer (the new functionality)
- New `src/server/clients/supabase.ts` — **service-role** client
  (`createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth:{ persistSession:false }})`).
  Used **only** server-side; every query is filtered by `ctx.session.user.id` (service role bypasses
  RLS, so wzrdclaw is responsible for scoping).
- New tRPC procedures (router `studio`) + agent tools wrapping it:
  `scheduleStudioPosts`, `listStudioChannels`, `upsertComposioChannel`, `listFinalizedAssets`,
  `recordClipAssets`, `getStudioProfile`, `syncStudioProfile` (→ §3.5).
- Studio data touched: `postz_posts` (create/update for scheduling), `postz_channels`
  (Composio channel rows), `project_assets` (read finalized clips; write generated ones via the
  Studio's asset edge functions), `profiles` (read/sync).

### 3.4 Composio (connect + publish + tools, all in wzrdclaw)
- **Connect** (reuse `getIntegrationAuthLinks`/`checkConnectionStatus`): expose for the Studio
  `/postz` connect UI and the onboarding integrations step. Toolkits = **gmail, tiktok, instagram,
  twitter (X)** (+ youtube/linkedin later). On `isActive`, wzrdclaw `upsertComposioChannel` writes
  `postz_channels` (`connection_mode='composio'`, `composio_account_id`, display fields) to Supabase.
- **Publish:** new wzrdclaw module `src/server/postz/publish.ts` — given a Supabase `postz_posts`
  row whose channel is Composio-backed, resolve `media[]` → **public HTTPS URLs** (Studio
  `project_assets.cdn_url` / signed URL; never base64-inline), then call the platform's Composio
  tool (tiktok video / instagram container+publish / X tweet / youtube upload) with caption +
  `settings.__type` options. Write `postz_publish_log`; flip `QUEUE→PUBLISHING→PUBLISHED|ERROR`.
- **Agent tools:** Composio `VercelProvider` tools scoped to the user — "act with their connected
  apps."

### 3.5 Profile dual-write + sync contract
- **Field ownership:** Supabase `profiles` is canonical for **display/identity** (`full_name`,
  `username`, `avatar_url`, `wallet_address`, `wallet_type`, `connected_accounts`,
  `onboarding_completed`). Neon `OnboardingState`/`ComposioClawInstance` is canonical for **agent
  persona** (writing style, personality, emoji, lore, model id, `identity_prompt`). Mirror the agent
  persona into `profiles.ai_preferences` (for display) and mirror display fields into Neon (for the
  agent's greeting).
- **Write paths:** onboarding writes both. A `syncStudioProfile` runs (a) at the end of onboarding,
  (b) on first authenticated request per session (reconcile): for each mirrored field, **last-write-
  wins by `updated_at`**; canonical owner wins ties. `connected_accounts` is recomputed from
  `postz_channels` on connect.
- Nav (`WorkspaceSwitcher`) reads Supabase `profiles`; the agent greeting reads Neon (kept in sync).

### 3.6 Secrets (already deployed + additions)
- **Already deployed** — reuse, don't reprint: Studio Supabase URL + anon **+ service-role** keys
  (service-role now also used by wzrdclaw), thirdweb config, `wallet-auth` material, existing
  `postz-*` keys, Supabase project JWT secret (for JWT verify). wzrdclaw's `COMPOSIO_API_KEY`,
  `DATABASE_URL` (Neon), `REDIS_URL`, `CRON_SECRET`, AI Gateway — already deployed for wzrdclaw.
- **Add to the wzrdclaw Vercel project:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SUPABASE_JWT_SECRET` (verify), and `STUDIO_APP_ORIGIN` (for media URL building / redirects).
- **Add to the Studio Vercel project:** `WZRDCLAW_ZONE_URL` (rewrites target). **No secret is ever
  `NEXT_PUBLIC_*`** beyond the existing public Supabase anon key + thirdweb client id.

---

## 4. Non-negotiable constraints / guardrails

1. **Web/Vercel only.** Do not add Electron/desktop work; do not gate features on desktop runtime.
2. **Keep wzrdclaw's backend.** Neon (Prisma + pgvector) + Redis stay. Do not port agent state to
   Supabase. Do not introduce a second Composio integration in the Studio.
3. **Additive on Supabase.** Do not edit existing Supabase migrations. Only new additive columns on
   `postz_channels`. Reuse `profiles`, `postz_*`, `project_assets`, the calendar.
4. **One identity.** Supabase JWT only. better-auth is removed from the request path; wzrdclaw keys
   Neon by the Supabase uid. No second login.
5. **Service role is server-only in wzrdclaw**, never shipped to the browser; every query scoped by
   `ctx.session.user.id`. Composio key + service-role key never `NEXT_PUBLIC_*`, never logged.
6. **Same-origin multi-zone** (not iframe) so the session cookie flows; sidebar → `/dashboard/*` is a
   hard nav into the zone.
7. **Media is pull-model** for publishing — resolve to public HTTPS URLs; never base64-inline.
8. **Works out of the box / never crash on missing keys.** Absent `COMPOSIO_API_KEY` ⇒ Connect
   buttons show a disabled "unavailable" hint, not an error (mirror `goal-social.md` §4 gating).
9. **One nav config** (`navConfig.ts`) drives the sidebar; the three new items hard-nav to the zone.
10. **Profiles stay in sync** per the §3.5 contract; never let the nav (Supabase) and the agent
    greeting (Neon) silently diverge.
11. **TS strict, no `any`** in changed code; regen Studio `types.ts` after the `postz_channels`
    migration; regen wzrdclaw Prisma client after its migrations; keep both apps' lint/build green.

---

## 5. Navigation changes (exact — Studio repo)

Single edit point: **`src/components/home/navConfig.ts`** `APP_NAV_ITEMS`. Items hard-nav into the
wzrdclaw zone (multi-zone), so their `route` is a plain path the Studio rewrites.

- **WZRDOS** — `{ id:'wzrdos', label:'WZRDOS', route:'/dashboard', icon: Sparkles|BrainCircuit, section:'main', mobilePlacement:'drawer', isActive: viewOrRouteActive('wzrdos','/dashboard') }` — **immediately above `ip-vault`**.
- **Integrations** — `{ id:'integrations', label:'Integrations', route:'/dashboard/toolkits', icon: Boxes|Plug, section:'main', mobilePlacement:'drawer', isActive: viewOrRouteActive('integrations','/dashboard/toolkits') }` — **directly under WZRDOS, still above `ip-vault`**.
- **Settings** — `{ id:'settings', label:'Settings', route:'/dashboard/settings', icon: Settings, section:'extra', mobilePlacement:'none' }` + a `SETTINGS_NAV_ITEM` export rendered **directly above** `FAVORITES_NAV_ITEM` in `Sidebar.tsx` and `MobileSidebarDrawer.tsx`.

Resulting **main** order: All Projects · Kanvas · Clipper · Sourcify · Postz · Aura · Asset Store ·
**WZRDOS** · **Integrations** · **IP Vault**. **extra**: **Settings** · Favorites.

Wiring:
- `src/lib/routes.ts`: add `wzrdos:'/dashboard'`, `integrations:'/dashboard/toolkits'`,
  `settingsApp:'/dashboard/settings'` + `ROUTE_MANIFEST` entries (category `core`). These are
  rewritten to the wzrdclaw zone (§3.1); clicking them performs a full navigation.
- **Sidebar click** for these three = hard nav (`window.location.assign(route)` or `<a href>`), not
  the SPA's `useNavigate` (which would 404 inside the SPA router). Keep all other items on the SPA router.
- **Profile-in-nav swap** (`WorkspaceSwitcher.tsx`): replace the email label + initials with
  `profiles.avatar_url` (image) + `profiles.username` (fallback `full_name`). **Remove the wallet
  address from the nav.** Add a `useProfile()` hook (TanStack Query over
  `supabase.from('profiles').select().eq('id', user.id).single()`). Wallet address now lives on
  Settings (§8.5).

---

## 6. Onboarding flow (exact — in the wzrdclaw zone, dual-write)

Lives in wzrdclaw's `/dashboard` (its existing wizard, extended). Triggers when Supabase
`profiles.onboarding_completed = false` **or** no Neon `ComposioClawInstance` for the user. Keep the
framer-motion animation, `OnboardingClawLogo`, `ProgressDots`, `StepLayout`. Swap persistence: each
step writes to Neon (existing `saveOnboardingState`) **and** mirrors identity fields to Supabase
`profiles` (§3.5).

**Steps:**
1. **Name** → Neon + `profiles.full_name`.
2. **Username** (new) → `profiles.username` (unique; validate via a `profiles` select) + Neon mirror.
3. **Profile pic** (new) → upload to Supabase Storage (`avatars/`) → `profiles.avatar_url` + Neon mirror.
4. **Context (4–5 Qs)** from wzrdclaw's wizard → Neon `OnboardingState`, mirrored to
   `profiles.ai_preferences`/`personality_type`:
   - **Goals** (new) → `ai_preferences.goals`.
   - **Writing style** (`lowercase|professional|friendly|playful`) → `ai_preferences.writing_style`.
   - **Personality** (`kind|sassy|energetic|curious`) → `profiles.personality_type`.
   - **Vibe emoji** (curated) → `ai_preferences.emoji`.
   - **Lore/backstory** → `ai_preferences.lore`.
   - (Model optional; default `anthropic/claude-sonnet-4.5` → `ai_preferences.model_id`.)
5. **Connect socials** — Composio integrations step (existing `integrations-step.tsx`) with toolkits
   **Gmail, TikTok, Instagram, X**. Authorize + poll via wzrdclaw Composio; on connect,
   `upsertComposioChannel` writes `postz_channels` (`connection_mode='composio'`) + updates
   `profiles.connected_accounts`. Skippable.
6. **Welcome** — personalized animation (greet by `full_name`, show `emoji` + persona, celebratory
   `OnboardingClawLogo`). On "Enter WZRDOS": create/finalize the Neon `ComposioClawInstance`
   (`assembleIdentityPrompt`), set `profiles.onboarding_completed = true`, route to `/dashboard` chat.

Resumable like today (Neon `OnboardingState.currentStep`); the new Supabase mirrors are best-effort
write-through (failures don't block the wizard; the reconcile in §3.5 repairs drift).

---

## 7. Phased execution plan (build in order)

**Phase 0 — Multi-zone + one-login substrate.** Branch both repos. Studio: switch Supabase client to
cookie storage (`@supabase/ssr`); add `WZRDCLAW_ZONE_URL` + `/dashboard/:path*` rewrite. wzrdclaw:
`basePath:'/dashboard'`, `assetPrefix`; swap `trpc.ts` context to `verifySupabaseSession` + Neon
`User` upsert; add `src/server/clients/supabase.ts` (service role) + secrets (§3.6). Gate: signing in
on the Studio domain, visiting `/dashboard` renders the wzrdclaw app **authenticated** (same session),
inside the Studio shell.

**Phase 1 — Nav + profile/wallet swap.** Studio: `navConfig.ts` (§5), `routes.ts`, `Sidebar.tsx`/
`MobileSidebarDrawer.tsx` (hard-nav items), `useProfile()`, `WorkspaceSwitcher` swap. Gate: three nav
items in the right positions route into the zone; nav shows avatar+username, not wallet.

**Phase 2 — Onboarding (dual-write).** wzrdclaw: add Username + Profile-pic steps; add Goals
question; mirror identity to `profiles` + Storage; `onboarding_completed` dual-set; `syncStudioProfile`
reconcile. Gate: fresh user completes onboarding; Neon **and** `profiles` populated; welcome →
`/dashboard`.

**Phase 3 — Composio connect in `/postz`.** Supabase migration: `postz_channels.connection_mode` +
`composio_account_id`. wzrdclaw: expose connect (`authorize`/`status`) + `upsertComposioChannel`.
Studio: wire `AddChannelDialog`/`ChannelRail` to call the wzrdclaw connect endpoints; channels render
on the rail. Gate: connect TikTok/IG/X/Gmail from `/postz` **and** onboarding; channels appear; missing
key ⇒ disabled hint, no crash.

**Phase 4 — Agent acts on Supabase data.** wzrdclaw: `studio` tRPC router + agent tools
(`listFinalizedAssets`, `scheduleStudioPosts`, `listStudioChannels`, `connectChannel`) over the
service-role client; Composio tools scoped to the user. Gate: in WZRDOS chat the agent reads the
user's finalized assets and performs a connected-app action (e.g., Gmail draft); messages persist in Neon.

**Phase 5 — Clips → schedule → calendar → autopost.** wzrdclaw: `ClipJob` Prisma model + tool
`generate_or_source_clips` (invoke Studio media edge fns → `project_assets`); `scheduleStudioPosts`
creates `postz_posts` (shared `group_id`, `QUEUE`, `find-slot` spread). Autopost: extend wzrdclaw
cron to drain due Supabase `postz_posts` and publish via `src/server/postz/publish.ts` (Composio),
writing status + `postz_publish_log`; Redis lock for idempotency; declare the cron in wzrdclaw
`vercel.json`. Gate: *"source 10 reels, schedule across my socials this week"* → 10 `QUEUE` posts on
the **Studio calendar** (editable) → they autopost via Composio at their times **with the browser
closed**; failures retry; `postz_publish_log` written.

**Phase 6 — Integrations + Settings pages.** wzrdclaw: `/dashboard/toolkits` (existing
`ToolkitsClient` — list/connect Composio toolkits) and `/dashboard/settings` (agent model/persona,
scheduled jobs/cron view, memories, **wallet address + wallet_type from `profiles`**, sign-out). Gate:
toolkits connect works; settings shows the wallet (moved from nav) and edits persona/model (synced).

**Phase 7 — Hardening.** Per-user scoping audit on every service-role query; Supabase `get_advisors`;
regen Studio `types.ts` + wzrdclaw Prisma client; remove dead better-auth/Telegram code; rate-limit
the chat path (Redis); e2e: login→/dashboard SSO, nav, onboarding, a scheduled-post smoke. Gate: §10
matrix green; §12 Definition of Done.

---

## 8. Detailed specs (file-level)

### 8.1 Multi-zone (Phase 0)
- **Studio `next.config.ts`** — add:
  ```ts
  async rewrites() {
    const zone = process.env.WZRDCLAW_ZONE_URL;          // e.g. https://wzrdclaw.vercel.app
    return [{ source: '/dashboard/:path*', destination: `${zone}/dashboard/:path*` }];
  }
  ```
  (Keep the existing editor COEP `headers()`.)
- **wzrdclaw `next.config.js`** — `basePath: '/dashboard'`, `assetPrefix: '/dashboard'`; ensure all
  dashboard routes + its API live under `/dashboard` (App Router respects `basePath`). CORS not
  needed (same origin via rewrite).

### 8.2 One-login seam (Phase 0) — wzrdclaw `src/server/api/trpc.ts`
```ts
// before: const session = await auth.api.getSession({ headers: opts.headers });
import { verifySupabaseSession } from "~/server/clients/supabase-auth";
const supa = await verifySupabaseSession(opts.headers);    // cookie sb-…-auth-token or Bearer
const session = supa ? { user: { id: supa.userId, email: supa.email } } : null;
if (session) await ensureNeonUser(supa);                    // upsert Neon User by supabase uid
return { db, headers: opts.headers, session };
```
- `src/server/clients/supabase-auth.ts`: `createClient(SUPABASE_URL, SERVICE_ROLE).auth.getUser(token)`
  (or `jwtVerify` with `SUPABASE_JWT_SECRET`) → `{ userId, email }`.
- `ensureNeonUser`: `db.user.upsert({ where:{ id: uid }, create:{ id: uid, … }, update:{} })` so
  Prisma FKs (`ComposioClawInstance.userId`, etc.) keep working with the Supabase uid as the key.
- Delete/disable `src/server/auth.ts`, `app/api/auth/[...all]`, `nextCookies`. Drop
  `Session/Account/Verification` tables in a Prisma migration (keep a slim `User`).

### 8.3 Supabase service-role client (Phase 0/3/4) — wzrdclaw `src/server/clients/supabase.ts`
```ts
import { createClient } from "@supabase/supabase-js";
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
// ALWAYS filter by ctx.session.user.id — service role bypasses RLS.
```
`studio` router (`src/server/api/routers/studio/*`): `listFinalizedAssets`, `scheduleStudioPosts`
(insert `postz_posts`), `listStudioChannels`, `upsertComposioChannel`, `recordClipAssets`,
`getStudioProfile`, `syncStudioProfile`. Each asserts `owner_id = ctx.session.user.id`.

### 8.4 Composio connect (Phase 3) + publish (Phase 5) — wzrdclaw
- **Connect:** reuse `getIntegrationAuthLinks` (swap toolkits → gmail/tiktok/instagram/twitter) and
  `checkConnectionStatus`. Expose at `/dashboard/api/composio/{authorize,status}` (Studio calls them
  same-origin). On `isActive` → `upsertComposioChannel` (Supabase `postz_channels`,
  `connection_mode='composio'`, `composio_account_id`, name/username/picture from the Composio
  account, `owner_id = uid`).
- **Publish:** `src/server/postz/publish.ts` `publishPost(postId)`:
  1. service-role claim `postz_posts` `QUEUE→PUBLISHING` (conditional update = idempotent).
  2. load channel (require `connection_mode='composio'`); resolve `media[]` → public HTTPS URLs.
  3. `composio.create(owner_id)` → platform tool (tiktok video / instagram container+publish /
     twitter tweet / youtube upload) with caption + `settings.__type` options.
  4. `PUBLISHED` (+ `release_url`) or `ERROR` (+ detail); always append `postz_publish_log`.

### 8.5 Autopost worker (Phase 5) — wzrdclaw cron
- New route `src/app/api/cron/postz/route.ts` (mirror `cron/trustclaw`: `CRON_SECRET` bearer, fail
  closed, Redis lease lock). Drain: select Supabase `postz_posts` where `state='QUEUE'` and
  `publish_date<=now()` and `deleted_at is null`, order by `publish_date`, limit 50 → `publishPost`
  each. Retries: re-`QUEUE` `ERROR` with `attempts<3` + backoff. Recurrence: clone next occurrence on
  `interval_in_days`. Token refresh handled by Composio.
- Declare in wzrdclaw `vercel.json`: `{ "crons":[{ "path":"/dashboard/api/cron/postz","schedule":"* * * * *" }] }`.
- (Alternative, §0.6: Supabase `pg_cron` + `pg_net.http_post` → `…/dashboard/api/cron/postz` with the
  service-role bearer. Use only if Vercel cron cadence is insufficient.)

### 8.6 Settings + Toolkits (Phase 6) — wzrdclaw
- `/dashboard/settings`: **Account** (`full_name`/`username`/`avatar_url` editors → dual-write;
  **wallet_address + wallet_type read-only from `profiles`**, Copy, Disconnect→sign out), **Agent**
  (model from `src/lib/models.ts`; persona/style/lore → Neon + mirror), **Automations** (scheduled
  `postz_posts` + `ClipJob` view), **Memories** (Neon `Memory` list/delete).
- `/dashboard/toolkits`: existing `ToolkitsClient` — list Composio toolkits, connect/disconnect,
  search/paginate; missing-key states never throw.

### 8.7 Agent chat (Phase 4) — unchanged runtime, new tools
Keep wzrdclaw `app/api/chat/route.ts` (AI SDK stream, Neon messages, Redis resumable). Add the
`studio` tools (§8.3) + `generate_or_source_clips`/`schedule_posts` (§7 Phase 5) to the tool set.
Identity prompt from Neon `OnboardingState` (kept in sync with `profiles`).

---

## 9. Schema changes

### 9.1 Supabase (additive only) — new migration `*_postz_channels_composio.sql`
```sql
alter table public.postz_channels
  add column if not exists connection_mode text not null default 'oauth'
    check (connection_mode in ('oauth','composio')),
  add column if not exists composio_account_id text;
create index if not exists postz_channels_composio_idx
  on public.postz_channels (owner_id, connection_mode);
```
> That is the **only** Supabase schema change. `postz_posts`, `postz_publish_log`, `profiles`,
> `project_assets` are reused as-is. Regenerate `src/integrations/supabase/types.ts` after applying.
> The scheduler that drains these posts is wzrdclaw cron (§8.5), so **no Supabase pg_cron migration
> is required** (the existing native scheduler can be left for any future `connection_mode='oauth'`
> channels; scope it to exclude `'composio'` to avoid double-publish).

### 9.2 wzrdclaw Neon (Prisma migrations)
- **`User` keyed by Supabase uid:** keep `User.id` as the Supabase uid string; drop better-auth
  `Session/Account/Verification` (and `User` columns only better-auth needed). `ComposioClawInstance`,
  `Message`, `Memory`, `CronJob`, `OnboardingState` unchanged (still keyed by `userId`).
- **New `ClipJob` model** (agent-owned; references Supabase asset ids by value):
  ```prisma
  model ClipJob {
    id        String   @id @default(cuid())
    userId    String
    prompt    String
    count     Int      @default(1)
    status    String   @default("pending") // pending|sourcing|ready|scheduled|failed
    assets    Json     @default("[]")       // [{ supabaseAssetId, cdnUrl }]
    groupId   String?                        // Supabase postz_posts.group_id once scheduled
    error     String?
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  }
  ```
- Run `prisma migrate` + regen client. pgvector `Memory` stays on Neon.

---

## 10. Verification matrix (gate before merge)

| # | Check | Pass condition |
|---|-------|----------------|
| 1 | SSO multi-zone | Sign in on Studio domain → `/dashboard` renders wzrdclaw **authenticated** (same Supabase session) inside the Studio shell; no second login. |
| 2 | Nav order | WZRDOS + Integrations above IP Vault; Settings above Favorites (desktop + mobile drawer); clicks hard-nav into the zone. |
| 3 | Profile-in-nav | `WorkspaceSwitcher` shows `profiles.avatar_url` + `username`; **no wallet** in nav. |
| 4 | Wallet relocated | `/dashboard/settings` Account shows `wallet_address` + `wallet_type`. |
| 5 | Onboarding dual-write | Fresh user: name, username (unique), pic, 4–5 context Qs, Composio connect, welcome anim; **Neon and Supabase `profiles` both populated**; `onboarding_completed=true` both sides. |
| 6 | Composio connect | Connect Gmail/TikTok/IG/X from onboarding **and** `/postz`; `postz_channels` row `connection_mode='composio'`; missing key ⇒ disabled hint, no crash. |
| 7 | Agent on Supabase | WZRDOS chat lists the user's finalized assets and performs a connected-app action; messages persist in Neon. |
| 8 | Clips→schedule | "source 10 reels, schedule across socials this week" → `ClipJob` ready → 10 `QUEUE` `postz_posts` on the **Studio calendar**, editable. |
| 9 | Autopost (browser closed) | A post ~2 min out publishes via wzrdclaw cron + Composio with no browser open; calendar QUEUE→PUBLISHING→PUBLISHED; `postz_publish_log` written; transient failure retries. |
| 10 | Isolation/security | Every service-role query scoped by uid (no cross-user reads); Composio + service-role keys absent from client bundle; Supabase `get_advisors` clean. |
| 11 | Builds | Both Vercel apps build; Studio `types.ts` + wzrdclaw Prisma client regenerated; lint green both. |

---

## 11. Risk register

- **Cross-zone session.** Cookie must be readable by both zones. *Mitigation:* `@supabase/ssr` cookie
  on the apex domain; same-origin rewrite (not a different host, not iframe). Verify the cookie name/
  `Domain`/`SameSite=Lax` reaches `/dashboard/*`.
- **Two databases, no FK across them.** *Mitigation:* Supabase is the source of truth for studio
  objects; Neon stores only `supabaseAssetId`/`group_id` **by value**; reconcile on read.
- **Service role bypasses RLS.** *Mitigation:* a single `studioQuery(uid)` helper that injects
  `owner_id = uid` on every call; code review + a test that a user can't read another's posts.
- **better-auth removal breakage.** *Mitigation:* keep a slim Neon `User` upserted from Supabase uid;
  delete only `Session/Account/Verification`; run typecheck after.
- **Double-publish (two schedulers).** *Mitigation:* wzrdclaw cron owns `connection_mode='composio'`;
  scope/disable the Supabase native scheduler for composio channels.
- **Composio publish coverage / media URLs.** *Mitigation:* start X+TikTok+IG+YouTube; pull-model
  public URLs; gate unsupported platforms as "coming soon" (no thrown error).
- **AI Gateway / Composio off the main route.** *Mitigation:* keys set on the wzrdclaw Vercel project;
  long clip jobs are async (`ClipJob` + poll), not held open in a request.

---

## 12. Definition of Done

1. §5 nav, §6 onboarding (dual-write), and the §10 matrix pass on both Vercel apps.
2. One sign-in (thirdweb→Supabase) authenticates both zones; better-auth is gone from the path.
3. wzrdclaw keeps Neon + Redis; its agent reads/writes Supabase studio data and runs the full
   **generate→schedule→Studio-calendar→autopost** loop via Composio with the browser closed.
4. Composio is the connect path for socials in `/postz` and onboarding; only additive Supabase
   migration (`postz_channels`); profiles dual-written and kept in sync per §3.5.
5. Profile pic + username in nav; wallet on Settings. No secrets in any client bundle; `get_advisors`
   clean; types/Prisma regenerated; both lint/builds green.

---

## Appendix A — File map (which repo, what changes)

**Studio (`WZRD.Studio-Desktop-v0-main`)**
- `next.config.ts` — add `/dashboard/:path*` rewrite (multi-zone).
- `src/integrations/supabase/client.ts` — cookie storage via `@supabase/ssr`.
- `src/components/home/navConfig.ts` — add WZRDOS / Integrations / Settings (§5).
- `src/components/home/Sidebar.tsx`, `MobileSidebarDrawer.tsx` — render Settings above Favorites; hard-nav the 3 items.
- `src/components/home/WorkspaceSwitcher.tsx` + new `src/hooks/useProfile.ts` — avatar+username, drop wallet.
- `src/lib/routes.ts` — route constants + manifest.
- `src/components/postz/AddChannelDialog.tsx`, `ChannelRail.tsx` — call wzrdclaw Composio connect.
- new migration `*_postz_channels_composio.sql`.

**wzrdclaw (`wzrdclaw2.0-main`)**
- `next.config.js` — `basePath:'/dashboard'`, `assetPrefix`.
- `src/server/api/trpc.ts` — Supabase-JWT context (§8.2); new `src/server/clients/supabase-auth.ts`, `supabase.ts`.
- remove `src/server/auth.ts` + `app/api/auth/[...all]`; Prisma migration to drop better-auth tables; `ensureNeonUser`.
- `src/server/api/routers/studio/*` (new) + `src/server/postz/publish.ts` (new).
- `dashboard/_components/onboarding/*` — add Username + Pic steps, Goals question; dual-write + `syncStudioProfile`.
- `getIntegrationAuthLinks.ts` — toolkits → gmail/tiktok/instagram/twitter; expose connect endpoints.
- agent tools — add `studio` + `generate_or_source_clips`/`schedule_posts`.
- `src/app/api/cron/postz/route.ts` (new) + `vercel.json` cron; Prisma `ClipJob`.
- drop Telegram steps/routers.

## Appendix B — Secrets (per Vercel project)

- **Studio Vercel:** `WZRDCLAW_ZONE_URL` (+ existing Supabase anon/url, thirdweb client id).
- **wzrdclaw Vercel (already has `COMPOSIO_API_KEY`, `DATABASE_URL`/Neon, `REDIS_URL`, `CRON_SECRET`,
  AI Gateway):** add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`,
  `STUDIO_APP_ORIGIN`. Remove `BETTER_AUTH_SECRET`, Telegram vars.
- Service-role + Composio + JWT secret are **server-only**; never `NEXT_PUBLIC_*`.

## Appendix C — Composio toolkit slugs
`gmail`, `tiktok`, `instagram`, `twitter` (X), `youtube`, `linkedin`, `slack`, `github`. Onboarding
default = **gmail, tiktok, instagram, twitter**. `postz_channels.provider` ↔ slug 1:1 (X=`twitter`).
Logos: `https://logos.composio.dev/api/<slug>`.

## Appendix D — Codex working agreement
1. Build phase-by-phase (§7); each gate green before the next. Phase 0 (SSO multi-zone) is the
   keystone — do not proceed until `/dashboard` is authenticated under the Studio domain.
2. Keep wzrdclaw on Neon/Redis; Supabase additions are additive; never edit existing Supabase migrations.
3. Every service-role query scoped by the Supabase uid. Secrets server-only.
4. Two repos, two deploys — state clearly in each PR which repo it touches.
5. Verify against real code before each phase (`trpc.ts`, `navConfig.ts`, `profiles` in `types.ts`,
   `postz_*`, `cron/trustclaw`); this doc is the plan, the code is truth. Update this doc if a verified
   fact changes.

