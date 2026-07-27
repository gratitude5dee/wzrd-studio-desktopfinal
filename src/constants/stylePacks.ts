export const STYLE_PACK_IDS = [
  'none',
  'cinematic',
  'scribble',
  'film-noir',
  'anime',
  'watercolor',
  'pixel-art',
  'cyberpunk',
  'fantasy',
  'documentary',
  'horror',
  'vintage',
] as const;

export type StylePackId = (typeof STYLE_PACK_IDS)[number];

export interface StylePack {
  id: StylePackId;
  label: string;
  description: string;
  thumbUrl: string;
  referenceUrl: string;
  promptFragment: string;
}

const stylePackUrl = (id: StylePackId) => `/style-packs/${id}.webp`;

export const STYLE_PACKS: readonly StylePack[] = [
  {
    id: 'none',
    label: 'None',
    description: 'Neutral studio reference with minimal stylization.',
    thumbUrl: stylePackUrl('none'),
    referenceUrl: stylePackUrl('none'),
    promptFragment: 'Neutral contemporary studio image, natural color, clean lighting, realistic proportions, no heavy stylization.',
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Film-like grading, soft contrast, lens depth.',
    thumbUrl: stylePackUrl('cinematic'),
    referenceUrl: stylePackUrl('cinematic'),
    promptFragment: 'Cinematic film still, rich contrast, controlled lens bloom, shallow depth of field, polished production lighting.',
  },
  {
    id: 'scribble',
    label: 'Scribble',
    description: 'Hand-drawn sketch lines and energetic texture.',
    thumbUrl: stylePackUrl('scribble'),
    referenceUrl: stylePackUrl('scribble'),
    promptFragment: 'Expressive hand-drawn scribble illustration, visible pencil lines, rough ink contours, energetic paper texture.',
  },
  {
    id: 'film-noir',
    label: 'Film Noir',
    description: 'Hard black and white lighting with deep shadows.',
    thumbUrl: stylePackUrl('film-noir'),
    referenceUrl: stylePackUrl('film-noir'),
    promptFragment: 'Classic film noir, black and white, high contrast chiaroscuro, venetian-blind shadows, dramatic rim light.',
  },
  {
    id: 'anime',
    label: 'Anime',
    description: 'Clean cel shading and expressive color.',
    thumbUrl: stylePackUrl('anime'),
    referenceUrl: stylePackUrl('anime'),
    promptFragment: 'Modern anime key art, clean cel shading, expressive shapes, crisp outlines, vibrant controlled palette.',
  },
  {
    id: 'watercolor',
    label: 'Watercolor',
    description: 'Soft washes, paper grain, painterly edges.',
    thumbUrl: stylePackUrl('watercolor'),
    referenceUrl: stylePackUrl('watercolor'),
    promptFragment: 'Soft watercolor painting, translucent pigment washes, paper grain, gentle blooms, painterly edges.',
  },
  {
    id: 'pixel-art',
    label: 'Pixel Art',
    description: 'Retro pixel clusters and limited palette.',
    thumbUrl: stylePackUrl('pixel-art'),
    referenceUrl: stylePackUrl('pixel-art'),
    promptFragment: 'Retro pixel art, crisp blocky silhouette, limited color palette, visible pixel clusters, game key art composition.',
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    description: 'Neon city color, tech glow, rain-slick contrast.',
    thumbUrl: stylePackUrl('cyberpunk'),
    referenceUrl: stylePackUrl('cyberpunk'),
    promptFragment: 'Cyberpunk neon atmosphere, magenta and cyan lighting, rain-slick surfaces, futuristic city glow, high-tech mood.',
  },
  {
    id: 'fantasy',
    label: 'Fantasy',
    description: 'Ethereal light, mythic detail, magical atmosphere.',
    thumbUrl: stylePackUrl('fantasy'),
    referenceUrl: stylePackUrl('fantasy'),
    promptFragment: 'Epic fantasy illustration, ethereal rim light, ornate world details, luminous atmosphere, magical realism.',
  },
  {
    id: 'documentary',
    label: 'Documentary',
    description: 'Grounded realism and available-light texture.',
    thumbUrl: stylePackUrl('documentary'),
    referenceUrl: stylePackUrl('documentary'),
    promptFragment: 'Documentary realism, available light, natural skin tones, handheld observational composition, authentic texture.',
  },
  {
    id: 'horror',
    label: 'Horror',
    description: 'Low-key light, unease, desaturated shadows.',
    thumbUrl: stylePackUrl('horror'),
    referenceUrl: stylePackUrl('horror'),
    promptFragment: 'Atmospheric horror, low-key lighting, desaturated color, uneasy negative space, controlled shadow detail.',
  },
  {
    id: 'vintage',
    label: 'Vintage',
    description: 'Aged film warmth, grain, and vignette.',
    thumbUrl: stylePackUrl('vintage'),
    referenceUrl: stylePackUrl('vintage'),
    promptFragment: 'Vintage film look, warm aged color, visible grain, subtle vignette, analog lens softness.',
  },
] as const;

export const FEATURED_STYLE_PACK_IDS = [
  'none',
  'cinematic',
  'scribble',
  'film-noir',
] as const satisfies readonly StylePackId[];

export const FEATURED_STYLE_PACKS = FEATURED_STYLE_PACK_IDS.map((id) => {
  const pack = STYLE_PACKS.find((item) => item.id === id);
  if (!pack) {
    throw new Error(`Missing featured style pack: ${id}`);
  }
  return pack;
});

export const DEFAULT_STYLE_PACK_ID: StylePackId = 'cinematic';

const STYLE_PACK_BY_ID = new Map(STYLE_PACKS.map((pack) => [pack.id, pack]));
const ABSOLUTE_URL_RE = /^(https?:|data:|blob:)/i;

export function isStylePackId(value: unknown): value is StylePackId {
  return typeof value === 'string' && STYLE_PACK_BY_ID.has(value as StylePackId);
}

export function getStylePackById(id?: string | null): StylePack {
  if (isStylePackId(id)) {
    return STYLE_PACK_BY_ID.get(id)!;
  }
  return STYLE_PACK_BY_ID.get(DEFAULT_STYLE_PACK_ID)!;
}

export function absolutizeStyleReferenceUrl(
  url?: string | null,
  origin?: string | null
): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  if (ABSOLUTE_URL_RE.test(trimmed) || !origin) return trimmed;

  try {
    return new URL(trimmed, origin).toString();
  } catch {
    return trimmed;
  }
}

export interface StyleReferenceInput {
  videoStyle?: string | null;
  styleReferenceUrl?: string | null;
  styleReferenceAssetId?: string | null;
}

export function resolveStyleReferenceUrl(
  input: StyleReferenceInput,
  origin?: string | null
): string | undefined {
  const customUrl = absolutizeStyleReferenceUrl(input.styleReferenceUrl, origin);
  if (customUrl) return customUrl;

  if (input.styleReferenceAssetId) {
    return undefined;
  }

  const stylePack = getStylePackById(input.videoStyle);
  return absolutizeStyleReferenceUrl(stylePack.referenceUrl, origin);
}

export function getStylePromptFragment(videoStyle?: string | null): string {
  return getStylePackById(videoStyle).promptFragment;
}
