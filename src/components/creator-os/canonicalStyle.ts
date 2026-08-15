import type { CSSProperties } from "react";

/**
 * The canonical Creator OS source declares layout with inline CSS declaration
 * strings. Keeping those strings verbatim in the React port makes the visual
 * diff against the canonical design auditable, so they are parsed into React
 * style objects here instead of being hand-translated to camelCase.
 */
const cache = new Map<string, CSSProperties>();

function splitDeclarations(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "(") depth += 1;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if (char === ";" && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));

  return parts;
}

function toCamelCase(property: string): string {
  return property.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

export function css(declarations: string): CSSProperties {
  const cached = cache.get(declarations);
  if (cached) return cached;

  const style: Record<string, string> = {};
  for (const declaration of splitDeclarations(declarations)) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const property = declaration.slice(0, separator).trim();
    const value = declaration.slice(separator + 1).trim();
    if (!property || !value) continue;
    style[property.startsWith("--") ? property : toCamelCase(property)] = value;
  }

  const parsed = style as CSSProperties;
  cache.set(declarations, parsed);

  return parsed;
}
