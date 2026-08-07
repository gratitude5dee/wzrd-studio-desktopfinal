# WZRD.Studio Vercel Web Migration Progress

## Current Branch

- Branch: `codex/wzrd-vercel-web`
- Source spec: `goal-vercel.md`
- Current phase: Phase 2 - Vercel platform adapter, serverless parity scaffold, and early browser smoke verification

## Phase 0 Status

- [x] Created implementation branch.
- [x] Added `goal-vercel.md` to the working branch.
- [x] Generated migration inventory in `docs/migration/inventory.md`.
- [x] Added web-boundary check for direct Electron bridge globals and runtime Electron imports.
- [x] Moved `QCutEditor` remote-media caching through the platform adapter.
- [x] Run lint/test/build baseline gates.
- [x] Commit Phase 0: `d49f3c7 chore: establish vercel web migration baseline`.

## Phase 0 Verification

- `bun run lint` passes. ESLint reports existing warnings, and `bun run check:web-boundaries` passes.
- `bun x vitest run src/qcut/platform/web/__tests__/adapter.test.ts` passes: 43 tests.
- `bun run build` passes: Vite built `dist/` in 1m 15s. Existing warnings remain around third-party pure annotations, browser-externalized Node modules from Story Protocol, dynamic/static chunk overlap, and oversized chunks.
- `bun run test` is not green at baseline: `src/legacy-pages/KanvasPage.test.tsx > KanvasPage > respects the studio query param and switches studios from the shell nav` stays on the Video studio after clicking the duplicated Lip Sync nav control in jsdom, then fails to find the mocked `Talking Head` button. The targeted rerun reproduces the same failure; no Phase 0 product code was changed for this unrelated Kanvas test.

## Phase 1 Status

- [x] Added Next.js App Router shell under `src/app/**`.
- [x] Added `next.config.ts`, `next-env.d.ts`, and `vercel.json`.
- [x] Added Bun/Next scripts while preserving Vite/Electron scripts.
- [x] Moved React providers into `src/app/providers.tsx`.
- [x] Moved legacy Vite route modules from `src/pages/**` to `src/legacy-pages/**`.
- [x] Recreated the route manifest from `src/lib/routes.ts` as App Router pages that mount the client shell.
- [x] Added public env helper with `NEXT_PUBLIC_*` first and `VITE_*` migration fallback.
- [x] Split Supabase config/browser/server clients so server-only clients are lazy and browser storage is not initialized during server build.
- [x] Scoped COOP/COEP headers to `/projects/:projectId/editor/:path*`.
- [x] Added webpack compatibility aliases for existing Vite-era dependencies.

## Phase 1 Verification

- `bun run web:build` passes. Next.js 16.2.9 builds 31 App Router pages/routes with known nonfatal warnings for dynamic export/remotion imports, `@mariozechner/pi-ai`, an old Browserslist DB, and one Tailwind arbitrary easing class.
- `bun run lint` passes. ESLint reports existing warnings and `bun run check:web-boundaries` passes.
- `bun run check:web-boundaries` passes independently.
- `bun run build` passes. Vite builds `dist/` successfully with existing third-party annotation and large chunk warnings.
- `bun run test` passes: 369 files passed, 2 skipped; 3,571 tests passed, 12 skipped.
- `bun x vitest run src/qcut/platform/web/__tests__/adapter.test.ts` passes: 43 tests.

## Vercel Project Status

