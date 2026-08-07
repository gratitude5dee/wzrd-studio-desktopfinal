import { useState } from 'react';

interface ComposerProps {
  hasImage: boolean;
  /** Absent until the reactor path ships; the composer stays visible either way. */
  onSubmit?: (prompt: string) => void;
  onAttach: (file: File) => void;
}

/**
 * Composer (§3.3). Phase 1 ships the frame and the attachment affordances —
 * photo, camera and paste (paste is handled page-wide). The skill palette,
 * Enhance sweep and generation wiring arrive with the reactor path, so
 * `onSubmit` is optional and the field degrades to read-only.
 */
export function Composer({ hasImage, onSubmit, onAttach }: ComposerProps) {
  const [prompt, setPrompt] = useState('');
  // §3.3: same input, two jobs, and the placeholder is the only thing that says so.
  const placeholder = hasImage ? 'Change something' : 'Describe an image';

  return (
    <form
      className="flex shrink-0 items-center gap-2 border-t border-wzrd-hairline px-4 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!onSubmit || !prompt.trim()) return;
        onSubmit(prompt.trim());
        setPrompt('');
      }}
    >
      <FilePick label="Attach a photo" glyph="+" onPick={onAttach} />
      <FilePick label="Take a photo" glyph="◉" capture onPick={onAttach} />
      <input
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={placeholder}
        disabled={!onSubmit}
        className="h-9 flex-1 rounded-full border border-wzrd-hairline bg-wzrd-ink px-4 text-[13px] text-wzrd-mist placeholder:text-wzrd-muted-text focus:border-wzrd-blue focus:outline-none disabled:cursor-not-allowed"
      />
    </form>
  );
}

function FilePick({
  label,
  glyph,
  capture,
  onPick,
}: {
  label: string;
  glyph: string;
  capture?: boolean;
  onPick: (file: File) => void;
}) {
  return (
    <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-wzrd-hairline text-[15px] text-wzrd-chrome">
      <span aria-hidden>{glyph}</span>
      <input
        type="file"
        accept="image/*"
        capture={capture ? 'environment' : undefined}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = '';
        }}
      />
      <span className="sr-only">{label}</span>
    </label>
  );
}
