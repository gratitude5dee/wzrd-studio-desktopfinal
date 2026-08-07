# WZRD Image Editor — Goal

**Route:** `mini.wzrd.tech/image`
**Inherits:** `../goal.md` — brand, tokens, components, auth, data, GMI, budgets. This document specifies only the delta.
**Reference:** `pixel-point/toolcraft` — architectural reference, not a fork. See parent §2.1.

---

## 1. What this is

**One image, made send-worthy, in under 25 seconds.**

Someone is in a thread. They have a photo, or an idea. They come here, do one decisive thing to it, and go back. The decisive thing is usually one of five:

1. Make an image from nothing (a joke, a mock-up, a reaction)
2. Change one thing about a photo they already have
3. Cut the subject out of its background
4. Make a small image bigger or a bad image better
5. Put text on it

That is the whole product. Everything below is in service of making those five things fast enough to do mid-conversation.

**This is the platform's proving ground.** It is cheaper to build than video and it clears the time budget comfortably, so it is where the design system, the job pipeline, the auth flow, and the share surface get their first real test.

### 1.1 Non-goals

- Layers as a user-facing concept. Toolcraft supports optional layers; we decline them. A layer stack is a project, and we do not make projects.
- Precise selection tooling. No lasso, no magic wand, no feather radius. Selection is either "the subject" or "a region you tapped."
- Colour grading with curves, levels, or channel controls. Intent-named presets only, per QCut's filter-library model.
- Batch processing. One image.
- Anything that requires a second session to finish.

---

## 2. Who this is for

Not a designer. A person in a group chat with a phone in one hand.

Three recurring situations, in rough order of expected volume:

**The reactor.** Wants an image that does not exist, right now, to land a joke. Text in, image out, sent. Cares only about speed and whether it is funny. Will not read a label. Path must be: type → wait → send.

**The fixer.** Has a photo that is *almost* right. Background is wrong, someone is in it, it is too dark, it is too small. Wants one surgical change. Cares about the result being believable. Path must be: upload → point at the problem → accept.

**The maker.** Building something small and real — a flyer, an avatar, a listing photo. Will spend two minutes, not thirty seconds. This is the only persona that benefits from the disclosed controls, and they must never slow the other two down.

The design tension is entirely between the reactor and the maker. **Resolve it in the reactor's favour every time.** The maker will find the extra controls; the reactor will bounce off any friction at all.

---

## 3. Information architecture

### 3.1 The layout

```
┌─────────────────────────────┐
│  ◀  WZRD image        ⋯     │  header · 44pt · wordmark small
├─────────────────────────────┤
│                             │
│                             │
│         C A N V A S         │  fills · pinch-zoom, double-tap fit
│                             │  the artifact, nothing else
│                             │
├─────────────────────────────┤
│  ↺   ↻            ⬚ 1:1  ⌄  │  history + format · 44pt
├─────────────────────────────┤
│  ▸ Reframe  Retouch  Style  │  intent rail · horizontal scroll
├─────────────────────────────┤
│  [ PromptInput ............] │  composer · the primary input
├─────────────────────────────┤
│         S E N D             │  56pt · always present, always enabled
└─────────────────────────────┘
```

Four rules govern this layout and none of them may be relaxed:

1. **Send is permanent.** It never disappears, never disables, never moves. From the moment there is anything on the canvas — including an unmodified upload — Send works. The user's ability to leave with something is never contingent on finishing.
2. **The canvas is the only thing above the fold that is not chrome.** No panels, no rails floating over it, no persistent tool palette.
3. **Everything interactive lives in the bottom 40%.** Reachable with a thumb, on a 6.7" phone, held in one hand, without shifting grip.
4. **Depth is one level.** Tapping an intent opens a sheet. Sheets do not open sheets. If something needs two levels of nesting, it does not belong in this app.

### 3.2 The intent rail

Three intents, always in this order, because it is the order of decreasing frequency:

| Intent | Contains | Runs |
| --- | --- | --- |
| **Reframe** | crop presets (1:1, 4:5, 9:16, 16:9, free), rotate, flip, straighten | **Local.** Zero network, zero cost, instant. |
| **Retouch** | remove background, erase object, upscale, enhance | **Model.** Each is one GMI job. |
| **Style** | intent-named preset grid + the ASCII effect | Mixed — CSS/canvas filters local, generative styles are jobs. |

Why exactly three: a horizontal rail with four or more items either truncates or shrinks below a comfortable target at 390pt. Three fits, labelled, at 44pt, with room for the scroll affordance.

