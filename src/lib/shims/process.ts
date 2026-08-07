// Minimal browser-safe `process` shim.
//
// Some dependencies (ex: @babel/* used by Remotion tooling) reference `process.env`
// and occasionally `process.cwd()` even when bundled for the browser.
//
// We provide a tiny global `process` implementation so those references don't crash.

type ProcessShim = {
  env?: Record<string, string | undefined>;
  cwd?: () => string;
};

const g = globalThis as unknown as { process?: ProcessShim };

g.process ??= {};
g.process.env ??= {};

g.process.cwd ??= (() => "/");

export {};
