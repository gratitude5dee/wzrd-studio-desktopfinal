// Centralized Supabase configuration with hardcoded fallbacks.
// These are PUBLIC keys (anon/publishable) — safe to embed in client bundles.

import { readPublicEnv } from "@/lib/env";

const FALLBACK_URL = "https://ixkkrousepsiorwlaycp.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4a2tyb3VzZXBzaW9yd2xheWNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAzMzI1MjcsImV4cCI6MjA1NTkwODUyN30.eX_P7bJam2IZ20GEghfjfr-pNwMynsdVb3Rrfipgls4";

function clean(val: string | undefined): string | undefined {
  if (!val || val === "" || val === "undefined" || val === "null") return undefined;
  return val;
}

export const SUPABASE_URL: string =
  clean(readPublicEnv("SUPABASE_URL", ["VITE_SUPABASE_URL"])) ?? FALLBACK_URL;

export const SUPABASE_ANON_KEY: string =
  clean(readPublicEnv("SUPABASE_ANON_KEY", ["VITE_SUPABASE_ANON_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY"])) ??
  FALLBACK_ANON_KEY;
