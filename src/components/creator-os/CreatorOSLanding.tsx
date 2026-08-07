"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import dynamic from "next/dynamic";
import { Component, useCallback, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";

import { CreatorProfileCard } from "./CreatorProfileCard";
import { PretextBubble } from "./PretextBubble";
import { PrismaticBurst } from "./PrismaticBurst";
import styles from "./CreatorOSLanding.module.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const CloudAtmosphere = dynamic(() => import("./CloudAtmosphere"), {
  ssr: false,
});

type CloudFallbackBoundaryProps = {
  children: ReactNode;
  onFailure: () => void;
};

type CloudFallbackBoundaryState = {
  failed: boolean;
};

class CloudFallbackBoundary extends Component<CloudFallbackBoundaryProps, CloudFallbackBoundaryState> {
  state: CloudFallbackBoundaryState = { failed: false };

  static getDerivedStateFromError(): CloudFallbackBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    this.props.onFailure();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const chapterLinks = [
  ["Air", "#air"],
  ["Studio", "#studio"],
  ["Earth", "#earth"],
  ["Zap", "#zap"],
] as const;

const runtimeStages = [
  {
    artifacts: ["voice-note.m4a", "reference-01.jpg"],
    copy: "A voice note, text, or reference becomes a portable intent packet.",
    index: "01",
    state: "input",
    title: "Intent packet",
  },
  {
    artifacts: ["story-beat.md", "shot-list.json", "sound-palette.wav"],
    copy: "Writing, shots, and sound can move in parallel while the brief stays attached.",
    index: "02",
    state: "parallel jobs",
    title: "Agents split the work",
  },
  {
    artifacts: ["cut-sheet.pdf", "edit-timeline.json"],
    copy: "The runtime keeps the decisions beside the media, not buried in a handoff.",
    index: "03",
    state: "artifacts",
    title: "Shared working state",
  },
  {
    artifacts: ["release-packet.zip"],
    copy: "A finished signal leaves with provenance, context, and its next invitation.",
    index: "04",
    state: "resolved output",
    title: "Release packet",
  },
] as const;

const constellationRoles = [
  {
    accent: "air",
    channel: "AIR",
    description: "Holds a fragment long enough to become a direction.",
    emblem: "01",
    role: "Signal Keeper",
    state: "Listening",
  },
  {
    accent: "studio",
    channel: "STUDIO",
    description: "Finds rhythm between rush and restraint.",
    emblem: "02",
    role: "Cut Director",
    state: "Composing",
  },
  {
    accent: "earth",
    channel: "EARTH",
    description: "Gives the release a room to live in.",
    emblem: "03",
    role: "Worldbuilder",
    state: "Gathering",
  },
  {
    accent: "zap",
    channel: "ZAP",
    description: "Keeps every decision attached to the work.",
    emblem: "04",
    role: "Runtime Steward",
    state: "Routing",
  },
] as const;

const footerBurstColors = ["#6dc8d7", "#f1ebdd", "#f0a145", "#f06a47"] as const;

export default function CreatorOSLanding() {
  const rootRef = useRef<HTMLDivElement>(null);
  const cloudProgressRef = useRef(0);
  const invalidateCloudRef = useRef<(() => void) | null>(null);
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [webglFaulted, setWebglFaulted] = useState(false);
  const [webglReady, setWebglReady] = useState(false);

  const motionAllowed = motionEnabled && !systemReducedMotion;
  const webglEnabled = webglReady && isDesktop && motionAllowed && !webglFaulted;

  const handleCloudReady = useCallback((invalidate: (() => void) | null) => {
    invalidateCloudRef.current = invalidate;
    invalidate?.();
  }, []);

  const handleCloudFailure = useCallback(() => {
    setWebglFaulted(true);
  }, []);

  useEffect(() => {
    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const desktopMedia = window.matchMedia("(min-width: 860px)");
    const updatePreference = () => setSystemReducedMotion(motionMedia.matches);
    const updateViewport = () => setIsDesktop(desktopMedia.matches);
    updatePreference();
    updateViewport();
    motionMedia.addEventListener("change", updatePreference);
    desktopMedia.addEventListener("change", updateViewport);

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl2") || canvas.getContext("webgl");
    setWebglReady(Boolean(context));

    // The probe is only used to decide whether to mount the optional canvas.
    // Release its context immediately so it never competes with the live scene.
    context?.getExtension("WEBGL_lose_context")?.loseContext();

    return () => {
      motionMedia.removeEventListener("change", updatePreference);
      desktopMedia.removeEventListener("change", updateViewport);
    };
  }, []);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return;

      const hero = root.querySelector<HTMLElement>("[data-hero]");
      const wordmark = root.querySelector<HTMLElement>("[data-wordmark]");
      const wordmarkVeil = root.querySelector<HTMLElement>("[data-wordmark-veil]");
      const creatorOS = root.querySelector<HTMLElement>("[data-creator-os]");
      const heroStatement = root.querySelector<HTMLElement>("[data-hero-statement]");
      const heroHud = root.querySelector<HTMLElement>("[data-hero-hud]");
      const systemMap = root.querySelector<HTMLElement>("[data-system-map]");
      const airMapItem = root.querySelector<HTMLElement>("[data-system-map-air]");
      const heroAirHandoff = root.querySelector<HTMLElement>("[data-hero-air-handoff]");
      const reveals = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));

      if (!motionAllowed) {
        cloudProgressRef.current = 0;
        invalidateCloudRef.current?.();
        gsap.set([
          wordmark,
          wordmarkVeil,
          creatorOS,
          heroStatement,
          heroHud,
          systemMap,
          airMapItem,
          heroAirHandoff,
        ].filter(Boolean), {
          clearProps: "all",
        });
        gsap.set(reveals, { clearProps: "all" });
        return;
      }

      const media = gsap.matchMedia();

      media.add("(min-width: 860px)", () => {
        if (
          !hero ||
          !wordmark ||
          !wordmarkVeil ||
          !creatorOS ||
          !heroStatement ||
          !heroHud ||
          !systemMap ||
          !heroAirHandoff
        ) return;

        gsap.set(wordmark, {
          autoAlpha: 0,
          clipPath: "inset(0 26% 0 26%)",
          filter: "blur(12px)",
          scale: 0.92,
          yPercent: 6,
        });
        gsap.set(wordmarkVeil, { autoAlpha: 0.96 });
        gsap.set(creatorOS, { autoAlpha: 0, yPercent: 20 });
        gsap.set(heroStatement, { autoAlpha: 0, y: 28 });
        gsap.set(heroHud, { autoAlpha: 0, y: 12 });
        gsap.set(systemMap, { autoAlpha: 0, y: 20 });
        gsap.set(heroAirHandoff, { autoAlpha: 0, y: 14 });

        const transition = gsap.timeline({
          defaults: { ease: "none" },
          scrollTrigger: {
            anticipatePin: 1,
            end: () => `+=${Math.round(window.innerHeight * 3.5)}`,
            invalidateOnRefresh: true,
            onUpdate: self => {
              cloudProgressRef.current = self.progress;
              invalidateCloudRef.current?.();
            },
            pin: true,
            scrub: 0.75,
            start: "top top",
            trigger: hero,
          },
        });

        transition
          .to(wordmark, {
            autoAlpha: 1,
            clipPath: "inset(0 0% 0 0%)",
            duration: 0.12,
            filter: "blur(0px)",
            scale: 1,
            yPercent: 0,
          }, 0.12)
          .to(wordmarkVeil, { autoAlpha: 0, duration: 0.12 }, 0.12)
          .to(creatorOS, { autoAlpha: 1, duration: 0.16, yPercent: 0 }, 0.34)
          .to(heroStatement, { autoAlpha: 1, duration: 0.14, y: 0 }, 0.4)
          .to(wordmark, { autoAlpha: 0.38, duration: 0.18, scale: 0.78, yPercent: -24 }, 0.56)
          .to(systemMap, { autoAlpha: 1, duration: 0.17, y: 0 }, 0.56)
          .to(heroHud, { autoAlpha: 1, duration: 0.12, y: 0 }, 0.58)
          .to(airMapItem, { color: "#8cc8ff", duration: 0.1, scale: 1.05 }, 0.78)
          .to(heroAirHandoff, { autoAlpha: 1, duration: 0.15, y: 0 }, 0.78);
      });

      media.add("(max-width: 859px)", () => {
        cloudProgressRef.current = 0.12;
        invalidateCloudRef.current?.();
        gsap.set([wordmark, creatorOS, heroStatement, heroHud].filter(Boolean), {
          clearProps: "all",
        });
      });

      reveals.forEach((element, index) => {
        gsap.fromTo(
          element,
          { autoAlpha: 0, y: index % 2 === 0 ? 34 : 24 },
          {
            autoAlpha: 1,
            duration: 0.8,
            ease: "power3.out",
            scrollTrigger: {
              start: "top 82%",
              toggleActions: "play none none reverse",
              trigger: element,
            },
            y: 0,
          },
        );
      });

      return () => media.revert();
    },
    { dependencies: [motionAllowed], revertOnUpdate: true, scope: rootRef },
  );

  return (
    <div
      className={`${styles.creatorOS} ${motionAllowed ? "" : styles.motionOff}`}
      ref={rootRef}
    >
      <a className={styles.skipLink} href="#creator-os-main">
        Skip to the Creator OS
      </a>

      <header className={styles.siteHeader}>
        <a aria-label="WZRD.tech home" className={styles.brandMark} href="#top">
          <span>WZRD</span>
          <i>.tech</i>
        </a>
        <nav aria-label="Creator OS chapters" className={styles.chapterNav}>
          {chapterLinks.map(([label, href]) => (
            <a href={href} key={label}>
              {label}
            </a>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <button
            aria-label={systemReducedMotion ? "Motion reduced by your device setting" : undefined}
            aria-pressed={motionAllowed}
            className={styles.motionButton}
            disabled={systemReducedMotion}
            onClick={() => setMotionEnabled(current => !current)}
            type="button"
          >
            Motion {systemReducedMotion ? "reduced" : motionEnabled ? "on" : "off"}
          </button>
          <a className={styles.headerCta} href="/home">
            Enter Studio <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <main id="creator-os-main">
        <section
          aria-labelledby="hero-title"
          className={styles.hero}
          data-hero
          id="top"
        >
          <div aria-hidden="true" className={styles.cloudFallback} />
          <div
            aria-hidden="true"
            className={styles.heroLightRays}
            data-motion={motionAllowed ? "active" : "static"}
            data-motion-layer="light-rays"
            data-react-bits-effect="light-rays"
          />
          {webglEnabled ? (
            <div aria-hidden="true" className={styles.cloudCanvas}>
              <CloudFallbackBoundary onFailure={handleCloudFailure}>
                <CloudAtmosphere
                  onWebglFailure={handleCloudFailure}
                  onInvalidateReady={handleCloudReady}
                  progressRef={cloudProgressRef}
                />
              </CloudFallbackBoundary>
            </div>
          ) : null}
          <div aria-hidden="true" className={styles.heroGrain} />
          <div aria-hidden="true" className={styles.heroFrame}>
            <span>LAT 34.0224° N</span>
            <span>WZRD / 001</span>
            <span>ALT +∞</span>
          </div>

          <div className={styles.heroContent}>
            <h1 className={styles.screenReaderOnly} id="hero-title">WZRD.tech</h1>
            <p className={styles.heroKicker}>A creator operating system</p>
            <div className={styles.heroWordmarkStage} data-wordmark>
              <picture>
                <img
                  alt=""
                  className={styles.heroWordmark}
                  decoding="async"
                  fetchPriority="high"
                  height="396"
                  src="/creator-os/wzrd-wordmark-1600.png"
                  width="1600"
                />
              </picture>
              <span aria-hidden="true" className={styles.wordmarkCloudVeil} data-wordmark-veil />
            </div>
            <p className={styles.creatorTitle} data-creator-os>
              <span>Creator</span>
              <strong>OS</strong>
            </p>
            <p className={styles.heroStatement} data-hero-statement>
              A living system for the people who turn passing signals into culture.
            </p>
            <ul aria-label="Creator OS system map" className={styles.heroSystemMap} data-system-map>
              <li data-system-map-air>Air</li>
              <li>Studio</li>
              <li>Earth</li>
              <li>Zap</li>
            </ul>
            <div className={styles.heroAirHandoff} data-hero-air-handoff>
              <span>Next / Air</span>
              <p>“Four shots. Night city. No rush.”</p>
            </div>
            <a className={styles.heroCta} href="#air">
              Begin at the source <span aria-hidden="true">↓</span>
            </a>
          </div>

          <div className={styles.heroHud} data-hero-hud>
            <span>Scroll to enter</span>
            <span className={styles.hudLine} />
            <span>01 / 05</span>
          </div>
        </section>

        <section aria-labelledby="air-title" className={`${styles.chapter} ${styles.air}`} id="air">
          <div
            aria-hidden="true"
            className={styles.airDitherField}
            data-motion={motionAllowed ? "active" : "static"}
            data-motion-layer="dither"
            data-react-bits-effect="dither"
          />
          <div className={styles.chapterMeta} data-reveal>
            <span>01 / Air</span>
            <span>Intent, received</span>
          </div>
          <div className={styles.airLayout}>
            <header className={styles.chapterIntro} data-reveal>
              <p className={styles.eyebrow}>An agent where your idea already lives</p>
              <h2 id="air-title">Air catches the thought before it becomes a task.</h2>
              <p>
                A messages-native creative agent that hears the cue, asks the one
                question that matters, and turns the answer into momentum.
              </p>
              <a className={styles.textLink} href="/home">
                Meet Air in Studio <span aria-hidden="true">↗</span>
              </a>
            </header>
            <article aria-label="A sample Air conversation" className={styles.messageThread} data-reveal>
              <div className={styles.threadHeader}>
                <span aria-hidden="true" className={styles.agentAvatar}>W</span>
                <div>
                  <strong>Air</strong>
                  <small>creative agent</small>
                </div>
                <span className={styles.threadStatus}>available</span>
              </div>
              <p className={styles.proofDisclosure}>Prototype transcript · fictional, consent-safe</p>
              <div className={styles.threadMessages} role="list">
                <PretextBubble kind="human" status="Sent">
                  Four shots. Night city. No rush.
                </PretextBubble>
                <PretextBubble status="Working">
                  I hear a quiet opener, a bright interruption, then room for the last beat.
                </PretextBubble>
                <PretextBubble kind="human" status="Approved">
                  Keep the last beat quiet.
                </PretextBubble>
                <PretextBubble kind="signal" status="Delivered">
                  Locked. I’ll carry the silence into the cut sheet.
                </PretextBubble>
              </div>
              <div className={styles.threadComposer}>
                <span>Send a thought</span>
                <b aria-hidden="true">↑</b>
              </div>
            </article>
          </div>
        </section>

        <section aria-labelledby="studio-title" className={`${styles.chapter} ${styles.studio}`} id="studio">
          <div
            aria-hidden="true"
            className={styles.studioMotionField}
            data-motion={motionAllowed ? "active" : "static"}
            data-motion-layer="studio-grid"
            data-react-bits-effect="liquid-chrome grid-motion grid-distortion"
          >
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className={styles.chapterMeta} data-reveal>
            <span>02 / Studio</span>
            <span>A pocket-sized set</span>
          </div>
          <div className={styles.studioLayout}>
            <header className={styles.chapterIntro} data-reveal>
              <p className={styles.eyebrow}>Generative media, in your pocket</p>
              <h2 id="studio-title">Make the cut without leaving the conversation.</h2>
              <p>
                Studio is a mobile creative room. Collect references, direct the
                agents, shape a sequence, and take the work to the next room when it is ready.
              </p>
            </header>
            <figure className={styles.deviceFigure} data-reveal>
              <div aria-hidden="true" className={styles.deviceHalo} />
              <img
                alt="Studio interface study shown across a phone and desktop workspace"
                height="373"
                loading="lazy"
                src="/creator-os/devices.png"
                width="669"
              />
              <figcaption>
                <span>Studio / interface study</span>
                <span>Prototype asset · input → direction → output</span>
              </figcaption>
            </figure>
            <ol className={styles.studioSteps} data-reveal>
              <li>
                <span>01</span>
                <p><strong>Gather</strong> Voice notes, images, fragments, and references.</p>
              </li>
              <li>
                <span>02</span>
                <p><strong>Direct</strong> Give the work an angle, a tempo, a reason to exist.</p>
              </li>
              <li>
                <span>03</span>
                <p><strong>Release</strong> Move the finished signal into the culture around it.</p>
              </li>
            </ol>
          </div>
        </section>

        <section aria-labelledby="earth-title" className={`${styles.chapter} ${styles.earth}`} id="earth">
          <div className={styles.chapterMeta} data-reveal>
            <span>03 / Earth</span>
            <span>Digital → physical</span>
          </div>
          <div className={styles.earthLayout}>
            <div className={styles.earthNarrative}>
              <header className={styles.chapterIntro} data-reveal>
                <p className={styles.eyebrow}>Generative culture has a place to land</p>
                <h2 id="earth-title">Earth gives a work a world beyond the feed.</h2>
                <p>
                  A cultural layer for releases that travel from a shared file to a
                  room, a screen, a crowd, and the next person who wants to make something.
                </p>
              </header>
              <aside className={styles.earthNote} data-reveal>
                <span>Field concept / 03</span>
                <p>
                  Digital work is not the opposite of physical culture. It is the invitation.
                </p>
                <a className={styles.textLink} href="#coming-soon">
                  Follow the horizon <span aria-hidden="true">↓</span>
                </a>
              </aside>
            </div>
            <section aria-labelledby="constellation-title" className={styles.constellation} data-reveal>
              <div
                aria-hidden="true"
                className={styles.earthOrbitBackdrop}
                data-motion={motionAllowed ? "active" : "static"}
                data-motion-layer="culture-orbit"
                data-react-bits-effect="prism infinite-menu"
              >
                <span />
                <span />
                <span />
                <i />
              </div>
              <div className={styles.constellationHeading}>
                <p className={styles.eyebrow}>The making constellation</p>
                <h3 id="constellation-title">No release moves alone.</h3>
                <p className={styles.proofDisclosure}>Conceptual roles — not member profiles.</p>
              </div>
              <div className={styles.constellationGrid}>
                {constellationRoles.map(role => (
                  <CreatorProfileCard key={role.role} motionEnabled={motionAllowed} {...role} />
                ))}
              </div>
            </section>
          </div>
        </section>

        <section aria-labelledby="zap-title" className={`${styles.chapter} ${styles.zap}`} id="zap">
          <div
            aria-hidden="true"
            className={styles.zapTerminalField}
            data-motion={motionAllowed ? "active" : "static"}
            data-motion-layer="runtime-terminal"
            data-react-bits-effect="faulty-terminal dither prism card-swap"
          >
            <span />
            <span />
            <span />
          </div>
          <div className={styles.chapterMeta} data-reveal>
            <span>04 / Zap</span>
            <span>Agent Media Runtime</span>
          </div>
          <div className={styles.zapLayout}>
            <header className={styles.chapterIntro} data-reveal>
              <p className={styles.eyebrow}>A framework for work that moves</p>
              <h2 id="zap-title">Zap is the runtime behind the creative current.</h2>
              <p>
                An Agent Media Runtime keeps intent attached as ideas cross tools,
                agents, formats, and collaborators. Less handoff theater. More signal.
              </p>
              <p className={styles.proofDisclosure}>
                Concept map · illustrative states pending engineering approval
              </p>
            </header>
            <ol aria-label="Illustrative Agent Media Runtime path" className={styles.runtimeMap} data-reveal>
              {runtimeStages.map(stage => (
                <li key={stage.index}>
                  <span>{stage.index}</span>
                  <div>
                    <p className={styles.runtimeState}>{stage.state}</p>
                    <h3>{stage.title}</h3>
                    <p>{stage.copy}</p>
                    <ul className={styles.runtimeArtifacts}>
                      {stage.artifacts.map(artifact => <li key={artifact}>{artifact}</li>)}
                    </ul>
                  </div>
                  <i aria-hidden="true" />
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="horizon-title" className={`${styles.chapter} ${styles.horizon}`} id="coming-soon">
          <div className={styles.chapterMeta} data-reveal>
            <span>05 / Horizon</span>
            <span>Coming soon</span>
          </div>
          <div className={styles.horizonHeading} data-reveal>
            <p className={styles.eyebrow}>The elements still gathering</p>
            <h2 id="horizon-title">Water and Fire.</h2>
            <p>Two future layers for creators, culture, and the value that follows a release.</p>
          </div>
          <div className={styles.horizonPair} data-reveal>
            <article className={styles.waterPanel}>
              <div
                aria-hidden="true"
                className={styles.waterChrome}
                data-motion={motionAllowed ? "active" : "static"}
                data-motion-layer="liquid-chrome"
                data-react-bits-effect="liquid-chrome"
              />
              <span className={styles.horizonNumber}>W</span>
              <p className={styles.panelKicker}>Water / coming soon</p>
              <h3>Creator Bank</h3>
              <p>Tools for the resources and relationships that let creative work keep moving.</p>
            </article>
            <article className={styles.firePanel}>
              <div
                aria-hidden="true"
                className={styles.firePixelField}
                data-motion={motionAllowed ? "active" : "static"}
                data-motion-layer="pixel-card"
                data-react-bits-effect="pixel-card"
              />
              <span className={styles.horizonNumber}>F</span>
              <p className={styles.panelKicker}>Fire / coming soon</p>
              <h3>Entertainment prediction markets</h3>
              <p>A future lens on cultural attention, momentum, and the stories people are choosing.</p>
            </article>
          </div>
        </section>

        <section
          aria-label="Enter WZRD Studio"
          className={styles.closing}
          data-prismatic-motion={motionAllowed && isDesktop ? "active" : "static"}
        >
          <PrismaticBurst
            colors={footerBurstColors}
            intensity={0.72}
            motionEnabled={motionAllowed && isDesktop}
            rayCount={18}
            speed={0.09}
          />
          <div className={styles.closingContent}>
            <p>WZRD.tech / Creator OS</p>
            <a href="/home">Make the next signal <span aria-hidden="true">↗</span></a>
          </div>
        </section>
      </main>

      <footer className={styles.siteFooter}>
        <span>© {new Date().getFullYear()} WZRD.tech</span>
        <span>Built for the work between the idea and the world.</span>
      </footer>
    </div>
  );
}
