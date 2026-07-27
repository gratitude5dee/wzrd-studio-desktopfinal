import { AlertTriangle, Film, Image as ImageIcon, Loader2, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { NormalizedKanvasMedia } from '@/features/kanvas/types';
import { cn } from '@/lib/utils';

interface KanvasMediaPreviewProps {
  media: NormalizedKanvasMedia;
  className?: string;
  mediaClassName?: string;
  fallbackClassName?: string;
  aspectClassName?: string;
  fallbackIcon?: LucideIcon;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  preload?: 'none' | 'metadata' | 'auto';
  loading?: 'eager' | 'lazy';
  showErrorLabel?: boolean;
}

export function KanvasMediaPreview({
  media,
  className,
  mediaClassName,
  fallbackClassName,
  aspectClassName = 'aspect-video',
  fallbackIcon,
  controls = false,
  autoPlay = false,
  loop = false,
  muted = true,
  playsInline = true,
  preload = 'metadata',
  loading = 'lazy',
  showErrorLabel = false,
}: KanvasMediaPreviewProps) {
  const src = media.previewUrl ?? media.primaryUrl ?? media.thumbnailUrl;
  const [hasError, setHasError] = useState(false);
  const Icon = useMemo(() => {
    if (fallbackIcon) return fallbackIcon;
    if (hasError) return AlertTriangle;
    if (media.kind === 'image') return ImageIcon;
    return Film;
  }, [fallbackIcon, hasError, media.kind]);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  const wrapperClassName = cn(
    'relative flex min-h-0 min-w-0 items-center justify-center overflow-hidden bg-black/40',
    aspectClassName,
    className,
  );

  if (media.status === 'loading') {
    return (
      <div className={wrapperClassName} data-kanvas-media-status="loading">
        <Loader2 className="h-6 w-6 animate-spin text-[#f97316]" />
      </div>
    );
  }

  if (!src || hasError || media.kind === 'unknown') {
    return (
      <div className={wrapperClassName} data-kanvas-media-status={hasError ? 'error' : 'missing'}>
        <div className={cn('flex flex-col items-center justify-center gap-2 text-center text-zinc-500', fallbackClassName)}>
          <Icon className={cn('h-6 w-6', hasError && 'text-rose-400')} />
          {showErrorLabel && (
            <span className="px-2 text-[11px] font-medium">
              {hasError ? 'Preview unavailable' : 'No preview available'}
            </span>
          )}
        </div>
      </div>
    );
  }

  if (media.kind === 'video') {
    return (
      <div className={wrapperClassName} data-kanvas-media-status="ready">
        <video
          src={src}
          poster={media.posterUrl ?? media.thumbnailUrl ?? undefined}
          controls={controls}
          autoPlay={autoPlay}
          loop={loop}
          muted={muted}
          playsInline={playsInline}
          preload={preload}
          aria-label={media.alt}
          onError={() => setHasError(true)}
          className={cn('h-full w-full bg-black object-cover', mediaClassName)}
        />
      </div>
    );
  }

  return (
    <div className={wrapperClassName} data-kanvas-media-status="ready">
      <img
        src={src}
        alt={media.alt}
        loading={loading}
        decoding="async"
        onError={() => setHasError(true)}
        className={cn('h-full w-full object-cover', mediaClassName)}
      />
    </div>
  );
}
