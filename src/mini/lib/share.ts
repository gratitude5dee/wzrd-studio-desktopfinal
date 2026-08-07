export type ShareOutcome = 'shared' | 'copied' | 'downloaded';

function canShareFile(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Send (§4.5): share the permalink, falling back to clipboard, then download.
 * Phase 5 adds the messages wrapper; `sendArtifact` is absent here so the
 * caller branches on the outcome rather than assuming a host app exists.
 */
export async function shareArtifact(options: {
  permalink: string;
  blob: Blob;
  filename?: string;
}): Promise<ShareOutcome> {
  const filename = options.filename ?? 'wzrd.png';
  const file = new File([options.blob], filename, { type: options.blob.type || 'image/png' });

  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], url: options.permalink, title: 'WZRD' });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(options.permalink);
      return 'copied';
    } catch {
      // fall through to download
    }
  }

  download(options.blob, filename);
  return 'downloaded';
}

export { download as downloadBlob };
