import { useRef } from 'react';

import { cn } from '@/lib/utils';

interface SendButtonProps {
  hasImage: boolean;
  pending: boolean;
  onSend: () => void;
  onPickFile: (file: File) => void;
}

/**
 * Permanent 56pt Send (§3.1, rule 1): always present, always enabled. With
 * nothing on the canvas there is nothing to send yet, so the press opens the
 * import picker instead — the button is never a dead end.
 */
export function SendButton({ hasImage, pending, onSend, onPickFile }: SendButtonProps) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => (hasImage ? onSend() : fileInput.current?.click())}
        className={cn(
          'h-14 w-full rounded-2xl text-[15px] font-medium transition-colors duration-wzrd-fast ease-wzrd-standard',
          pending
            ? 'bg-wzrd-deep text-wzrd-steel'
            : 'bg-wzrd-blue text-wzrd-paper hover:brightness-110'
        )}
      >
        {pending ? 'Sending…' : 'Send'}
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPickFile(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}
