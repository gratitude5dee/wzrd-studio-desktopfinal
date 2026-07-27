import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent,
} from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface LensWheelHandle {
  focus(): void;
}

export interface LensWheelProps<T extends string> {
  label: string;
  options: readonly T[];
  /** Currently selected value, or undefined when unset (still renders peeks for visual continuity). */
  value: T | undefined;
  /** Called with the next value, or `undefined` when the user clicks the center cell to clear. */
  onChange: (next: T | undefined) => void;
  /** Render the iconographic glyph for a given option. */
  renderGlyph: (option: T, isActive: boolean) => ReactNode;
  /** Optional caption transform (e.g. uppercase labels). Defaults to the value itself. */
  formatCaption?: (option: T) => string;
}

const CELL_HEIGHT = 64;
const SCRUB_STEP_PX = 30;
const SCROLL_THROTTLE_MS = 110;

function LensWheelInner<T extends string>(
  { label, options, value, onChange, renderGlyph, formatCaption }: LensWheelProps<T>,
  ref: React.Ref<LensWheelHandle>
) {
  const hasValue = value !== undefined && options.includes(value);
  const activeIndex = hasValue ? options.indexOf(value!) : 0;
  const rootRef = useRef<HTMLDivElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => rootRef.current?.focus(),
  }));

  const goto = useCallback(
    (delta: number) => {
      if (options.length === 0) return;
      const start = hasValue ? activeIndex : 0;
      const next = ((start + delta) % options.length + options.length) % options.length;
      onChange(options[next]);
    },
    [options, hasValue, activeIndex, onChange]
  );

  const clear = useCallback(() => onChange(undefined), [onChange]);

  const handleKey = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        goto(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        goto(-1);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (hasValue) clear();
        else goto(0);
      }
    },
    [goto, clear, hasValue]
  );

  // --- Scroll-wheel support (throttled) ---
  const lastScrollAt = useRef(0);
  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      // Only horizontally-flat wheels (mouse) and meaningful deltas
      if (Math.abs(event.deltaY) < 4) return;
      const now = Date.now();
      if (now - lastScrollAt.current < SCROLL_THROTTLE_MS) return;
      lastScrollAt.current = now;
      event.preventDefault();
      goto(event.deltaY > 0 ? 1 : -1);
    },
    [goto]
  );

  // --- Drag-to-scrub support ---
  const dragStartY = useRef<number | null>(null);
  const dragAccum = useRef(0);
  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    // Ignore drags initiated on chevron / center buttons so clicks still work.
    if ((event.target as HTMLElement).closest('button')) return;
    dragStartY.current = event.clientY;
    dragAccum.current = 0;
    (event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId);
  }, []);
  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragStartY.current == null) return;
      const dy = dragStartY.current - event.clientY;
      const steps = Math.trunc((dy - dragAccum.current) / SCRUB_STEP_PX);
      if (steps !== 0) {
        dragAccum.current += steps * SCRUB_STEP_PX;
        goto(steps);
      }
    },
    [goto]
  );
  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    dragStartY.current = null;
    dragAccum.current = 0;
    try {
      (event.currentTarget as HTMLDivElement).releasePointerCapture(event.pointerId);
    } catch {
      /* noop */
    }
  }, []);

  // Render a 3-cell window: prev / center / next (wrap-around for visual continuity).
  const peekIndex = (offset: number) => {
    if (options.length === 0) return 0;
    const start = hasValue ? activeIndex : 0;
    return ((start + offset) % options.length + options.length) % options.length;
  };

  const caption = hasValue ? (formatCaption ? formatCaption(value!) : value!) : '—';

  return (
    <div
      ref={rootRef}
      className="relative flex h-full min-w-0 flex-1 flex-col items-center outline-none focus-visible:ring-1 focus-visible:ring-[#f97316]/30 rounded-xl"
      role="listbox"
      aria-label={label}
      aria-activedescendant={hasValue ? `lens-${label}-${activeIndex}` : undefined}
      tabIndex={0}
      onKeyDown={handleKey}
    >
      {/* Column heading */}
      <div className="mb-1 text-[9px] uppercase tracking-[0.22em] text-zinc-600">{label}</div>

      {/* Carousel viewport */}
      <div className="relative flex w-full items-center justify-center py-1">
        {/* Left chevron */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goto(-1);
          }}
          aria-label={`Previous ${label}`}
          className="absolute left-[-2px] z-10 inline-flex h-5 w-4 items-center justify-center text-zinc-600 transition-colors hover:text-white"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {/* Wheel column — handles wheel + drag */}
        <div
          className="relative h-[196px] w-[84px] cursor-grab overflow-hidden touch-none active:cursor-grabbing"
          style={{
            maskImage:
              'linear-gradient(to bottom, transparent 0, black 28%, black 72%, transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(to bottom, transparent 0, black 28%, black 72%, transparent 100%)',
          }}
          onWheel={handleWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <ul
            className="absolute inset-x-0 flex flex-col items-center transition-transform duration-200 motion-reduce:transition-none"
            style={{
              transform: `translateY(${CELL_HEIGHT}px)`,
              transitionTimingFunction: 'cubic-bezier(0.32,0.72,0,1)',
            }}
          >
            {[-1, 0, 1].map((offset) => {
              const idx = peekIndex(offset);
              const opt = options[idx];
              const isCenter = offset === 0;
              const isActive = isCenter && hasValue;
              return (
                <li
                  key={`${opt}-${offset}`}
                  id={isCenter ? `lens-${label}-${idx}` : undefined}
                  role={isCenter ? 'option' : undefined}
                  aria-selected={isActive ? 'true' : undefined}
                  aria-hidden={!isCenter}
                  className={cn(
                    'flex items-center justify-center transition-all duration-200',
                    isCenter ? 'opacity-100' : 'opacity-30'
                  )}
                  style={{ height: `${CELL_HEIGHT}px` }}
                >
                  {isCenter ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (hasValue) clear();
                      }}
                      title={hasValue ? `${opt} — click to clear` : opt}
                      className={cn(
                        'group relative flex h-[60px] w-[60px] items-center justify-center rounded-2xl transition-all',
                        isActive
                          ? 'border border-[#f97316]/45 bg-[#1c1510] text-[#fdba74] shadow-[0_0_28px_rgba(249,115,22,0.22),inset_0_1px_0_rgba(255,255,255,0.05)]'
                          : 'bg-white/[0.02] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
                      )}
                    >
                      <div className="h-10 w-10">{renderGlyph(opt, isActive)}</div>
                    </button>
                  ) : (
                    <div className="flex h-[48px] w-[48px] items-center justify-center text-zinc-700">
                      <div className="h-7 w-7 opacity-60">{renderGlyph(opt, false)}</div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Right chevron */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            goto(1);
          }}
          aria-label={`Next ${label}`}
          className="absolute right-[-2px] z-10 inline-flex h-5 w-4 items-center justify-center text-zinc-600 transition-colors hover:text-white"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Caption */}
      <div
        className={cn(
          'mt-2 max-w-[92px] truncate text-center text-[12px] font-medium transition-colors',
          hasValue ? 'text-[#fdba74]' : 'text-zinc-600'
        )}
      >
        {caption}
      </div>
    </div>
  );
}

// Generic forwardRef wrapper preserving the type parameter
export const LensWheel = forwardRef(LensWheelInner) as <T extends string>(
  props: LensWheelProps<T> & { ref?: React.Ref<LensWheelHandle> }
) => ReturnType<typeof LensWheelInner>;

export default LensWheel;
