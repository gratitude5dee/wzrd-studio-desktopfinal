import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { getRouteEntry } from '@/lib/routes';

const CORE_ROUTE_AUDIT_FILES = [
  'src/components/AppHeader.tsx',
  'src/components/CreditsDisplay.tsx',
  'src/components/home/Header.tsx',
  'src/components/home/HeroSection.tsx',
  'src/components/project-setup/NavigationFooter.tsx',
  'src/components/project-setup/ProjectSetupHeader.tsx',
  'src/components/studio/StudioBottomBar.tsx',
  'src/components/studio/StudioErrorBoundary.tsx',
  'src/legacy-pages/Credits.tsx',
  'src/legacy-pages/DirectorCutPage.tsx',
  'src/legacy-pages/EditorPage.tsx',
  'src/legacy-pages/Home.tsx',
  'src/legacy-pages/Login.tsx',
  'src/legacy-pages/NotFound.tsx',
  'src/legacy-pages/SettingsBillingDocsPage.tsx',
  'src/legacy-pages/SettingsBillingPage.tsx',
  'src/legacy-pages/StoryboardPage.tsx',
  'src/providers/AuthProvider.tsx',
];

const ROUTE_LITERAL_PATTERNS = [
  /navigate\(\s*['"]([^'"`]+)['"]/g,
  /\bto=\s*['"]([^'"`]+)['"]/g,
  /\b(?:href|to)\s*:\s*['"]([^'"`]+)['"]/g,
];

function normalizeLiteral(literal: string) {
  return literal.split('?')[0]?.split('#')[0] ?? literal;
}

function extractRouteLiterals(source: string) {
  const literals: string[] = [];

  for (const pattern of ROUTE_LITERAL_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const value = match[1];
      if (typeof value === 'string' && value.startsWith('/')) {
        literals.push(value);
      }
    }
  }

  return literals;
}

describe('core route audit', () => {
  it('uses registered, non-deferred route literals in audited core files', () => {
    const issues: string[] = [];

    for (const relativeFile of CORE_ROUTE_AUDIT_FILES) {
      const absoluteFile = path.resolve(process.cwd(), relativeFile);
      const source = readFileSync(absoluteFile, 'utf8');
      const literals = extractRouteLiterals(source);

      for (const literal of literals) {
        const routePath = normalizeLiteral(literal);
        const entry = getRouteEntry(routePath);

        if (!entry) {
          issues.push(`${relativeFile}: unregistered route literal ${literal}`);
          continue;
        }

        if (entry.category === 'deferred') {
          issues.push(`${relativeFile}: deferred route literal ${literal}`);
        }
      }
    }

    expect(issues).toEqual([]);
  });
});
