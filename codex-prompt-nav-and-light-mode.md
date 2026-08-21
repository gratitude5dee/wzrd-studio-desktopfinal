# Codex Task — Restructure the Left Nav (accordion IA) + Light-Mode Refresh (lime-green accent)

> Paste everything below into Codex as a single task. It is written to be executed against this repo (WZRD Studio desktop). It encodes the current ground truth, the exact target, and the guardrails. Where it says **CONFIRM**, verify in the repo before writing code.

---

## 0) Role & operating rules

You are a senior design engineer working in the WZRD Studio codebase (React 18 + TypeScript + Vite + Tailwind + `next-themes` + `framer-motion` + `lucide-react` + shadcn/ui).

Hard rules:
- **Do not edit** `src/integrations/supabase/types.ts` or anything under `supabase/migrations/`.
- Keep changes **token-driven and minimal-blast-radius**. Prefer changing CSS variables and shared config over sprinkling new hex values.
- Preserve accessibility: visible focus rings, `aria-current`, `aria-expanded`, keyboard operability, and WCAG AA contrast in both themes.
- Preserve existing behavior of routes, voice navigation, and tests except where this task explicitly changes them.
- After implementation, run `bunx vitest run` and `bun run build`; both must pass. Update/extend tests rather than deleting assertions.
- Work in two reviewable phases: **Phase A (nav IA)** then **Phase B (light mode + accent)**. Don't interleave.

---

## 1) Ground truth (files that matter)

Navigation:
- `src/components/home/navConfig.ts` — source of truth. Exports the `AppNavItem` interface and `APP_NAV_ITEMS` (flat array, `section: 'main' | 'collaborate' | 'extra' | 'action'`). Derived exports: `MAIN_NAV_ITEMS`, `SECONDARY_NAV_ITEMS`, `FAVORITES_NAV_ITEM`, `FLOATING_APP_RAIL_ITEMS`, `MOBILE_DRAWER_NAV_ITEMS`, `MOBILE_BOTTOM_NAV_ITEMS`, `HOME_NAV_VIEW_IDS`. **There is no nested/children concept today.**
- `src/components/home/Sidebar.tsx` — desktop rail. Renders three sections ("Main Menu" → `MAIN_NAV_ITEMS`, "Collaborate" → `SECONDARY_NAV_ITEMS`, "Favorites" → a collapsible accordion). Has a collapsed/expanded state via `useSidebar()` (`APP_SIDEBAR_COLLAPSED_WIDTH` / `APP_SIDEBAR_EXPANDED_WIDTH`). **Accent color `#f97316` (orange) is hardcoded throughout** (active pill, badges, shine border, focus ring). Study the existing **Favorites accordion** (state `favoritesOpen`, `AnimatePresence` height animation, chevron rotate) — reuse that exact interaction pattern for the new groups.
- `src/components/home/MobileSidebarDrawer.tsx` — mobile drawer; also consumes `navConfig`.
- `src/components/home/__tests__/SidebarIPVault.test.tsx` and `e2e/web/app-sidebar-smoke.spec.ts` — nav tests to keep green / update.
- `src/voice/actions/navigation.ts` — voice-driven navigation that references nav ids/routes. Keep in sync with any id/route changes.

Routes (`src/lib/routes.ts`, `appRoutes`):
- `home: '/home'`, `assets: '/assets'`, `ipVault: '/ip-vault'`, `kanvas: '/kanvas'`, `kanvasLyrics: '/kanvas/lyrics'`, `kanvasRemix: '/kanvas/remix'`, `clipper: '/clipper'`, `sourcify: '/sourcify'`, `postz: '/postz'`, `settings: { billing: '/settings/billing', billingDocs: '/settings/billing/docs' }`.
- `aura` and `asset-store` are **home `activeView` ids**, not routes (clicking navigates to `/home` and sets `activeView`). `all` (All Projects) = `/home` default view.