- [x] Created new Vercel project `wzrd-studio-web` under `5dee-studios`.
- [x] Linked the local checkout to project `prj_hbk6ccJSWObGLq3KMSNgFsudAP8T`.
- [x] Connected the project to GitHub repo `gratitude5dee/wzrd-studio-desktopfinal`.
- [x] Added `.vercelignore` so CLI deploys do not upload `node_modules`, `.next`, `dist`, or desktop release artifacts.
- [x] Confirmed Vercel env list is empty for the new project; auth/media parity still needs public Supabase env and server-only secrets.
- [x] Remote Vercel build succeeded for deployment `dpl_HNjZCnN8FK7cbhgGGLopUYQuSeii` at immutable URL `https://wzrd-studio-m883c684a-5dee-studios.vercel.app`.
- [x] The initial CLI deploy was unexpectedly marked `target=production`; removed active `wzrd-studio-web*` aliases afterward so the deployment is not intentionally promoted as the production launch.
- [x] Git-backed preview deployment from `codex/wzrd-vercel-web` is ready after aligning project settings and committing with the account email. Deployment `dpl_3kKRuLvjwXheFrrN3bUbrU9FdY6w` is live at `https://wzrd-studio-88rl9xmw2-5dee-studios.vercel.app`.
- [x] Latest verified Git-backed preview deployment is `dpl_DovAbTW2YnmP9mnhuJiFJid9z473` at `https://wzrd-studio-dfgrxrp0e-5dee-studios.vercel.app`.
- [x] Latest verified Git-backed preview deployment is `dpl_GqPNcSUoxrz49amEpGH8jS5DBuzs` at `https://wzrd-studio-1onmimyhs-5dee-studios.vercel.app`.
- [x] Latest verified render-offload code preview deployment is `dpl_4gDB3nGfYD6VdGatJ7brE2enk82e` at `https://wzrd-studio-1224hu6cn-5dee-studios.vercel.app`.
- [x] Configured public Vercel env vars for Preview and Production: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_THIRDWEB_CLIENT_ID`.
- [x] Latest verified env-backed preview redeployment is `dpl_CuLXGPu1J7t5dMs8qtvE16EwMnoJ` at `https://wzrd-studio-1hjafmx5w-5dee-studios.vercel.app`.
- [x] Latest verified FFmpeg fallback code preview deployment is `dpl_Bcp6C4owDF5YZSja3jKosuh5q8rS` at `https://wzrd-studio-qzuamlclh-5dee-studios.vercel.app`.
- [x] Latest verified FFmpeg resource resolver preview deployment is `dpl_HJy7aq2EvZ6hgJEEEPJiKhGSaHYM` at `https://wzrd-studio-39j8azhep-5dee-studios.vercel.app`.
- [x] Aligned Vercel project settings through `PATCH /v9/projects/prj_hbk6ccJSWObGLq3KMSNgFsudAP8T`: `framework=nextjs`, `buildCommand=bun run web:build`, `installCommand=bun install --frozen-lockfile`, and `devCommand=bun run web:dev`.
- [x] Generated protected-deployment share URL `https://wzrd-studio-88rl9xmw2-5dee-studios.vercel.app/?_vercel_share=MgyS1w5HzWTlThRdwQdUDK6mizc6oh7U`, expiring June 20, 2026 at 8:43 PM.
- [x] Generated protected-deployment share URL `https://wzrd-studio-dfgrxrp0e-5dee-studios.vercel.app/?_vercel_share=jCZZNzokm9009cPlWJuxRueNjAgpMsl7`, expiring June 20, 2026 at 8:48 PM.
- [x] Generated protected-deployment share URL `https://wzrd-studio-1onmimyhs-5dee-studios.vercel.app/?_vercel_share=gmJruiVl3yTh3etaVfE7WbYlOpoHv9An`, expiring June 20, 2026 at 9:17 PM.

## Phase 2 Status

- [x] Added `src/qcut/platform/vercel/**` as a Vercel-aware web adapter.
- [x] Updated Next client bootstrap to initialize the Vercel adapter while preserving the WZRD desktop adapter for the Vite/Electron target.
- [x] Vercel adapter now prefers authenticated `/api/media/proxy` remote-media caching, then falls back to the browser web adapter.
- [x] Self-hosted FFmpeg core assets under `public/ffmpeg/ffmpeg-core.js` and `public/ffmpeg/ffmpeg-core.wasm` for same-origin wasm fallback.
- [x] Added `src/lib/ffmpeg-web/**` to validate the self-hosted FFmpeg WASM asset allowlist, same-origin URLs, browser worker/fetch support, and editor-route cross-origin isolation before enabling fallback export.
- [x] Updated the legacy FFmpeg resource resolver to share the same WASM asset allowlist and same-origin URL helper, removing direct `import.meta.env.BASE_URL` usage while preserving Electron `app://ffmpeg` fallback.
- [x] Kept WebCodecs/mediabunny as the preferred browser export path, with FFmpeg WASM selected only when WebCodecs is unavailable or the `qcut_force_webcodecs_off` localStorage matrix flag is set.
- [x] Added authenticated App Router route handlers for `/api/media/proxy`, `/api/media/probe`, `/api/render`, `/api/render/status`, `/api/youtube`, and `/api/agent/*`.
- [x] Added basic public-URL validation for media proxy/probe routes to block unsupported schemes, credentials, localhost, and literal private IP hosts.
- [x] Kept render, YouTube, and agent routes bounded/unconfigured instead of running long work inside a single serverless request.
- [x] Split Supabase server config away from the shared Vite/Next public env helper so API route bundles do not emit `import.meta`.
- [x] Hardened the shared public env helper so Next client bundles only reference statically enumerated Vite fallback keys, avoiding runtime `import.meta` access in the browser bundle.
- [x] Added `NEXT_PUBLIC_THIRDWEB_CLIENT_ID` support, with `VITE_THIRDWEB_CLIENT_ID` migration fallback, before the browser falls back to the existing Supabase `get-thirdweb-config` function.
- [x] Added a dedicated Next web Playwright smoke suite for landing hydration, test-auth login redirect, editor route load/reload, scoped COOP/COEP headers, and absence of `PlatformUnsupportedError`.
- [x] Quieted the Next test-auth editor bootstrap by skipping remote Supabase project/assets/timeline reads for non-UUID demo IDs, making desktop skills sync capability-aware, lazily initializing FAL keys, using a test billing catalog, and cleaning up animated logo timers on unmount.
- [x] Added additive `public.web_render_jobs` migration with RLS, explicit `authenticated` Data API grants, owner/project indexes, and idempotency protection for browser render offload metadata.
- [x] Applied hosted Supabase migrations `web_render_jobs` and `harden_web_render_jobs_grants` to project `ixkkrousepsiorwlaycp`, including privilege hardening after Supabase default grants exposed the new table too broadly.
- [x] Replaced the render-offload stubs with authenticated queue/status handlers that validate project ownership, return existing jobs by idempotency hash, and fail fast when the migration has not been applied.
- [x] Updated the Vercel adapter so legacy `ffmpeg.exportVideoCLI` calls can queue a bounded render-offload job, while clearly reporting that async result polling is not wired into the CLI export path yet.

