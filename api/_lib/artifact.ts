export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

export interface Artifact {
  id: string;
  width: number;
  height: number;
  mimeType: string;
  createdAt: string;
  /** Short-lived signed URL into the private `artifacts` bucket. */
  url: string;
}

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ??
  process.env.SUPABASE_URL ??
  'https://ixkkrousepsiorwlaycp.supabase.co';

/** Read an artifact through the public `mini-artifacts` edge function. */
export async function fetchArtifact(id: string): Promise<Artifact | null> {
  const response = await fetch(
    `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/mini-artifacts?id=${encodeURIComponent(id)}`
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Artifact lookup failed (${response.status})`);
  return (await response.json()) as Artifact;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
