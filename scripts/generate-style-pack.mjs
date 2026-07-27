#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const outputDir = path.join(repoRoot, 'public', 'style-packs');
const width = 1024;
const height = 576;

const styles = [
  {
    id: 'none',
    label: 'None',
    prompt: 'Neutral contemporary studio reference, natural color, clean lighting, realistic proportions.',
    colors: ['#171b22', '#4b5563', '#e5e7eb'],
    accent: '#d1d5db',
    pattern: 'grid',
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    prompt: 'Cinematic film still, soft lens depth, rich contrast, polished production lighting.',
    colors: ['#101820', '#264653', '#f4a261'],
    accent: '#ffd166',
    pattern: 'bars',
  },
  {
    id: 'scribble',
    label: 'Scribble',
    prompt: 'Expressive hand-drawn scribble illustration with rough ink contours and paper texture.',
    colors: ['#f7f1df', '#232323', '#e76f51'],
    accent: '#111111',
    pattern: 'scribble',
  },
  {
    id: 'film-noir',
    label: 'Film Noir',
    prompt: 'Classic film noir, black and white, high contrast chiaroscuro, dramatic rim light.',
    colors: ['#030303', '#313131', '#f8f8f8'],
    accent: '#ffffff',
    pattern: 'blinds',
  },
  {
    id: 'anime',
    label: 'Anime',
    prompt: 'Modern anime key art with clean cel shading, crisp outlines, and vivid color.',
    colors: ['#f72585', '#4361ee', '#fff3b0'],
    accent: '#ffffff',
    pattern: 'speed',
  },
  {
    id: 'watercolor',
    label: 'Watercolor',
    prompt: 'Soft watercolor painting, translucent pigment washes, paper grain, gentle blooms.',
    colors: ['#edf6f9', '#83c5be', '#ffddd2'],
    accent: '#006d77',
    pattern: 'wash',
  },
  {
    id: 'pixel-art',
    label: 'Pixel Art',
    prompt: 'Retro pixel art, crisp blocky silhouette, limited palette, visible pixel clusters.',
    colors: ['#1b1f3b', '#ff6b6b', '#4ecdc4'],
    accent: '#ffe66d',
    pattern: 'pixels',
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk',
    prompt: 'Cyberpunk neon atmosphere, magenta and cyan lighting, rain-slick futuristic city glow.',
    colors: ['#080013', '#00f5d4', '#f15bb5'],
    accent: '#fee440',
    pattern: 'neon',
  },
  {
    id: 'fantasy',
    label: 'Fantasy',
    prompt: 'Epic fantasy illustration, ethereal rim light, ornate world details, luminous atmosphere.',
    colors: ['#233d4d', '#a1c181', '#fcca46'],
    accent: '#fefae0',
    pattern: 'runes',
  },
  {
    id: 'documentary',
    label: 'Documentary',
    prompt: 'Documentary realism, available light, natural skin tones, observational composition.',
    colors: ['#2f3e46', '#cad2c5', '#b08968'],
    accent: '#f1faee',
    pattern: 'grain',
  },
  {
    id: 'horror',
    label: 'Horror',
    prompt: 'Atmospheric horror, low-key lighting, desaturated color, uneasy negative space.',
    colors: ['#050505', '#3c096c', '#9d0208'],
    accent: '#e0e1dd',
    pattern: 'fog',
  },
  {
    id: 'vintage',
    label: 'Vintage',
    prompt: 'Vintage film look, warm aged color, visible grain, subtle vignette, analog lens softness.',
    colors: ['#3d2b1f', '#c08552', '#f3d5b5'],
    accent: '#ffe8d6',
    pattern: 'film',
  },
];

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function patternMarkup(style) {
  switch (style.pattern) {
    case 'grid':
      return '<path d="M80 90H944M80 180H944M80 270H944M80 360H944M80 450H944M160 64V512M320 64V512M480 64V512M640 64V512M800 64V512" stroke="white" stroke-opacity=".08" stroke-width="2"/>';
    case 'bars':
      return '<path d="M0 408H1024V576H0z" fill="black" fill-opacity=".26"/><path d="M0 0H1024V88H0z" fill="black" fill-opacity=".22"/><circle cx="780" cy="210" r="170" fill="white" fill-opacity=".08"/>';
    case 'scribble':
      return Array.from({ length: 26 }, (_, i) => {
        const y = 72 + i * 17;
        const x = i % 2 === 0 ? 72 : 118;
        return `<path d="M${x} ${y}c80-42 140 40 222-4s126-58 216 0 160 22 250-20" fill="none" stroke="black" stroke-opacity=".20" stroke-width="${2 + (i % 3)}" stroke-linecap="round"/>`;
      }).join('');
    case 'blinds':
      return Array.from({ length: 14 }, (_, i) => `<path d="M0 ${i * 48}H1024V${i * 48 + 18}H0z" fill="white" fill-opacity="${i % 2 ? '.09' : '.16'}"/>`).join('');
    case 'speed':
      return Array.from({ length: 24 }, (_, i) => {
        const angle = (i / 24) * Math.PI * 2;
        const x = 512 + Math.cos(angle) * 80;
        const y = 280 + Math.sin(angle) * 48;
        const x2 = 512 + Math.cos(angle) * 520;
        const y2 = 280 + Math.sin(angle) * 300;
        return `<path d="M${x.toFixed(1)} ${y.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="white" stroke-opacity=".18" stroke-width="5"/>`;
      }).join('');
    case 'wash':
      return Array.from({ length: 10 }, (_, i) => `<circle cx="${120 + i * 88}" cy="${120 + (i % 4) * 86}" r="${90 + (i % 3) * 26}" fill="white" fill-opacity=".12"/>`).join('');
    case 'pixels':
      return Array.from({ length: 88 }, (_, i) => {
        const x = 32 + (i % 22) * 46;
        const y = 52 + Math.floor(i / 22) * 112;
        return `<rect x="${x}" y="${y}" width="24" height="24" fill="white" fill-opacity="${i % 5 === 0 ? '.22' : '.10'}"/>`;
      }).join('');
    case 'neon':
      return '<path d="M70 438H954" stroke="#00f5d4" stroke-opacity=".65" stroke-width="4"/><path d="M130 130h150v280H130zM736 98h118v326H736zM610 170h86v250H610z" fill="white" fill-opacity=".08"/><path d="M130 210h150M736 180h118M610 250h86" stroke="#f15bb5" stroke-opacity=".8" stroke-width="3"/>';
    case 'runes':
      return Array.from({ length: 18 }, (_, i) => {
        const x = 84 + (i % 9) * 106;
        const y = i < 9 ? 100 : 446;
        return `<path d="M${x} ${y}l20-42 20 42m-30-18h20" fill="none" stroke="white" stroke-opacity=".20" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
      }).join('');
    case 'grain':
      return Array.from({ length: 160 }, (_, i) => {
        const x = (i * 79) % width;
        const y = (i * 137) % height;
        return `<circle cx="${x}" cy="${y}" r="${1 + (i % 3)}" fill="white" fill-opacity=".08"/>`;
      }).join('');
    case 'fog':
      return Array.from({ length: 8 }, (_, i) => `<ellipse cx="${120 + i * 126}" cy="${410 - (i % 3) * 26}" rx="210" ry="42" fill="white" fill-opacity=".07"/>`).join('');
    case 'film':
      return '<path d="M58 42v492M966 42v492" stroke="black" stroke-opacity=".35" stroke-width="44"/>' +
        Array.from({ length: 12 }, (_, i) => `<rect x="40" y="${58 + i * 40}" width="36" height="22" rx="4" fill="#f3d5b5" fill-opacity=".55"/><rect x="948" y="${58 + i * 40}" width="36" height="22" rx="4" fill="#f3d5b5" fill-opacity=".55"/>`).join('');
    default:
      return '';
  }
}

function subjectMarkup(style) {
  const [dark, mid, light] = style.colors;
  return `
    <g filter="url(#shadow)">
      <ellipse cx="512" cy="472" rx="190" ry="30" fill="#000" fill-opacity=".26"/>
      <path d="M414 440c18-82 56-126 98-126s80 44 98 126z" fill="${mid}" stroke="${style.accent}" stroke-opacity=".45" stroke-width="4"/>
      <circle cx="512" cy="246" r="72" fill="${light}" stroke="${style.accent}" stroke-width="5"/>
      <path d="M454 246c28-58 96-74 146-28 14-54-42-100-92-94-58 8-94 58-76 116z" fill="${dark}" fill-opacity=".82"/>
      <rect x="382" y="336" width="260" height="78" rx="18" fill="#050505" fill-opacity=".42" stroke="${style.accent}" stroke-opacity=".32"/>
      <circle cx="472" cy="374" r="25" fill="${style.accent}" fill-opacity=".55"/>
      <rect x="516" y="350" width="82" height="44" rx="7" fill="${light}" fill-opacity=".65"/>
    </g>
  `;
}

function svgForStyle(style) {
  const [dark, mid, light] = style.colors;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${dark}"/>
      <stop offset="55%" stop-color="${mid}"/>
      <stop offset="100%" stop-color="${light}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="42%" r="60%">
      <stop offset="0%" stop-color="${style.accent}" stop-opacity=".32"/>
      <stop offset="100%" stop-color="${style.accent}" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000" flood-opacity=".35"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  ${patternMarkup(style)}
  ${subjectMarkup(style)}
  <path d="M96 96h832v384H96z" fill="none" stroke="${style.accent}" stroke-opacity=".28" stroke-width="4"/>
  <path d="M96 152h118M810 152h118M96 424h118M810 424h118" stroke="${style.accent}" stroke-opacity=".42" stroke-width="7" stroke-linecap="round"/>
  <rect x="112" y="410" width="336" height="52" rx="10" fill="#000" fill-opacity=".38"/>
  <text x="132" y="444" font-family="Inter, Arial, sans-serif" font-size="30" font-weight="700" fill="white">${escapeXml(style.label)}</text>
  <text x="132" y="474" font-family="Inter, Arial, sans-serif" font-size="14" fill="white" fill-opacity=".72">${escapeXml(style.prompt.slice(0, 76))}</text>
</svg>`;
}

async function generateLocalFallbacks() {
  await fs.mkdir(outputDir, { recursive: true });

  for (const style of styles) {
    const outputPath = path.join(outputDir, `${style.id}.webp`);
    await sharp(Buffer.from(svgForStyle(style)))
      .resize(width, height, { fit: 'cover' })
      .webp({ quality: 86, effort: 5 })
      .toFile(outputPath);
    console.log(`wrote ${path.relative(repoRoot, outputPath)}`);
  }
}

async function generateViaEdgeFunction() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const authToken = process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !authToken) {
    throw new Error('SUPABASE_URL and SUPABASE_ACCESS_TOKEN or SUPABASE_ANON_KEY are required for --edge.');
  }

  await fs.mkdir(outputDir, { recursive: true });

  for (const style of styles) {
    const response = await fetch(`${supabaseUrl}/functions/v1/falai-image-generation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: `${style.prompt} Same seed subject across all styles: a centered filmmaker silhouette holding a camera inside a clean storyboard frame. No text.`,
        aspect_ratio: '16:9',
        image_size: 'landscape_16_9',
        output_format: 'webp',
        model_id: 'fal-ai/nano-banana-2',
      }),
    });

    if (!response.ok) {
      throw new Error(`Edge generation failed for ${style.id}: ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    const imageUrl = payload?.data?.images?.[0]?.url || payload?.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error(`Edge generation did not return an image URL for ${style.id}.`);
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download generated image for ${style.id}: ${imageResponse.status}`);
    }

    const outputPath = path.join(outputDir, `${style.id}.webp`);
    await sharp(Buffer.from(await imageResponse.arrayBuffer()))
      .resize(width, height, { fit: 'cover' })
      .webp({ quality: 86, effort: 5 })
      .toFile(outputPath);
    console.log(`generated ${path.relative(repoRoot, outputPath)}`);
  }
}

async function uploadFallbacksToSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.STYLE_PACK_STORAGE_BUCKET || 'style-references';

  if (!supabaseUrl || !serviceRoleKey) {
    return;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  for (const style of styles) {
    const filePath = path.join(outputDir, `${style.id}.webp`);
    const file = await fs.readFile(filePath);
    const storagePath = `style-packs/${style.id}.webp`;
    const { error } = await supabase.storage.from(bucket).upload(storagePath, file, {
      contentType: 'image/webp',
      upsert: true,
    });
    if (error) {
      throw error;
    }
    console.log(`uploaded ${bucket}/${storagePath}`);
  }
}

const useEdge = process.argv.includes('--edge');
const shouldUpload = process.argv.includes('--upload');

if (useEdge) {
  await generateViaEdgeFunction();
} else {
  await generateLocalFallbacks();
}

if (shouldUpload) {
  await uploadFallbacksToSupabase();
}