**Reframe is first and is entirely local.** This is deliberate. The first thing a new user touches should be instant and free — it teaches them the app is fast before they have paid a single network round trip. Putting a generative action first would teach the opposite.

### 3.3 The composer

`PromptInput` (parent §4.6), configured:

- Placeholder shifts with state: `Describe an image` when the canvas is empty, `Change something` once there is an image. Same input, two jobs, and the placeholder is the only thing that says so.
- `/` opens the skill palette: `/upscale`, `/remove-bg`, `/erase`, `/ascii`, `/model`. This is where the maker persona lives — discoverable by typing, invisible otherwise.
- `/model` is the disclosed model picker. Everyone else sees `Fast` / `Quality` in the sheet and never learns a model ID exists (parent §6.5).
- Attachment `+` accepts photo, camera, and paste. Paste matters more than it sounds — people copy images out of threads constantly.
- **Enhance Prompt** is on by default for the reactor. A one-line prompt from someone typing fast is exactly the case a prompt rewrite helps most. The conic-gradient border sweep during enhance is the app's signature working state.

---

## 4. Flows

### 4.1 Cold start → sent (the reactor path)

```
tap link
  ↓  ≤1.2s FCP · guest wallet minted silently · zero sign-in
land: empty canvas, DitherGradient wash, composer focused, keyboard up
  ↓  types "a cat lawyer in a tiny suit"
Enhance sweeps the composer border · rewritten prompt lands
  ↓  Send arrow
ImageGeneration loader fills the canvas frame
  · dithered radial · morphing mask · resolution badge top-right
  · "Generating image" shimmer + the prompt in quotes below
  ↓  Realtime push on jobs row (not polling)
image cross-fades in over the loader — skeleton reveal, blur → sharp, 400ms
  ↓  SEND
Messages: MSMessage inserted · Web: navigator.share() → /a/[id]
```

Target: **10–18 seconds.** Every element on this path is either the canvas, the composer, or Send.

The single most important detail: **the loader occupies the canvas frame at the final image's aspect ratio.** The image replaces the loader in place, with no reflow. This is worth real engineering effort — it is the difference between an app that feels considered and one that feels like a web page.

### 4.2 Upload → surgical fix (the fixer path)

```
tap + → photo library / camera / paste
  ↓  local downscale to ≤2048px long edge before any upload
canvas shows the image immediately (local object URL — no wait)
  ↓  in parallel, background upload via GMI upload-url → public_url
Retouch → sheet: Remove background · Erase · Upscale · Enhance
  ↓  taps Remove background
Orb pill appears inline on the affected control: "Removing background"
  ↓  result cross-fades · checkerboard behind the alpha
  ↓  ↺ undo restores in one tap, instantly, from the command stack
SEND
```

Two things carry this flow:

- **The image appears before it uploads.** Local object URL on the canvas, upload in the background. The user is never watching a progress bar for something they can already see.
- **Undo is instant and free.** The command stack (parent §6.4) holds the pre-operation state client-side. Undoing a background removal must not cost a second job or a second wait. This is what makes it safe to experiment, which is what makes the app fun.

### 4.3 Erase — the one place we accept a gesture

Tap-to-erase, not draw-to-erase.

```
Retouch → Erase
  ↓  canvas enters erase mode · everything else dims to 40%
tap the thing to remove
  ↓  a soft dithered highlight marks the tapped region
  ↓  optional: drag to grow the region · pinch to zoom first for precision
Confirm ✓
  ↓  Orb pill · region + image posted as one job
result cross-fades
```

We do not ship a brush. A brush needs pressure, precision, and a size control, and it needs the user to be looking at the part of the screen their hand is covering. Tap-to-region is less precise and dramatically more likely to succeed on a phone. If the tapped region is wrong, undo is one tap.

### 4.4 Style

A grid of intent-named presets over live thumbnails of *the user's actual image*, not stock samples. QCut's filter library is organized by intent — portrait, cinematic, vintage, stylized — and that is the correct granularity. Ours:

```
Local, instant, free              Generative, costs a job
─────────────────────            ─────────────────────
Punch     Faded                   Illustrate
Cool      Warm                    Paint
Mono      Contrast                Anime
Dither ✦                          ASCII ✦
```

