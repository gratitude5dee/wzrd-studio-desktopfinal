import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { MiniShell } from '../MiniShell';
import { MiniHeader } from '../image/components/MiniHeader';
import { fetchArtifact, type ArtifactRecord } from '../lib/mini-api';

/** Public artifact permalink (`/a/:id`): the artifact large, one CTA. */
export function ArtifactPage() {
  const { artifactId } = useParams<{ artifactId: string }>();
  const [artifact, setArtifact] = useState<ArtifactRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!artifactId) return undefined;
    let cancelled = false;
    setArtifact(null);
    setError(null);
    fetchArtifact(artifactId)
      .then((record) => {
        if (!cancelled) setArtifact(record);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Artifact unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, [artifactId]);

  return (
    <MiniShell>
      <MiniHeader title="Artifact" />

      <main className="flex flex-1 items-center justify-center p-4">
        {error ? (
          <p className="text-[13px] text-wzrd-muted-text">{error}</p>
        ) : artifact ? (
          <img
            src={artifact.url}
            alt="WZRD artifact"
            width={artifact.width}
            height={artifact.height}
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        ) : (
          // Reserves space so the image swap costs no layout shift (§8).
          <div className="h-full w-full max-w-3xl animate-pulse rounded-xl bg-wzrd-deep" />
        )}
      </main>

      <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <Link
          to="/image"
          className="flex h-14 w-full items-center justify-center rounded-2xl bg-wzrd-blue text-[15px] font-medium text-wzrd-paper"
        >
          Make your own
        </Link>
      </div>
    </MiniShell>
  );
}

export default ArtifactPage;
