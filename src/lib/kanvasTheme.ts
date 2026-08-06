import { cva, type VariantProps } from "class-variance-authority";

/**
 * Kanvas design system theme contract.
 *
 * Every Kanvas surface, radius and accent usage resolves through this module so
 * the studios never hardcode a hex literal or a bespoke radius again.
 */

/* ------------------------------------------------------------------ */
/*  Surfaces & radii                                                   */
/* ------------------------------------------------------------------ */

export const kanvasSurface = {
  /** Page canvas behind every studio. */
  base: "bg-kanvas-bg",
  /** Raised panel (settings blocks, job cards). */
  raised: "bg-kanvas-surface-1",
  /** Card / rail row surface. */
  panel: "bg-kanvas-surface-2",
  /** Hover / pressed state of a panel. */
  hover: "bg-kanvas-surface-3",
} as const;

export type KanvasSurface = keyof typeof kanvasSurface;

export const kanvasRadius = {
  sm: "rounded-kanvas-sm",
  md: "rounded-kanvas-md",
  lg: "rounded-kanvas-lg",
  xl: "rounded-kanvas-xl",
} as const;

export type KanvasRadius = keyof typeof kanvasRadius;

/* ------------------------------------------------------------------ */
/*  Typography                                                         */
/* ------------------------------------------------------------------ */

/** Condensed uppercase display recipe used by studio headlines. */
export const kanvasDisplay =
  "font-kanvas-display font-bold uppercase tracking-tighter text-kanvas-text-primary";

/** Small uppercase label above a control group. */
export const kanvasEyebrow =
  "text-[10px] font-semibold uppercase tracking-[0.2em] text-kanvas-text-muted";

/* ------------------------------------------------------------------ */
/*  Layout constants                                                   */
/* ------------------------------------------------------------------ */

/** Default width (px) of a studio control rail. */
export const railWidth = 336;
/** Width (px) of a studio control rail in compact/secondary layouts. */
export const railWidthCompact = 300;

/* ------------------------------------------------------------------ */
/*  Accent policy                                                      */
/* ------------------------------------------------------------------ */

/** Solid accent, for the single primary action on a surface. */
export const accentFill =
  "bg-kanvas-accent text-kanvas-accent-contrast hover:bg-kanvas-accent-hover";
/** Tinted accent wash, for selected/active affordances. */
export const accentSoft = "bg-kanvas-accent-soft";
/** Accent hairline, for focus rings and active outlines. */
export const accentEdge = "border-kanvas-accent-edge";
/** Accent text, for emphasised values and eyebrow highlights. */
export const accentText = "text-kanvas-accent";

/* ------------------------------------------------------------------ */
/*  Recipes                                                            */
/* ------------------------------------------------------------------ */

/** A single row inside a studio control rail. */
export const railRow = cva(
  "flex w-full items-center justify-between gap-3 rounded-kanvas-md px-4 py-2.5 text-left transition-colors",
  {
    variants: {
      surface: {
        panel: "bg-kanvas-surface-2",
        raised: "bg-kanvas-surface-1",
        ghost: "bg-transparent",
      },
      interactive: {
        true: "hover:bg-kanvas-surface-3",
        false: "",
      },
      active: {
        true: "ring-1 ring-inset ring-kanvas-accent-edge",
        false: "",
      },
    },
    defaultVariants: { surface: "panel", interactive: false, active: false },
  },
);

export type RailRowVariants = VariantProps<typeof railRow>;

/** A pill-shaped toggle/filter chip inside a rail or toolbar. */
export const railChip = cva(
  "inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-full font-bold uppercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kanvas-accent focus-visible:ring-offset-2 focus-visible:ring-offset-kanvas-bg disabled:opacity-50",
  {
    variants: {
      size: {
        sm: "px-3 py-1 text-[9px] tracking-widest",
        md: "px-4 py-1.5 text-[10px] tracking-widest",
      },
      active: {
        true: "bg-kanvas-accent text-kanvas-accent-contrast",
        false:
          "bg-kanvas-surface-3/80 text-kanvas-text-muted hover:bg-kanvas-surface-3 hover:text-kanvas-text-secondary",
      },
    },
    defaultVariants: { size: "md", active: false },
  },
);

export type RailChipVariants = VariantProps<typeof railChip>;

/** A media thumbnail tile (preset, motion reference, recent result). */
export const mediaTile = cva(
  "group relative overflow-hidden bg-kanvas-surface-2",
  {
    variants: {
      ratio: {
        square: "aspect-square",
        video: "aspect-video",
        portrait: "aspect-[9/16]",
        poster: "aspect-[4/5]",
      },
      radius: {
        sm: "rounded-kanvas-sm",
        md: "rounded-kanvas-md",
        lg: "rounded-kanvas-lg",
        xl: "rounded-kanvas-xl",
      },
      interactive: {
        true: "cursor-pointer border border-kanvas-border-subtle transition-colors hover:border-kanvas-accent-edge",
        false: "",
      },
    },
    defaultVariants: { ratio: "video", radius: "md", interactive: false },
  },
);

export type MediaTileVariants = VariantProps<typeof mediaTile>;

/** A framed panel: the shared chrome for hero stages, rails and job cards. */
export const panelSurface = cva("overflow-hidden", {
  variants: {
    surface: {
      base: "bg-kanvas-bg",
      raised: "bg-kanvas-surface-1",
      panel: "bg-kanvas-surface-2",
      glass: "bg-black/40 backdrop-blur-sm",
    },
    radius: {
      sm: "rounded-kanvas-sm",
      md: "rounded-kanvas-md",
      lg: "rounded-kanvas-lg",
      xl: "rounded-kanvas-xl",
    },
    border: {
      none: "",
      subtle: "border border-kanvas-border-subtle",
      default: "border border-kanvas-border-default",
      accent: "border border-kanvas-accent-edge",
    },
  },
  defaultVariants: { surface: "panel", radius: "lg", border: "none" },
});

export type PanelSurfaceVariants = VariantProps<typeof panelSurface>;
