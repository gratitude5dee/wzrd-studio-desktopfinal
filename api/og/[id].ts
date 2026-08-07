import sharp, { type Sharp } from 'sharp';

import { fetchArtifact, OG_HEIGHT, OG_WIDTH } from '../_lib/artifact.js';

/**
 * Artifact OG card: 1200×630, artifact bled to frame, 24px ink bar at 85%
 * opacity with the wordmark left and the mini-app URL mono right.
 *
 * Encoded as progressive JPEG and stepped down in quality until it fits the
 * 300KB budget — a PNG of a photograph at this size cannot.
 */

const MAX_BYTES = 300 * 1024;
const BAR_HEIGHT = 24;
const QUALITY_STEPS = [82, 70, 58, 46];

function barSvg(): Buffer {
  return Buffer.from(
    `<svg width="${OG_WIDTH}" height="${BAR_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${OG_WIDTH}" height="${BAR_HEIGHT}" fill="#0b0e14" fill-opacity="0.85"/>
      <text x="24" y="16.5" font-family="Helvetica, Arial, sans-serif" font-size="12"
        font-weight="600" letter-spacing="2.2" fill="#e7ebf2">WZRD</text>
      <text x="${OG_WIDTH - 24}" y="16.5" text-anchor="end" font-family="ui-monospace, Menlo, monospace"
        font-size="11" fill="#9aa6bc">mini.wzrd.tech/image</text>
    </svg>`
  );
}

async function encodeWithinBudget(pipeline: Sharp): Promise<Buffer> {
  let encoded = Buffer.alloc(0);
  for (const quality of QUALITY_STEPS) {
    encoded = await pipeline.clone().jpeg({ quality, progressive: true, mozjpeg: true }).toBuffer();
    if (encoded.byteLength <= MAX_BYTES) return encoded;
  }
  return encoded;
}

export default async function handler(request: Request): Promise<Response> {
  const id = new URL(request.url).pathname.split('/').pop();
  if (!id) return new Response('Missing artifact id', { status: 400 });

  try {
    const artifact = await fetchArtifact(id);
    if (!artifact) return new Response('Artifact not found', { status: 404 });

    const source = await fetch(artifact.url);
    if (!source.ok) return new Response('Artifact unavailable', { status: 502 });

    const card = sharp(Buffer.from(await source.arrayBuffer()))
      .resize(OG_WIDTH, OG_HEIGHT, { fit: 'cover', position: 'attention' })
      .composite([{ input: barSvg(), top: OG_HEIGHT - BAR_HEIGHT, left: 0 }]);

    const body = await encodeWithinBudget(card);

    return new Response(body, {
      headers: {
        'Content-Type': 'image/jpeg',
        // Artifacts are immutable once published.
        'Cache-Control': 'public, immutable, max-age=31536000, s-maxage=31536000',
      },
    });
  } catch (error) {
    console.error('og-image error:', error);
    return new Response('Could not render card', { status: 500 });
  }
}
