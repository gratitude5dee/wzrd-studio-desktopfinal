# Goal: WZRD Studio Universal Plugin

A single portable plugin that exposes WZRD Studio's full functionality —
project setup, Studio (node-based prompt-to-workflow), Timeline (storyboard),
and Editor (full video editor) — to any agent harness with native UI:
Codex, Claude Code, Hermes, Pi, OpenClaw, and any Agent Skills / MCP host.

## North-star statement

> "From inside any agent harness, a user (or the agent itself) can set up a
> WZRD project, develop a storyboard scene-by-scene with character/setting
> continuity, review and refine shots as native harness UI (cards/tables,
> not raw JSON), and hand the finished storyboard packet to Seedance 2.5
> automatically for generation — with WZRD credits billed server-side, and
> the same project openable in the WZRD web app's Studio, Timeline, and
> Editor tabs at any point."

## Package format: Agent Plugins v1.0.0

Follow the open standard at https://agent-plugins.org (spec repo:
agentplugins/agent-plugins-spec; canonical example:
agentplugins/agent-plugins-example; marketplace pattern:
antonbabenko/agent-plugins). The portable core is:

```text
wzrd-studio-plugin/
├── plugin.json                  # required closed-schema manifest
├── mcp.json                     # portable MCP server config (Streamable HTTP)
├── skills/                      # Agent Skills (agentskills.io format)
│   ├── setup-project/SKILL.md
│   ├── storyboard/SKILL.md          # the simplified storyboarding flow
│   ├── generate-shot/SKILL.md
│   ├── render-timeline/SKILL.md
│   ├── run-studio-graph/SKILL.md
│   ├── seedance-handoff/SKILL.md    # storyboard → Seedance 2.5 packet
│   ├── edit-timeline/SKILL.md
│   ├── export-video/SKILL.md
│   └── billing/SKILL.md
├── com.anthropic.claude-code/   # client extension: hooks, slash commands
├── com.openai.codex/            # client extension: codex marketplace metadata
├── com.openclaw/                # client extension: OpenClaw manifest data
└── com.hermes/                  # client extension: Hermes agent.yaml mapping
```

Rules from the spec that MUST be honored:
- `plugin.json` schema is closed — no `hooks`/`agents`/`commands`/`mcpServers`
  at top level; client-owned data goes under `extensions.<reverse-domain>`.
- Skills live at immediate children of `skills/`, one `SKILL.md` each.
- `mcp.json` declares the server with explicit transport type
  (`streamable-http` pointing at the deployed mcp-server edge function).
- Clients that don't implement an extension namespace must still get a fully
  working plugin from the portable core (skills + MCP).

### What already exists in this repo (build on, don't duplicate)

- `supabase/functions/mcp-server/` — hand-rolled JSON-RPC 2.0 Streamable
  HTTP MCP server (initialize / tools/list / tools/call) with tools:
  `list_models`, `get_credits`, `create_project`, `get_timeline`,
  `run_studio_graph`, `create_checkout_session`.
- `agent-skills/` — agent-agnostic skill bundle with `index.json` and
  per-skill `skill.md` (list-models, generate-shot, render-timeline,
  run-studio-graph, make-magic, edit-timeline, billing-checkout).
- Harness configs: `agents.md`, `.claude/CLAUDE.md`, `.codex/codex.md`,
  `.openclaw/manifest.json`, `.hermes/agent.yaml`,
  `public/.well-known/agents.json` discovery endpoint.
