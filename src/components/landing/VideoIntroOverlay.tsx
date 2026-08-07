import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { SkipForward, Volume2, VolumeX } from 'lucide-react';
import { cn } from '@/lib/utils';

export const VIDEO_INTRO_SEEN_KEY = 'wzrd-video-intro-seen';

export function shouldShowVideoIntro(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return localStorage.getItem(VIDEO_INTRO_SEEN_KEY) !== 'true';
  } catch {
    return false;
  }
}

interface VideoIntroOverlayProps {
  src: string;
  /** Portrait-cropped encode served to portrait phone viewports. */
  mobileSrc?: string;
  onComplete: () => void;
}

const CONTROLS_HIDE_DELAY = 2200;
const CONTROLS_HIDE_DELAY_TOUCH = 3500;

function isTouchViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse), (max-width: 767px)').matches;
}

function isPortraitPhoneViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(orientation: portrait) and (max-width: 767px)').matches;
}

export default function VideoIntroOverlay({ src, mobileSrc, onComplete }: VideoIntroOverlayProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isTouch] = useState(() => isTouchViewport());
  const [isMuted, setIsMuted] = useState(true);
  // Touch devices have no hover: start with controls visible so they're discoverable
  const [controlsVisible, setControlsVisible] = useState(() => isTouchViewport());
  const [isEnding, setIsEnding] = useState(false);
  const [isPortraitPhone] = useState(() => isPortraitPhoneViewport());
  const videoSrc = isPortraitPhone && mobileSrc ? mobileSrc : src;

  const finish = useCallback(() => {
    try {
      localStorage.setItem(VIDEO_INTRO_SEEN_KEY, 'true');
    } catch {
      /* storage unavailable */
    }
    onComplete();
  }, [onComplete]);

  const beginFadeOut = useCallback(() => {
    setIsEnding(true);
  }, []);

  // Reveal controls on pointer movement or tap, hide again after a quiet period
  const revealControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(
      () => setControlsVisible(false),
      isTouch ? CONTROLS_HIDE_DELAY_TOUCH : CONTROLS_HIDE_DELAY,
    );
  }, [isTouch]);

  // Arm the initial auto-hide countdown on touch devices
  useEffect(() => {
    if (isTouch) revealControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [isTouch, revealControls]);

  // Autoplay must start muted; surface the video only once it can play
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {
      // Autoplay blocked even when muted — don't hold the page hostage
      finish();
    });
  }, [finish]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
    revealControls();
  }, [revealControls]);

  return (
    <motion.div
      className="fixed inset-0 z-[99999] bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: isEnding ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: isEnding ? 1.1 : 0.9, ease: 'easeInOut' }}
      onAnimationComplete={() => {
        if (isEnding) finish();
      }}
      onMouseMove={revealControls}
      onTouchStart={revealControls}
      data-testid="video-intro-overlay"
    >
      <video
        ref={videoRef}
        src={videoSrc}
        muted={isMuted}
        autoPlay
        playsInline
        preload="auto"
        onEnded={beginFadeOut}
        onError={finish}
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* ── Liquid glass treatment ── */}
      {/* Specular sweep */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.06) 42%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.06) 58%, transparent 70%)',
          backgroundSize: '250% 250%',
        }}
        animate={{ backgroundPosition: ['120% 0%', '-40% 100%'] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'linear' }}
      />
      {/* Curved glass edge highlights + vignette */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(255,255,255,0.06), inset 0 0 140px rgba(0,0,0,0.55)',
        }}
      />
      {/* Frosted glass rim */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white/[0.07] to-transparent backdrop-blur-[2px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent backdrop-blur-[2px] [mask-image:linear-gradient(to_top,black,transparent)]" />

      {/* ── Hover/tap-revealed controls (top right, inside safe area) ── */}
      <div
        style={{
          top: 'max(1.25rem, env(safe-area-inset-top))',
          right: 'max(1.25rem, env(safe-area-inset-right))',
        }}
        className={cn(
          'absolute z-10 flex items-center gap-2 transition-all duration-500',
          controlsVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
        )}
      >
        <button
          type="button"
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute intro' : 'Mute intro'}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-colors hover:bg-white/20"
        >
          {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={beginFadeOut}
          aria-label="Skip intro"
          className="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 text-sm font-medium text-white/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_8px_32px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-colors hover:bg-white/20"
        >
          Skip
          <SkipForward className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
