import { useRef } from 'react';

import { DitherGradient } from '@/components/dither-kit/gradient';

import { EXAMPLE_PROMPTS } from '../lib/example-prompts';

interface EmptyCanvasProps {
  onPickFile: (file: File) => void;
  onExamplePrompt?: (prompt: string) => void;
}

/** Empty canvas state (§8): DitherGradient wash, drop target, example prompts. */
export function EmptyCanvas({ onPickFile, onExamplePrompt }: EmptyCanvasProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file?.type.startsWith('image/')) onPickFile(file);
  };

  return (
    <div
      className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden p-6"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        handleFiles(event.dataTransfer.files);
      }}
    >
      {/* §8: the DitherGradient wash, at --wzrd-blue's hue rather than the
       * chart palette's purple. */}
      <DitherGradient
        from={224}
        direction="up"
        cell={3}
        opacity={0.35}
        className="pointer-events-none absolute inset-0"
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative flex w-full max-w-md flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-wzrd-hairline-strong bg-wzrd-ink/60 px-8 py-12 text-center transition-colors duration-wzrd-fast ease-wzrd-standard hover:border-wzrd-blue"
      >
        <span className="text-base text-wzrd-mist">Drop a photo</span>
        <span className="text-[13px] text-wzrd-muted-text">
          or tap to choose from your device
        </span>
      </button>

      <div className="relative flex w-full max-w-md flex-col items-center gap-2">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            disabled={!onExamplePrompt}
            onClick={() => onExamplePrompt?.(prompt)}
            className="h-11 w-full rounded-full border border-wzrd-hairline px-4 text-[13px] text-wzrd-chrome disabled:text-wzrd-steel"
          >
            {prompt}
          </button>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
    </div>
  );
}