## Phase 2 Verification

- `bun x vitest run src/qcut/platform/vercel/__tests__/adapter.test.ts src/app/api/_lib/__tests__/media-url.test.ts` passes: 6 tests.
- `bun x vitest run src/lib/__tests__/env.test.ts src/qcut/platform/vercel/__tests__/adapter.test.ts src/app/api/_lib/__tests__/media-url.test.ts` passes: 10 tests.
- `bun x vitest run src/lib/__tests__/env.test.ts src/qcut/platform/vercel/__tests__/adapter.test.ts src/app/api/_lib/__tests__/media-url.test.ts src/qcut/app/lib/__tests__/project-skills-sync.test.ts` passes: 14 tests.
- `bun x vitest run src/lib/__tests__/env.test.ts src/lib/thirdweb/__tests__/client.test.ts` passes: 6 tests.
- `bun x vitest run src/app/api/render/_lib/__tests__/jobs.test.ts src/app/api/render/__tests__/route.test.ts src/qcut/platform/vercel/__tests__/adapter.test.ts` passes: 14 tests.
- `bun x vitest run src/lib/ffmpeg-web/__tests__/index.test.ts src/qcut/app/lib/export/__tests__/export-engine-factory.test.ts src/qcut/app/lib/export/__tests__/webcodecs-support.test.ts` passes: 39 tests.
- `bun x vitest run src/lib/ffmpeg-web/__tests__/index.test.ts src/qcut/app/lib/ffmpeg/__tests__/resources.test.ts src/qcut/app/lib/export/__tests__/export-engine-factory.test.ts src/qcut/app/lib/export/__tests__/webcodecs-support.test.ts` passes: 43 tests.
- `bun run web:build` passes. Next.js lists the new API routes as dynamic server functions. Existing nonfatal warnings remain for dynamic export/remotion imports, `@mariozechner/pi-ai`, old Browserslist data, and one Tailwind arbitrary easing class.
- `bun run lint` passes. ESLint reports existing warnings, and `bun run check:web-boundaries` passes.
- `bun run build` passes for the Vite/Electron target with existing third-party annotation and large chunk warnings.
- `bun run test` passes: 376 files passed, 2 skipped; 3,603 tests passed, 12 skipped.
- `bun run test:e2e:web` passes: 3 Chromium tests. The sandboxed attempt could not bind `127.0.0.1:3300` (`EPERM`), then the escalated rerun passed. Known noisy browser console output remains from webpack dynamic-import warnings, React script-tag warnings, Motion/Lit dev-mode warnings, and old Browserslist data; the smoke gate found no `PlatformUnsupportedError` and no test-auth Supabase UUID/timeline/billing/FAL bootstrap exceptions.
- Supabase CLI v2.78.1 does not expose `db advisors`; `npx supabase migration list --local` and `npx supabase db lint --local --fail-on error` were attempted but could not connect because local Postgres is not running on `127.0.0.1:54322`.
- Supabase connector verification passes for `public.web_render_jobs`: table exists, RLS is enabled, select/insert/update policies are present for authenticated owners, indexes exist for primary key, idempotency, owner/project recency, and status recency, and table privileges are restricted to no `anon` access, `authenticated=select/insert/update`, and `service_role=select/insert/update/delete`.
- Vercel preview `dpl_3kKRuLvjwXheFrrN3bUbrU9FdY6w` built remotely with Bun 1.3.12, Next.js 16.2.9, `bun install --frozen-lockfile`, and `bun run web:build`.
- Vercel preview `dpl_DovAbTW2YnmP9mnhuJiFJid9z473` built remotely and was verified through protected fetch.
- Vercel preview `dpl_4gDB3nGfYD6VdGatJ7brE2enk82e` built remotely from commit `9c033c3` with Bun 1.3.12, Next.js 16.2.9, `bun install --frozen-lockfile`, and `bun run web:build`.
- Vercel preview `dpl_CuLXGPu1J7t5dMs8qtvE16EwMnoJ` redeployed from commit `37a941b` after public env configuration, skipped build cache, and built remotely with Bun 1.3.12, Next.js 16.2.9, `bun install --frozen-lockfile`, and `bun run web:build`.
- Vercel preview `dpl_Bcp6C4owDF5YZSja3jKosuh5q8rS` built remotely from commit `18e4cf5` with Bun 1.3.12, Next.js 16.2.9, `bun install --frozen-lockfile`, and `bun run web:build`; build logs show only the known Browserslist, Tailwind arbitrary easing, and dynamic-import warnings.
- Vercel preview `dpl_HJy7aq2EvZ6hgJEEEPJiKhGSaHYM` built remotely from commit `7d71506` with Bun 1.3.12, Next.js 16.2.9, `bun install --frozen-lockfile`, and `bun run web:build`; build logs show only the known Browserslist, Tailwind arbitrary easing, and dynamic-import warnings.
- Vercel protected fetch of `/` returns 200 and the Next shell HTML.
- Vercel protected fetch of `/projects/demo/editor` returns 200 with scoped isolation headers: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- `vercel curl` verified `/projects/demo/editor` on `dpl_4gDB3nGfYD6VdGatJ7brE2enk82e` returns 200 with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`; `/` returns 200 without those scoped editor-only headers. Runtime logs for the deployment show only 200 responses for these checks.
- `vercel curl` verified `/projects/demo/editor` on `dpl_CuLXGPu1J7t5dMs8qtvE16EwMnoJ` returns 200 with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`; `/` returns 200 without those scoped editor-only headers. Runtime logs for the deployment show only 200 responses for these checks.
- `vercel curl` verified `/projects/demo/editor` on `dpl_Bcp6C4owDF5YZSja3jKosuh5q8rS` returns 200 with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`; `/` returns 200 without those scoped editor-only headers. Runtime logs for the deployment show only 200 responses for these checks.
- `vercel curl` verified `/ffmpeg/ffmpeg-core.js` and `/ffmpeg/ffmpeg-core.wasm` on `dpl_Bcp6C4owDF5YZSja3jKosuh5q8rS` return 200; the WASM asset is served as `application/wasm`.
- `vercel curl` verified `/projects/demo/editor` on `dpl_HJy7aq2EvZ6hgJEEEPJiKhGSaHYM` returns 200 with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`; `/` returns 200 without those scoped editor-only headers; `/ffmpeg/ffmpeg-core.js` and `/ffmpeg/ffmpeg-core.wasm` return 200, with WASM served as `application/wasm`. Runtime logs surfaced only info-level 2xx/204 entries, with no errors.
- Earlier preview deploys from commits authored as `gratitud3@mac.lan` remain `BLOCKED`; they have no build-log events and can be ignored in favor of `dpl_DovAbTW2YnmP9mnhuJiFJid9z473`.

