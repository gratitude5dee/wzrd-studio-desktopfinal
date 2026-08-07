import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const roots = ["app", "src"].filter((root) => existsSync(root));
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

const ignoredPathFragments = [
	`${path.sep}__tests__${path.sep}`,
	`${path.sep}__tests_disabled__${path.sep}`,
	".test.",
	".spec.",
	`${path.sep}src${path.sep}lib${path.sep}desktop.ts`,
	`${path.sep}src${path.sep}qcut${path.sep}app${path.sep}lib${path.sep}claude-bridge${path.sep}`,
	`${path.sep}src${path.sep}qcut${path.sep}app${path.sep}lib${path.sep}screen-recording${path.sep}`,
	`${path.sep}src${path.sep}qcut${path.sep}app${path.sep}types${path.sep}electron${path.sep}`,
	`${path.sep}src${path.sep}qcut${path.sep}bridge${path.sep}`,
	`${path.sep}src${path.sep}qcut${path.sep}platform${path.sep}desktop${path.sep}`,
	`${path.sep}src${path.sep}qcut${path.sep}platform${path.sep}wzrd${path.sep}`,
	`${path.sep}src${path.sep}types${path.sep}`,
];

const violations = [];

function isIgnored(filePath) {
	if (filePath.endsWith(".d.ts")) return true;
	const normalized = path.resolve(filePath);
	return ignoredPathFragments.some((fragment) => normalized.includes(fragment));
}

function walk(dir) {
	for (const entry of readdirSync(dir)) {
		const fullPath = path.join(dir, entry);
		const stat = statSync(fullPath);
		if (stat.isDirectory()) {
			if (entry === "node_modules" || entry === ".next" || entry === "dist") {
				continue;
			}
			walk(fullPath);
			continue;
		}
		if (!extensions.has(path.extname(fullPath)) || isIgnored(fullPath)) {
			continue;
		}
		checkFile(fullPath);
	}
}

function checkFile(filePath) {
	const source = readFileSync(filePath, "utf8");
	const lines = source.split(/\r?\n/);
	lines.forEach((line, index) => {
		const lineNumber = index + 1;
		const trimmed = line.trim();
		if (
			/(window|\(window\s+as\s+[^)]+\))\.(wzrdDesktop|wzrdQcut)\b/.test(
				line
			)
		) {
			violations.push({
				filePath,
				lineNumber,
				message:
					"Use the platform adapter instead of direct wzrdDesktop/wzrdQcut globals.",
			});
		}

		const importsElectronPackage =
			/\bfrom\s+["']electron(?:\/[^"']*)?["']/.test(line) ||
			/\bimport\s*\(\s*["']electron(?:\/[^"']*)?["']\s*\)/.test(line);
		const importsElectronRelative =
			/\bfrom\s+["'][^"']*electron\/[^"']*["']/.test(line) &&
			!trimmed.startsWith("import type ");

		if (importsElectronPackage || importsElectronRelative) {
			violations.push({
				filePath,
				lineNumber,
				message:
					"Web-target code cannot import Electron runtime modules or values.",
			});
		}
	});
}

for (const root of roots) {
	walk(root);
}

if (violations.length > 0) {
	console.error("Web boundary check failed:");
	for (const violation of violations) {
		console.error(
			`- ${violation.filePath}:${violation.lineNumber} ${violation.message}`
		);
	}
	process.exit(1);
}

console.log("Web boundary check passed.");
