# QCut Editor Integration (WZRD Studio Desktop)

## Summary
WZRD’s `/projects/:projectId/editor` route now mounts the vendored **QCut** editor (under `src/qcut/**`) as the native editor experience.

- Canonical route: `/projects/:projectId/editor`
- Legacy aliases: `/editor/:projectId`, `/video-editor/:projectId` (redirect)
- **Legacy editor** remains accessible via `?legacy=1`.

## Architecture

### Key entry points
- `src/legacy-pages/EditorPage.tsx`: host route entry; mounts `<QCutEditor/>` or legacy editor when `?legacy=1`.
- `src/qcut/QCutEditor.tsx`: QCut editor mount + platform init + project loading.

### Platform adapter
QCut’s editor accesses privileged operations through `platform()` (`@qcut/platform-core`).

- Adapter: `src/qcut/platform/wzrd/index.ts`
  - Starts from the web adapter, then upgrades capabilities when running in Electron.
  - Uses `window.wzrdQcut` (preload namespace) for desktop-only APIs.

### Electron bridge
- `electron/qcut-bridge.js`: IPC handlers for QCut desktop namespaces.
- `electron/preload.cjs`: exposes `window.wzrdQcut.*` (contextIsolation-safe).

### Agent command surface
The editor exposes a typed command API:

- Renderer global: `window.wzrd.editor.commands.execute(command, args)`
  - Implemented in `src/qcut/bridge/agent-api.ts`
  - Includes rate limiting + in-memory ring-buffer command log (`window.wzrd.editor.debug.*`).

- Local MCP-like server (JSON-RPC2 over HTTP, localhost only):
  - `electron/qcut-mcp-server.js`
  - Discover via: `window.wzrdQcut.mcp.getInfo()`
  - Auth token required for requests (see below).

- Voice layer:
  - Editor actions are registered in `src/voice/actions/registry.ts` and routed to `window.wzrd.editor.commands.execute(...)`.

## MCP server auth
The local MCP server is bound to `127.0.0.1` and requires an auth token.

Get connection details in DevTools:

```js
await window.wzrdQcut.mcp.getInfo();
// { url, authorizationHeader, authToken, ... }
```

Include either header in MCP requests:
- `Authorization: Bearer <token>` (recommended)
- `x-wzrd-qcut-token: <token>`

## Parity matrix (legacy editor → QCut)
This is a working doc; verify and update as parity work continues.

| Legacy feature | Where it lived | QCut equivalent | Status / notes |
|---|---|---|---|
| Multi-track timeline | `src/components/editor/TimelinePanel/**` | QCut timeline / tracks | Implemented |
| Text overlays | legacy clip type / properties panel | QCut text elements | Implemented (basic). Verify style parity. |
| Image/video trim/split | legacy timeline ops | QCut timeline ops | Implemented |
| Undo/redo | legacy store history | QCut history | Implemented |
| Export (mp4) | legacy export panel / Remotion | QCut export engines | Implemented (wasm/web + native ffmpeg in Electron) |
| Masks | legacy masks | TBD | Not verified. Likely gap; evaluate QCut masking/effects pipeline. |
| Keyframes | legacy keyframes | TBD | Not verified; check QCut animation/keyframe support. |
| Bookmarks/markers | legacy bookmarks | TBD | Not verified; check QCut markers / timeline annotations. |
| Retime / speed ramp | legacy retime | TBD | Not verified; check QCut element speed/retime tools. |

## Legacy timeline importer
On first open of a project, if the QCut timeline is empty, WZRD will attempt a one-time import from the legacy timeline tables:

- Implementation: `src/qcut/bridge/legacy-importer.ts`
- Trigger: `src/qcut/QCutEditor.tsx`

Importer behavior:
- Imports legacy clips/audio tracks into QCut media store using the original URLs.
- Creates tracks per legacy lane index.
- Marks completion in `localStorage` (`wzrd:qcut:legacy-imported:<projectId>`) to avoid repeated imports.

## Decisions / tradeoffs

### MCP transport
We implemented a lightweight localhost JSON-RPC2 server (`electron/qcut-mcp-server.js`) instead of wiring into the existing `mcp/` servers.

Reasons:
- Keeps editor-control tools co-located with the running Electron editor.
- Avoids introducing additional service orchestration during development.

Follow-ups:
- If we need the editor tools to be managed by WZRD’s broader MCP orchestration, we can replace/augment this transport while keeping the renderer command surface stable.
