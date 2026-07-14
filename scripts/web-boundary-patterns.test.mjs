import { describe, expect, it } from "vitest";

import { hasDirectElectronGlobal } from "./web-boundary-patterns.mjs";

describe("hasDirectElectronGlobal", () => {
	it.each([
		"window.electronAPI?.video",
		"window?.electronAPI?.video",
		"(window as any).electronAPI.storage",
		"(globalThis as unknown as DesktopGlobal).electronAPI",
		"globalThis['electronAPI']",
		"self?.['electronAPI']",
	])("detects direct desktop globals in %s", (sourceLine) => {
		expect(hasDirectElectronGlobal(sourceLine)).toBe(true);
	});

	it.each([
		"const electronAPI = platform().video",
		"pattern: /\\bwindow\\.electronAPI\\b/",
		"platform().storage.save(key, value)",
	])("allows platform access in %s", (sourceLine) => {
		expect(hasDirectElectronGlobal(sourceLine)).toBe(false);
	});
});
