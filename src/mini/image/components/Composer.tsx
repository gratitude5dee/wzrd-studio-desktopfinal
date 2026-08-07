import { useState } from 'react';

interface ComposerProps {
  hasImage: boolean;
  /** Absent until the reactor path ships; the composer stays visible either way. */
  onSubmit?: (prompt: string) => void;
  onAttach: (file: File) => void;
}

/**
 * Composer (§3.3). Phase 1 ships the frame and the attachment affordance; the
 * skill palette, Enhance sweep and generation wiring arrive with the reactor
 * path, so `onSubmit` is optional and the field degrades to read-only.
 */
export function Composer({ hasImage, onSubmit, onAttach }: ComposerProps) {
  const [prompt, setPrompt] = useState('');
  const placeholder = hasImage ? 'Describe an edit…' : 'Describe an image…';

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
      <label className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-wzrd-hairline text-[17px] text-wzrd-chrome">
        +
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onAttach(file);
            event.target.value = '';
          }}
        />
        <span className="sr-only">Attach a photo</span>
      </label>
      <input
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={onSubmit ? placeholder : `${placeholder} (coming soon)`}
        disabled={!onSubmit}
        className="h-9 flex-1 rounded-full border border-wzrd-hairline bg-wzrd-ink px-4 text-[13px] text-wzrd-mist placeholder:text-wzrd-muted-text focus:border-wzrd-blue focus:outline-none disabled:cursor-not-allowed"
      />
    </form>
  );
}
