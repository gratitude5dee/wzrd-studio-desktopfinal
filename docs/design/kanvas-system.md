# Kanvas Design System

The Kanvas design system is the shared visual language for the `/kanvas` studio
surfaces (Image, Video, Edit, Lipsync, Cinema) and their supporting chrome
(sidebar, page shell, empty states). It is built from three layers:

1. **Tokens** — CSS variables + Tailwind utilities
2. **Theme recipes** — `src/lib/kanvasTheme.ts`
3. **Primitives** — `src/components/kanvas/primitives/`

## 1. Tokens

All Kanvas tokens are HSL triples defined in `src/index.css` (mirrored into
both `:root` and `.dark` so utilities resolve in either mode) and exposed as
Tailwind utilities via the `kanvas` color group and `kanvas-sm/md/lg/xl`
borderRadius scale in `tailwind.config.ts`.

| Token | Value | Purpose |
| --- | --- | --- |
| `--kanvas-bg` | `0 0% 4%` | Page background |
| `--kanvas-surface-1` | `0 0% 7%` | Raised surface (rails, prompt bars) |
| `--kanvas-surface-2` | `0 2% 10%` | Panels |
| `--kanvas-surface-3` | `0 0% 13%` | Hover / highest surface |
| `--kanvas-border-subtle` | `0 0% 100% / 0.06` | Hairline borders |
| `--kanvas-border-default` | `0 0% 100% / 0.1` | Default borders |
| `--kanvas-border-strong` | `0 0% 100% / 0.2` | Emphasized borders |
| `--kanvas-text-primary` | `0 0% 100%` | Headings, primary copy |
| `--kanvas-text-secondary` | `240 5% 65%` | Secondary copy |
| `--kanvas-text-muted` | `240 4% 46%` | Muted labels |
| `--kanvas-text-faint` | `240 5% 34%` | Faintest hints |
| `--kanvas-accent` | `25 95% 53%` | WZRD orange accent |
| `--kanvas-accent-hover` | `27 96% 61%` | Accent hover |
| `--kanvas-accent-soft` | `25 95% 53% / 0.1` | Soft accent fills |
| `--kanvas-accent-edge` | `25 95% 53% / 0.3` | Accent borders/rings |
| `--kanvas-accent-contrast` | `0 0% 0%` | Text on accent fills |
| `--kanvas-radius-sm/md/lg/xl` | `0.5/0.75/1/1.5rem` | Radius scale |
| `--kanvas-rail-width` | `336px` | Standard rail width |
| `--kanvas-rail-width-compact` | `300px` | Compact rail width |
| `--kanvas-font-display` | Space Grotesk stack | Display typography |

Usage: `bg-kanvas-surface-2`, `text-kanvas-text-muted`, `border-kanvas-accent-edge`,
`rounded-kanvas-lg`, `font-kanvas-display`. In raw CSS use
`hsl(var(--kanvas-accent) / 0.3)`.

### Accent policy

The only accent is WZRD orange. Never hardcode `#f97316`, `#ff3399`, or
`rgba(249,115,22,…)` in Kanvas chrome — use the accent exports from
`kanvasTheme.ts`:

- `accentFill` — solid accent buttons (`bg-kanvas-accent text-kanvas-accent-contrast hover:bg-kanvas-accent-hover`)
- `accentSoft` — soft accent backgrounds
- `accentEdge` — accent borders
- `accentText` — accent-colored text

Exception: *data* metadata (e.g. Cinema genre-card `color` fields) is content,
not chrome, and may carry literal color values.

## 2. Theme recipes — `src/lib/kanvasTheme.ts`

- `kanvasSurface` / `kanvasRadius` — className maps for surfaces and radii.
- `kanvasDisplay` — condensed uppercase display type recipe.
- `railWidth = 336`, `railWidthCompact = 300`.
- cva recipes:
  - `railRow({ selected })` — rows inside rails/lists.
  - `railChip({ active })` — pill filters/chips.
  - `mediaTile({ interactive, selected })` — media thumbnails.
  - `panelSurface({ surface, radius, border })` — panel containers.
    Note: `panelSurface` includes `overflow-hidden`; add `overflow-visible`
    when a panel hosts popovers that open outside its box (see the Image
    studio prompt bar).

## 3. Primitives — `src/components/kanvas/primitives/`

Presentational-only components (no `@/features/kanvas/**` imports). All
forward `className` and `ref`, use real focusable elements, keep ≥44px hit
targets, use aspect-ratio media, and include reduced-motion fallbacks.

`KanvasPanel`, `KanvasSpinner`, `KanvasDisplayHeading`, `KanvasSectionHeader`,
`KanvasBadge`, `KanvasChip`, `KanvasIconButton`, `KanvasButton`,
`KanvasRailRow`, `KanvasMediaTile`, `KanvasStepper`, `KanvasTabs`,
`KanvasPromptBar`, `KanvasFieldRow`, `KanvasRail`, `KanvasUploadTile`,
`KanvasProgress`, `KanvasEmptyState`.

Tests live in `src/components/kanvas/primitives/__tests__/`. Extend a
primitive with an optional prop rather than forking it.

## Related systems

- **Dither kit** (`src/components/dither-kit/`, themed via
  `src/lib/ditherTheme.ts`) — canvas-rendered dithered charts/gradients used
  for data moments (observability runs, billing usage, home stats wash).
- **Pixel effects** (`src/components/effects/`) — shared-rAF pixel shimmer
  (`PixelLayer`, `PixelCard`) with a `wzrd` orange variant; renders null under
  `prefers-reduced-motion` and on `(hover: none)` pointers.

## Navigation

Kanvas does not own a navigation list. `KANVAS_NAV_ITEMS` in
`src/components/home/navigation.ts` (the Kanvas group of the five-group Creator
OS IA) is the single source of truth for the studio entries plus Lyrics, and is
consumed by `KanvasSidebar`, the Kanvas header pill slider, and the mobile
bottom nav. `kanvasStudioFromNavItem(item)` maps an entry back to its
`KanvasStudio`, or returns null for routed entries such as Lyrics.

The Kanvas rail follows the shell's sidebar behaviour contract: persistent (not
hover-revealed), keyboard-operable, `focus-visible` rings from `--focus`,
`aria-current="page"` on the active entry, and 44px targets. See
[DESIGN.md](../../DESIGN.md) for the semantic token contract those surfaces
share.

## Rules of engagement

- Never hardcode studio names or studio lists; use `KANVAS_NAV_ITEMS` for
  navigation and labels from `src/features/kanvas/helpers.ts`
  (`KANVAS_STUDIO_META`) elsewhere.
- Do not modify `src/features/kanvas/**`, `src/integrations/**`, generation
  payloads, or EditCanvas math from design-system work.
- Token sweep: `src/components/kanvas` and `src/pages/Kanvas*` must contain no
  hardcoded hex surfaces/accents or `zinc-*` text colors (data metadata
  excepted).
