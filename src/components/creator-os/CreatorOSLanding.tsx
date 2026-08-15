"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";

import { css } from "./canonicalStyle";
import styles from "./CreatorOSLanding.module.css";

/**
 * Native React port of the canonical "WZRD CREATOR OS — STANDALONE SOURCE"
 * landing page. Section order is fixed: top → studio → zap → earth → air →
 * coming-soon → enter. The WebGL atmosphere is the bundle's own `fx.js`
 * custom-element engine, served from `/creator-os/`.
 */
const STUDIO_URL = "https://studio.wzrd.tech/login";
const ZAP_URL = "https://zap.wzrd.tech";
const WHITEPAPER_URL = "https://joinopenstandard.com/";

const GL_MATRIX_SRC = "/creator-os/gl-matrix-min.js";
const FX_SRC = "/creator-os/fx.js";

const FIRE_WATER_VIDEO = "/creator-os/assets/fire-water-loop.mp4";
const FIRE_WATER_POSTER = "/creator-os/assets/fire-water-loop-poster.jpg";
const WORDMARK = "/creator-os/wzrd-wordmark-1600.png";

/** Resource ids `fx.js` resolves through `window.__resources`. */
const FX_RESOURCES: Record<string, string> = {
  devicesImg: "/creator-os/devices-trimmed.png",
  "silk_jade-plum-gold": "/creator-os/jade-plum-gold.svg",
  "silk_nova-teal-void": "/creator-os/nova-teal-void.svg",
  "silk_silk-amber-dusk": "/creator-os/silk-amber-dusk.svg",
  "silk_silk-sky-melon": "/creator-os/silk-sky-melon.svg",
};

const MONO = "'Azeret Mono',ui-monospace,Consolas,monospace";

const bubbleItems = [
  { bg: "#8cc8ff", delay: "0ms", href: "#air", hoverBg: "#aedaff", label: "air", rot: "-8deg" },
  { bg: "#f0a145", delay: "70ms", href: "#studio", hoverBg: "#f5c184", label: "studio", rot: "6deg" },
  { bg: "#c5ba9e", delay: "140ms", href: "#earth", hoverBg: "#d8cfb4", label: "earth", rot: "-6deg" },
  { bg: "#f06a47", delay: "210ms", href: ZAP_URL, hoverBg: "#f89d80", label: "zap", rot: "8deg" },
  { bg: "#6dc8d7", delay: "280ms", href: "#coming-soon", hoverBg: "#9adde8", label: "fire+water", rot: "-4deg" },
  { bg: "#f1ebdd", delay: "350ms", href: STUDIO_URL, hoverBg: "#ffffff", label: "enter studio", rot: "4deg" },
] as const;

const studioSteps = [
  { copy: "Voice notes, images, fragments, and references.", index: "01", title: "Gather" },
  { copy: "Give the work an angle, a tempo, a reason to exist.", index: "02", title: "Direct" },
  { copy: "Move the finished signal into the culture around it.", index: "03", title: "Release" },
] as const;

const studioNotes = [
  { copy: "Analyzing footage pacing…", tone: "muted" },
  { copy: '"Cut at 1:24 is 2s too long. Tightening."', tone: "plain" },
  { copy: '"Adding cinematic LUT to B-roll clips…"', tone: "accent" },
  { copy: "Planning the next cut…", tone: "faint" },
] as const;

const studioTracks = [
  { bar: "background:rgba(140,120,220,0.28);border:1px solid rgba(180,160,255,0.4)", label: "B-ROLL" },
  { bar: "background:rgba(240,161,69,0.28);border:1px solid rgba(240,161,69,0.45)", label: "MAIN" },
  { bar: "background:rgba(109,200,175,0.24);border:1px solid rgba(109,200,175,0.4)", label: "MUSIC" },
] as const;

const zapStages = [
  {
    copy: "One command scaffolds the skill directory, package scripts, and a sample recipe.",
    index: "01",
    stage: "scaffold",
    tags: ["zap init", "match-day/"],
    title: "Init the project",
  },
  {
    copy: "Inputs, steps, provider routes, and budget cap live together in a single Zap.md file.",
    index: "02",
    stage: "author",
    tags: ["Zap.md", "SKILL.md", "prompt files"],
    title: "Write the recipe",
  },
  {
    copy: "zap validate checks the contract; zap lint flags live-provider defaults before anything runs.",
    index: "03",
    stage: "validate",
    tags: ["cap_usd", "plan-only"],
    title: "Guard the spend",
  },
  {
    copy: "Every run defaults to a zero-cost mock. Add --live and the budget cap is enforced before a provider job submits.",
    index: "04",
    stage: "run",
    tags: ["--live", "GMI Cloud · fal"],
    title: "Mock, then live",
  },
] as const;

const dataCards = [
  {
    copy: "Stewards the development and maintenance of the DATA Network and Trace. It is the governance entity behind the network, not the product.",
    label: "The DATA Foundation",
  },
  {
    copy: "The open protocol where real human data is sourced, proven, and processed to train the world's leading AI models.",
    label: "The DATA Network",
  },
  {
    copy: "The public audit layer where any record on DATA Network can be verified — provenance, consent, license, and payment — with contributor identity kept private.",
    label: "Trace",
  },
] as const;

const WHEEL_ITEMS = [
  "AIR|Signal Keeper|Holds a fragment long enough to become a direction.|#8cc8ff",
  "STUDIO|Cut Director|Finds rhythm between rush and restraint.|#f0a145",
  "EARTH|Worldbuilder|Gives the release a room to live in.|#c5ba9e",
  "ZAP|Runtime Steward|Keeps every decision attached to the work.|#f06a47",
].join(";;");

const GRID_MOTION_ITEMS = [
  "ref-041.jpg",
  "LUT / kodak-2383",
  "shot-list.json",
  "",
  "stem-vox.wav",
  "night-run.mp4",
  "beat-03.md",
  "",
  "cut-sheet.pdf",
  "reference-01.jpg",
  "storyboard.pdf",
  "",
  "voice-note.m4a",
  "plate-07.png",
  "mix-v2.wav",
  "",
  "grade-pass",
  "title-cards",
  "foley-kit",
  "",
].join("|");

const GRAIN_BACKGROUND =
  "url(data:image/svg+xml,%3Csvg%20viewBox%3D%270%200%20160%20160%27%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%3E%3Cfilter%20id%3D%27n%27%3E%3CfeTurbulence%20type%3D%27fractalNoise%27%20baseFrequency%3D%27.93%27%20numOctaves%3D%274%27%20stitchTiles%3D%27stitch%27%2F%3E%3C%2Ffilter%3E%3Crect%20width%3D%27100%25%27%20height%3D%27100%25%27%20filter%3D%27url%28%23n%29%27%20opacity%3D%27.5%27%2F%3E%3C%2Fsvg%3E)";

const SECTION_META = `position:relative;z-index:1;display:flex;justify-content:space-between;gap:1rem;color:rgba(241,235,221,0.55);font-family:${MONO};font-size:clamp(0.75rem,0.76vw,0.95rem);letter-spacing:0.12em;text-transform:uppercase;margin-bottom:clamp(3.5rem,8vw,7.5rem)`;
const SECTION_KICKER = `font-family:${MONO};font-size:clamp(0.75rem,0.76vw,0.95rem);letter-spacing:0.12em;text-transform:uppercase;margin:0 0 1.1rem`;
const SECTION_TITLE = "font-size:clamp(2.05rem,5vw,5.6rem);font-weight:400;letter-spacing:-0.065em;line-height:0.9;margin:0";
const SECTION_LEDE = "font-size:clamp(1.05rem,1.5vw,1.3rem);line-height:1.45;margin:1.75rem 0 0;max-width:30rem";
const SECTION_SHELL =
  "position:relative;min-height:48rem;overflow:hidden;padding:clamp(4.5rem,12vw,12rem) max(1.7rem,calc((100vw - 75rem) / 2)) clamp(4rem,10vw,10rem);scroll-margin-top:4rem";
const ZAP_TAG = `background:rgba(240,106,71,0.09);border:1px solid rgba(240,106,71,0.32);color:rgba(241,235,221,0.86);font-family:${MONO};font-size:0.68rem;letter-spacing:0.025em;padding:0.38rem 0.48rem`;
const MESSAGE_BASE = `font-family:${MONO};font-size:clamp(0.68rem,1vw,0.78rem);line-height:1.48;padding:0.6rem 0.85rem`;
const MESSAGE_OUT = `align-self:flex-end;width:min(88%,29rem);background:#0a84ff;color:#fff;border-radius:1.15rem 1.15rem 0.25rem 1.15rem;${MESSAGE_BASE}`;
const MESSAGE_IN = `align-self:flex-start;width:min(88%,29rem);background:rgba(223,240,255,0.16);color:#f7fbff;border-radius:1.15rem 1.15rem 1.15rem 0.25rem;${MESSAGE_BASE}`;
const MESSAGE_TYPING = `align-self:flex-start;display:flex;align-items:center;gap:0.4rem;width:fit-content;background:rgba(223,240,255,0.14);color:rgba(220,230,242,0.75);font-family:${MONO};font-size:0.68rem;letter-spacing:0.05em;padding:0.6rem 0.85rem;border-radius:1.15rem 1.15rem 1.15rem 0.25rem`;
const MESSAGE_META = "display:block;color:rgba(255,255,255,0.7);font-size:0.62rem;letter-spacing:0.08em;text-transform:uppercase;margin-top:0.4rem";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);

    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[data-creator-os-fx="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(`failed to load ${src}`)), { once: true });
      }

      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.creatorOsFx = src;
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", () => reject(new Error(`failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

const FX_TAGS = [
  "wz-ascii-fx",
  "wz-beams",
  "wz-burst",
  "wz-chrome",
  "wz-dither",
  "wz-electric-border",
  "wz-griddistort",
  "wz-gridmotion",
  "wz-infinite-menu",
  "wz-pixel-veil",
  "wz-pixels",
  "wz-prism",
  "wz-sky",
  "wz-terminal",
  "wz-trail",
] as const;

