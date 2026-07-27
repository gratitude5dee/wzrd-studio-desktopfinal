import { Check, AudioLines, Type, Scissors, Save } from 'lucide-react';
import type { CSSProperties } from 'react';
import {
  APP_SIDEBAR_COLLAPSED_WIDTH,
  APP_SIDEBAR_EXPANDED_WIDTH,
  useSidebar,
} from '@/contexts/SidebarContext';
import { cn } from '@/lib/utils';
import type { WizardStep } from './types';

interface KanvasLyricsFooterProps {
  currentStep: WizardStep;
  audioConfirmed: boolean;
  selectionDuration: number;
  wordCount: number;
  markerCount: number;
  saving: boolean;
  onSave: () => void;
}

const STEPS: Array<{ id: WizardStep; label: string; icon: typeof AudioLines }> = [
  { id: 1, label: 'Audio', icon: AudioLines },
  { id: 2, label: 'Lyrics', icon: Type },
  { id: 3, label: 'Markers', icon: Scissors },
];

export function KanvasLyricsFooter({
  currentStep,
  audioConfirmed,
  selectionDuration,
  wordCount,
  markerCount,
  saving,
  onSave,
}: KanvasLyricsFooterProps) {
  // Save is enabled once audio is confirmed and lyrics exist
  const saveEnabled = audioConfirmed && wordCount > 0 && !saving;
  const { isCollapsed, offset } = useSidebar();
  const sidebarOffset =
    typeof offset === 'number'
      ? offset
      : isCollapsed
        ? APP_SIDEBAR_COLLAPSED_WIDTH
        : APP_SIDEBAR_EXPANDED_WIDTH;

  return (
    <footer
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#0D1017]/95 backdrop-blur-xl transition-[left] duration-300 ease-out md:left-[var(--app-sidebar-offset)]"
      style={{ '--app-sidebar-offset': `${sidebarOffset}px` } as CSSProperties}
    >
      <div className="mx-auto flex h-20 max-w-[1500px] items-center justify-between gap-6 px-5">
        {/* Stepper */}
        <ol className="flex items-center gap-2">
          {STEPS.map((step, idx) => {
            const isActive = currentStep === step.id;
            const isComplete = currentStep > step.id;
            const isLocked = currentStep < step.id;
            const Icon = step.icon;
            const isLast = idx === STEPS.length - 1;
            return (
              <li key={step.id} className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all',
                    isActive &&
                      'border-cyan-300/70 bg-cyan-400/10 text-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.32)]',
                    isComplete && 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
                    isLocked && 'border-white/10 bg-white/[0.02] text-slate-600 opacity-60'
                  )}
                >
                  {isComplete ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    {step.label}
                  </span>
                </div>
                {!isLast && (
                  <span
                    className={cn(
                      'h-px w-6',
                      currentStep > step.id ? 'bg-emerald-400/40' : 'bg-white/10'
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>

        {/* Center stats */}
        <div className="hidden items-center gap-4 text-[11px] uppercase tracking-wider text-slate-500 md:flex">
          {audioConfirmed && (
            <>
              <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2.5 py-1 text-cyan-300">
                {selectionDuration.toFixed(1)}s
              </span>
              <span>
                <span className="text-emerald-300">{wordCount}</span> words
              </span>
            </>
          )}
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={onSave}
          disabled={!saveEnabled}
          className={cn(
            'inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-bold uppercase tracking-[0.18em] transition-all',
            saveEnabled
              ? 'bg-gradient-to-r from-cyan-400 to-emerald-400 text-black shadow-[0_0_24px_rgba(52,211,153,0.4)] hover:brightness-110'
              : 'cursor-not-allowed bg-white/5 text-slate-600 ring-1 ring-white/10'
          )}
        >
          <Save className="h-4 w-4" />
          SAVE TEMPLATE
        </button>
      </div>
    </footer>
  );
}
