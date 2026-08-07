import { escapeHtml, fetchArtifact, OG_HEIGHT, OG_WIDTH } from '../_lib/artifact.js';

/**
 * Per-artifact OG meta for `/a/:id`.
 *
 * This is a Vite SPA, so `index.html` is a single static shell with no
 * per-route metadata. Rather than prerendering or user-agent sniffing, every
 * `/a/:id` request is rewritten here (see `vercel.json`): the function fetches
 * the built shell from the same deployment, injects the artifact's tags into
 * `<head>`, and returns it. Crawlers and humans get byte-identical HTML, and
 * React hydrates the route exactly as it would from the static shell.
 */

const SITE_ORIGIN = 'https://mini.wzrd.tech';

function ogTags(id: string, origin: string): string {
  const permalink = `${origin}/a/${escapeHtml(id)}`;
  const card = `${origin}/api/og/${escapeHtml(id)}`;
  return [
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="WZRD">',
    '<meta property="og:title" content="Made with WZRD">',
    '<meta property="og:description" content="Make your own at mini.wzrd.tech/image">',
    `<meta property="og:url" content="${permalink}">`,
    `<meta property="og:image" content="${card}">`,
    `<meta property="og:image:width" content="${OG_WIDTH}">`,
    `<meta property="og:image:height" content="${OG_HEIGHT}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:image" content="${card}">`,
  ].join('\n    ');
}

/** Drop the shell's own OG/twitter tags so the artifact's win. */
function stripExistingCards(html: string): string {
  return html.replace(
    /\s*<meta[^>]+(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>/g,
    ''
  );
}

export default async function handler(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const id = requestUrl.pathname.split('/').pop() ?? '';
  const origin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : requestUrl.origin;
  const publicOrigin = process.env.VERCEL_ENV === 'production' ? SITE_ORIGIN : origin;

  try {
    // Confirms the artifact exists before advertising a card for it.
    const artifact = await fetchArtifact(id);
    const shell = await fetch(`${origin}/index.html`);
    if (!shell.ok) throw new Error(`Shell fetch failed (${shell.status})`);

    let html = await shell.text();
    if (artifact) {
      html = stripExistingCards(html).replace(
        '</head>',
        `  ${ogTags(id, publicOrigin)}\n  </head>`
      );
    }

    return new Response(html, {
      status: artifact ? 200 : 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('artifact-shell error:', error);
    return new Response(
      `<!doctype html><meta charset="utf-8"><title>WZRD</title><a href="/image">Make your own</a>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}
