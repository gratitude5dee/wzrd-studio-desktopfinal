const globalExpression = String.raw`(?:\b(?:window|globalThis|self)|\((?:window|globalThis|self)\s+as\s+[^)]+\))`;
const directProperty = new RegExp(
	String.raw`${globalExpression}\s*(?:\.|\?\.)electronAPI\b`
);
const directBracket = new RegExp(
	String.raw`${globalExpression}\s*(?:\?\.)?\[\s*["']electronAPI["']\s*\]`
);

export function hasDirectElectronGlobal(sourceLine) {
	return directProperty.test(sourceLine) || directBracket.test(sourceLine);
}
