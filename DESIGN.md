# WZRD.tech — Elemental Cathedral

## Intent

WZRD.tech is the front door to a creator operating system: cinematic enough to
feel like culture, exact enough to feel like infrastructure. The page moves
from atmosphere into evidence. It should never resemble a generic AI SaaS
homepage or a dashboard pretending to be a film.

The emotional arc is **arrival → agency → craft → culture → infrastructure →
possibility**. A visitor should understand the promise within the first screen,
then discover the system one element at a time.

## Visual language

- **Void / ink:** `#05070a`, `#071225`, and translucent blue-black establish
  the site as a nocturnal stage rather than a flat black page.
- **Air signal:** `#8cc8ff` and cloud-white carry the hero and native-agent
  chapter.
- **Studio ember:** `#f06a47` is reserved for authored media and decisive
  actions, never used as decoration everywhere.
- **Earth mineral:** `#b8b096` and deep moss support digital-to-physical
  culture.
- **Water / fire:** `#6dc8d7` and `#f0a145` only appear in the coming-soon
  horizon.
- Use hairline borders, soft grain, clipped glows, and oversized editorial
  type. Avoid glossy gradients, pill-heavy controls, generic rounded cards,
  floating icon clouds, or fake product screenshots.

## Typography

- **Editorial voice:** `Newsreader`, with Georgia as a reliable fallback. It
  carries propositions, section statements, and long-form warmth.
- **System voice:** `Azeret Mono`, with a monospace fallback. It carries
  coordinates, labels, runtime states, and utility navigation.
- The cropped WZRD raster wordmark is treated as a mark, not a substitute for
  live heading text. `Creator OS` remains real text for accessibility and
  responsive reflow.

## Layout rules

1. One visual event leads each viewport. Copy is deliberately sparse and has a
   clear next action.
2. A fixed header provides conventional wayfinding; chapter anchors make the
   long narrative scannable.
3. The hero uses one WebGL atmosphere behind semantic HTML. The DOM must be
   legible before the shader loads and must stay complete if it fails.
4. Sections are editorial scenes, not a card grid: an artifact, a conversation,
   a pocket studio, a cultural threshold, then a runtime diagram.
5. Product proof stays honest. The supplied device image appears only in
   Studio, at a scale where its native resolution holds up.
6. Mobile is a deliberate composition: no pinned scroll, no hover-only
   information, 44px minimum targets, and a short visible path to Studio.

## Motion rules

- Native scrolling is the control surface. Scroll-led motion uses transform and
  opacity, with distinct timing for the logo reveal, chapter entrances, and
  runtime signal.
- The WZRD mark crossfades/scales into **Creator OS**; it is not presented as a
  misleading literal vector morph.
- The cloud field only redraws when scroll state changes. No permanent request
  animation loop and no more than one WebGL canvas.
- `prefers-reduced-motion` and the visible Motion toggle remove pinning and
  reveal all content immediately. The CSS atmospheric fallback remains.
- Stillness is part of the pacing. Do not make every object drift, spin, or
  pulse.

## Accessibility and trust

- Semantic landmarks, in-page navigation, logical heading order, visible focus,
  and text equivalents remain present without WebGL or JavaScript.
- Decorative shader and frames are hidden from assistive technology. Status
  labels are plain language, not faux-terminal theater.
- Water and Fire are clearly marked **Coming soon** with no financial claims or
  implied availability.

## Creator OS semantic token contract

The app shell consumes semantic tokens, never raw hexes. Every token is stored
as an HSL triplet in both `:root` and `.dark` in `src/index.css` and mapped in
`tailwind.config.ts`, so `bg-surface-canvas`, `text-accent-ember`,
`border-line-subtle`, `ring-focus`, etc. resolve through `hsl(var(--x))`.

| Token | Purpose |
| --- | --- |
| `--surface-canvas` | Page/base surface behind everything. |
| `--surface-raised` | Panels, rails, cards lifted off the canvas. |
| `--accent-air` (`#8cc8ff`) | Calm accent: hover, selection, focus. |
| `--accent-ember` (`#f06a47`) | Decisive accent: active nav, primary actions. |
| `--accent-mineral` (`#b8b096`) | Quiet supporting accent. |
| `--text-primary` / `--text-secondary` / `--text-muted` | Text hierarchy. |
| `--line-subtle` | Hairline borders and dividers. |
| `--status-success` / `--status-warning` / `--status-danger` | State colour. |
| `--focus` | Focus ring colour; used by `focus-visible:ring-focus`. |
| `--accent-water` / `--accent-fire` | Reserved for the coming-soon horizon; no surface consumes them yet. |

Light-theme accents are darkened relative to the brand hexes so text and icons
using them clear WCAG AA against `--surface-canvas`.

Deprecated but still present: `accent-purple` (misnamed — it resolves to coral
`#ff6b4a`), and the `cosmic` and `glass` palettes. ~30 legacy component files
still reference them; new and shell code must not. Use `accent-ember` /
`accent-air` instead.

### Spacing, radius, motion

- **Spacing:** 4 / 8 / 12 / 16 / 24 / 32 / 48 (`wzrd-1` … `wzrd-12`).
- **Radius:** 6 controls (`rounded-wzrd-sm`), 10 cards (`rounded-wzrd-md`),
  14 panels (`rounded-wzrd-lg`); `rounded-wzrd-chip` (999px) for chips only.
- **Motion:** transform and opacity only. Controls 160–240ms
  (`duration-wzrd-control`, `duration-wzrd-control-slow`), reveals ~250ms
  (`duration-wzrd-reveal`). Never `transition: all` — name the properties.
  `prefers-reduced-motion: reduce` is honoured globally in `src/index.css`.

## Creator OS navigation shell

`src/components/home/navigation.ts` is the single source of truth for app
navigation. `SIDEBAR_SECTIONS` holds exactly five root groups:

1. **Studio** — All Projects, Shared with me, Community, Favorites, Aura
   (view-based; landing view `all`).
2. **Kanvas** — Image, Video, Edit, Lip Sync, Cinema, Worldview, Characters,
   Lyrics (`/kanvas/lyrics`); landing `/kanvas`.
3. **IP Management** — IP Vault only; landing `/ip-vault`.
4. **Clip Studio** — Clipper, Sourcify, Postz; landing `/clipper`.
5. **Settings** — Billing; landing `/settings`.

WTR is not surfaced. Asset Store is gone: `/assets` redirects to `/ip-vault`.
`/clip-studio` → `/clipper` and `/IPVault` → `/ip-vault` remain.

Consumers derive from this model: `Sidebar`, `FloatingNavPill` (the collapsed
rail), `MobileSidebarDrawer`, `KanvasSidebar`, and the Kanvas page's pill
slider and mobile bottom nav (`KANVAS_NAV_ITEMS`).

### Sidebar behaviour contract

- The root row is two controls: the label navigates to the group landing, a
  separate chevron button (`aria-expanded`, `aria-controls`) toggles the subnav.
- The active destination carries `aria-current="page"`.
- Interactive targets are at least 44px.
- The collapsed rail is persistent, not hover-revealed: it stays visible, is
  reachable by keyboard, and shows a `focus-visible` ring using `--focus`.
- A persistent collapse/expand control switches between the rail and the full
  sidebar.
- No decorative shine borders or glow chrome in the shell; accent usage comes
  from `accent-air` / `accent-ember`.

## Related design docs

- [Kanvas design system](docs/design/kanvas-system.md) — tokens, theme
  recipes, primitives, accent policy, and rules of engagement for the
  `/kanvas` studio surfaces.

