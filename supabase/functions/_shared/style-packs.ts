export const STYLE_PROMPT_FRAGMENTS: Record<string, string> = {
  none: 'Neutral contemporary studio image, natural color, clean lighting, realistic proportions, no heavy stylization.',
  cinematic: 'Cinematic film still, rich contrast, controlled lens bloom, shallow depth of field, polished production lighting.',
  scribble: 'Expressive hand-drawn scribble illustration, visible pencil lines, rough ink contours, energetic paper texture.',
  'film-noir': 'Classic film noir, black and white, high contrast chiaroscuro, venetian-blind shadows, dramatic rim light.',
  anime: 'Modern anime key art, clean cel shading, expressive shapes, crisp outlines, vibrant controlled palette.',
  watercolor: 'Soft watercolor painting, translucent pigment washes, paper grain, gentle blooms, painterly edges.',
  'pixel-art': 'Retro pixel art, crisp blocky silhouette, limited color palette, visible pixel clusters, game key art composition.',
  cyberpunk: 'Cyberpunk neon atmosphere, magenta and cyan lighting, rain-slick surfaces, futuristic city glow, high-tech mood.',
  fantasy: 'Epic fantasy illustration, ethereal rim light, ornate world details, luminous atmosphere, magical realism.',
  documentary: 'Documentary realism, available light, natural skin tones, handheld observational composition, authentic texture.',
  horror: 'Atmospheric horror, low-key lighting, desaturated color, uneasy negative space, controlled shadow detail.',
  vintage: 'Vintage film look, warm aged color, visible grain, subtle vignette, analog lens softness.',
};

const DEFAULT_STYLE_PACK_ID = 'cinematic';
const STYLE_PACK_IDS = new Set(Object.keys(STYLE_PROMPT_FRAGMENTS));

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function getStylePackId(videoStyle?: string | null): string {
  const styleId = normalizeOptionalString(videoStyle) || DEFAULT_STYLE_PACK_ID;
  return STYLE_PACK_IDS.has(styleId) ? styleId : DEFAULT_STYLE_PACK_ID;
}

function getStyleReferenceBaseUrl(): string | null {
  const vercelUrl = normalizeOptionalString(Deno.env.get('VERCEL_URL'));
  const rawBase =
    normalizeOptionalString(Deno.env.get('WZRD_STYLE_REFERENCE_BASE_URL')) ||
    normalizeOptionalString(Deno.env.get('WZRD_APP_URL')) ||
    normalizeOptionalString(Deno.env.get('PUBLIC_APP_URL')) ||
    normalizeOptionalString(Deno.env.get('SITE_URL')) ||
    (vercelUrl ? `https://${vercelUrl}` : null);

  return rawBase?.replace(/\/+$/, '') || null;
}

export function getStylePromptFragment(videoStyle?: string | null): string {
  return STYLE_PROMPT_FRAGMENTS[getStylePackId(videoStyle)];
}

export function resolveBuiltInStyleReferenceUrl(videoStyle?: string | null): string | null {
  const baseUrl = getStyleReferenceBaseUrl();
  if (!baseUrl) return null;
  return `${baseUrl}/style-packs/${getStylePackId(videoStyle)}.webp`;
}
