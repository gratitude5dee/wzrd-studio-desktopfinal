# WZRD Studio Desktop (macOS)

WZRD Studio Desktop is the packaged macOS build of **WZRD**, an AI creative studio for moving from concept → storyline → node-based generation → editing → final delivery in one workflow.

This repo contains:

- React/Vite renderer
- Electron shell (desktop deep-links + desktop-friendly auth)
- Supabase Edge Functions + migrations (including Postz)

---

## Highlights / Features

- **Studio canvas**: node-based generation workflows (React Flow)
- **Video editing + preview**: Remotion-powered editor pipeline
- **Desktop deep-link support**: `wzrd://...` routes handled by Electron
- **Desktop auth plumbing**: Thirdweb in-app wallet auth bridged into Supabase sessions
- **Postz (social scheduler)**:
  - OAuth channel connect flow that returns to the desktop app via deep-link
  - Multi-channel composer + per-channel validation
  - Calendar view with drag/move + state filters (Draft / Queue / Publishing / Published / Error)
  - Attach media from project assets

---

## Install (DMG)

This project currently builds an **unsigned** DMG named:

```text
wzrdstudiofinal555-apfs.dmg
```

### Install steps

1. Download (or build) the DMG.
2. Double-click `wzrdstudiofinal555-apfs.dmg` to mount it.
3. Drag **WZRD Studio.app** into **Applications**.
4. Eject the mounted DMG.

### First launch (Gatekeeper)

Because the DMG is unsigned/notarized, macOS may block the first launch.

Try one of these:

- **Right-click** (or Control-click) **WZRD Studio.app** → **Open** → confirm.
- Or go to **System Settings → Privacy & Security** and choose **Open Anyway** for WZRD Studio.

---

## Desktop deep-links

Auth callback:

```text
wzrd://auth/thirdweb
```

Postz channel connect callback:

```text
wzrd://postz/connected
```

Desktop deep-link diagnostics are written with auth values redacted:

```text
~/Library/Logs/WZRD Studio/desktop.log
```

---

## Requirements

- macOS (Apple Silicon / `arm64` for the current packaged target)
- Bun
- Node.js compatible with the project toolchain
- Supabase project credentials (and any provider keys you use)

---

## Environment

Create a local `.env` file with the required public Supabase and provider values. At minimum:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
VITE_THIRDWEB_CLIENT_ID=<thirdweb-client-id>
```

Additional provider keys may be required depending on which generation workflows or Postz providers you enable.

---

## Development

This repository uses Bun exclusively for dependency installation and package scripts. Do not run `npm install` or commit npm lockfiles; CI and Vercel install with the committed `bun.lock`.

Install dependencies:

```bash
bun install --frozen-lockfile
```

Start the web renderer:

```bash
bun run dev
```

Start the Electron desktop app in development:

```bash
bun run desktop:dev
```

---

## Verification

Build the production Next.js app, start it on a free local port, and verify that `/` serves hydrated HTML without a Next.js error shell:

```bash
bun run web:smoke
```

Run targeted unit tests:

```bash
bun x vitest run src/lib/thirdweb/wallets.test.ts src/lib/desktop.test.ts electron/deep-links.test.js
```

Run the desktop smoke test:

```bash
bun run desktop:test
```

Run lint:

```bash
bun run lint
```

---

## Packaging (build the APFS DMG)

Build the macOS Apple Silicon DMG:

```bash
bun run desktop:dist:mac
```

Outputs:

```text
release/wzrdstudiofinal555-apfs.dmg
release/mac-arm64/WZRD Studio.app
```

> Note: the DMG build is forced to **APFS** via `hdiutil` to avoid issues observed with HFS+ DMGs on this machine.

---

## Repo notes

- Generated build outputs are ignored (for example: `dist/`, `release/`)
- Desktop shell code lives in `electron/`
- Renderer app code lives in `src/`
- Supabase Edge Functions live in `supabase/functions/`
- Supabase migrations live in `supabase/migrations/`
