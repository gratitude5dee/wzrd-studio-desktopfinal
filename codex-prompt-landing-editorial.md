# Codex / Claude Code Prompt — Editorial landing upgrade for WZRD Studio

> Paste everything below the line into Codex or Claude Code running in this repo. It is **additive**: it keeps the existing studio landing and layers a new editorial narrative on top, fused with WZRD's brand. Frontend only. Reference look: a dark, fashion-editorial agency site (large high-contrast serif headlines, warm cream text on cinematic near-black, generous negative space, color-blocked feature cards, a chat-style product demo, and a gradient "coming soon" band).

---

## ROLE

Act as a **world-class senior product architect and design engineer with 30+ years of experience**. You write production-grade, accessible, performant React/TypeScript. You respect existing architecture, reuse what's already there, and never break the build. You are surgical — you add only what the brief specifies and touch nothing else.

## MISSION

Layer a new **editorial brand narrative** onto the existing WZRD Studio marketing landing page, repositioning WZRD as an **agentic creative agency & content engine**. Keep every current section; insert a sequence of new, cinematic sections that adopt the reference site's editorial *structure and typographic confidence* while staying inside WZRD's existing dark + orange/cosmic design system. **Frontend only.** Reuse the app's design tokens, landing primitives, routing, providers, and motion stack.

---

## REFERENCE AESTHETIC (translate, don't copy)

The reference is a premium music-management agency landing page. Capture these qualities — re-skinned into WZRD's palette:

- **Typography as the hero.** Oversized serif display headlines, frequently with one word set in *italic* for emphasis (e.g. "Your music career, *managed.*"). Tight leading, lots of breathing room.
- **Warm cream text on near-black.** Body and headlines are an ivory/cream, not pure white, sitting on cinematic black photography or flat black.
- **Color-blocked feature cards.** A grid of large rounded cards, each a different saturated color, each labeled with a serif title and a duotone image ("Creative Director", "Project Manager", "Marketing Manager"…).
- **Conversational product demo.** A faux chat thread (user bubble → product bubble) showing the service doing the work.
- **A single, calm accent for action.** One CTA color (a warm off-white pill in the reference). In WZRD this becomes **orange**.
- **A gradient "coming soon / aura" band** — a full-bleed saturated gradient panel with a centered pill badge, headline, and two CTAs.

You will reproduce these *archetypes*, not the reference's exact colors or copy.

---

## HARD CONSTRAINTS (do not violate)

1. **Frontend only.** Do **NOT** create, modify, or delete anything under `supabase/migrations/`, `supabase/functions/`, or `src/integrations/supabase/types.ts`. Do not change auth, providers, or the data layer. You may *import* the existing Supabase client (`@/integrations/supabase/client`) only if a waitlist/email capture genuinely needs it — without altering schema or types.
2. **Additive — never remove.** The live landing is `src/legacy-pages/Landing.tsx` (lazy-loaded in `src/App.tsx` at the route `appRoutes.landing`). Keep all existing sections (`HeroSection`, `FeatureGrid`, `UseCasesSection`, `TestimonialsSection`, `FAQAccordion`, `PricingSectionRedesigned`, `MassiveFooter`, etc.) mounted and working. Only **insert** new sections at the points specified below.
3. **Reuse the existing design system. Do not introduce a parallel one.** Use the repo's Tailwind tokens and shadcn/ui primitives in `@/components/ui`. Use `framer-motion` (already a dependency) for motion. Use `cn` from `@/lib/utils`. Reuse existing landing primitives where they help (see "Reuse" list).
4. **Keep the page in forced dark mode**, exactly as `Landing.tsx` already does (it adds `dark` to the document root on mount). Preserve the existing `prefers-reduced-motion` and `CinematicIntro` gating.
5. **Do not break `bun run build` or `bunx vitest run`.** No TypeScript errors, no unused imports, no console errors. Keep `bun run lint` clean (it also runs `check:web-boundaries` — keep web/desktop import boundaries intact).
6. **Mobile-first and responsive.** Every new section must look intentional from 360px up to wide desktop.
7. **No fabricated proof.** Do not invent a named founder, fake testimonials, real client logos, or metrics. Where social proof or brand logos are implied, use clearly-labeled placeholders and a `// TODO:` comment so the team can drop in real assets.

---

## WHERE THE WORK GOES (exact paths)

- **Edit:** `src/legacy-pages/Landing.tsx` — import and place the new sections in the specified order. Wrap every new below-the-fold section in the existing `LazySection` (`@/components/landing/LazySection`) to preserve lazy rendering.
- **New components folder:** `src/components/landing/editorial/` — one file per new section:
  - `EditorialHero.tsx`
  - `AttentionEngineSection.tsx`
  - `CreatorOSGrid.tsx`
  - `IntegrationsSection.tsx`
  - `ComingSoonDistribution.tsx`
