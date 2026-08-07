export type StaticAsset = string | { src: string };

export function staticAssetUrl(asset: StaticAsset): string {
  return typeof asset === 'string' ? asset : asset.src;
}
