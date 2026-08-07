import { createClient } from "@supabase/supabase-js";

import type { Database } from "./types";

const FALLBACK_URL = "https://ixkkrousepsiorwlaycp.supabase.co";
const FALLBACK_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml4a2tyb3VzZXBzaW9yd2xheWNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAzMzI1MjcsImV4cCI6MjA1NTkwODUyN30.eX_P7bJam2IZ20GEghfjfr-pNwMynsdVb3Rrfipgls4";

function clean(value: string | undefined): string | undefined {
  if (!value || value === "undefined" || value === "null") return undefined;
  return value;
}

function readServerUrl(): string {
  return (
    clean(process.env.SUPABASE_URL) ??
    clean(process.env.NEXT_PUBLIC_SUPABASE_URL) ??
    clean(process.env.VITE_SUPABASE_URL) ??
    FALLBACK_URL
  );
}

function readServerAnonKey(): string {
  return (
    clean(process.env.SUPABASE_ANON_KEY) ??
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ??
    clean(process.env.VITE_SUPABASE_ANON_KEY) ??
    clean(process.env.VITE_SUPABASE_PUBLISHABLE_KEY) ??
    FALLBACK_ANON_KEY
  );
}

function readServerKey(): string {
  return (
    clean(process.env.SUPABASE_SERVICE_ROLE_KEY) ??
    clean(process.env.SUPABASE_SERVICE_KEY) ??
    readServerAnonKey()
  );
}

export function createSupabaseServerClient(accessToken?: string) {
  return createClient<Database>(readServerUrl(), readServerKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: accessToken
      ? {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      : undefined,
  });
}