- **Reuse (import, don't recreate):** `AnimatedBackground`, `ParticleField`, `EmberParticles`, `LazySection`, `ScrollingPartners`, `MetricsSection`, `TestimonialCard`, `MassiveFooter` — all under `src/components/landing/`.
- **Fonts:** add one editorial serif to the existing Google Fonts `<link>` in `index.html` (see Design System). Do not remove the existing font link.

---

## DESIGN SYSTEM — FUSE EDITORIAL WITH WZRD

Use the repo's existing CSS-variable tokens. **Do not hardcode hex values** except where adding a new named token.

- **Surfaces:** `surface-0`…`surface-4` (near-black → elevated). Page base stays near-black.
- **Text:** `text-primary`, `text-secondary`, `text-tertiary`.
- **Borders:** `border-subtle`, `border-default`, `border-strong`.
- **Accents (use for the color-blocked cards):** `accent-orange` (primary brand / the single CTA color), `accent-teal`, `accent-purple`, `accent-amber`, `accent-rose`, plus `gold`.
- **Semantic:** `primary` (orange, `25 95% 53%`), `secondary`, `muted`, `card`, `popover`, `ring`.

**Editorial typography (the one additive change):**
- Add **`Fraunces`** (or `Instrument Serif` if you prefer a lighter cut) to the existing `index.html` Google Fonts `<link>`: weights `300;400;400italic;600;9..144 opsz`.
- Add a CSS variable `--font-editorial: 'Fraunces', 'Cinzel', Georgia, serif;` in `src/index.css` `:root`, and a Tailwind family `editorial: ['var(--font-editorial)', 'serif']` in `tailwind.config.ts` `fontFamily`.
- Use `font-editorial` for all big display headlines (this delivers the high-contrast serif + italic-accent-word look). Keep `font-body` (Inter) for body copy and `cyber` (Orbitron) only for small technical eyebrow labels.

**Editorial cream:** add `--editorial-cream: 40 38% 92%;` to `:root` and expose as `editorial-cream` in Tailwind colors. Use it for hero/section display headlines instead of pure white, to get the warm reference tone. Body copy stays `text-secondary`.

**Palette discipline:** near-black canvas, cream display type, **orange as the only action accent** (pills, primary CTAs, active states). The card grid is the one place multiple accent colors appear — exactly like the reference's color-blocked cards.

**Motion:** `framer-motion` scroll-reveal (fade + 16–24px rise, staggered children). Honor `prefers-reduced-motion` — gate every non-essential animation, matching the page's existing pattern.

---

## NEW PAGE FLOW (top → bottom)

Insert in this order. Items marked **KEEP** already exist — leave them in place.

### 1. `EditorialHero` — new, very top
Full-viewport, near-black, optional cinematic background image/video (reuse `VideoBackground`/`AnimatedBackground`; image optional, use a `// TODO:` placeholder). Centered editorial composition:
- **Eyebrow pill** (orange, `cyber`/Orbitron, uppercase, tracking-wide): `AGENTIC CREATIVE AGENCY`
- **Headline** (`font-editorial`, oversized, cream, italic accent word — this is the page's single `<h1>`):
  > Your creative agency, *automated.*
- **Subcopy** (`text-secondary`, max-w ~640px):
  > WZRD is an agentic creative agency and content engineer — ads, short films, music videos, and explainers, produced, distributed, and optimized end to end. You make the work. We run the machine.
- **Primary CTA** (orange pill → `/login?mode=signup`): `Start Creating` · **Secondary** (ghost/outline): `See the Engine` (smooth-scrolls to Attention Engine).
- **Heading hygiene:** because this is now the page `<h1>`, **downgrade the existing studio `HeroSection` headline to `<h2>`** so there is exactly one `<h1>`. Reframe the existing timeline-mockup hero as the "product preview" that sits directly beneath this band — no other change to it.

### 2. **KEEP** — existing studio `HeroSection` (the timeline-editor mockup) as product proof, then existing `FeatureGrid` / intro sections.

### 3. `AttentionEngineSection` — new
Editorial two-column split (text left, living visual right). Reuse `MetricsSection` or a small animated line/area chart motif for the "evolving" feel.
- **Eyebrow:** `ATTENTION ENGINE`
- **Headline** (`font-editorial`, two lines, italic on the second):
  > Marketing used to be data-driven campaigns.
  > Now it's an *evolving virality engine.*
- **Body:**
  > Campaigns are static — you launch, you measure, you guess. WZRD's attention engine treats every post, platform, and reaction as a live signal, compounding what works across channels so reach grows on its own. Not a campaign you run. An engine that runs itself.

### 4. `CreatorOSGrid` — new (the color-blocked card grid)
This is the reference's "Meet Your Managers" archetype, re-skinned as WZRD's **Creator OS** modules.
- **Section header** (centered): eyebrow `CREATOR OS`; headline (`font-editorial`): `Studio of the Creator OS`; subhead (`text-secondary`, uppercase small): `WE HANDLE THE PRODUCTION — YOU STAY THE TALENT.`
- **Grid:** large rounded cards (`rounded-3xl`), each a different accent background, serif title, one-line description, and a duotone image area (`// TODO:` placeholder image, tinted to the card color). Responsive: 1 col mobile → 2 → 4. Cards:
  1. **Create Your Twin** — `accent-teal` — "A photoreal AI version of you that shoots content on demand."
  2. **Star in Your Own Movie** — `accent-purple` — "Cast yourself as the lead. We generate the film around you."
  3. **Ads** — `accent-orange` — "Performance creative, generated and A/B-tested at scale."
  4. **Short Films** — `accent-rose` — "Narrative pieces that build the world around your brand."
  5. **Music Videos** — `accent-amber` — "Release-ready visuals, concept to final cut."
  6. **Explainer Videos** — `gold` — "Make the complex obvious — and shareable."
- Hover: subtle lift + image zoom; keyboard-focusable.

### 5. `IntegrationsSection` — new (logo wall + chat demo)
- **Eyebrow:** `CONNECTED EVERYWHERE` · **Headline** (`font-editorial`): `Plug into every distribution network.`
- **Body:**
  > Connect your socials, Meta Ads, OpenAI Ads, and ad managers across every content distribution network. WZRD posts, pitches, and optimizes across all of them from one place.
- **Chat demo** (reference's "let us do the rest" archetype) — alternating bubbles, `text-secondary` labels "You" / "WZRD":
  - You → "I need to launch this ad."
  - WZRD → "Live across Meta, TikTok & YouTube — optimizing spend now."
  - You → "Get this in front of curators."
  - WZRD → "Sent your cut to 20 vetted creators."
- **Logo wall:** reuse `ScrollingPartners` with placeholder integration logos (Meta, OpenAI, TikTok, YouTube, Instagram, X) — `// TODO:` swap for licensed marks.

### 6. `ComingSoonDistribution` — new (the gradient "aura" band)
Full-bleed saturated gradient panel (build from `accent-rose` → `accent-purple` → `accent-orange`, low-opacity grain), centered content:
- **Badge pill:** `COMING SOON`
- **Headline** (`font-editorial`, cream): `A cultural distribution engine.`
- **Body:**
  > Put your content and product in front of the world's top streamers and artists — every creator we work with is vetted at 1M+ followers. Collaborate with emerging tech startups and culture-defining brands.
- **Brand row:** placeholder logos for brand collaborations (e.g. Adidas, Red Bull) behind a `// TODO:` — do not ship real marks without permission.
- **CTAs:** `Get Early Access` (orange) + `See How It Works` (ghost).

### 7. **KEEP** — existing `TestimonialsSection`, `PricingSectionRedesigned`, `FAQAccordion`, `MassiveFooter`. Optional value line above pricing (`font-editorial`): "A whole creative team for *less than a single ad buy.*"

---

## COPY BANK (single source of truth)

All headline/subcopy strings live here so the team can edit in one place. Mirror these exactly in the components (offer the alternates as commented options):

- **Hero H1:** "Your creative agency, *automated.*" — alts: "Your content engine, *on autopilot.*" / "Your story, *at scale.*"
- **Hero sub:** "WZRD is an agentic creative agency and content engineer — ads, short films, music videos, and explainers, produced, distributed, and optimized end to end."
- **Attention Engine:** "Marketing used to be data-driven campaigns. Now it's an *evolving virality engine.*"
- **Creator OS:** "Studio of the Creator OS" / "We handle the production — you stay the talent."
- **Integrations:** "Plug into every distribution network." / "Socials, Meta Ads, OpenAI Ads & ad managers — across every content distribution network."
- **Coming Soon:** "A cultural distribution engine." / "Top streamers & artists, vetted at 1M+ followers. Brand collabs with emerging startups and names like Adidas & Red Bull."

---

## ACCESSIBILITY & PERFORMANCE

- Exactly **one `<h1>`** (the editorial hero); logical `<h2>`/`<h3>` order thereafter.
- All images need real `alt`; decorative layers `aria-hidden`. Cards are reachable by keyboard with visible focus rings (`ring`).
- Cream-on-near-black must clear **WCAG AA** (4.5:1 body, 3:1 large display) — verify and nudge the cream token if needed.
- Gate all motion behind `prefers-reduced-motion`. Lazy-load below-fold sections via `LazySection`; lazy-load any heavy media.
- No layout shift on font load (`display=swap` is already set); no console warnings.

## BUILD & TEST GATES (Definition of Done)

- [ ] `bun run build` passes — zero TS errors.
- [ ] `bunx vitest run` passes — existing tests stay green.
- [ ] `bun run lint` passes (including `check:web-boundaries`).
- [ ] All six new sections render in order in `src/legacy-pages/Landing.tsx`; every existing section still present and functional.
- [ ] Exactly one `<h1>`; forced dark mode and `prefers-reduced-motion` intact.
- [ ] Responsive 360px → desktop; no horizontal scroll; no console errors.
- [ ] Every placeholder asset/logo and stubbed action carries a `// TODO:`.

## OUT OF SCOPE

Backend, schema, auth, pricing logic, Electron/desktop shell, and `src/integrations/supabase/types.ts`. Do not rename the npm package or Electron `productName`. No new heavy dependencies — `framer-motion`, Tailwind, and shadcn/ui already cover everything here.