Kanvas sub-studios (reuse — **do not reinvent**):
- `src/features/kanvas/helpers.ts` → `KANVAS_STUDIO_ORDER = ["image","video","edit","lipsync","cinema","worldview","character-creation"]` and `KANVAS_STUDIO_META` (each has `key`, `label`, `queryValue`, `icon`).
- `src/components/kanvas/studioNavConfig.ts` → `KANVAS_STUDIO_NAV` (with resolved lucide `Icon`) and `KANVAS_LYRICS_NAV_ITEM` (`routeOverride: appRoutes.kanvasLyrics`).
- **Studio selection is driven by a URL query param.** `src/legacy-pages/KanvasPage.tsx` uses `useSearchParams()` and reads `searchParams.get("studio")` → `normalizeStudioParam(...)`. So deep-link a studio with `/kanvas?studio=<queryValue>` (e.g. `/kanvas?studio=video`). Lyrics is its own route `/kanvas/lyrics`. **CONFIRM** the exact `queryValue` strings in `KANVAS_STUDIO_META` and the accepted values in `normalizeStudioParam` before wiring links.

Theme system:
- `next-themes` configured in `src/app/providers.tsx`: `<ThemeProvider attribute="class" defaultTheme="dark" enableSystem>`. So `<html>` gets class `light` / `dark`.
- Token layers (HSL channel format `H S% L%`, consumed as `hsl(var(--token))`):
  - `src/index.css` `@layer base`: `:root { … }` holds the **light** defaults (labeled "Odyssey Light Mode", `--background: 240 10% 96%`, etc.). `.dark { … }` holds dark overrides.
  - `src/styles/themes/light-premium.css`: premium **light** overrides scoped to `:root[data-theme="light"], :root.light, html.light`. Uses `--bg-page`, `--surface-1..4`, `--text-primary/secondary/...`, `--accent-*`, semantic `--primary/--accent/--border/--ring`, and shadow tokens. Imported **after** `index.css` in `src/main.tsx` and `src/app/layout.tsx`.
- `src/components/ui/theme-toggle.tsx` toggles dark/light. Note the Moon icon already uses lime `text-[#BEFF00]` — lime is an existing brand color.
- `tailwind.config.ts` maps the CSS variables to Tailwind color names. **CONFIRM** how `primary`/`accent`/`ring` are mapped before relying on utility classes.

---

## 2) Target information architecture (the new left nav)