- Edge functions covering the full pipeline: `create-project`,
  `finalize-project-setup`, `generate-storylines`, `gen-shots`,
  `generate-shot-image`, `edit-shot-image`, `upscale-shot-image`,
  `generate-character-image`, `edit-character-image`,
  `generate-visual-prompt`, `evaluate-storyboard-packet`,
  `build-revision-plan`, `director-cut`, `generate-workflow`,
  `compute-execute` / `compute-save-graph`, `fal-stream`, `gmi-execute`,
  `studio-save-state` / `studio-load-state`, plus billing
  (`billing-checkout`, credits ledger, strict catalog pricing from #42–#52).

The plugin is therefore mostly an integration + packaging effort over an API
surface that already exists, plus the new storyboard-session and Seedance
tools described below.

---

## Phase 0 — Repo + auth groundwork

1. Create `plugin/` at repo root holding the portable package (source of
   truth), with a build script `bun run plugin:build` that validates
   `plugin.json` against `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`,
   lints every `SKILL.md` frontmatter, and emits a distributable tarball.
2. **Auth model (blocking design decision, do it first).** MCP callers can't
   use the browser's Supabase session. Add a Personal Access Token flow:
   - `wzrd_api_tokens` table (hashed token, user_id, scopes, expiry,
     last_used_at) + RLS; migration via the migration tool.
   - Token mint/revoke UI in the web app (Settings → "Agent access").
   - `mcp-server` resolves `Authorization: Bearer wzrd_pat_…` → user id, and
     every tool runs with that user's identity (credits, projects, RLS).
   - Scopes: `read`, `generate` (spends credits), `billing`.
   - Never accept raw Supabase service keys from harness config.
3. Rate limiting + spend guard: per-token daily credit cap (default 500,
   configurable), enforced in `_shared/credits.ts` hold creation.

## Phase 1 — Complete the MCP tool surface

Extend `supabase/functions/mcp-server/` so every plugin capability is a tool.
Tool names are stable API; version via `serverInfo.version`.

Project setup:
- `setup_project` — one-call wizard: `{concept, format, aspectRatio, style,
  voiceover?, cast?}` → runs concept→storyline→settings/cast→breakdown via
  the existing edge functions (`create-project`, `generate-storylines`,
  `gen-shots`, `finalize-project-setup`) and returns `{projectId, scenes[],
  characters[], settings}`. Progress streamed as MCP progress notifications.
- `update_project_settings`, `add_character`, `generate_character_image`,
  `list_projects`, `get_project`.

Storyboard (Timeline):
- `get_storyboard` — scenes/shots with prompt, status, image URL, credits.
- `update_shot` — edit prompt/camera/duration for a shot.
- `generate_shot_image` (single, 2 credits) and `generate_scene_images`
  (scene batch, 10 credits) — wrap `generate-shot-image`.
- `evaluate_storyboard` — wrap `evaluate-storyboard-packet` so agents can
  self-review continuity before generation.
- `seedance_handoff` — NEW (see Phase 3): compile the storyboard into a
  Seedance 2.5 reference packet and enqueue image-to-video generation.

Studio (node editor):
- `generate_workflow` — wrap `generate-workflow` (prompt → node graph plan
  → materialize), same path the WorkflowGeneratorTab uses.
- `run_studio_graph` (exists), `save_studio_graph`, `get_studio_graph`.

Editor:
- `get_timeline` (exists), `edit_timeline` (add/move/trim/delete elements —
  reuse `src/qcut/bridge/agent-api.ts` semantics against the project
  snapshot), `export_video` (server-side Director's Cut path via
  `director-cut`; client-side WebCodecs export stays app-only),
  `transcribe_captions` (fal Whisper route from #69).

Cross-cutting:
- `list_models`, `get_credits`, `create_checkout_session` (exist).
- Every generation tool returns `{jobId}` immediately plus a `get_job`
  poll tool; long operations must never hold the JSON-RPC request open
  past ~55s (edge function limit).

## Phase 2 — Fix the project-setup workflow (prerequisite for `setup_project`)

Known bugs to fix in `src/components/project-setup/` (audit found these; do a
full pass while in there):
- `ProjectSetupHeader` always shows "Step 1 of 4": `currentStep` prop is
  never passed from wizard state (`ProjectSetupWizard.tsx` renders
  `<ProjectSetupHeader />` bare). Wire it to the active tab index.
- Settings & Cast step: aspect-ratio selector uses off-palette blue
  (screenshot evidence) — align with craft tokens.
- Video-style cards render broken/empty thumbnails ("None" card is blank,
  others show screenshots of the app itself).
- Audit tab-gating logic: Breakdown must not be reachable before Storyline
  completes; Cast generation errors must surface, not silently no-op.
- Simplification per product direction: collapse Settings & Cast into one
  reviewable "Project brief" the agent can fill in a single round-trip; the
  wizard keeps parity so web users see the same model the plugin writes.

Acceptance: the four-step wizard and the `setup_project` tool produce
identical `projects` rows and storyboard packets for the same inputs.

## Phase 3 — Simplified storyboarding + Seedance 2.5 handoff

The core product idea: storyboarding happens conversationally in the
harness, then ships to Seedance 2.5 automatically.

1. **Storyboard session model.** New table `storyboard_sessions`
   (project_id, state json, revision int) so an agent can iterate on
   scene/shot structure cheaply (text-only) before any image credits are
   spent. Tools: `storyboard_propose` (agent submits scene/shot deltas),
   `storyboard_diff` (server returns normalized diff + continuity warnings
   from `evaluate-storyboard-packet`), `storyboard_commit` (writes shots).
2. **Reference packet compiler** (`supabase/functions/seedance-handoff/`):
   for each shot, assemble `{prompt, negative, camera, duration, character
   reference images, setting reference image, style anchor, previous-shot
   last frame (continuity)}` → submit to Seedance 2.5 via the existing
   fal/GMI transport (`fal-stream` strict pricing; catalog rows for
   `seedance_pro_i2v` / `seedance_pro_fast_i2v` already exist in the AI view
   — add 2.5 rows to the catalog with verified pricing, following the
   #42-style derivation).
3. **Hyperframes-editor learnings.** Reuse the hyperframes editor's
   shot-graph logic to improve storyboard structure: shots as nodes with
   explicit continuity edges (character, location, prop), so the packet
   compiler can pick the right reference frames automatically instead of
   naive previous-shot chaining. If hyperframes code isn't in this repo,
   treat its published behavior as design reference only.
4. Auto mode: `seedance_handoff({projectId, mode: "auto"})` runs
   evaluate → fix-trivial-issues (`build-revision-plan`) → compile → submit
   → poll, reporting progress; `mode: "review"` stops after compile and
   returns the packet for the agent/user to approve shot-by-shot.

## Phase 4 — Native harness UI

The portable core returns structured JSON; each client extension shapes it:

- **Claude Code** (`com.anthropic.claude-code/`): slash commands
  (`/wzrd:setup`, `/wzrd:storyboard`, `/wzrd:generate`), hooks that render
  storyboard state as markdown tables with image links; marketplace entry
  (`.claude-plugin/marketplace.json`) so
  `/plugin marketplace add gratitude5dee/WZRD-Studio` works.
- **Codex** (`com.openai.codex/`): codex plugin marketplace metadata so
  `codex plugin marketplace add gratitude5dee/WZRD-Studio` + `/plugins`
  install works; skills auto-discovered from `.agents/skills/`.
- **Hermes** (`com.hermes/`): map tools into Hermes' MCP registration
  (`.hermes/agent.yaml` already sketches this); ensure draft/approve
  semantics for credit-spending tools.
- **Pi / OpenClaw / other Agent Skills hosts**: no extension needed —
  portable skills + `mcp.json` are the contract; verify skill frontmatter
  against agentskills.io spec.
- All SKILL.md files teach the same loop: check credits → cheap text
  iteration → explicit user confirmation before spending credits →
  generate → present results with image/video URLs.

## Phase 5 — Deployment

1. MCP server: deployed as today via Supabase Edge Functions
  (`supabase functions deploy mcp-server`); URL stays
  `https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/mcp-server`.
  Add `GET /health` and version reporting.
2. Plugin package: publish from the mirror repo
   (github.com/gratitude5dee/WZRD-Studio) so marketplace adds use the clean
   repo; CI job (a) validates schemas on every push, (b) tags releases,
   (c) publishes the tarball as a GitHub release asset, (d) updates
   `public/.well-known/agents.json` on the Vercel deploy.
3. `npx skills add https://github.com/gratitude5dee/WZRD-Studio` must work
   (skills at the standard location).
4. Docs page in the app (Settings → Agent access) with copy-paste install
   blocks per harness + PAT minting.

## Phase 6 — Testing (must pass before announcing)

Automated (CI):
- Schema validation: `plugin.json`, `mcp.json`, every `SKILL.md`.
- MCP conformance: scripted client does initialize → tools/list →
  tools/call for every tool against a local `supabase functions serve`,
  asserting shapes and auth failures (bad PAT → -32001, missing scope →
  clear error).
- Integration: seeded test user runs setup_project → storyboard_propose/
  commit → generate_shot_image (mock provider) → seedance_handoff
  (mode:review) → export path; asserts credits ledger deltas match catalog.

Manual matrix (scripted walkthrough per harness, recorded):
- **Claude Code**: marketplace add → install → `/wzrd:setup` with the
  "Mars Colony 7: Zero-G Noir" concept → storyboard iteration → one real
  2-credit shot generation → seedance review packet.
- **Codex**: same flow via codex plugin marketplace.
- **Hermes / Pi / OpenClaw**: MCP-only flow (no extension), confirming the
  portable core is sufficient.
- Each run verifies: the project appears in the web app; Studio/Timeline/
  Editor tabs open it; credits deducted exactly once; no page-key exposure.

## Non-goals (v1)

- No client-side export from the plugin (Editor export beyond the
  server-side Director's Cut path stays in-app).
- No Electron-specific tools (PTY, native FFmpeg) in the portable core.
- No plugin-initiated payment method changes (checkout links only).

## Sequencing & estimate

| Phase | Contents | Estimate |
|---|---|---|
| 0 | package scaffold + PAT auth | 1 session |
| 1 | full MCP tool surface | 1–2 sessions |
| 2 | project-setup workflow fixes | 0.5 session |
| 3 | storyboard sessions + seedance-handoff | 1–2 sessions |
| 4 | harness extensions + skills | 1 session |
| 5 | deployment + CI | 0.5 session |
| 6 | test matrix + fixes | 1 session |

External waits: Seedance 2.5 catalog pricing verification, and live-harness
manual runs need real accounts for Codex/Claude/Hermes.

## Definition of done

- `plugin.json`/`mcp.json`/skills validate against the v1.0.0 schemas.
- Claude Code and Codex install via their marketplaces; at least one
  MCP-only harness (Hermes or OpenClaw) completes the golden path.
- Golden path (setup → storyboard → shot image → seedance handoff →
  visible in web Timeline) passes on all tested harnesses with correct
  credit billing.
- Project-setup wizard bugs (step indicator, tab gating, style cards)
  fixed and covered by tests.
- Published release on gratitude5dee/WZRD-Studio with install docs.
