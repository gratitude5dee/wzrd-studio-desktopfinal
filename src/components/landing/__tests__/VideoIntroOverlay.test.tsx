import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VideoIntroOverlay, { shouldShowVideoIntro, VIDEO_INTRO_SEEN_KEY } from '../VideoIntroOverlay';

// Render motion elements as plain DOM in jsdom (avoids framer-motion CSS/media-query issues)
vi.mock('framer-motion', async () => {
  const react = await import('react');
  const motionProxy = new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        ({ initial, animate, exit, transition, onAnimationComplete, ...props }: Record<string, unknown>) =>
          react.createElement(tag, props as object),
    },
  );
  return { motion: motionProxy, AnimatePresence: ({ children }: { children: React.ReactNode }) => children };
});

const matchMediaMock = (matches: boolean) =>
  vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  });

describe('shouldShowVideoIntro', () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = matchMediaMock(false) as unknown as typeof window.matchMedia;
  });

  it('returns true for first-time visitors', () => {
    expect(shouldShowVideoIntro()).toBe(true);
  });

  it('returns false once the intro has been seen', () => {
    localStorage.setItem(VIDEO_INTRO_SEEN_KEY, 'true');
    expect(shouldShowVideoIntro()).toBe(false);
  });

  it('returns false when reduced motion is preferred', () => {
    window.matchMedia = matchMediaMock(true) as unknown as typeof window.matchMedia;
    expect(shouldShowVideoIntro()).toBe(false);
  });
});

describe('VideoIntroOverlay', () => {
  beforeEach(() => {
    localStorage.clear();
    window.matchMedia = matchMediaMock(false) as unknown as typeof window.matchMedia;
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  });

  it('renders the video with hover-revealed mute and skip controls', () => {
    render(<VideoIntroOverlay src="/introani.mp4" onComplete={vi.fn()} />);
    const overlay = screen.getByTestId('video-intro-overlay');
    expect(overlay.querySelector('video')).not.toBeNull();

    fireEvent.mouseMove(overlay);
    expect(screen.getByRole('button', { name: 'Unmute intro' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip intro' })).toBeInTheDocument();
  });

  it('toggles mute state', () => {
    render(<VideoIntroOverlay src="/introani.mp4" onComplete={vi.fn()} />);
    fireEvent.mouseMove(screen.getByTestId('video-intro-overlay'));
    fireEvent.click(screen.getByRole('button', { name: 'Unmute intro' }));
    expect(screen.getByRole('button', { name: 'Mute intro' })).toBeInTheDocument();
  });

  it('shows controls immediately on touch viewports and uses the mobile source', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('pointer: coarse') || query.includes('orientation: portrait'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    render(<VideoIntroOverlay src="/introani.mp4" mobileSrc="/introani-mobile.mp4" onComplete={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Skip intro' })).toBeInTheDocument();
    const video = screen.getByTestId('video-intro-overlay').querySelector('video')!;
    expect(video.getAttribute('src')).toBe('/introani-mobile.mp4');
  });

  it('marks the intro as seen when the video errors', () => {
    const onComplete = vi.fn();
    render(<VideoIntroOverlay src="/introani.mp4" onComplete={onComplete} />);
    const video = screen.getByTestId('video-intro-overlay').querySelector('video')!;
    fireEvent.error(video);
    expect(onComplete).toHaveBeenCalled();
    expect(localStorage.getItem(VIDEO_INTRO_SEEN_KEY)).toBe('true');
  });
});