const FX_REFLECTED_PROPS = [
  "accent",
  "active",
  "amp",
  "base",
  "bright",
  "cell",
  "chaos",
  "color",
  "color2",
  "colors",
  "curve",
  "distort",
  "focal",
  "freq",
  "glow",
  "hue",
  "ink",
  "intensity",
  "items",
  "levels",
  "mode",
  "noise",
  "pixel",
  "radius",
  "rate",
  "rays",
  "relax",
  "scale",
  "speed",
  "strength",
  "tags",
  "threshold",
  "tint",
  "wash",
] as const;

function ownDescriptor(prototype: object, name: string): PropertyDescriptor | null {
  for (let target: object | null = prototype; target && target !== HTMLElement.prototype; ) {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    if (descriptor) return descriptor;
    target = Object.getPrototypeOf(target) as object | null;
  }

  return null;
}

/**
 * `fx.js` exposes its configuration as getter-only properties. React writes
 * unknown custom element props as properties once the element is upgraded, so
 * mirror those writes back onto the attribute the engine actually reads.
 */
function reflectFxPropertyWrites() {
  for (const tag of FX_TAGS) {
    const constructor = window.customElements.get(tag);
    if (!constructor) continue;

    const prototype = constructor.prototype as object;
    for (const name of FX_REFLECTED_PROPS) {
      const descriptor = ownDescriptor(prototype, name);
      if (!descriptor?.get || descriptor.set) continue;

      Object.defineProperty(prototype, name, {
        configurable: true,
        get: descriptor.get,
        set(this: HTMLElement, value: unknown) {
          if (value === null || value === undefined) this.removeAttribute(name);
          else this.setAttribute(name, String(value));
        },
      });
    }
  }
}

type DisclosureCardProps = {
  copy: string;
  fxModeAttr: string;
  label: string;
};

function DataDisclosureCard({ copy, fxModeAttr, label }: DisclosureCardProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pressed, setPressed] = useState<boolean | null>(null);
  const expanded = pressed ?? (hovered || focused);

  const toggle = () => setPressed(!expanded);
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggle();
  };

  const shell: CSSProperties = {
    ...css(
      "position:relative;overflow:hidden;cursor:default;padding:1.1rem 1.25rem;transition:background 380ms ease,border-color 380ms ease,transform 380ms cubic-bezier(0.34,1.56,0.64,1),box-shadow 380ms ease",
    ),
    background: expanded ? "rgba(35,26,18,0.92)" : "rgba(23,19,17,0.7)",
    border: `1px solid ${expanded ? "rgba(240,161,69,0.75)" : "rgba(240,161,69,0.28)"}`,
    boxShadow: expanded ? "0 1.2rem 2.2rem rgba(240,161,69,0.16)" : "0 0 0 rgba(0,0,0,0)",
    transform: expanded ? "translateY(-0.35rem)" : "translateY(0)",
  };

  const description: CSSProperties = {
    ...css(
      "position:relative;z-index:1;color:rgba(241,235,221,0.72);font-size:0.88rem;line-height:1.42;margin:0;overflow:hidden;transition:max-height 420ms cubic-bezier(0.4,0,0.2,1),opacity 320ms ease,transform 380ms cubic-bezier(0.34,1.56,0.64,1)",
    ),
    maxHeight: expanded ? "10rem" : "0px",
    opacity: expanded ? 1 : 0,
    transform: expanded ? "translateY(0.6rem)" : "translateY(0)",
  };

  return (
    <article
      aria-expanded={expanded}
      aria-label={label}
      onBlur={() => {
        setFocused(false);
        setPressed(null);
      }}
      onClick={toggle}
      onFocus={() => setFocused(true)}
      onKeyDown={onKeyDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => {
        setHovered(false);
        setPressed(null);
      }}
      role="button"
      style={shell}
      tabIndex={0}
    >
      <wz-pixel-veil
        active={expanded ? "1" : "0"}
        cell="5"
        colors="#f0a145,#f06a47,#ffcf8f"
        mode={fxModeAttr}
        style={css(
          "position:absolute;inset:0;z-index:0;pointer-events:none;mix-blend-mode:screen;opacity:0.5;display:block",
        )}
      />
      <p
        style={css(
          `position:relative;z-index:1;color:#f0a145;font-family:${MONO};font-size:0.68rem;letter-spacing:0.1em;text-transform:uppercase;margin:0`,
        )}
      >
        {label}
      </p>
      <p style={description}>{copy}</p>
    </article>
  );
}

