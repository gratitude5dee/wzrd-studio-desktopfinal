import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { KanvasMediaPreview } from '@/components/kanvas/KanvasMediaPreview';
import type { NormalizedKanvasMedia } from '@/features/kanvas/types';

function media(overrides: Partial<NormalizedKanvasMedia>): NormalizedKanvasMedia {
  return {
    kind: 'image',
    primaryUrl: null,
    previewUrl: null,
    thumbnailUrl: null,
    posterUrl: null,
    alt: 'Preview',
    sourceType: 'job',
    status: 'missing',
    ...overrides,
  };
}

describe('KanvasMediaPreview', () => {
  it('renders an image preview and falls back when it errors', () => {
    render(
      <KanvasMediaPreview
        media={media({
          kind: 'image',
          primaryUrl: 'https://cdn.example.com/image.png',
          previewUrl: 'https://cdn.example.com/image.png',
          status: 'ready',
        })}
        showErrorLabel
      />,
    );

    const image = screen.getByRole('img', { name: 'Preview' });
    expect(image).toHaveAttribute('src', 'https://cdn.example.com/image.png');

    fireEvent.error(image);

    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  });

  it('renders video previews with poster and metadata preload', () => {
    const { container } = render(
      <KanvasMediaPreview
        media={media({
          kind: 'video',
          primaryUrl: 'https://cdn.example.com/video.mp4',
          previewUrl: 'https://cdn.example.com/video.mp4',
          thumbnailUrl: 'https://cdn.example.com/poster.jpg',
          posterUrl: 'https://cdn.example.com/poster.jpg',
          status: 'ready',
        })}
        controls
      />,
    );

    const video = container.querySelector('video');
    expect(video).toHaveAttribute('src', 'https://cdn.example.com/video.mp4');
    expect(video).toHaveAttribute('poster', 'https://cdn.example.com/poster.jpg');
    expect(video).toHaveAttribute('preload', 'metadata');
    expect(video).toHaveAttribute('controls');
  });

  it('shows a stable missing state when no URL is available', () => {
    render(<KanvasMediaPreview media={media({ status: 'missing' })} showErrorLabel />);

    expect(screen.getByText('No preview available')).toBeInTheDocument();
  });
});
