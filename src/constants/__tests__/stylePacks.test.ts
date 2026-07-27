import { describe, expect, it } from 'vitest';
import {
  STYLE_PACKS,
  getStylePromptFragment,
  resolveStyleReferenceUrl,
} from '../stylePacks';

describe('stylePacks', () => {
  it('uses distinct first-party webp thumbnails instead of lovable uploads', () => {
    const thumbUrls = STYLE_PACKS.map((pack) => pack.thumbUrl);

    expect(new Set(thumbUrls).size).toBe(STYLE_PACKS.length);
    expect(thumbUrls.every((url) => url.startsWith('/style-packs/'))).toBe(true);
    expect(thumbUrls.every((url) => url.endsWith('.webp'))).toBe(true);
    expect(thumbUrls.some((url) => url.includes('/lovable-uploads/'))).toBe(false);
  });

  it('resolves selected pack references to absolute payload URLs', () => {
    expect(
      resolveStyleReferenceUrl(
        { videoStyle: 'film-noir', styleReferenceUrl: null, styleReferenceAssetId: null },
        'https://wzrd.test'
      )
    ).toBe('https://wzrd.test/style-packs/film-noir.webp');
  });

  it('lets custom uploads win over built-in style packs', () => {
    expect(
      resolveStyleReferenceUrl(
        {
          videoStyle: 'anime',
          styleReferenceUrl: 'https://assets.test/custom.webp',
          styleReferenceAssetId: 'asset-1',
        },
        'https://wzrd.test'
      )
    ).toBe('https://assets.test/custom.webp');

    expect(
      resolveStyleReferenceUrl(
        {
          videoStyle: 'anime',
          styleReferenceUrl: null,
          styleReferenceAssetId: 'asset-1',
        },
        'https://wzrd.test'
      )
    ).toBeUndefined();
  });

  it('exposes prompt fragments for generation payloads', () => {
    expect(getStylePromptFragment('cyberpunk')).toContain('Cyberpunk');
    expect(getStylePromptFragment('unknown-style')).toContain('Cinematic');
  });
});