export default function CreatorOSLanding() {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fxReady, setFxReady] = useState(false);
  const [motionOn, setMotionOn] = useState(true);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [navHover, setNavHover] = useState(false);
  const [logoHover, setLogoHover] = useState(false);

  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const desktop = useMediaQuery("(min-width: 860px)");
  const calmViewport = useMediaQuery("(pointer: coarse), (max-width: 859px)");
  // Without hover there is nothing to reveal the motion control, so it stays out.
  const hoverless = useMediaQuery("(hover: none)");

  const motionAllowed = motionOn && !reduced;
  const baseMode = calmViewport ? "calm" : "full";
  const fxModeAttr = motionAllowed ? baseMode : "off";
  const motionLabel = reduced ? "reduced" : motionOn ? "on" : "off";

  const closeBubbleMenu = useCallback(() => setBubbleOpen(false), []);

  // gl-matrix must be evaluated before fx.js — the Earth wheel reads it as a global.
  useEffect(() => {
    window.__resources = { ...FX_RESOURCES, ...(window.__resources ?? {}) };
    let cancelled = false;

    loadScriptOnce(GL_MATRIX_SRC)
      .then(() => loadScriptOnce(FX_SRC))
      .then(() => {
        reflectFxPropertyWrites();
        if (!cancelled) setFxReady(true);
      })
      .catch((error: unknown) => {
        console.warn("[creator-os] atmosphere engine unavailable", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Hero arrival timeline: pinned and scroll-scrubbed on desktop, static otherwise.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const hero = root.querySelector<HTMLElement>("[data-hero]");
    if (!hero) return;

    const query = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector);
    const sky = query("[data-sky]") as (HTMLElement & { progress?: number }) | null;
    const parts = {
      dash: query("[data-hero-dashboard]"),
      hud: query("[data-hero-hud]"),
      os: query("[data-creator-os]"),
      scrim: query("[data-hero-dash-scrim]"),
      statement: query("[data-hero-statement]"),
      word1: query("[data-word-1]"),
      word2: query("[data-word-2]"),
      wordmark: query("[data-wordmark]"),
    };
    const sticky = query("[data-hero-sticky]");
    const pinned = motionAllowed && desktop;

    const seg = (p: number, a: number, b: number) => Math.max(0, Math.min(1, (p - a) / (b - a)));
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

    const applyWord = (element: HTMLElement | null, t: number, tilt: number, fade: number) => {
      if (!element) return;
      element.style.opacity = String((0.1 + 0.9 * t) * fade);
      element.style.filter = `blur(${lerp(9, 0, t).toFixed(2)}px)`;
      element.style.transform = `translateY(${lerp(14, 0, t).toFixed(2)}px) rotate(${lerp(tilt, 0, t).toFixed(2)}deg)`;
      const chroma = (1 - t) * 0.6;
      element.style.textShadow =
        chroma > 0.01
          ? `-${(chroma * 3).toFixed(2)}px 0 rgba(140,200,255,${chroma.toFixed(2)}),${(chroma * 3).toFixed(2)}px 0 rgba(240,106,71,${chroma.toFixed(2)})`
          : "none";
    };

    const apply = (p: number) => {
      if (sky && "progress" in sky) sky.progress = p;
      const t1 = lerp(0.92, 1, seg(p, 0, 0.28));
      const t2 = lerp(0.88, 1, seg(p, 0, 0.46));
      const t3 = lerp(0.88, 1, seg(p, 0, 0.54));
      const t4 = seg(p, 0.54, 0.74);
      const t5 = seg(p, 0.58, 0.72);
      const fade = 1 - seg(p, 0.5, 0.66);
      const t7 = seg(p, 0.62, 0.9);

      if (parts.wordmark) {
        parts.wordmark.style.opacity = String(t1 * fade);
        parts.wordmark.style.transform = `translateY(${lerp(0, -24, t4).toFixed(2)}%) scale(${lerp(1, 0.78, t4).toFixed(3)})`;
      }
      if (parts.os) {
        parts.os.style.opacity = String(t2 * fade);
        parts.os.style.transform = `translateY(${lerp(20, 0, t2).toFixed(2)}%)`;
      }
      const reveal = seg(p, 0, 0.46);
      const stagger = 0.35;
      const span = 1 - stagger;
      applyWord(parts.word1, Math.max(0, Math.min(1, reveal / span)), -4, fade);
      applyWord(parts.word2, Math.max(0, Math.min(1, (reveal - stagger) / span)), 4, fade);
      if (parts.statement) {
        parts.statement.style.opacity = String(t3 * fade);
        parts.statement.style.transform = `translateY(${lerp(28, 0, t3).toFixed(2)}px)`;
      }
      if (parts.hud) {
        parts.hud.style.opacity = String(t5 * fade);
        parts.hud.style.transform = `translateX(-50%) translateY(${lerp(12, 0, t5).toFixed(2)}px)`;
      }
      if (parts.scrim) parts.scrim.style.opacity = String(t7 * 0.92);
      if (parts.dash) {
        parts.dash.style.opacity = String(t7);
        parts.dash.style.transform = `translateY(${lerp(28, 0, t7).toFixed(2)}px)`;
      }
    };

    const reset = () => {
      if (sky && "progress" in sky) sky.progress = 0.28;
      Object.values(parts).forEach((element) => {
        if (!element) return;
        element.style.opacity = element === parts.scrim ? "0" : "";
        element.style.transform = element === parts.hud ? "translateX(-50%)" : "";
        element.style.filter = "";
        element.style.textShadow = "";
      });
    };

    if (parts.hud) parts.hud.style.display = pinned ? "" : "none";
    if (sticky) sticky.style.overflow = "hidden";
    if (parts.dash) {
      Object.assign(
        parts.dash.style,
        pinned
          ? {
              alignItems: "center",
              display: "flex",
              flexDirection: "column",
              inset: "0",
              justifyContent: "center",
              margin: "0",
              padding: "0 1.7rem",
              position: "absolute",
            }
          : {
              alignItems: "",
              display: "",
              flexDirection: "",
              inset: "",
              justifyContent: "",
              margin: "",
              padding: "",
              position: "",
            },
      );
    }

    if (!pinned) {
      hero.style.height = "";
      reset();

      return;
    }

    hero.style.height = "340vh";
    let progress = 0;
    let target = 0;
    let raf = 0;

    const measure = () => {
      const viewport = window.innerHeight || 1;
      const total = hero.offsetHeight - viewport;
      const rect = hero.getBoundingClientRect();
      target = total > 10 ? Math.max(0, Math.min(1, -rect.top / total)) : 0;
    };
    const step = () => {
      raf = 0;
      progress += (target - progress) * 0.16;
      apply(progress);
      if (Math.abs(target - progress) > 0.0008) raf = requestAnimationFrame(step);
      else {
        progress = target;
        apply(progress);
      }
    };
    const onScroll = () => {
      measure();
      if (!raf) raf = requestAnimationFrame(step);
    };

    measure();
    progress = target;
    apply(progress);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
      hero.style.height = "";
    };
  }, [desktop, motionAllowed]);

  // Chapter reveals.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));

    if (!motionAllowed) {
      elements.forEach((element) => {
        element.style.transition = "none";
        element.style.opacity = "";
        element.style.transform = "";
      });

      return;
    }

    elements.forEach((element) => {
      const dir = element.getAttribute("data-reveal-dir");
      element.style.transition = "none";
      element.style.opacity = "0";
      element.style.transform =
        dir === "left" ? "translateX(-2.2rem)" : dir === "right" ? "translateX(2.2rem)" : "translateY(30px)";
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target as HTMLElement;
          observer.unobserve(element);
          const dir = element.getAttribute("data-reveal-dir");
          const delay = (Number.parseInt(element.getAttribute("data-stagger") || "0", 10) || 0) * 95;
          requestAnimationFrame(() => {
            element.style.transition = `opacity 0.85s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms, transform 0.85s cubic-bezier(0.22, 1, 0.36, 1) ${delay}ms`;
            element.style.opacity = "1";
            element.style.transform = dir === "left" || dir === "right" ? "translateX(0)" : "translateY(0)";
          });
        });
      },
      { rootMargin: "0px 0px -14%", threshold: 0.02 },
    );
    elements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [motionAllowed]);

  // Studio mock: scroll-scrubs the illustrative timeline.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const figure = root.querySelector<HTMLElement>("[data-studio-app]");
    if (!figure) return;
    const playhead = figure.querySelector<HTMLElement>("[data-studio-playhead]");
    const timecode = figure.querySelector<HTMLElement>("[data-studio-timecode]");
    const totalSeconds = 62 * 60 + 34;
    const format = (value: number) => {
      const clamped = Math.max(0, Math.min(totalSeconds, Math.round(value)));
      const hours = String(Math.floor(clamped / 3600)).padStart(2, "0");
      const minutes = String(Math.floor((clamped % 3600) / 60)).padStart(2, "0");
      const seconds = String(Math.floor(clamped % 60)).padStart(2, "0");

      return `${hours}:${minutes}:${seconds}`;
    };

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = figure.getBoundingClientRect();
        const viewport = window.innerHeight || 1;
        const p = Math.max(0, Math.min(1, (viewport - rect.top) / (viewport + rect.height)));
        if (playhead) playhead.style.left = `${(6 + p * 88).toFixed(2)}%`;
        if (timecode) timecode.textContent = `${format(p * totalSeconds)} / 01:02:34`;
      });
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Earth wheel: keep vertical scroll available on touch and make the sphere
  // keyboard-operable by replaying an arcball drag from arrow keys.
  useEffect(() => {
    if (!fxReady) return;
    const root = rootRef.current;
    if (!root) return;
    const wheel = root.querySelector<HTMLElement>("wz-infinite-menu");
    if (!wheel) return;

    let cancelled = false;
    let raf = 0;
    let detach: (() => void) | null = null;
    let tries = 0;
    let attached: HTMLCanvasElement | null = null;
    let observer: MutationObserver | null = null;

    const spin = (canvas: HTMLCanvasElement, dx: number, dy: number) => {
      if (typeof PointerEvent === "undefined") return;
      const rect = canvas.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const base = { bubbles: true, isPrimary: true, pointerId: 1, pointerType: "mouse" as const };
      canvas.dispatchEvent(new PointerEvent("pointerdown", { ...base, buttons: 1, clientX: x, clientY: y }));
      const steps = 12;
      let step = 0;
      const tick = () => {
        step += 1;
        const ratio = step / steps;
        canvas.dispatchEvent(
          new PointerEvent("pointermove", {
            ...base,
            buttons: 1,
            clientX: x + dx * ratio,
            clientY: y + dy * ratio,
          }),
        );
        if (step < steps) raf = requestAnimationFrame(tick);
        else canvas.dispatchEvent(new PointerEvent("pointerup", { ...base, clientX: x + dx, clientY: y + dy }));
      };
      raf = requestAnimationFrame(tick);
    };

    const attach = () => {
      if (cancelled) return;
      const shadow = wheel.shadowRoot;
      // The engine tears the canvas down when the chapter scrolls out of view,
      // so re-apply the patch to whichever canvas it rebuilds.
      if (shadow && !observer) {
        observer = new MutationObserver(() => attach());
        observer.observe(shadow, { childList: true, subtree: true });
      }

      const canvas = shadow?.querySelector("canvas");
      if (!canvas) {
        if (tries < 40) {
          tries += 1;
          window.setTimeout(attach, 120);
        }

        return;
      }

      if (canvas === attached) return;
      detach?.();
      attached = canvas;

      // The wheel canvas ships touch-action:none so the arcball can claim any
      // drag; pan-y keeps vertical swipes scrolling the page.
      canvas.style.touchAction = "pan-y";
      canvas.setAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight ArrowUp ArrowDown");

      const onKeyDown = (event: KeyboardEvent) => {
        const distance = Math.max(80, Math.min(220, canvas.clientWidth * 0.25));
        const deltas: Record<string, [number, number]> = {
          ArrowDown: [0, -distance],
          ArrowLeft: [distance, 0],
          ArrowRight: [-distance, 0],
          ArrowUp: [0, distance],
        };
        const delta = deltas[event.key];
        if (!delta) return;
        event.preventDefault();
        spin(canvas, delta[0], delta[1]);
      };

      canvas.addEventListener("keydown", onKeyDown);
      detach = () => canvas.removeEventListener("keydown", onKeyDown);
    };

    attach();

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      if (detach) detach();
    };
  }, [fxReady]);

  // Fire + Water loop: hydrate the source only as its section approaches.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || video.getAttribute("src")) return;

    const load = () => {
      if (video.getAttribute("src")) return;
      video.setAttribute("src", FIRE_WATER_VIDEO);
      video.load();
      void video.play().catch(() => undefined);
    };

    if (typeof IntersectionObserver === "undefined") {
      load();

      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        load();
      },
      { rootMargin: "200px" },
    );
    observer.observe(video);

    return () => observer.disconnect();
  }, []);

  const bubbleScale = bubbleOpen ? 1 : 0;
  const motionShown = navHover || hoverless;
  const navPop = useMemo<CSSProperties>(
    () => ({
      opacity: motionShown ? 1 : 0,
      pointerEvents: motionShown ? "auto" : "none",
      transform: motionShown ? "translateX(-3.75rem) scale(1)" : "translateX(0rem) scale(0.78)",
    }),
    [motionShown],
  );

  return (
    <div className={styles.root} data-fx-mode={fxModeAttr} ref={rootRef}>
      {/* ============ HEADER ============ */}
      <header
        style={css(
          `position:fixed;top:0;left:0;right:0;z-index:50;display:flex;align-items:center;justify-content:space-between;padding:clamp(0.9rem,3.2vw,1.35rem) clamp(1.15rem,4.5vw,1.7rem);pointer-events:none;font-family:${MONO}`,
        )}
      >
        <a
          aria-label="WZRD.tech home"
          className={styles.logo}
          href="#top"
          onPointerEnter={() => setLogoHover(true)}
          onPointerLeave={() => setLogoHover(false)}
          style={css(
            "position:relative;pointer-events:auto;display:inline-flex;align-items:center;height:clamp(3.1rem,10.5vw,3.9rem);padding:0 clamp(0.95rem,3.4vw,1.4rem);border-radius:999px;border:1px solid rgba(255,255,255,0.14);background:rgba(12,11,16,0.62);backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);box-shadow:0 0.5rem 1.3rem rgba(2,5,10,0.4),inset 0 1px 0 rgba(255,255,255,0.08);transition:box-shadow 200ms ease",
          )}
        >
          <img
            alt="WZRD.tech"
            src={WORDMARK}
            style={css("display:block;height:clamp(1.45rem,5vw,1.9rem);width:auto;object-fit:contain")}
          />
          <wz-electric-border
            active={logoHover ? "1" : "0"}
            chaos="5"
            color="#8cc8ff"
            mode={fxModeAttr}
            radius="999"
            speed="1.2"
            style={css("position:absolute;inset:-9px;z-index:2;pointer-events:none;display:block")}
          />
        </a>
        <div
          onPointerEnter={() => setNavHover(true)}
          onPointerLeave={() => setNavHover(false)}
          style={css(
            "position:relative;pointer-events:auto;width:clamp(2.8rem,9vw,3.15rem);height:clamp(2.8rem,9vw,3.15rem)",
          )}
        >
          <button
            aria-label="Toggle motion"
            className={styles.motionButton}
            disabled={reduced}
            onClick={() => setMotionOn((value) => !value)}
            style={{
              ...css(
                "position:absolute;top:0;right:0;display:inline-flex;align-items:center;justify-content:center;width:clamp(2.8rem,9vw,3.15rem);height:clamp(2.8rem,9vw,3.15rem);border-radius:50%;border:1.5px solid transparent;background:linear-gradient(rgba(12,11,16,0.62),rgba(12,11,16,0.62)) padding-box,radial-gradient(circle at 25% 20%, rgba(140,200,255,0.14), transparent 60%) padding-box,conic-gradient(from 90deg, rgba(140,200,255,0.6), rgba(109,200,215,0.6) 25%, rgba(240,161,69,0.5) 50%, rgba(240,106,71,0.5) 75%, rgba(140,200,255,0.6) 100%) border-box;backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);cursor:pointer;font-size:0.52rem;letter-spacing:0.03em;text-transform:uppercase;color:rgba(241,235,221,0.65);box-shadow:0 0.5rem 1.3rem rgba(2,5,10,0.4),inset 0 1px 0 rgba(255,255,255,0.08);z-index:1;transition:color 200ms ease,transform 260ms cubic-bezier(0.34,1.56,0.64,1),opacity 220ms ease,box-shadow 200ms ease",
              ),
              ...navPop,
            }}
            type="button"
          >
            {motionLabel}
          </button>
          <button
            aria-label="Toggle navigation"
            aria-pressed={bubbleOpen}
            className={styles.menuButton}
            onClick={() => setBubbleOpen((value) => !value)}
            style={css(
              "position:absolute;top:0;right:0;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:0.4rem;width:clamp(2.8rem,9vw,3.15rem);height:clamp(2.8rem,9vw,3.15rem);border-radius:50%;border:1px solid rgba(255,255,255,0.14);background:rgba(12,11,16,0.62);backdrop-filter:blur(16px) saturate(160%);-webkit-backdrop-filter:blur(16px) saturate(160%);box-shadow:0 0.5rem 1.3rem rgba(2,5,10,0.4),inset 0 1px 0 rgba(255,255,255,0.08);cursor:pointer;z-index:2;transition:transform 260ms cubic-bezier(0.34,1.56,0.64,1),box-shadow 200ms ease",
            )}
            type="button"
          >
            <span
              style={{
                ...css("display:block;width:1.35rem;height:2px;background:#f1ebdd;border-radius:2px;transition:transform 300ms ease,opacity 300ms ease"),
                transform: bubbleOpen ? "translateY(3.5px) rotate(45deg)" : "none",
              }}
            />
            <span
              style={{
                ...css("display:block;width:1.35rem;height:2px;background:#f1ebdd;border-radius:2px;margin-top:-0.28rem;transition:transform 300ms ease,opacity 300ms ease"),
                transform: bubbleOpen ? "translateY(-3.5px) rotate(-45deg)" : "none",
              }}
            />
            <wz-electric-border
              active={navHover ? "1" : "0"}
              chaos="5"
              color="#f06a47"
              mode={fxModeAttr}
              radius="999"
              speed="1.2"
              style={css("position:absolute;inset:-9px;z-index:2;pointer-events:none;display:block")}
            />
          </button>
        </div>
      </header>

      {/* ============ BUBBLE MENU OVERLAY ============ */}
      <div
        aria-hidden={!bubbleOpen}
        style={{
          ...css(
            "position:fixed;inset:0;z-index:45;display:flex;align-items:center;justify-content:center;overflow-y:auto;overscroll-behavior:contain;padding:clamp(5.5rem,17vw,6rem) clamp(1.15rem,4.5vw,1.7rem) 2rem;background:rgba(5,7,10,0.9);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:opacity 320ms ease",
          ),
          opacity: bubbleOpen ? 1 : 0,
          pointerEvents: bubbleOpen ? "auto" : "none",
        }}
      >
        <ul
          style={css(
            "list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;justify-content:center;gap:1rem;max-width:52rem;width:100%",
          )}
        >
          {bubbleItems.map((item) => (
            <li key={item.label} style={css("flex:1 1 11rem;display:flex")}>
              <a
                aria-label={item.label}
                className={styles.bubbleLink}
                href={item.href}
                onClick={closeBubbleMenu}
                style={
                  {
                    "--bubble-bg": item.bg,
                    "--bubble-delay": item.delay,
                    "--bubble-hover-bg": item.hoverBg,
                    "--bubble-rot": item.rot,
                    "--bubble-scale": String(bubbleScale),
                  } as CSSProperties
                }
                {...(item.href.startsWith("https://") ? { rel: "noopener", target: "_top" } : {})}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <main>
        {/* ============ HERO ============ */}
        <section
          aria-label="WZRD.tech Creator OS"
          data-hero=""
          data-screen-label="Hero"
          id="top"
          style={css("position:relative;background:#071124")}
        >
          <div
            data-hero-sticky=""
            style={css(
              "position:sticky;top:0;min-height:100svh;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden;isolation:isolate;padding:5.5rem clamp(1.15rem,4.5vw,1.7rem) 2.25rem",
            )}
          >
            <div
              aria-hidden="true"
              style={css(
                "position:absolute;inset:0;z-index:0;pointer-events:none;transform:scale(1.08);background:radial-gradient(circle at 73% 63%, rgba(182,219,255,0.5), transparent 11%),radial-gradient(ellipse at 50% 78%, rgba(224,239,255,0.5) 0 11%, transparent 42%),radial-gradient(ellipse at 17% 43%, rgba(136,188,241,0.42) 0 12%, transparent 39%),radial-gradient(ellipse at 66% 13%, rgba(83,146,225,0.58) 0 20%, transparent 45%),linear-gradient(180deg, #154b95 0%, #0a2b65 47%, #06162d 100%)",
              )}
            />
            <wz-sky
              data-sky=""
              mode={fxModeAttr}
              rays="0.9"
              style={css("position:absolute;inset:0;z-index:1;pointer-events:none;display:block")}
            />
            <wz-dither
              amp="0.26"
              color="#bcdcff"
              freq="2.3"
              levels="5"
              mode={fxModeAttr}
              pixel="2.2"
              speed="0.035"
              style={css(
                "position:absolute;inset:0;z-index:2;opacity:0.16;mix-blend-mode:overlay;pointer-events:none;display:block",
              )}
            />
            <wz-trail
              className={styles.trail}
              mode={fxModeAttr}
              tags="Air|Studio|Earth|Zap|Fire+Water"
              threshold="85"
              style={css("position:absolute;inset:0;z-index:6;pointer-events:none")}
            />
            <div
              aria-hidden="true"
              style={{
                ...css(
                  "position:absolute;inset:0;z-index:2;pointer-events:none;mix-blend-mode:soft-light;opacity:0.15",
                ),
                backgroundImage: GRAIN_BACKGROUND,
              }}
            />
            <div aria-hidden="true" style={css("position:absolute;inset:1.25rem;z-index:4;pointer-events:none")}>
              <span
                style={css(
                  `position:absolute;left:0.75rem;top:0.75rem;color:rgba(220,230,242,0.72);font-family:${MONO};font-size:0.62rem;letter-spacing:0.08em;text-transform:uppercase`,
                )}
              >
                LAT 34.0224° N
              </span>
              <span
                style={css(
                  `position:absolute;left:0.75rem;bottom:0.75rem;color:rgba(220,230,242,0.72);font-family:${MONO};font-size:0.62rem;letter-spacing:0.08em;text-transform:uppercase`,
                )}
              >
                ALT +∞
              </span>
            </div>

            <div style={css("position:relative;z-index:3;margin:0 auto;max-width:75rem;width:100%;text-align:center")}>
              <h1
                style={css(
                  "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;margin:0",
                )}
              >
                WZRD.tech
              </h1>
              <p
                style={css(
                  `font-family:${MONO};font-size:clamp(0.75rem,0.76vw,0.95rem);letter-spacing:0.12em;text-transform:uppercase;color:rgba(220,230,242,0.86);margin:0 0 1.35rem`,
                )}
              >
                A creator operating system
              </p>
              <div
                data-wordmark=""
                style={css("position:relative;margin:0 auto;width:min(88vw,50rem);max-width:min(88vw,50rem)")}
              >
                <img
                  alt=""
                  fetchPriority="high"
                  height={396}
                  src={WORDMARK}
                  style={css(
                    "display:block;width:100%;height:auto;filter:drop-shadow(0 1.7rem 1.8rem rgba(2,10,25,0.28))",
                  )}
                  width={1600}
                />
              </div>
              <p
                data-creator-os=""
                style={css(
                  "position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#f1ebdd;font-size:clamp(2.2rem,7.4vw,7.2rem);font-weight:400;letter-spacing:-0.03em;line-height:0.98;margin:clamp(1.5rem,4vw,3.25rem) auto 0;max-width:44rem",
                )}
              >
                <span data-word-1="" style={css("display:inline-block;will-change:transform,filter,opacity")}>
                  Creative
                </span>
                <span data-word-2="" style={css("display:inline-block;will-change:transform,filter,opacity")}>
                  Infrastructure
                </span>
              </p>
              <p
                data-hero-statement=""
                style={css(
                  "color:#f8f5ec;text-shadow:0 1px 2px rgba(2,8,20,0.85),0 0.5rem 1.6rem rgba(2,8,20,0.6);font-size:clamp(1.05rem,1.5vw,1.3rem);line-height:1.5;margin:1.8rem auto 1.7rem;max-width:34rem",
                )}
              >
                Building digital and physical generative media studio to create, distribute, and monetize across all
                channels on one platform.
              </p>
            </div>

            <div
              aria-hidden="true"
              data-hero-dash-scrim=""
              style={css(
                "position:absolute;inset:0;z-index:4;pointer-events:none;opacity:0;background:radial-gradient(ellipse at 50% 42%, #0d1830 0%, #05070a 68%)",
              )}
            />
            <div
              data-hero-dashboard=""
              style={css("position:relative;z-index:5;margin:3rem auto 0;text-align:center;opacity:1")}
            >
              <p
                style={css(
                  `color:#8cc8ff;font-family:${MONO};font-size:clamp(0.75rem,0.76vw,0.95rem);letter-spacing:0.12em;text-transform:uppercase;margin:0 0 1.1rem`,
                )}
              >
                An Attention Engine
              </p>
              <h2
                style={css(
                  "font-size:clamp(1.75rem,3.6vw,3.4rem);font-weight:400;letter-spacing:-0.055em;line-height:0.98;margin:0 auto 2rem;max-width:38rem;color:#f1ebdd",
                )}
              >
                Your unified creative infrastructure to take action across 1000s of models, applications, and
                integrations.
              </h2>
              <div
                style={css(
                  "position:relative;width:100%;max-width:52rem;margin:0 auto;aspect-ratio:575/322;isolation:isolate",
                )}
              >
                <wz-griddistort
                  mode={fxModeAttr}
                  radius="0.22"
                  relax="0.9"
                  src="/creator-os/devices-trimmed.png"
                  strength="0.6"
                  style={css("position:absolute;inset:0;display:block")}
                />
              </div>
            </div>

            <div
              data-hero-hud=""
              style={css(
                `position:absolute;bottom:3.4rem;left:50%;transform:translateX(-50%);z-index:4;display:flex;align-items:center;gap:0.75rem;white-space:nowrap;color:rgba(220,230,242,0.7);font-family:${MONO};font-size:0.54rem;letter-spacing:0.08em;text-transform:uppercase`,
              )}
            >
              <span>Scroll to enter</span>
              <span style={css("width:3.25rem;height:1px;background:currentColor;opacity:0.58")} />
              <span>01 / 05</span>
            </div>
          </div>
        </section>

        {/* ============ 01 / STUDIO ============ */}
        <section
          aria-labelledby="studio-title"
          data-screen-label="01 Studio"
          id="studio"
          style={css(`${SECTION_SHELL};background:#171311;color:#f1ebdd;display:flex;flex-direction:column`)}
        >
          <div
            aria-hidden="true"
            style={css(
              "position:absolute;inset:0;z-index:0;pointer-events:none;opacity:0.5;background:radial-gradient(circle at 76% 44%, rgba(240,106,71,0.22), transparent 30%),radial-gradient(circle at 50% 50%, rgba(224,155,93,0.14), transparent 67%)",
            )}
          />
          <wz-gridmotion
            accent="rgba(240,161,69,0.3)"
            gradient-color="#171311"
            ink="rgba(241,235,221,0.5)"
            items={GRID_MOTION_ITEMS}
            mode={fxModeAttr}
            style={css("position:absolute;inset:0;z-index:0;opacity:0.5;display:block")}
            wash="rgba(224,155,93,0.14)"
          />
          <div data-reveal="" style={css(SECTION_META)}>
            <span>01 / Studio</span>
            <span>A Generative Media Studio, in your pocket</span>
          </div>
          <div
            style={css(
              "position:relative;z-index:1;display:grid;gap:2.25rem clamp(2rem,5vw,6rem);grid-template-columns:repeat(auto-fit,minmax(min(100%,21rem),1fr));margin:0 auto;max-width:71rem;align-items:center",
            )}
          >
            <header data-reveal="" style={css("max-width:36rem")}>
              <h2 id="studio-title" style={css(SECTION_TITLE)}>
                Make the cut without leaving the conversation.
              </h2>
              <p style={css(`color:rgba(241,235,221,0.72);${SECTION_LEDE}`)}>
                Studio is a mobile creative room. Collect references, direct the agents, shape a sequence, and take the
                work to the next room when it is ready.
              </p>
            </header>
            <figure
              aria-label="Studio editor interface, illustrative"
              data-reveal=""
              data-studio-app=""
              style={css("position:relative;z-index:1;margin:0;max-width:32rem;width:100%;justify-self:end")}
            >
              <div
                className={styles.appFrame}
                style={css(
                  "position:relative;width:100%;aspect-ratio:960/469;overflow:hidden;border-radius:0.85rem;border:1px solid rgba(241,235,221,0.14);background:#111;box-shadow:0 2rem 4rem rgba(0,0,0,0.5)",
                )}
              >
                <div
                  style={css(
                    `position:absolute;top:0;left:0;right:0;z-index:3;display:flex;align-items:center;justify-content:space-between;height:12.5%;padding:0 1.8%;background:#181615;border-bottom:1px solid rgba(241,235,221,0.08);font-family:${MONO}`,
                  )}
                >
                  <div style={css("display:flex;align-items:center;gap:0.6rem")}>
                    <span
                      aria-hidden="true"
                      style={css("width:0.85rem;height:0.85rem;border-radius:50%;background:#f06a47;flex:none")}
                    />
                    <span style={css("font-size:0.85rem;letter-spacing:0.06em;color:#f1ebdd")}>WZRD.STUDIO</span>
                  </div>
                  <span style={css("font-size:0.78rem;color:rgba(241,235,221,0.45);letter-spacing:0.04em")}>
                    Project Timeline
                  </span>
                  <div style={css("display:flex;align-items:center;gap:0.7rem")}>
                    <span
                      style={css(
                        "font-size:0.72rem;color:rgba(241,235,221,0.7);border:1px solid rgba(241,235,221,0.18);border-radius:0.4rem;padding:0.3rem 0.65rem",
                      )}
                    >
                      Export
                    </span>
                    <span
                      style={css("display:flex;align-items:center;gap:0.35rem;font-size:0.72rem;color:rgba(241,235,221,0.7)")}
                    >
                      <i
                        aria-hidden="true"
                        style={css("width:0.4rem;height:0.4rem;border-radius:50%;background:#5ce08a;display:inline-block")}
                      />
                      Ready
                    </span>
                  </div>
                </div>
                <div
                  style={css(
                    "position:absolute;top:12.5%;bottom:0;left:0;z-index:3;width:5.2%;display:flex;flex-direction:column;align-items:center;gap:1.1rem;padding-top:1.4rem;background:#141210;border-right:1px solid rgba(241,235,221,0.08)",
                  )}
                >
                  <span
                    aria-hidden="true"
                    style={css(
                      "width:1.9rem;height:1.9rem;border-radius:0.5rem;background:rgba(240,106,71,0.22);border:1px solid rgba(240,106,71,0.5)",
                    )}
                  />
                  {[0.22, 0.16, 0.16, 0.16].map((alpha, index) => (
                    <span
                      aria-hidden="true"
                      key={`rail-${index}`}
                      style={css(
                        `width:1.1rem;height:1.1rem;border-radius:0.2rem;background:rgba(241,235,221,${alpha})`,
                      )}
                    />
                  ))}
                </div>
                <div
                  data-studio-scrub=""
                  style={css("position:absolute;top:12.5%;left:5.2%;right:22%;height:49%;overflow:hidden;background:#0a0a0a")}
                >
                  <wz-dither
                    amp="0.4"
                    color="#f0a145"
                    freq="1.6"
                    levels="5"
                    mode={fxModeAttr}
                    pixel="3.2"
                    speed="0.05"
                    style={css("position:absolute;inset:0;display:block")}
                  />
                  <div
                    aria-hidden="true"
                    style={css(
                      "position:absolute;inset:0;mix-blend-mode:overlay;opacity:0.5;background:linear-gradient(100deg, rgba(240,106,71,0.55) 0%, rgba(91,127,224,0.1) 52%, rgba(60,90,220,0.55) 100%)",
                    )}
                  />
                  <div
                    aria-hidden="true"
                    style={css("position:absolute;top:30%;left:56%;width:1.6rem;height:1.6rem;opacity:0.5;font-size:1.1rem;color:#f1ebdd")}
                  >
                    ☝
                  </div>
                  <div
                    aria-hidden="true"
                    style={css(`position:absolute;top:22%;left:40%;font-family:${MONO};font-size:0.6rem;color:rgba(241,235,221,0.5)`)}
                  >
                    8:24
                  </div>
                  <div
                    aria-hidden="true"
                    style={css(`position:absolute;top:38%;left:58%;font-family:${MONO};font-size:0.6rem;color:rgba(241,235,221,0.45)`)}
                  >
                    $12,410
                  </div>
                  <div
                    style={css(
                      `position:absolute;bottom:0;left:0;right:0;display:flex;align-items:center;gap:0.7rem;height:18%;padding:0 1.1rem;background:rgba(10,9,8,0.78);font-family:${MONO};color:rgba(241,235,221,0.75)`,
                    )}
                  >
                    <span aria-hidden="true" style={css("font-size:0.85rem")}>
                      ⏮
                    </span>
                    <span
                      aria-hidden="true"
                      style={css(
                        "width:1.5rem;height:1.5rem;border-radius:50%;background:rgba(241,235,221,0.16);display:flex;align-items:center;justify-content:center;font-size:0.7rem",
                      )}
                    >
                      ▶
                    </span>
                    <span aria-hidden="true" style={css("font-size:0.85rem")}>
                      ⏭
                    </span>
                    <span data-studio-timecode="" style={css("font-size:0.66rem;margin-left:0.3rem")}>
                      00:00:00 / 01:02:34
                    </span>
                    <span style={css("margin-left:auto;font-size:0.66rem;opacity:0.7")}>100% 🔊</span>
                  </div>
                </div>
                <div
                  style={css(
                    `position:absolute;left:5.2%;right:22%;top:61.5%;bottom:0;padding:0.9rem 1.1rem;background:#151210;border-top:1px solid rgba(241,235,221,0.14);font-family:${MONO};font-size:0.6rem;color:rgba(241,235,221,0.55)`,
                  )}
                >
                  <div style={css("display:flex;justify-content:space-between;opacity:0.55;margin-bottom:0.4rem")}>
                    {["00:00", "00:15", "00:30", "00:45", "01:00"].map((tick) => (
                      <span key={tick}>{tick}</span>
                    ))}
                  </div>
                  <div style={css("position:relative;display:flex;flex-direction:column;gap:0.55rem")}>
                    <div
                      aria-hidden="true"
                      data-studio-playhead=""
                      style={css(
                        "position:absolute;top:-0.3rem;bottom:-0.3rem;left:6%;width:2px;background:#f0a145;box-shadow:0 0 0.5rem rgba(240,161,69,0.7)",
                      )}
                    />
                    {studioTracks.map((track) => (
                      <div key={track.label} style={css("display:flex;align-items:center;gap:0.6rem")}>
                        <span style={css("width:3.2rem;flex:none;opacity:0.7")}>{track.label}</span>
                        <span style={css(`flex:1;height:1.15rem;border-radius:0.3rem;${track.bar}`)} />
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  style={css(
                    `position:absolute;top:12.5%;bottom:0;right:0;width:22%;padding:1rem 0.9rem;background:#161311;border-left:1px solid rgba(241,235,221,0.08);font-family:${MONO};font-size:0.66rem;color:rgba(241,235,221,0.7)`,
                  )}
                >
                  <div
                    style={css(
                      "display:flex;align-items:center;gap:0.4rem;margin-bottom:0.85rem;letter-spacing:0.08em;text-transform:uppercase",
                    )}
                  >
                    <i
                      aria-hidden="true"
                      style={css("width:0.4rem;height:0.4rem;border-radius:50%;background:#5ce08a;display:inline-block")}
                    />
                    Director
                  </div>
                  <div style={css("display:flex;flex-direction:column;gap:0.5rem")}>
                    {studioNotes.map((note, index) => (
                      <p
                        data-reveal=""
                        data-stagger={index}
                        data-studio-note=""
                        key={note.copy}
                        style={css(
                          note.tone === "accent"
                            ? "margin:0;padding:0.55rem 0.6rem;background:rgba(240,106,71,0.14);border:1px solid rgba(240,106,71,0.4);border-radius:0.4rem;color:#f1ebdd"
                            : `margin:0;padding:0.55rem 0.6rem;background:rgba(241,235,221,0.05);border-radius:0.4rem${
                                note.tone === "muted" ? ";opacity:0.7" : note.tone === "faint" ? ";opacity:0.35" : ""
                              }`,
                        )}
                      >
                        {note.copy}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
              <figcaption
                style={css(
                  `display:flex;justify-content:space-between;gap:0.6rem;color:rgba(241,235,221,0.5);font-family:${MONO};font-size:0.64rem;letter-spacing:0.04em;text-transform:uppercase;margin-top:0.75rem`,
                )}
              >
                <span>Studio / interface study</span>
                <span>Scroll to scrub</span>
              </figcaption>
            </figure>
          </div>

          <ol
            style={css(
              "list-style:none;margin:auto auto 0;width:100%;padding:clamp(1.75rem,3vw,2.5rem) 0 0;border-top:1px solid rgba(241,235,221,0.24);display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr));gap:clamp(1.75rem,4vw,3.5rem);max-width:71rem",
            )}
          >
            {studioSteps.map((step, index) => (
              <li
                data-reveal=""
                data-stagger={index}
                key={step.title}
                style={css("border-left:1px solid rgba(241,235,221,0.18);padding-left:1.5rem")}
              >
                <span
                  style={css(
                    `display:block;color:#f0a145;font-family:${MONO};font-size:0.78rem;letter-spacing:0.04em;margin-bottom:0.7rem`,
                  )}
                >
                  {step.index}
                </span>
                <h3
                  style={css("font-size:1.55rem;font-weight:400;letter-spacing:-0.03em;margin:0 0 0.5rem;color:#f1ebdd")}
                >
                  {step.title}
                </h3>
                <p style={css("font-size:1rem;line-height:1.4;margin:0;color:rgba(241,235,221,0.68)")}>{step.copy}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ============ 02 / ZAP ============ */}
        <section
          aria-labelledby="zap-title"
          data-screen-label="02 Zap"
          id="zap"
          style={css(`${SECTION_SHELL};background:#070809`)}
        >
          <div
            aria-hidden="true"
            style={css(
              "position:absolute;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse at 72% 48%, rgba(240,106,71,0.13), transparent 30%),repeating-linear-gradient(90deg, transparent 0 3.3rem, rgba(140,200,255,0.05) 3.35rem 3.42rem)",
            )}
          />
          <wz-terminal
            bright="0.55"
            curve="0.12"
            mode={fxModeAttr}
            scale="1.4"
            speed="0.28"
            style={css("position:absolute;inset:0;z-index:0;opacity:0.85;mix-blend-mode:screen;display:block")}
            tint="#e07a55"
          />
          <div
            aria-hidden="true"
            style={css(
              "position:absolute;inset:0;z-index:0;pointer-events:none;background:linear-gradient(90deg, rgba(7,8,9,0.92) 0%, rgba(7,8,9,0.55) 42%, rgba(7,8,9,0.22) 100%)",
            )}
          />
          <div data-reveal="" style={css(SECTION_META)}>
            <span>02 / Zap</span>
            <span>Agent Media Runtime</span>
          </div>
          <div
            style={css(
              "position:relative;z-index:1;display:grid;gap:clamp(3rem,8vw,9rem);grid-template-columns:repeat(auto-fit,minmax(min(100%,21rem),1fr));margin:0 auto;max-width:71rem",
            )}
          >
            <header data-reveal="" style={css("max-width:36rem")}>
              <p style={css(`color:#f06a47;${SECTION_KICKER}`)}>Agent media runtime · v0.3.0</p>
              <h2 id="zap-title" style={css(SECTION_TITLE)}>
                Zap is the recipe runtime behind every release.
              </h2>
              <p style={css(`color:rgba(241,235,221,0.74);${SECTION_LEDE}`)}>
                File-first media recipes for agents, creators, and operators. Prompts, provider routes, budget caps, and
                output shape stay inspectable — mock by default, live only when you say so.
              </p>
              <p
                style={css(
                  `color:rgba(241,235,221,0.58);font-family:${MONO};font-size:0.68rem;letter-spacing:0.08em;line-height:1.35;text-transform:uppercase;margin:1rem 0 0`,
                )}
              >
                Runtime spec · docs.zap.wzrd.tech
              </p>
              <a
                className={styles.airLink}
                href={ZAP_URL}
                rel="noopener"
                style={css(
                  `display:inline-flex;align-items:center;gap:0.6rem;border-bottom:1px solid rgba(240,106,71,0.55);color:#f1ebdd;font-family:${MONO};font-size:0.75rem;letter-spacing:0.08em;text-transform:uppercase;margin-top:2.1rem;min-height:44px;padding-bottom:0.55rem;transition:color 160ms ease`,
                )}
                target="_top"
              >
                Open Zap <span aria-hidden="true">↗</span>
              </a>
            </header>
            <ol
              aria-label="Illustrative Agent Media Runtime path"
              data-reveal=""
              style={css("list-style:none;margin:0;padding:0;border-top:1px solid rgba(220,230,242,0.24)")}
            >
              {zapStages.map((stage) => (
                <li
                  key={stage.stage}
                  style={css(
                    "display:grid;align-items:start;gap:1rem;grid-template-columns:2.5rem 1fr 0.8rem;border-bottom:1px solid rgba(220,230,242,0.2);padding:1.45rem 0",
                  )}
                >
                  <span style={css(`color:#f06a47;font-family:${MONO};font-size:0.75rem;padding-top:0.28rem`)}>
                    {stage.index}
                  </span>
                  <div>
                    <p
                      style={css(
                        `color:#f06a47;font-family:${MONO};font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;margin:0 0 0.55rem`,
                      )}
                    >
                      {stage.stage}
                    </p>
                    <h3 style={css("font-size:1.65rem;font-weight:400;letter-spacing:-0.045em;margin:0")}>
                      {stage.title}
                    </h3>
                    <p
                      style={css(
                        "color:rgba(241,235,221,0.64);font-size:0.98rem;line-height:1.35;margin:0.35rem 0 0;max-width:27rem",
                      )}
                    >
                      {stage.copy}
                    </p>
                    <ul style={css("display:flex;flex-wrap:wrap;gap:0.45rem;list-style:none;margin:0.85rem 0 0;padding:0")}>
                      {stage.tags.map((tag) => (
                        <li key={tag} style={css(ZAP_TAG)}>
                          {tag}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <i
                    aria-hidden="true"
                    style={css(
                      "display:block;width:0.43rem;height:0.43rem;margin-top:0.47rem;background:#f06a47;box-shadow:0 0 1.2rem rgba(240,106,71,0.75)",
                    )}
                  />
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ============ 03 / EARTH ============ */}
        <section
          aria-labelledby="earth-title"
          data-screen-label="03 Earth"
          id="earth"
          style={css(
            "position:relative;min-height:100svh;height:100svh;overflow:hidden;background:linear-gradient(112deg, #152e25 0%, #0c201b 48%, #111d17 100%);scroll-margin-top:4rem",
          )}
        >
          <wz-prism
            freq="0.6"
            glow="1"
            hue="-0.5"
            mode={fxModeAttr}
            noise="0.22"
            scale="3.6"
            speed="0.35"
            style={css(
              "position:absolute;inset:0;z-index:0;opacity:0.55;mix-blend-mode:screen;pointer-events:none;display:block",
            )}
          />
          <div
            aria-hidden="true"
            style={css(
              "position:absolute;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse at 50% 0%, rgba(8,20,16,0.7), transparent 55%),radial-gradient(ellipse at 50% 100%, rgba(8,20,16,0.85), transparent 60%)",
            )}
          />
          <div data-reveal="" style={css("position:absolute;inset:0;z-index:1")}>
            <wz-infinite-menu
              className={styles.wheel}
              items={WHEEL_ITEMS}
              mode={fxModeAttr}
              scale="1"
              style={css("display:block;width:100%;height:100%")}
            />
            <div aria-hidden="true" className={styles.wheelFallback} style={css("position:absolute;inset:0")} />
          </div>
          <div
            style={css(
              `position:absolute;top:0;left:0;right:0;z-index:2;display:flex;justify-content:space-between;gap:1rem;color:rgba(241,235,221,0.55);font-family:${MONO};font-size:clamp(0.75rem,0.76vw,0.95rem);letter-spacing:0.12em;text-transform:uppercase;padding:clamp(2rem,4vw,3.25rem) max(1.7rem,calc((100vw - 75rem) / 2)) 0;pointer-events:none`,
            )}
          >
            <span>03 / Earth</span>
            <span>Artist discovery</span>
          </div>
          <div
            style={css(
              "position:absolute;left:0;right:0;bottom:0;z-index:2;display:grid;gap:clamp(1.5rem,4vw,3rem);grid-template-columns:repeat(auto-fit,minmax(min(100%,17rem),1fr));align-items:end;padding:0 max(1.7rem,calc((100vw - 75rem) / 2)) clamp(2.5rem,5vw,4rem);pointer-events:none;background:linear-gradient(to top, rgba(10,20,17,0.75) 0%, rgba(10,20,17,0.35) 55%, transparent 100%);padding-top:clamp(2.5rem,8vw,6rem)",
            )}
          >
            <header data-reveal="" style={css("max-width:38rem;pointer-events:auto")}>
              <p style={css(`color:#c5ba9e;${SECTION_KICKER}`)}>Artist Discovery</p>
              <h2
                id="earth-title"
                style={css(
                  "font-size:clamp(1.95rem,4.4vw,4.8rem);font-weight:400;letter-spacing:-0.065em;line-height:0.92;margin:0",
                )}
              >
                Enter the Creative Universe.
              </h2>
              <p
                style={css(
                  "color:rgba(241,235,221,0.74);font-size:clamp(1.05rem,1.5vw,1.3rem);line-height:1.45;margin:1.5rem 0 0;max-width:30rem",
                )}
              >
                Drag the wheel to move through the makers, roles, and rooms behind every release — a living map of who
                carries the work forward.
              </p>
            </header>
            <aside
              data-reveal=""
              style={css(
                "border-left:1px solid rgba(224,220,192,0.38);max-width:26rem;padding:0.2rem 0 0.2rem 1.3rem;pointer-events:auto",
              )}
            >
              <span
                style={css(
                  `color:#c5ba9e;font-family:${MONO};font-size:0.75rem;letter-spacing:0.1em;text-transform:uppercase`,
                )}
              >
                The creative landscape
              </span>
              <p style={css("font-size:1.3rem;line-height:1.16;margin:1.1rem 0 0")}>No release moves alone.</p>
              <a
                className={styles.earthLink}
                href="#coming-soon"
                style={css(
                  `display:inline-flex;align-items:center;gap:0.6rem;border-bottom:1px solid rgba(197,186,158,0.55);color:#c5ba9e;font-family:${MONO};font-size:0.75rem;letter-spacing:0.08em;text-transform:uppercase;margin-top:1.6rem;min-height:44px;padding-bottom:0.55rem;transition:color 160ms ease`,
                )}
              >
                Access Earth Tones <span aria-hidden="true">↓</span>
              </a>
            </aside>
          </div>
        </section>

        {/* ============ 04 / AIR ============ */}
        <section
          aria-labelledby="air-title"
          className={styles.air}
          data-screen-label="04 Air"
          id="air"
          style={css(`${SECTION_SHELL};background:linear-gradient(135deg, #071a39 0%, #0b356f 45%, #07172e 100%)`)}
        >
          <wz-dither
            amp="0.32"
            color="#7db8ff"
            freq="2.6"
            levels="4"
            mode={fxModeAttr}
            pixel="2.5"
            speed="0.055"
            style={css(
              "position:absolute;inset:0;z-index:0;opacity:0.42;mix-blend-mode:screen;pointer-events:none;display:block",
            )}
          />
          <div data-reveal="" style={css(SECTION_META)}>
            <span>04 / Air</span>
            <span>Intent, received</span>
          </div>
          <div
            style={css(
              "position:relative;z-index:1;display:grid;align-items:center;gap:clamp(3rem,9vw,10rem);grid-template-columns:repeat(auto-fit,minmax(min(100%,21rem),1fr));margin:0 auto;max-width:71rem",
            )}
          >
            <header data-reveal="" style={css("max-width:36rem")}>
              <p style={css(`color:#8cc8ff;${SECTION_KICKER}`)}>Air powered by Zaps, your creative assistant</p>
              <h2 id="air-title" style={css(SECTION_TITLE)}>
                Air by WZRD Tech is your creative assistant that lives in your iMessages.
              </h2>
              <p style={css(`color:rgba(241,235,221,0.74);${SECTION_LEDE}`)}>
                A messages-native creative agent that hears the cue, asks the one question that matters, and turns the
                answer into momentum.
              </p>
              <a
                className={styles.airLink}
                href="#coming-soon"
                style={css(
                  `display:inline-flex;align-items:center;gap:0.6rem;border-bottom:1px solid rgba(241,235,221,0.55);color:#f1ebdd;font-family:${MONO};font-size:0.75rem;letter-spacing:0.08em;text-transform:uppercase;margin-top:2.1rem;min-height:44px;padding-bottom:0.55rem;transition:color 160ms ease`,
                )}
              >
                Access Air via iMessage <span aria-hidden="true">↓</span>
              </a>
            </header>
            <article
              aria-label="A sample Air conversation"
              data-reveal=""
              style={css(
                "background:rgba(4,16,35,0.62);border:1px solid rgba(219,237,255,0.35);box-shadow:1.2rem 1.2rem 0 rgba(3,11,26,0.22);padding:1rem;transform:rotate(1.2deg)",
              )}
            >
              <div
                style={css(
                  `display:flex;align-items:center;gap:0.65rem;border-bottom:1px solid rgba(219,237,255,0.16);padding:0.1rem 0.1rem 0.85rem;font-family:${MONO}`,
                )}
              >
                <span
                  aria-hidden="true"
                  style={css(
                    "display:inline-flex;align-items:center;justify-content:center;width:1.85rem;height:1.85rem;border-radius:50%;background:#0a84ff;color:#fff;font-size:0.73rem;font-weight:800",
                  )}
                >
                  W
                </span>
                <div>
                  <strong style={css("display:block;font-size:0.82rem;letter-spacing:0.03em")}>Air</strong>
                  <small style={css("display:block;color:rgba(220,230,242,0.62);font-size:0.75rem;margin-top:0.16rem")}>
                    creative agent
                  </small>
                </div>
                <span
                  className={styles.pulse}
                  style={css("margin-left:auto;padding-right:0.1rem;color:#0a84ff;font-size:0.75rem")}
                >
                  available
                </span>
              </div>
              <p
                style={css(
                  `color:rgba(220,230,242,0.58);font-family:${MONO};font-size:0.68rem;letter-spacing:0.08em;line-height:1.35;text-transform:uppercase;margin:0.95rem 0.1rem -0.25rem`,
                )}
              >
                Prototype transcript · fictional, consent-safe
              </p>
              <div role="list" style={css("display:flex;flex-direction:column;gap:0.5rem;padding:1rem 0.1rem")}>
                <div data-reveal="" data-reveal-dir="right" data-stagger="0" role="listitem" style={css(MESSAGE_OUT)}>
                  <b style={css("color:#cfe6ff;font-weight:700")}>/imagine</b> Four shots. Night city. No rush.
                  <span aria-hidden="true" style={css(MESSAGE_META)}>
                    Sent
                  </span>
                </div>
                <div
                  aria-label="Air is imagining"
                  data-reveal=""
                  data-reveal-dir="left"
                  data-stagger="1"
                  role="listitem"
                  style={css(MESSAGE_TYPING)}
                >
                  <span aria-hidden="true" style={css("display:inline-flex;gap:0.22rem")}>
                    <i className={styles.typingDot} />
                    <i className={styles.typingDot} />
                    <i className={styles.typingDot} />
                  </span>
                  Imagining…
                </div>
                <div data-reveal="" data-reveal-dir="left" data-stagger="2" role="listitem" style={css(MESSAGE_IN)}>
                  I hear a quiet opener, a bright interruption, then room for the last beat.
                  <span
                    aria-hidden="true"
                    style={css(
                      "display:block;color:rgba(220,230,242,0.7);font-size:0.62rem;letter-spacing:0.08em;text-transform:uppercase;margin-top:0.4rem",
                    )}
                  >
                    Working
                  </span>
                </div>
                <div data-reveal="" data-reveal-dir="right" data-stagger="3" role="listitem" style={css(MESSAGE_OUT)}>
                  <b style={css("color:#cfe6ff;font-weight:700")}>/director</b> Keep the last beat quiet.
                  <span aria-hidden="true" style={css(MESSAGE_META)}>
                    Approved
                  </span>
                </div>
                <div
                  aria-label="Air is directing"
                  data-reveal=""
                  data-reveal-dir="left"
                  data-stagger="4"
                  role="listitem"
                  style={css(MESSAGE_TYPING)}
                >
                  <span aria-hidden="true" style={css("display:inline-flex;gap:0.22rem")}>
                    <i className={styles.typingDot} />
                    <i className={styles.typingDot} />
                    <i className={styles.typingDot} />
                  </span>
                  Directing…
                </div>
                <div data-reveal="" data-reveal-dir="right" data-stagger="5" role="listitem" style={css(MESSAGE_OUT)}>
                  <b style={css("color:#cfe6ff;font-weight:700")}>/create</b> release packet.
                  <span aria-hidden="true" style={css(MESSAGE_META)}>
                    Sent
                  </span>
                </div>
                <div
                  data-reveal=""
                  data-reveal-dir="left"
                  data-stagger="6"
                  role="listitem"
                  style={css(
                    `align-self:flex-start;width:min(88%,29rem);background:rgba(9,27,57,0.65);border-left:2px solid #0a84ff;color:rgba(220,230,242,0.88);border-radius:0 1.15rem 1.15rem 1.15rem;${MESSAGE_BASE}`,
                  )}
                >
                  Locked. I’ll carry the silence into the cut sheet.
                  <span
                    aria-hidden="true"
                    style={css(
                      "display:block;color:rgba(220,230,242,0.7);font-size:0.62rem;letter-spacing:0.08em;text-transform:uppercase;margin-top:0.4rem",
                    )}
                  >
                    Delivered
                  </span>
                </div>
              </div>
              <div
                style={css(
                  `display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(219,237,255,0.16);color:rgba(220,230,242,0.52);font-family:${MONO};font-size:0.66rem;text-transform:uppercase;letter-spacing:0.08em;padding:0.85rem 0.1rem 0.08rem`,
                )}
              >
                <span>Send a thought</span>
                <b
                  aria-hidden="true"
                  style={css(
                    "display:inline-flex;align-items:center;justify-content:center;width:1.5rem;height:1.5rem;border:1px solid rgba(219,237,255,0.36);color:#f1ebdd;font-size:0.8rem;font-weight:400",
                  )}
                >
                  ↑
                </b>
              </div>
            </article>
          </div>
        </section>

        {/* ============ 05 / FIRE+WATER ============ */}
        <section
          aria-labelledby="horizon-title"
          className={styles.horizon}
          data-screen-label="05 Fire+Water"
          id="coming-soon"
          style={css(
            "position:relative;min-height:32rem;overflow:hidden;padding:clamp(4.5rem,8vw,7rem) max(1.7rem,calc((100vw - 75rem) / 2)) clamp(4rem,7vw,6rem);background:#0e1114;scroll-margin-top:4rem",
          )}
        >
          <div data-reveal="" style={css(`${SECTION_META};margin-bottom:clamp(2.5rem,5vw,4.5rem)`)}>
            <span>05 / Fire+Water</span>
            <span>Coming soon</span>
          </div>
          <div data-reveal="" style={css("position:relative;margin:0 auto clamp(3rem,6vw,6rem);max-width:71rem")}>
            <p style={css(`color:rgba(241,235,221,0.58);${SECTION_KICKER}`)}>The elements still gathering</p>
            <h2 id="horizon-title" style={css(SECTION_TITLE)}>
              Fire and Water.
            </h2>
            <p
              style={css(
                "color:rgba(241,235,221,0.74);font-size:clamp(1.05rem,1.5vw,1.3rem);line-height:1.45;margin:1.75rem 0 0;max-width:28rem",
              )}
            >
              Two future layers for creators, culture, and the value that follows a release.
            </p>
          </div>
          <div
            data-reveal=""
            style={css(
              "position:relative;display:grid;gap:1px;grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr));margin:0 auto;max-width:71rem",
            )}
          >
            <article
              style={css(
                "position:relative;overflow:hidden;min-height:clamp(19rem,54vw,25rem);padding:clamp(1.5rem,3vw,3rem);background:#0d2027;border:1px solid rgba(109,200,215,0.42);display:flex;flex-direction:column",
              )}
            >
              <div
                aria-hidden="true"
                style={css(
                  "position:absolute;inset:0;z-index:0;pointer-events:none;opacity:0.5;background:radial-gradient(circle at 18% 18%, rgba(109,200,215,0.42), transparent 26%),radial-gradient(circle at 76% 68%, rgba(145,222,235,0.24), transparent 32%)",
                )}
              />
              <wz-chrome
                amp="0.4"
                base="#0a2126"
                fx="2.2"
                fy="1.6"
                mode={fxModeAttr}
                speed="0.45"
                style={css("position:absolute;inset:0;z-index:0;opacity:0.55;mix-blend-mode:screen;display:block")}
              />
              <div
                style={css("position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;gap:1rem")}
              >
                <p style={css(`color:#6dc8d7;${SECTION_KICKER};margin:0`)}>Water / coming soon</p>
                <img
                  alt="The Data Foundation"
                  src="/creator-os/tdf-logo.svg"
                  style={css(
                    "height:clamp(2.3rem,7vw,3.3rem);width:auto;filter:invert(1) brightness(2.2);opacity:0.85",
                  )}
                />
              </div>
              <h3
                style={css(
                  "position:relative;z-index:1;font-size:clamp(1.7rem,3.5vw,3.8rem);font-weight:400;letter-spacing:-0.065em;line-height:0.9;margin:clamp(2.5rem,9vw,6rem) 0 1rem;max-width:18rem",
                )}
              >
                WTR - Powered by The Data FDN
              </h3>
              <p
                style={css(
                  "position:relative;z-index:1;color:rgba(241,235,221,0.68);font-size:1.02rem;line-height:1.4;margin:0;max-width:26rem",
                )}
              >
                Financial infrastructure for the creator economy from stream-backed creative credit loans and embedded
                banking for artists and talent buyers, powered by $5DEE built on OpenUSD.
              </p>
              <a
                className={styles.waterLink}
                href={WHITEPAPER_URL}
                rel="noopener"
                style={css(
                  `position:relative;z-index:1;display:inline-flex;align-items:center;gap:0.6rem;margin-top:1.5rem;padding:0.8rem 1.4rem;border:1px solid rgba(109,200,215,0.5);border-radius:999px;color:#f1ebdd;font-family:${MONO};font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;width:fit-content;transition:background 220ms ease,border-color 220ms ease`,
                )}
                target="_blank"
              >
                Read Our Whitepaper →
              </a>
            </article>
            <article
              style={css(
                "position:relative;overflow:hidden;min-height:clamp(19rem,54vw,25rem);padding:clamp(1.5rem,3vw,3rem);background:#24180f;border:1px solid rgba(240,161,69,0.42);display:flex;flex-direction:column",
              )}
            >
              <video
                autoPlay
                data-fire-water-video=""
                data-src={FIRE_WATER_VIDEO}
                loop
                muted
                playsInline
                poster={FIRE_WATER_POSTER}
                preload="none"
                ref={videoRef}
                style={css("position:absolute;inset:0;z-index:0;width:100%;height:100%;object-fit:cover;opacity:0.6")}
              />
              <div
                aria-hidden="true"
                style={css(
                  "position:absolute;inset:0;z-index:0;pointer-events:none;background:linear-gradient(180deg, rgba(36,24,15,0.32) 0%, rgba(36,24,15,0.55) 55%, rgba(36,24,15,0.92) 100%),radial-gradient(circle at 66% 30%, rgba(240,161,69,0.22), transparent 30%)",
                )}
              />
              <wz-pixels
                cell="13"
                color="#f0a145"
                color2="#f06a47"
                mode={fxModeAttr}
                rate="3"
                style={css("position:absolute;inset:0;z-index:0;opacity:0.32;mix-blend-mode:screen;display:block")}
              />
              <div
                style={css("position:relative;z-index:1;display:flex;align-items:flex-start;justify-content:space-between;gap:1rem")}
              >
                <p style={css(`color:#f0a145;${SECTION_KICKER};margin:0`)}>FYE 🔥 / coming soon</p>
                <img
                  alt="Open Standard"
                  src="/creator-os/openusd-logo-trimmed.png"
                  style={css("height:1.5rem;width:auto;opacity:0.92")}
                />
              </div>
              <h3
                style={css(
                  "position:relative;z-index:1;font-size:clamp(1.7rem,3.5vw,3.8rem);font-weight:400;letter-spacing:-0.065em;line-height:0.9;margin:clamp(2.5rem,9vw,6rem) 0 1rem;max-width:20rem",
                )}
              >
                FYE 🔥, Fifth Spaces
              </h3>
              <p
                style={css(
                  "position:relative;z-index:1;color:rgba(241,235,221,0.68);font-size:1.02rem;line-height:1.4;margin:0;max-width:26rem",
                )}
              >
                Physical spaces for creatives, technologists, and builders. Generative media studios and performance
                spaces operating as cultural nodes for verified human experiences. Partnering with the DATAFDN and
                Frontier Labs for anonymized data collection.
              </p>
              <div
                style={css(
                  "position:relative;z-index:1;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr));gap:0.9rem;margin-top:auto;padding-top:1.75rem",
                )}
              >
                {dataCards.map((card) => (
                  <DataDisclosureCard copy={card.copy} fxModeAttr={fxModeAttr} key={card.label} label={card.label} />
                ))}
              </div>
            </article>
          </div>
        </section>

        {/* ============ CLOSING ============ */}
        <section
          aria-label="Enter WZRD Studio"
          data-screen-label="Closing"
          id="enter"
          style={css(
            "position:relative;isolation:isolate;display:flex;align-items:center;min-height:clamp(14rem,22vw,20rem);overflow:hidden;background:radial-gradient(ellipse at 50% 42%, #0d1830 0%, #05070a 68%);padding:clamp(2rem,4vw,3.5rem) max(1.7rem,calc((100vw - 75rem) / 2))",
          )}
        >
          <div
            aria-hidden="true"
            style={css(
              "position:absolute;inset:0;z-index:0;pointer-events:none;opacity:0.85;background:radial-gradient(circle at 70% 42%, rgba(241,235,221,0.5), transparent 8%),conic-gradient(from 207deg at 70% 42%, transparent 0 9deg, rgba(109,200,215,0.45) 11deg 17deg, transparent 20deg 31deg, rgba(241,235,221,0.4) 33deg 37deg, transparent 41deg 55deg, rgba(240,161,69,0.38) 58deg 64deg, transparent 68deg 83deg, rgba(240,106,71,0.36) 86deg 92deg, transparent 96deg 360deg),radial-gradient(ellipse at 79% 50%, rgba(240,106,71,0.26), transparent 44%)",
            )}
          />
          <wz-burst
            colors="#6dc8d7,#f1ebdd,#f0a145,#f06a47"
            distort="1.3"
            focal="0.7,0.42"
            intensity="1.2"
            mode={fxModeAttr}
            rays="18"
            speed="0.14"
            style={css("position:absolute;inset:0;z-index:0;opacity:0.95;mix-blend-mode:screen;display:block")}
          />
          <div
            aria-hidden="true"
            style={css(
              "position:absolute;inset:0;z-index:1;pointer-events:none;background:linear-gradient(90deg, rgba(5,7,10,0.96) 0%, rgba(5,7,10,0.64) 40%, rgba(5,7,10,0.18) 100%)",
            )}
          />
          <div
            style={css(
              "position:relative;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:1.5rem;flex-wrap:wrap;margin:0 auto;max-width:75rem;width:100%",
            )}
          >
            <div style={css("display:flex;flex-direction:column;align-items:flex-start;gap:0.4rem")}>
              <img
                alt="WZRD.tech"
                src={WORDMARK}
                style={css("height:2.2rem;width:auto;filter:grayscale(1) brightness(1.6)")}
              />
              <p
                style={css(
                  `font-family:${MONO};font-size:0.68rem;letter-spacing:0.1em;text-transform:uppercase;margin:0`,
                )}
              >
                WZRD.tech / Creator OS
              </p>
            </div>
            <a
              className={styles.closingLink}
              href={STUDIO_URL}
              rel="noopener"
              style={css(
                "display:inline-flex;align-items:center;gap:0.6rem;border-bottom:1px solid #f1ebdd;color:#f1ebdd;font-size:clamp(1.4rem,2vw,2.1rem);letter-spacing:-0.04em;min-height:44px;padding-bottom:0.2rem;transition:color 180ms ease,border-color 180ms ease",
              )}
              target="_top"
            >
              Make the next signal <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
