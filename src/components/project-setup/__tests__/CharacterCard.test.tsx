import { act, render, screen } from '@testing-library/react';
import type { HTMLAttributes, ImgHTMLAttributes, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CharacterCard from '../CharacterCard';
import type { Character } from '../types';

type MotionDivProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  layout?: unknown;
  initial?: unknown;
  animate?: unknown;
  exit?: unknown;
  transition?: unknown;
};

type MotionImgProps = ImgHTMLAttributes<HTMLImageElement> & {
  children?: ReactNode;
  initial?: unknown;
  animate?: unknown;
  exit?: unknown;
  transition?: unknown;
};

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, layout, initial, animate, exit, transition, ...props }: MotionDivProps) => (
      <div {...props}>{children}</div>
    ),
    img: ({ children, initial, animate, exit, transition, ...props }: MotionImgProps) => (
      <img {...props}>{children}</img>
    ),
  },
  AnimatePresence: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

vi.mock('../CharacterEditDialog', () => ({
  CharacterEditDialog: () => null,
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

describe('CharacterCard', () => {
  const generatingCharacter: Character = {
    id: 'char-1',
    name: 'Ari',
    description: 'Lead performer',
    image_status: 'generating',
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses an indeterminate generation strip instead of fake percentage progress', () => {
    render(
      <CharacterCard
        character={generatingCharacter}
        onDelete={vi.fn()}
        onGenerate={vi.fn()}
      />
    );

    expect(screen.getByTestId('character-generation-progress')).toBeInTheDocument();
    expect(screen.getByText('Generating image...')).toBeInTheDocument();
    expect(screen.queryByText(/Creating prompt|Uploading|\d+%/)).not.toBeInTheDocument();
  });

  it('marks stuck generation failed after the watchdog timeout and exposes retry', () => {
    const onGenerationTimeout = vi.fn();

    render(
      <CharacterCard
        character={generatingCharacter}
        onDelete={vi.fn()}
        onGenerate={vi.fn()}
        onGenerationTimeout={onGenerationTimeout}
        generationTimeoutMs={1000}
      />
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onGenerationTimeout).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'char-1' }),
      'Generation timed out after 1 seconds. Try again.'
    );
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});
