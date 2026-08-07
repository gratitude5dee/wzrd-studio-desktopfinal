import { afterEach, describe, expect, it, vi } from "vitest";

import { readPublicEnv, readPublicFlag } from "../env";

describe("public env helper", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prefers NEXT_PUBLIC values over legacy VITE fallbacks", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://next.example.test");
    vi.stubEnv("VITE_SUPABASE_URL", "https://vite.example.test");

    expect(readPublicEnv("SUPABASE_URL", ["VITE_SUPABASE_URL"])).toBe(
      "https://next.example.test"
    );
  });

  it("falls back to legacy VITE values during migration", () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://vite.example.test");

    expect(readPublicEnv("SUPABASE_URL", ["VITE_SUPABASE_URL"])).toBe(
      "https://vite.example.test"
    );
  });

  it("ignores placeholder env strings", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "undefined");
    vi.stubEnv("VITE_SUPABASE_URL", "https://vite.example.test");

    expect(readPublicEnv("SUPABASE_URL", ["VITE_SUPABASE_URL"])).toBe(
      "https://vite.example.test"
    );
  });

  it("parses public flags with a fallback", () => {
    expect(readPublicFlag("USE_MOCK_ASSETS", ["VITE_USE_MOCK_ASSETS"], true)).toBe(true);

    vi.stubEnv("VITE_USE_MOCK_ASSETS", "false");
    expect(readPublicFlag("USE_MOCK_ASSETS", ["VITE_USE_MOCK_ASSETS"], true)).toBe(false);

    vi.stubEnv("NEXT_PUBLIC_USE_MOCK_ASSETS", "true");
    expect(readPublicFlag("USE_MOCK_ASSETS", ["VITE_USE_MOCK_ASSETS"], false)).toBe(true);
  });
});
