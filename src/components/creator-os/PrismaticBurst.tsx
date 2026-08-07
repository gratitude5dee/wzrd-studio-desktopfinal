"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./CreatorOSLanding.module.css";

type PrismaticBurstProps = {
  colors?: readonly string[];
  intensity?: number;
  motionEnabled: boolean;
  rayCount?: number;
  speed?: number;
};

const defaultColors = ["#6dc8d7", "#f1ebdd", "#f0a145", "#f06a47"] as const;

export function PrismaticBurst({
  colors = defaultColors,
  intensity = 0.72,
  motionEnabled,
  rayCount = 18,
  speed = 0.09,
}: PrismaticBurstProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [canRender, setCanRender] = useState(false);

  useEffect(() => {
    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateRenderState = () => setCanRender(motionEnabled && !motionMedia.matches);

    updateRenderState();
    motionMedia.addEventListener("change", updateRenderState);

    return () => motionMedia.removeEventListener("change", updateRenderState);
  }, [motionEnabled]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root || !canRender) return;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    let animationFrame: number | null = null;
    let isVisible = false;
    let width = 0;
    let height = 0;
    let pixelRatio = 1;

    const resize = () => {
      const bounds = root.getBoundingClientRect();
      width = Math.max(1, Math.round(bounds.width));
      height = Math.max(1, Math.round(bounds.height));
      pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    };

    const draw = (timestamp: number) => {
      if (!isVisible) {
        animationFrame = null;
        return;
      }

      const time = timestamp * 0.001 * speed;
      const centerX = width * (0.68 + Math.sin(time * 0.7) * 0.025);
      const centerY = height * (0.42 + Math.cos(time * 0.55) * 0.03);
      const radius = Math.hypot(width, height) * 1.25;

      context.clearRect(0, 0, width, height);
      context.save();
      context.globalCompositeOperation = "screen";

      for (let index = 0; index < rayCount; index += 1) {
        const progress = index / rayCount;
        const angle = progress * Math.PI * 2 + time * (0.42 + progress * 0.16);
        const spread = 0.035 + (Math.sin(time * 1.6 + index) + 1) * 0.012;
        const color = colors[index % colors.length];
        const x1 = centerX + Math.cos(angle - spread) * radius;
        const y1 = centerY + Math.sin(angle - spread) * radius;
        const x2 = centerX + Math.cos(angle + spread) * radius;
        const y2 = centerY + Math.sin(angle + spread) * radius;
        const gradient = context.createLinearGradient(centerX, centerY, (x1 + x2) / 2, (y1 + y2) / 2);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.28, "rgba(255,255,255,0.22)");
        gradient.addColorStop(1, "rgba(255,255,255,0)");

        context.globalAlpha = intensity * (0.28 + (index % 3) * 0.12);
        context.fillStyle = gradient;
        context.beginPath();
        context.moveTo(centerX, centerY);
        context.lineTo(x1, y1);
        context.lineTo(x2, y2);
        context.closePath();
        context.fill();
      }

      const core = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, Math.min(width, height) * 0.33);
      core.addColorStop(0, "rgba(241,235,221,0.82)");
      core.addColorStop(0.16, "rgba(109,200,215,0.32)");
      core.addColorStop(1, "rgba(109,200,215,0)");
      context.globalAlpha = intensity;
      context.fillStyle = core;
      context.fillRect(0, 0, width, height);
      context.restore();

      animationFrame = window.requestAnimationFrame(draw);
    };

    const startIfVisible = () => {
      if (isVisible && animationFrame === null) animationFrame = window.requestAnimationFrame(draw);
    };

    const observer = new IntersectionObserver(
      entries => {
        isVisible = entries.some(entry => entry.isIntersecting);
        startIfVisible();
      },
      { rootMargin: "140px" },
    );
    const resizeObserver = new ResizeObserver(resize);

    resize();
    observer.observe(root);
    resizeObserver.observe(root);

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, [canRender, colors, intensity, rayCount, speed]);

  return (
    <div
      aria-hidden="true"
      className={styles.prismaticBurst}
      data-gpu-scene={canRender ? "prismatic-burst" : undefined}
      data-motion={canRender ? "active" : "static"}
      data-prismatic-burst
      data-react-bits-effect="prismatic-burst"
      ref={rootRef}
    >
      <div className={styles.prismaticBurstFallback} />
      {canRender ? <canvas className={styles.prismaticBurstCanvas} ref={canvasRef} /> : null}
    </div>
  );
}