## Decisions And Assumptions

- Use the existing GitHub repo for the first pass.
- Create a new Vercel project named `wzrd-studio-web` when the Next.js shell has a deployable preview.
- Keep Vite/Electron desktop scripts working while adding the Next.js web target.
- Supabase schema work remains additive only; `public.web_render_jobs` and the follow-up grant hardening migration are now committed locally and applied to the hosted project.

## Known Follow-Ups

- Replace localStorage-backed web storage with IndexedDB/OPFS plus Supabase Storage in the persistence phase.
- Wire the async worker/result polling path before enabling server render offload in the UI.
- Wire YouTube OAuth/upload and agent runtime routes once server-only Vercel env is configured.
- Expand browser Playwright coverage beyond the current Next smoke into project CRUD, real authenticated sessions, and stricter console budgets once optional service env/config is available.
- Run the full browser MP4 export matrix: WebCodecs/mediabunny 30s export plus forced wasm fallback reprobe/playback using `localStorage.setItem("qcut_force_webcodecs_off", "true")`.
- Investigate and reduce Next webpack warnings for dynamic export/remotion imports before production.
- Configure server-only Vercel API/secrets as route handlers come online.
- Keep repo-local Git identity on `GRATITUD3 <gratitude@5-dee.com>` for future branch-tip commits so Vercel Git previews are not blocked by the local machine email.
