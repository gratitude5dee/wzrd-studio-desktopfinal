# WZRD.Studio Web Migration Inventory

Generated on 2026-06-19 for `goal-vercel.md`.

## Project Shape

- Current web shell is Vite 5 + React 19 with `react-router-dom`.
- Current desktop shell is Electron, with `package.json` `main` set to `electron/main.js`.
- Package manager/runtime target is Bun; lockfiles present are `bun.lock` and `bun.lockb`.
- No `app/`, `next.config.*`, `.vercel/`, or Vercel project link exists yet.

## Electron Bridge Surface

Electron bridge globals are intentionally confined to these areas:

- `electron/preload.cjs` exposes `window.wzrdDesktop` and `window.wzrdQcut`.
- `src/qcut/platform/wzrd/index.ts` adapts those globals into the `PlatformAPI` contract for desktop.
- `src/qcut/bridge/agent-api.ts` handles desktop agent-command bridge messages.
- `src/lib/desktop.ts` and desktop-focused tests cover legacy desktop billing/auth helpers.
- `src/types/wzrdDesktop.d.ts` declares the bridge shape.

The previous direct editor call to `window.wzrdDesktop.cacheRemoteMedia` in `src/qcut/QCutEditor.tsx` has been moved behind `platform().mediaImport.cacheRemoteMedia`.

## Electron Imports

- Runtime Electron imports are located in `electron/**` and remain desktop-only.
- Web-side `src/qcut/app/**` currently contains type-only imports and type barrels that reference Electron type definitions. These are migration debt for the Next build, but they do not invoke Electron at runtime.
- The new `scripts/check-web-boundaries.mjs` fails on direct Electron runtime imports and direct `window.wzrdDesktop` / `window.wzrdQcut` access outside explicitly allowed desktop adapter, bridge, type, and test files.

## Platform Adapter Usage

The QCut editor already initializes the platform singleton via:

- `src/qcut/QCutEditor.tsx`
- `src/qcut/platform/core/provider.ts`
- `src/qcut/platform/wzrd/index.ts`
- `src/qcut/platform/web/index.ts`

Important namespaces used by editor/app code include:

- `files`
- `storage`
- `mediaImport`
- `projectFolder`
- `projectJson`
- `ffmpeg`
- `audio`
- `video`
- `transcription`
- `fal`
- `geminiChat`
- `pty`
- `skills`
- `mcp`
- `updates`
- optional `claude`, `piAgent`, and `remotion`

## Immediate Migration Notes

- Keep the Electron desktop product intact; do not edit `electron/**` for the web migration unless an explicit desktop compatibility fix is needed.
- Prefer adding platform adapter capabilities over adding runtime conditionals in editor code.
- Treat direct bridge/global access as a regression unless it is inside an allowed desktop adapter or bridge file.
