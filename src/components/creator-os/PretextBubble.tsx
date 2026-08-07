"use client";

import { layoutWithLines, prepareWithSegments } from "@chenglou/pretext";
import { useEffect, useRef, useState } from "react";

import styles from "./CreatorOSLanding.module.css";

type PretextBubbleProps = {
  children: string;
  kind?: "agent" | "human" | "signal";
  label?: string;
  status?: "Approved" | "Delivered" | "Sent" | "Working";
};

export function PretextBubble({
  children,
  kind = "agent",
  label,
  status,
}: PretextBubbleProps) {
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<string[]>([children]);
  const accessibleText = label ?? `${status ? `${status}. ` : ""}${children}`;

  useEffect(() => {
    const element = bubbleRef.current;
    if (!element) return;

    let cancelled = false;
    let animationFrame = 0;

    const measure = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        if (cancelled) return;

        try {
          const computed = window.getComputedStyle(element);
          const font = `${computed.fontStyle} ${computed.fontWeight} ${computed.fontSize} ${computed.fontFamily}`;
          const lineHeight = Number.parseFloat(computed.lineHeight) || 20;
          const width = Math.max(1, element.clientWidth - 28);
          const prepared = prepareWithSegments(children, font);
          const nextLines = layoutWithLines(prepared, width, lineHeight).lines.map(
            line => line.text,
          );

          setLines(nextLines.length > 0 ? nextLines : [children]);
        } catch {
          // Canvas measurement can be unavailable in hardened browser contexts.
          // The DOM text is already a complete, readable fallback.
          setLines([children]);
        }
      });
    };

    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    void document.fonts?.ready.then(measure).catch(() => undefined);

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      observer?.disconnect();
    };
  }, [children]);

  return (
    <div
      className={`${styles.messageBubble} ${styles[`messageBubble${kind[0].toUpperCase()}${kind.slice(1)}`]}`}
      ref={bubbleRef}
      role="listitem"
    >
      <span aria-hidden="true" className={styles.pretextLines}>
        {lines.map((line, index) => (
          <span className={styles.pretextLine} key={`${line}-${index}`}>
            {line}
          </span>
        ))}
      </span>
      <span className={styles.screenReaderOnly}>{accessibleText}</span>
      {status ? <span aria-hidden="true" className={styles.messageStatus}>{status}</span> : null}
    </div>
  );
}
