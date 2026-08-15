import type { HTMLAttributes } from "react";

/**
 * Custom elements defined by the Creator OS atmosphere engine
 * (`public/creator-os/fx.js`). Every element takes string attributes only.
 */
interface WzElementAttributes extends HTMLAttributes<HTMLElement> {
  accent?: string;
  active?: string;
  amp?: string;
  base?: string;
  bright?: string;
  cell?: string;
  chaos?: string;
  color2?: string;
  colors?: string;
  curve?: string;
  distort?: string;
  focal?: string;
  freq?: string;
  fx?: string;
  fy?: string;
  glow?: string;
  "gradient-color"?: string;
  hue?: string;
  ink?: string;
  intensity?: string;
  items?: string;
  levels?: string;
  mode?: string;
  noise?: string;
  pixel?: string;
  radius?: string;
  rate?: string;
  rays?: string;
  relax?: string;
  scale?: string;
  speed?: string;
  src?: string;
  strength?: string;
  tags?: string;
  threshold?: string;
  tint?: string;
  wash?: string;
}

declare global {
  interface Window {
    /** Resource id → URL map read by `fx.js` for the Earth wheel silk atlas. */
    __resources?: Record<string, string>;
  }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "wz-ascii-fx": WzElementAttributes;
      "wz-beams": WzElementAttributes;
      "wz-burst": WzElementAttributes;
      "wz-chrome": WzElementAttributes;
      "wz-dither": WzElementAttributes;
      "wz-electric-border": WzElementAttributes;
      "wz-griddistort": WzElementAttributes;
      "wz-gridmotion": WzElementAttributes;
      "wz-infinite-menu": WzElementAttributes;
      "wz-pixel-veil": WzElementAttributes;
      "wz-pixels": WzElementAttributes;
      "wz-prism": WzElementAttributes;
      "wz-sky": WzElementAttributes;
      "wz-terminal": WzElementAttributes;
      "wz-trail": WzElementAttributes;
    }
  }
}