Render top-to-bottom in this order. `▸` = expandable accordion group (same interaction as today's Favorites). Children render indented under an expanded parent.

```
WZRDOS                         (top-level, brand/launcher entry — see note)
▸ Studio                       (group, container-only — label toggles)
    • All Projects             → /home (activeView 'all')
    • Asset Store              → /home (activeView 'asset-store')
    • Aura                     → /home (activeView 'aura')
▸ Kanvas                       (group — reuse KANVAS_STUDIO_NAV)
    • Image                    → /kanvas?studio=image
    • Video                    → /kanvas?studio=video
    • Edit                     → /kanvas?studio=edit
    • Lip Sync                 → /kanvas?studio=lipsync
    • Cinema Studio            → /kanvas?studio=cinema
    • Worldview                → /kanvas?studio=worldview
    • Characters               → /kanvas?studio=character-creation
    • Lyrics                   → /kanvas/lyrics
  IP Vault                     (top-level) → /ip-vault
▸ Clipper                      (group WITH its own destination — see note)
    • Sourcify                 → /sourcify
  Postz                        (top-level) → /postz
▸ Settings                     (group)
    • Integrations             → /settings/integrations  (NEW route+page — see §2.3)
```

Keep **Favorites** and the **Collaborate** items (Shared with me, Community) — append Favorites at the very bottom as today; place Collaborate either under Settings or fold "Shared with me"/"Community" where it reads best. **Do not silently drop existing destinations.** Keep the **Create** action and the credits/logout footer intact.

### 2.1 Parent-group behavior (decided)
Parent groups are **expandable accordions**:
- **Container-only parents** (`Studio`, `Settings`): clicking the row toggles expand/collapse only (no navigation). `aria-expanded` reflects state.
- **Parents that are also destinations** (`Kanvas` → `/kanvas`, `Clipper` → `/clipper`): the row **navigates** to the parent route **and** there is a distinct chevron affordance to expand/collapse children (chevron click must not trigger navigation — stop propagation). Active styling on the parent when on the parent route or any child.
- Expansion state persists within a session (component state is fine; if you want persistence across reloads, use the existing sidebar/context pattern — **do not** add new `localStorage` keys unless the repo already does this for the sidebar).
- When the rail is **collapsed**, groups behave like today's collapsed items: show parent icon only, and reveal children via the existing tooltip/flyout pattern (or auto-expand the rail on click). Match whatever the collapsed Favorites/secondary items already do.

### 2.2 WZRDOS entry
`WZRDOS` is listed as the top anchor. **CONFIRM** whether a WZRDOS route/view exists (search `routes.ts`, `AuthenticatedRoutes.tsx`, and `legacy-pages/`). Then:
- If a destination exists, wire `WZRDOS` to it.
- If not, render it as a prominent top-level brand/launcher row that routes to the best existing home/launcher surface (`/home`) and leave a clearly-marked `// TODO(nav): WZRDOS launcher destination` so it's easy to repoint. Do **not** invent a broken route.

### 2.3 Integrations route/page (new)
There is currently **no** `/settings/integrations` route or page. Do this:
1. Search the repo for any existing integrations surface (e.g. components matching `Integration*`, connectors UI). **CONFIRM** before creating new.
2. If none, add `integrations: '/settings/integrations'` to `appRoutes.settings`, register the route in `src/app/AuthenticatedRoutes.tsx`, and create a minimal `src/legacy-pages/SettingsIntegrationsPage.tsx` (follow the structure/scaffold of `SettingsBillingPage.tsx`) with a clean placeholder ("Integrations — coming soon" + section shell) styled in the new design language. Mark with a `// TODO(integrations)` for real content.

---

## 3) Phase A — implement the nav restructure

### 3.1 Data model
Extend `navConfig.ts` to support one level of nesting without breaking existing consumers. Add an optional `children` and a `kind` to `AppNavItem` (or introduce a parallel `AppNavGroup` type), e.g.:

```ts
export type AppNavKind = 'item' | 'group';

export interface AppNavItem {
  id: string;
  label: string;
  route?: string;                 // exact path, may include query (e.g. '/kanvas?studio=video')
  activeViewId?: string;          // for home activeView items ('all' | 'asset-store' | 'aura')
  icon: LucideIcon;
  kind?: AppNavKind;              // default 'item'
  parentRoute?: string;          // for destination-parents (Kanvas '/kanvas', Clipper '/clipper')
  children?: AppNavItem[];
  showBadge?: boolean;
  featureFlag?: string;
  isAction?: boolean;
  isActive?: (pathname: string, activeView: string, search?: string) => boolean;
}
```

Then define a single ordered `PRIMARY_NAV_TREE: AppNavItem[]` that expresses §2. Reuse `KANVAS_STUDIO_NAV` + `KANVAS_LYRICS_NAV_ITEM` to build the Kanvas children (map `queryValue` → `route: ${appRoutes.kanvas}?studio=${queryValue}` and the correct `label`; map labels to the target wording: `lipsync`→"Lip Sync", `cinema`→"Cinema Studio", `character-creation`→"Characters"). Keep the legacy derived exports working (some are imported elsewhere) — either keep them as flattened views of the tree or update every importer. **CONFIRM all importers** of the names in §1 and update them consistently.

`isActive` for child studios must consider the `studio` query param (compare `searchParams.get('studio')`), not just pathname. Parent `isActive` = on parent route OR any child active.

### 3.2 Rendering — `Sidebar.tsx`
- Replace the three hard-coded sections with a renderer that walks `PRIMARY_NAV_TREE`. Reuse `SidebarNavButton` for leaf items and the **Favorites accordion mechanics** for groups (chevron rotate + `AnimatePresence` height animation + indented child list with the left hairline `border-l`).
- Container-only parent: button toggles open state. Destination parent: button navigates (`parentRoute`) and a trailing chevron toggles (chevron `onClick` calls `e.stopPropagation()`).
- Children: indented (reuse the `ml-6 … border-l … pl-3` treatment from Favorites), smaller row height, leaf `SidebarNavButton` styling.
- Keep collapsed-rail tooltips and the `data-active` / `aria-current` semantics. Keep `data-testid="app-sidebar"` and `data-tour="sidebar-nav"`.
- Navigation handler: extend the existing `handleNavClick` so it supports `route` containing a query string (use `navigate(item.route)` which accepts a path+query), `activeViewId` (navigate to `/home` with `state: { activeView }` exactly as today), and group toggles.

### 3.3 Rendering — `MobileSidebarDrawer.tsx`
Mirror the same tree with nested disclosure suited to the drawer. Keep bottom-bar items sensible (`MOBILE_BOTTOM_ORDER`); update it if ids changed.

### 3.4 Voice + tests
- Update `src/voice/actions/navigation.ts` for any new/renamed ids and the new Integrations destination; keep existing voice targets working.
- Update `src/components/home/__tests__/SidebarIPVault.test.tsx` and `e2e/web/app-sidebar-smoke.spec.ts` to reflect the new structure (IP Vault still reachable; Kanvas children expand; Sourcify nested under Clipper). Add a test that expanding `Kanvas` reveals its studios and that a studio link carries `?studio=`.

### 3.5 Phase A acceptance
- All previous destinations remain reachable (nothing orphaned): All Projects, Asset Store, Aura, Kanvas (+ 8 studios), IP Vault, Clipper, Sourcify, Postz, Settings/Integrations, Favorites, Shared, Community, Create.
- Accordions expand/collapse with animation; keyboard + `aria-expanded` correct; active state correct on parent + child (including `?studio=`).
- Collapsed rail still usable. Mobile drawer reflects the tree. `bunx vitest run` + `bun run build` pass.

---

## 4) Phase B — light-mode refresh + lime-green accent

Two coupled changes: (1) make **lime-green `#BEFF00` the primary accent across the whole app** (both themes), and (2) make **light mode a polished translation of the editor's design language** (the dark LYRICA editor screenshot is the reference; translate its look into a bright theme — do **not** copy its dark values).

### 4.1 Accent migration → lime-green `#BEFF00`
`#BEFF00` ≈ **HSL `75 100% 50%`**. Because pure lime is too light for text on white, define a scale:

| Token (proposed) | HSL | Use |
| --- | --- | --- |
| `--accent-lime` | `75 100% 50%` | primary accent fill / active background / brand |
| `--accent-lime-strong` | `74 85% 33%` | accent **text/icons/borders on light surfaces** (AA on white) |
| `--accent-lime-foreground` | `80 60% 8%` | text/icon **on top of** a lime fill (near-black) |
| `--accent-lime-soft` (light) | `75 100% 50% / 0.12` | soft active backgrounds |

Plan:
1. Add the lime tokens to **both** `:root` (light) and `.dark` in `src/index.css`, and to `light-premium.css`.
2. Repoint the **semantic** interactive tokens to lime in both themes: `--primary`, `--accent`, `--ring`, and the active/selected accent used by nav. In dark mode, lime is the literal editor accent; in light mode use `--accent-lime` for fills and `--accent-lime-strong` for accent text/icons so contrast holds.
3. In `src/components/home/Sidebar.tsx` (and `MobileSidebarDrawer.tsx`, `theme-toggle.tsx` focus states), **replace hardcoded orange** (`#f97316`, `rgba(249,115,22,*)`, `#f59e0b`, and `25 95% 53%` where it's used as the interactive accent) with the lime tokens via `hsl(var(--accent-lime…))` / Tailwind arbitrary values like `text-[hsl(var(--accent-lime-strong))]`. Introduce small local constants or `@layer` utility classes if it reduces repetition. Keep the `ShineBorder` but feed it the lime color(s).
4. Leave **non-accent** semantics alone: `--destructive`/rose, amber warnings, teal, etc. Don't chase every legacy `--accent-purple/--mog-*` token — focus on what's visibly the interactive accent (nav active pill, badges, primary buttons, focus rings, toggles, key CTAs in the app shell).
5. **CONFIRM** `tailwind.config.ts` so `bg-primary`/`text-primary`/`ring` resolve to the lime tokens after the change; adjust the mapping if needed.

### 4.2 Light-mode design language (translate the editor reference)
The editor reference reads as: layered glass panels, hairline borders, generous rounding (`rounded-xl/2xl`), lime accent for active controls/waveform, soft depth, crisp high-contrast type, pill toggles. Translate to **light**:

- **Surfaces:** near-white layered scale — page `#F6F7F9`, panel/card `#FFFFFF`, raised `#FFFFFF` with shadow, subtle cool-gray fills for inputs. Keep the editor's **glassiness** with translucent white + `backdrop-blur` (e.g. `bg-white/70 backdrop-blur-xl`) where the dark UI uses translucent panels.
- **Borders/dividers:** cool-gray hairlines at low alpha (`0 0% 0% / 0.06–0.10`) instead of the dark `white/0.06`.
- **Text:** near-black primary (`214 12% 12%`), graded secondary/tertiary (already defined in `light-premium.css` — reuse).
- **Accent:** lime fills for active/selected; `--accent-lime-strong` for accent text/icons; soft lime tints for hover/active backgrounds. Replace dark "glow" with **soft shadows** (`--shadow-sm/md/lg` already in `light-premium.css`) plus an optional faint lime ring on focus.
- **Geometry & motion:** keep the same radii, spacing, and framer-motion transitions as dark mode so the two themes feel like one product.

Edit the light tokens in `src/index.css` `:root` and `src/styles/themes/light-premium.css`. `light-premium.css` already has a strong neutral light scale — **keep its neutrals**, and swap its accent block (`--accent-purple/-orange`, `--primary`, `--ring`, `--border-focus`) to the lime scale so light mode's accent matches the new brand.

### 4.3 Component sweep (don't let light mode break)
The app was built dark-first; some shells hardcode dark values or are `dark:`-only.
- Audit the **app shell** for light correctness: `Sidebar.tsx`, `MobileSidebarDrawer.tsx`, top-bar/header, `CreditsDisplay`, `WorkspaceSwitcher`, and the home/`legacy-pages/Home.tsx` chrome. Replace hardcoded `bg-[#0A0A0F]`, `text-zinc-*`, `bg-black`, `white/0.0x` etc. in these shells with theme tokens (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`) so they invert correctly. Use `dark:` variants where a value must differ per theme.
- You do **not** need to fully re-theme deep editor canvases (e.g. `qcut`, tldraw, reactflow) in this task — scope to the **navigation + app shell + Settings/Integrations page**. Note any large surfaces left dark-only with a `// TODO(light-mode)` so they're trackable.
- Keep `defaultTheme="dark"`; ensure the toggle flips cleanly and persists (next-themes default behavior). Verify no flash/contrast regressions on the routes you touched.

### 4.4 Phase B acceptance
- Toggling to **light** yields a clean, readable, on-brand UI for the sidebar, app shell, home, and Settings/Integrations — glassy white panels, lime accents, AA-contrast text, soft shadows; no black-on-black or invisible text in the touched surfaces.
- **Lime-green is the primary accent in both themes** (nav active state, badges, focus rings, primary CTAs). No stray orange accent remains in the nav/app shell.
- Focus rings visible in both themes; `bunx vitest run` + `bun run build` pass.

---

## 5) Global guardrails & verification

- Never touch `src/integrations/supabase/types.ts` or `supabase/migrations/`.
- No new runtime deps. Reuse `framer-motion`, `lucide-react`, shadcn, existing tokens.
- Keep diffs focused; don't reformat unrelated files.
- **Verify before coding** every line marked **CONFIRM**: Kanvas `queryValue`s + `normalizeStudioParam`; all importers of the `navConfig` exports; whether WZRDOS/Integrations destinations already exist; `tailwind.config.ts` token mapping.
- Final checks: `bunx vitest run`, `bun run build`, and a manual pass toggling dark↔light on `/home`, `/kanvas` (expand + pick a studio), `/clipper`→`/sourcify`, `/postz`, `/ip-vault`, `/settings/integrations`. Confirm collapsed-rail and mobile drawer.
- Deliver as two commits/PRs: **A) nav IA**, **B) light-mode + lime accent**, each with a short screenshot-style description of what changed and any `TODO`s left.
