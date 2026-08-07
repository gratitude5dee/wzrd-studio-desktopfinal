import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".next", "shared/generated"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },

  // Quarantine boundary: only `src/qcut/**` and `src/legacy-pages/EditorPage.tsx` may import vendored QCut code.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/qcut/**", "src/legacy-pages/EditorPage.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            "@qcut-app/*",
            "@qcut/editor-core",
            "@qcut/platform-core",
            "@qcut/platform-web",
            "src/qcut/*",
            "@/qcut/*",
          ],
        },
      ],
    },
  },

  // Inside `src/qcut/**`, enforce zod3 usage and relax lint rules for vendored code.
  {
    files: ["src/qcut/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "zod",
              message: "Use the zod v3 alias (import from 'zod3') inside src/qcut/**.",
            },
          ],
        },
      ],

      // Vendored code: keep TypeScript type-checking strict, but don't churn lint.
      "no-empty": "off",
      "prefer-const": "off",
      "no-control-regex": "off",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  }
);
