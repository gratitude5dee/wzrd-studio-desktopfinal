import { Loader2, Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VoiceSessionStatus } from '@/voice/realtime/useWzrdRealtimeSession';

interface VoiceActionButtonProps {
  status: VoiceSessionStatus;
  errorMessage?: string | null;
  disabled?: boolean;
  onPressStart: () => void | Promise<void>;
  onPressEnd: () => void | Promise<void>;
  onDisconnect: () => void;
}

const STATUS_LABELS: Record<VoiceSessionStatus, string> = {
  idle: 'Ready',
  connecting: 'Connecting',
  connected: 'Connected — hold to speak',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  confirming: 'Confirming',
  error: 'Voice unavailable',
};

/** Threshold in ms — presses shorter than this are treated as a toggle tap, not PTT. */
const TAP_THRESHOLD = 200;

export function VoiceActionButton({
  status,
  errorMessage,
  disabled,
  onPressStart,
  onPressEnd,
  onDisconnect,
}: VoiceActionButtonProps) {
  const [pressed, setPressed] = useState(false);
  const pressStartTime = useRef(0);
  const pressMode = useRef<'pointer' | 'keyboard'>('pointer');

  const isActive = status !== 'idle' && status !== 'error';

  const start = useCallback((mode: 'pointer' | 'keyboard' = 'pointer') => {
    if (disabled || pressed) return;
    pressStartTime.current = Date.now();
    pressMode.current = mode;
    setPressed(true);
    void onPressStart();
  }, [disabled, onPressStart, pressed]);

  const stop = useCallback(() => {
    if (!pressed) return;
    setPressed(false);
    const elapsed = Date.now() - pressStartTime.current;

    // Short tap on an already-connected session → disconnect
    if (pressMode.current === 'pointer' && elapsed < TAP_THRESHOLD && isActive) {
      onDisconnect();
      return;
    }

    void onPressEnd();
  }, [onPressEnd, pressed, isActive, onDisconnect]);

  const handlePointerDown = useCallback(
    (_event: PointerEvent<HTMLButtonElement>) => {
      start('pointer');
    },
    [start],
  );

  const handlePointerEnd = useCallback(
    (_event: PointerEvent<HTMLButtonElement>) => {
      stop();
    },
    [stop],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      start('keyboard');
    },
    [start],
  );

  const handleKeyUp = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      stop();
    },
    [stop],
  );

  const Icon =
    status === 'connecting' || status === 'thinking'
      ? Loader2
      : status === 'speaking'
        ? Volume2
        : status === 'error'
          ? MicOff
          : status === 'connected'
            ? PhoneOff
            : Mic;

  return (
    <div
      data-testid="voice-action-button-container"
      className="pointer-events-none fixed bottom-20 right-4 z-[80] flex flex-row-reverse items-center gap-2 md:bottom-4"
    >
      <Button
        type="button"
        aria-label={isActive ? 'Hold to speak, tap to disconnect' : 'Hold to speak'}
        disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={handlePointerEnd}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        className={cn(
          'pointer-events-auto h-12 w-12 rounded-full border border-white/15 bg-zinc-950/90 p-0 text-white shadow-2xl shadow-black/40 backdrop-blur transition',
          'hover:bg-zinc-900 focus-visible:ring-2 focus-visible:ring-orange-400',
          status === 'listening' && 'border-orange-400 bg-orange-500 text-black shadow-orange-500/30',
          status === 'connected' && 'border-green-400/50 shadow-green-500/10',
          status === 'error' && 'border-red-400 bg-red-500/15 text-red-100',
        )}
      >
        <Icon className={cn('h-5 w-5', (status === 'connecting' || status === 'thinking') && 'animate-spin')} />
        {/* Pulsing dot to indicate active session */}
        {isActive && status !== 'listening' && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-green-400 animate-pulse" />
        )}
      </Button>

      {(status !== 'idle' || errorMessage) && (
        <div className="pointer-events-none max-w-[240px] rounded-md border border-white/10 bg-zinc-950/90 px-3 py-2 text-xs text-zinc-100 shadow-xl backdrop-blur">
          <div className="font-medium">{STATUS_LABELS[status]}</div>
          {errorMessage ? <div className="mt-1 text-zinc-400">{errorMessage}</div> : null}
        </div>
      )}
    </div>
  );
}
