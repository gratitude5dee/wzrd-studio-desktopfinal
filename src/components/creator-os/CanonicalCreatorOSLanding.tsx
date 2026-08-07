"use client";

import { useEffect, useRef } from "react";

import styles from "./CanonicalCreatorOSLanding.module.css";

const CANONICAL_DESIGN_URL = "/creator-os/wzrd-creator-os-newdesign.html";

const destinations = {
  "enter studio": "https://studio.wzrd.tech/login",
  zap: "https://zap.wzrd.tech",
} as const;

function normalizeLabel(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim().toLowerCase() ?? "";
}

/**
 * The supplied artifact is self-contained and replaces its own document while
 * booting. Keep its DOM, assets, shaders, and typography intact, while routing
 * the two explicitly requested menu destinations to their live products.
 */
function connectProductDestinations(document: Document) {
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>("a")) {
    const label = normalizeLabel(anchor.getAttribute("aria-label") || anchor.textContent);
    const destination = destinations[label as keyof typeof destinations];
    if (!destination) continue;

    anchor.href = destination;
    anchor.target = "_top";
    anchor.dataset.wzrdDestination = label;
  }
}

export default function CanonicalCreatorOSLanding() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let observer: MutationObserver | null = null;
    let observedDocument: Document | null = null;

    const connect = () => {
      const document = iframe.contentDocument;
      if (!document) return;

      connectProductDestinations(document);

      if (observedDocument === document) return;
      observer?.disconnect();
      observer = new MutationObserver(() => connectProductDestinations(document));
      observer.observe(document, { childList: true, subtree: true });
      observedDocument = document;
    };

    const onLoad = () => connect();
    const poll = window.setInterval(connect, 120);
    iframe.addEventListener("load", onLoad);
    connect();

    return () => {
      iframe.removeEventListener("load", onLoad);
      window.clearInterval(poll);
      observer?.disconnect();
    };
  }, []);

  return (
    <main aria-label="WZRD Creator OS" className={styles.landing}>
      <iframe
        className={styles.frame}
        ref={iframeRef}
        src={CANONICAL_DESIGN_URL}
        title="WZRD Creator OS"
      />
    </main>
  );
}