`✦` marks the two that carry brand: **Dither** applies the DitherKit ordered-dither treatment; **ASCII** runs `AsciiObject` in opt-in effect mode (parent §4.6 — `orbit={false} zoom={false} autoRotate={false}`, `cellSize` capped at 12, hard fallback to a Canvas2D ASCII path if WebGL2 is unavailable).

These two exist because they are the interface's own visual language turned into a product feature. Toolcraft's canonical example is literally an ASCII effect on an uploaded image; we are on the tool's home ground here.

The local presets render at thumbnail scale on first paint and full scale on selection. Generative presets show a cost dot and a `Fast`/`Quality` toggle in the sheet header.

### 4.5 Send

```
SEND
 ├─ Messages wrapper present → sendArtifact() → MSMessage in the thread
 ├─ Web Share API available  → navigator.share({ url: /a/[id], files: [blob] })
 └─ neither                  → copy link + download, with a toast
```

On send: the artifact is written to Storage, the `artifacts` row is created, and the OG card for `/a/[id]` is generated at the edge and cached immutably.

**The OG card is a design deliverable, not a technical one.** It is what every other person in that thread sees. Layout: the artifact bled to the frame, a 24px `--wzrd-ink` bar along the bottom at 85% opacity, the WZRD wordmark at 20px on the left, and `mini.wzrd.tech/image` in mono at 12px `--wzrd-chrome` on the right. Nothing else. 1200×630, under 300KB.

---

## 5. Control system

### 5.1 Schema-driven

Controls are declared in `app-schema.ts` (parent §2.1), never hand-assembled. Every control declares:

```ts
{
  id, label,
  type: 'segmented' | 'slider' | 'select' | 'action' | 'toggle' | 'grid',
  group: 'reframe' | 'retouch' | 'style',
  cost: 'local' | 'job',
  surface: ['expanded', 'desktop'],     // 'compact' is never a work surface
  default, options?, range?
}
```

The schema being data is what lets one definition render as a bottom sheet on a phone and a panel on desktop without forking behaviour — the parent's responsive strategy depends on this.

### 5.2 Rules

- **Every control shows its cost before it runs.** `local` controls show nothing (free and instant is the default assumption). `job` controls carry a small `--wzrd-blue` dot and the credit cost in mono. Surprise cost is the fastest way to lose trust in a paid generative product.
- **No control has more than one degree of freedom exposed at once.** A slider or a segmented set. Never a slider plus a dropdown plus a toggle in the same row.
- **Live controls are 60fps or they are not live.** Anything that previews on drag renders at reduced scale during the gesture and at full scale on release. Toolcraft's `smoothTarget` discipline: declare the workload you actually guarantee, measure it, lower it only with evidence.
- **Reset is per-group, never global.** "Reset Reframe" is comprehensible. A single global reset that silently discards a generative result is not, and there is no world in which the user wanted it.

### 5.3 History

The command stack is the primary exploration mechanic, so it gets real treatment:

- `↺` and `↻` are permanent in the toolbar. Not in a menu, not on long-press.
- Undo of a local operation is synchronous and instant.
- Undo of a generative operation restores the previous image from the client-side stack — **it never re-runs a job.**
- Depth of 20 in memory. Beyond that, the oldest entries drop.
- Long-press `↺` opens a filmstrip of the last eight states as thumbnails. This is the closest thing to layers we ship, and it is enough.

---

## 6. Rendering

Toolcraft requires the renderer technique to be an explicit, documented decision rather than a default (parent §2.1). Ours:

| Surface | Technique | Why |
| --- | --- | --- |
| Canvas / artifact display | **Canvas 2D**, `OffscreenCanvas` in a worker where supported | Sufficient for every local operation. Zero dependency weight. Predictable memory. |
| Local filters | **CSS filters** for preview, Canvas 2D for commit | Preview at 60fps on the GPU; commit accurately once. |
| Dither preset | **Canvas 2D**, ordered Bayer matrix | Deterministic, fast, no shader compile. |
| ASCII preset | **WebGL2** via `AsciiObject`, opt-in only | The only WebGL in the app. Dynamically imported, never in a shared chunk, hard fallback to Canvas 2D. |
| Text overlay | **DOM** during editing, Canvas 2D on commit | DOM text is editable with the native IME and gets font shaping for free. Rasterize once, at the end. |

**Memory ceiling: 4096px on the long edge in the working buffer.** Sources are downscaled on import. Upscale results above the ceiling are held as a blob and displayed at a reduced preview resolution — the full-resolution asset goes to Storage and to Send without ever being fully decoded on the main thread.

---

## 7. Model routing

