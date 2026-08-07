"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import styles from "./CreatorOSLanding.module.css";

const finePointerQuery = "(hover: hover) and (pointer: fine)";

export type CreatorProfileAccent = "air" | "earth" | "studio" | "zap";

type CreatorProfileCardProps = {
  accent: CreatorProfileAccent;
  channel: string;
  description: string;
  emblem: string;
  motionEnabled: boolean;
  role: string;
  state: string;
};

function accentClass(accent: CreatorProfileAccent) {
  return styles[`creatorProfileCard${accent[0].toUpperCase()}${accent.slice(1)}`];
}

export function CreatorProfileCard({
  accent,
  channel,
  description,
  emblem,
  motionEnabled,
  role,
  state,
}: CreatorProfileCardProps) {
  const cardRef = useRef<HTMLElement>(null);
  const frameRef = useRef<number | null>(null);
  const pointerRef = useRef({ x: 50, y: 50 });
  const [hasFinePointer, setHasFinePointer] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const descriptionId = useId();
  const headingId = useId();
  const canTilt = motionEnabled && hasFinePointer;

  useEffect(() => {
    const pointerMedia = window.matchMedia(finePointerQuery);
    const updatePointerCapability = () => setHasFinePointer(pointerMedia.matches);

    updatePointerCapability();
    pointerMedia.addEventListener("change", updatePointerCapability);

    return () => pointerMedia.removeEventListener("change", updatePointerCapability);
  }, []);

  useEffect(() => {
    if (canTilt) return;

    setIsHovering(false);
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const card = cardRef.current;
    card?.style.setProperty("--pointer-x", "50%");
    card?.style.setProperty("--pointer-y", "50%");
    card?.style.setProperty("--rotate-x", "0deg");
    card?.style.setProperty("--rotate-y", "0deg");
  }, [canTilt]);

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const updatePointer = (event: ReactPointerEvent<HTMLElement>) => {
    const card = cardRef.current;
    if (!card) return;

    const bounds = card.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100));
    const y = Math.min(100, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100));
    pointerRef.current = { x, y };

    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const nextCard = cardRef.current;
      if (!nextCard) return;

      const point = pointerRef.current;
      const rotateX = ((50 - point.y) / 50) * 5.5;
      const rotateY = ((point.x - 50) / 50) * 5.5;
      nextCard.style.setProperty("--pointer-x", `${point.x}%`);
      nextCard.style.setProperty("--pointer-y", `${point.y}%`);
      nextCard.style.setProperty("--rotate-x", `${rotateX.toFixed(2)}deg`);
      nextCard.style.setProperty("--rotate-y", `${rotateY.toFixed(2)}deg`);
    });
  };

  const resetPointer = () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const card = cardRef.current;
    card?.style.setProperty("--pointer-x", "50%");
    card?.style.setProperty("--pointer-y", "50%");
    card?.style.setProperty("--rotate-x", "0deg");
    card?.style.setProperty("--rotate-y", "0deg");
  };

  const handlePointerEnter = (event: ReactPointerEvent<HTMLElement>) => {
    if (!canTilt || event.pointerType !== "mouse") return;
    setIsHovering(true);
    updatePointer(event);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!canTilt || event.pointerType !== "mouse") return;
    updatePointer(event);
  };

  const handlePointerLeave = () => {
    if (!canTilt) return;
    setIsHovering(false);
    resetPointer();
  };

  return (
    <article
      aria-describedby={descriptionId}
      aria-labelledby={headingId}
      className={`${styles.creatorProfileCard} ${accentClass(accent)}`}
      data-creator-profile-card
      data-motion={canTilt ? "active" : "static"}
      data-react-bits-effect="profile-card bounce-cards"
      data-hovered={isHovering}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerMove={handlePointerMove}
      ref={cardRef}
    >
      <div aria-hidden="true" className={styles.creatorProfileAtmosphere}>
        <span className={styles.creatorProfileGlow} />
        <span className={styles.creatorProfileSheen} />
        <span className={styles.creatorProfileEmblem}>{emblem}</span>
        <span className={styles.creatorProfileScan} />
      </div>
      <div className={styles.creatorProfileContent}>
        <p className={styles.creatorProfileIndex}>Creator role / {channel}</p>
        <div className={styles.creatorProfileCopy}>
          <h3 id={headingId}>{role}</h3>
          <p id={descriptionId}>{description}</p>
        </div>
        <p className={styles.creatorProfileMeta}>
          <span>{channel}</span>
          <span aria-hidden="true">/</span>
          <span>{state}</span>
        </p>
      </div>
    </article>
  );
}
