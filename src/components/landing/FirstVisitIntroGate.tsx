'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import VideoIntroOverlay, { shouldShowVideoIntro } from './VideoIntroOverlay';

/**
 * Client-side gate that shows the first-visit video intro overlay.
 * Decides after mount to avoid SSR/hydration mismatches.
 */
export default function FirstVisitIntroGate() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (shouldShowVideoIntro()) setActive(true);
  }, []);

  return (
    <AnimatePresence>
      {active && (
        <VideoIntroOverlay
          src="/introani.mp4"
          mobileSrc="/introani-mobile.mp4"
          onComplete={() => setActive(false)}
        />
      )}
    </AnimatePresence>
  );
}