Intents, resolved server-side (parent §6.5). The user never sees the right column.

| Intent | Exposed as | Resolves to |
| --- | --- | --- |
| `image.generate.fast` | **Fast** | low-cost, low-latency text-to-image |
| `image.generate.quality` | **Quality** | higher-fidelity text-to-image |
| `image.edit` | the composer, when an image is present | instruction-following image edit |
| `image.remove-bg` | Retouch → Remove background | dedicated background removal |
| `image.upscale` | Retouch → Upscale | dedicated resolution increase |
| `image.erase` | Retouch → Erase | generative fill / object removal |
| `image.stylize` | Style → generative presets | image-to-image, style-prompted |

GMI's image catalog is broad and moves — FLUX 2, Gemini image, Seedream, Qwen-Image, Z-Image, and Bria's task-specific models for erase, background removal and resolution increase are all present, and per-request pricing varies by roughly two orders of magnitude across it. That volatility is exactly why the routing table is server-side and versioned, and why `GET /models/{model_id}` is synced nightly so a provider-side parameter change surfaces as a diff rather than a 500.

---

## 8. States

| State | Treatment |
| --- | --- |
| Empty canvas | `DitherGradient` wash, `from="purple"` shifted to the brand hue, composer focused, keyboard up. Three tappable example prompts, chosen to be funny rather than impressive. |
| Uploading | Image visible immediately from the local object URL. Upload progress is a 2px `--wzrd-blue` line on the canvas bottom edge. Never a modal, never a spinner over the image. |
| Generating (whole image) | `ImageGeneration` loader at the target aspect ratio, in place. Resolution badge top-right. Prompt in quotes beneath. |
| Generating (one region) | `Orb` pill inline on the control that triggered it. Canvas stays interactive — pan and zoom still work. |
| Style grid loading | `Skeleton` tiles with bounded pulse. Space reserved so CLS stays at zero. |
| Queued behind others | Elapsed timer plus a plain-language position: *"3rd in line — about 40 seconds."* Never a fake progress bar. |
| Failed | Inline on the control, never a modal. Names the cause and the next move: *"That model is busy. Try Fast, or wait about a minute."* Retry preserves every parameter. |
| Offline | Local controls stay fully live. Generative controls dim with one line: *"Reframe and Style still work offline."* |
| Guest, 3rd artifact | One inline, dismissible card above the composer: *"Keep these? About 5 seconds."* Once per session. Never during a create-or-send flow. |

---

## 9. Success metrics

| Metric | Target | Why it is the right measure |
| --- | --- | --- |
| Tap → sent, median | **≤ 20 s** | Under the platform's 25s budget, because image should clear it comfortably. |
| Tap → sent, p90 | **≤ 45 s** | The tail is where people give up. |
| Send rate (sessions producing a sent artifact) | **≥ 55%** | The only metric that measures the actual product. |
| Undo usage | **≥ 30% of sessions** | Counter-intuitively, high undo is *good* — it means people are exploring rather than committing anxiously. Low undo suggests they are afraid of the tool. |
| Zero-auth completion | **100%** | Any sign-in wall before a send is a bug. |
| Guest → linked conversion | **≥ 12%** by 3rd artifact | Enough to build a returning base without the prompt being pushy. |
| `/a/[id]` view → new session | **≥ 8%** | Whether the share surface actually acquires. This is the growth loop. |
| Route JS, first load | **≤ 180 KB gz** | Parent §8. |
| WebGL in critical path | **0 bytes** | Parent §8. |

---

## 10. Build order

Each phase is independently shippable and each one ends with something a person could actually use.

**Phase 1 — the spine.** Canvas, upload, local Reframe, Send, `/a/[id]` with its OG card. No models at all. This is a functioning crop-and-share tool, it validates the whole platform (auth, storage, share, budgets), and it ships in a fraction of the time of anything generative.

**Phase 2 — generate.** Composer, `image.generate.fast` and `.quality`, the job pipeline, Realtime, `ImageGeneration` loader. This is the reactor path end to end.

**Phase 3 — retouch.** Remove background, upscale, erase. Command stack with proper generative undo. This is the fixer path.

**Phase 4 — style.** Preset grid, local filters, Dither, ASCII. This is where brand and product finally converge, and it is deliberately last — it is the most fun and the least load-bearing.

**Phase 5 — surface.** Messages extension wrapper, compact strip, `sendArtifact`. Only if Phase 1–4 instrumentation says the entry point is the bottleneck (parent §9, open question 1).