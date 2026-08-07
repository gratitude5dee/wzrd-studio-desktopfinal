import { cn } from '@/lib/utils';

interface SendButtonProps {
  enabled: boolean;
  pending: boolean;
  onSend: () => void;
}

/**
 * Permanent 56pt Send (§3.1). It is always mounted and becomes enabled the
 * moment anything is on the canvas — it never appears or disappears.
 */
export function SendButton({ enabled, pending, onSend }: SendButtonProps) {
  return (
    <div className="shrink-0 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
      <button
        type="button"
        disabled={!enabled || pending}
        onClick={onSend}
        className={cn(
          'h-14 w-full rounded-2xl text-[15px] font-medium transition-colors duration-wzrd-fast ease-wzrd-standard',
          enabled && !pending
            ? 'bg-wzrd-blue text-wzrd-paper hover:brightness-110'
            : 'bg-wzrd-deep text-wzrd-steel'
        )}
      >
        {pending ? 'Sending…' : 'Send'}
      </button>
    </div>
  );
}
