import { Check, Loader2, Mic, MicOff, PhoneOff, Volume2, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VoiceActionConfirmation } from '@/voice/actions/registry';
import type { VoiceSessionStatus } from '@/voice/realtime/useWzrdRealtimeSession';

interface VoiceActionButtonProps {
  status: VoiceSessionStatus;
  errorMessage?: string | null;
  pendingConfirmation?: VoiceActionConfirmation | null;
  lastTranscript?: string | null;
  lastActionMessage?: string | null;
  lastTraceId?: string | null;
  disabled?: boolean;
  onPressStart: () => void | Promise<void>;
  onPressEnd: () => void | Promise<void>;
  onDisconnect: () => void;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
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
  pendingConfirmation,
  lastTranscript,
  lastActionMessage,
  lastTraceId,
  disabled,
  onPressStart,
  onPressEnd,
  onDisconnect,
  onConfirm,
  onCancel,
}: VoiceActionButtonProps) {
  const [pressed, setPressed] = useState(false);
  const pressStartTime = useRef(0);
  const pressMode = useRef<'pointer' | 'keyboard'>('pointer');

  const isActive = status !== 'idle' && status !== 'error';
  const hasDockCopy = status !== 'idle' || errorMessage || pendingConfirmation || lastTranscript || lastActionMessage;

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
      className="pointer-events-none fixed bottom-20 right-4 z-[80] flex flex-row-reverse items-end gap-3 md:bottom-12"
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

      {hasDockCopy && (
        <div
          data-testid="voice-command-dock"
          className={cn(
            'pointer-events-auto w-[min(22rem,calc(100vw-5.5rem))] rounded-xl border border-white/10 bg-zinc-950/[0.92] px-3 py-3 text-xs text-zinc-100 shadow-2xl shadow-black/50 backdrop-blur-xl',
            pendingConfirmation && 'border-orange-400/40 shadow-orange-500/10',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold">{STATUS_LABELS[status]}</div>
            {lastTraceId ? (
              <div className="max-w-[8rem] truncate rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-zinc-500">
                {lastTraceId}
              </div>
            ) : null}
          </div>

          {pendingConfirmation ? (
            <div className="mt-2 rounded-lg border border-orange-400/20 bg-orange-500/10 p-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-300">
                Confirmation Required
              </div>
              <p className="mt-1 text-zinc-100">{pendingConfirmation.message}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => void onConfirm?.()}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-orange-500 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-black transition hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
                >
                  <Check className="h-3.5 w-3.5" />
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-300 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
                >
                  <X className="h-3.5 w-3.5" />
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {lastActionMessage && !pendingConfirmation ? (
            <div className="mt-2 text-zinc-300">{lastActionMessage}</div>
          ) : null}

          {lastTranscript ? (
            <div className="mt-2 border-t border-white/10 pt-2 text-zinc-500">
              <span className="text-zinc-400">Heard:</span> {lastTranscript}
            </div>
          ) : null}

          {errorMessage ? <div className="mt-2 text-red-200">{errorMessage}</div> : null}
        </div>
      )}
    </div>
  );
}
