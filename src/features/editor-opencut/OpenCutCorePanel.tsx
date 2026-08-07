import {
  ArrowLeft,
  ArrowRight,
  BookmarkPlus,
  CheckSquare,
  Clipboard,
  ClipboardPaste,
  Copy,
  Eraser,
  Gauge,
  KeyRound,
  Scan,
  ScissorsLineDashed,
  Sparkles,
  SplitSquareHorizontal,
  Trash2,
  Waves,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  addKeyframeAtPlayhead,
  applyEffectToSelection,
  clearOpenCutSelection,
  copyOpenCutSelection,
  deleteSelection,
  duplicateSelection,
  moveSelection,
  pasteOpenCutClipboard,
  retimeSelection,
  selectAllOpenCutElements,
  separateSelectedSourceAudio,
  splitSelectedAtPlayhead,
  toggleBookmarkAtPlayhead,
  toggleMaskOnSelection,
  trimSelectionEdges,
} from './openCutCommands';
import type { OpenCutProjectSnapshot } from './openCutTypes';

interface OpenCutCorePanelProps {
  snapshot: OpenCutProjectSnapshot;
}

interface CoreCommand {
  label: string;
  icon: LucideIcon;
  onRun: () => number;
  emptyMessage: string;
  disabled?: boolean;
  destructive?: boolean;
}

function runCommand(label: string, command: () => number, emptyMessage: string) {
  const count = command();
  if (count > 0) {
    toast.success(`${label} ${count} item${count === 1 ? '' : 's'}`);
  } else {
    toast.info(emptyMessage);
  }
}

function CommandButton({ command }: { command: CoreCommand }) {
  const Icon = command.icon;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={
        command.destructive
          ? 'h-7 min-w-0 justify-start border-rose-400/30 bg-rose-950/20 px-2 text-[11px] text-rose-100 hover:bg-rose-900/30'
          : 'h-7 min-w-0 justify-start border-zinc-700 bg-zinc-950/70 px-2 text-[11px] text-zinc-200 hover:bg-zinc-900'
      }
      onClick={() => runCommand(command.label, command.onRun, command.emptyMessage)}
      disabled={command.disabled}
    >
      <Icon className="mr-1.5 h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{command.label}</span>
    </Button>
  );
}

function CommandSection({ title, commands }: { title: string; commands: CoreCommand[] }) {
  return (
    <section className="space-y-1.5">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{title}</h3>
      <div className="grid min-w-0 grid-cols-2 gap-1.5">
        {commands.map((command) => (
          <CommandButton key={command.label} command={command} />
        ))}
      </div>
    </section>
  );
}

export function OpenCutCorePanel({ snapshot }: OpenCutCorePanelProps) {
  const selectedMediaCount = snapshot.selectedElementIds.length;
  const selectedKeyframeCount = snapshot.selectedKeyframeIds.length;
  const selectedCount = selectedMediaCount + selectedKeyframeCount;
  const elementCount = snapshot.tracks.reduce((count, track) => count + track.elements.length, 0);
  const mediaDisabled = selectedMediaCount === 0;
  const selectionDisabled = selectedCount === 0;

  const commandGroups: Array<{ title: string; commands: CoreCommand[] }> = [
    {
      title: 'Timing',
      commands: [
        {
          label: 'Split',
          icon: SplitSquareHorizontal,
          onRun: splitSelectedAtPlayhead,
          emptyMessage: 'Move the playhead inside a selected clip to split it.',
          disabled: mediaDisabled,
        },
        {
          label: 'Move Left',
          icon: ArrowLeft,
          onRun: () => moveSelection({ deltaMs: -100, snapToGrid: true }),
          emptyMessage: 'Select one or more clips to move.',
          disabled: mediaDisabled,
        },
        {
          label: 'Move Right',
          icon: ArrowRight,
          onRun: () => moveSelection({ deltaMs: 100, snapToGrid: true }),
          emptyMessage: 'Select one or more clips to move.',
          disabled: mediaDisabled,
        },
        {
          label: 'Trim In',
          icon: ScissorsLineDashed,
          onRun: () => trimSelectionEdges({ startDeltaMs: 100 }),
          emptyMessage: 'Select one or more clips to trim.',
          disabled: mediaDisabled,
        },
        {
          label: 'Trim Out',
          icon: ScissorsLineDashed,
          onRun: () => trimSelectionEdges({ endDeltaMs: -100 }),
          emptyMessage: 'Select one or more clips to trim.',
          disabled: mediaDisabled,
        },
        {
          label: 'Retime 2x',
          icon: Gauge,
          onRun: () => retimeSelection(2),
          emptyMessage: 'Select one or more clips to retime.',
          disabled: mediaDisabled,
        },
      ],
    },
    {
      title: 'Edit',
      commands: [
        {
          label: 'Duplicate',
          icon: Copy,
          onRun: duplicateSelection,
          emptyMessage: 'Select one or more clips to duplicate.',
          disabled: mediaDisabled,
        },
        {
          label: 'Copy',
          icon: Clipboard,
          onRun: copyOpenCutSelection,
          emptyMessage: 'Select clips, audio, or keyframes to copy.',
          disabled: selectionDisabled,
        },
        {
          label: 'Paste',
          icon: ClipboardPaste,
          onRun: () => pasteOpenCutClipboard(),
          emptyMessage: 'Copy clips, audio, or keyframes before pasting.',
        },
        {
          label: 'Delete',
          icon: Trash2,
          onRun: deleteSelection,
          emptyMessage: 'Select one or more clips to delete.',
          disabled: selectionDisabled,
          destructive: true,
        },
      ],
    },
    {
      title: 'Enhance',
      commands: [
        {
          label: 'Effect',
          icon: Sparkles,
          onRun: () => applyEffectToSelection('blur', { amount: 4 }),
          emptyMessage: 'Select a visual clip to apply an effect.',
          disabled: mediaDisabled,
        },
        {
          label: 'Mask',
          icon: Scan,
          onRun: () => toggleMaskOnSelection('rectangle'),
          emptyMessage: 'Select a visual clip to toggle a mask.',
          disabled: mediaDisabled,
        },
        {
          label: 'Keyframe',
          icon: KeyRound,
          onRun: addKeyframeAtPlayhead,
          emptyMessage: 'Select a visual clip or audio track to add a keyframe.',
          disabled: mediaDisabled,
        },
        {
          label: 'Bookmark',
          icon: BookmarkPlus,
          onRun: () => toggleBookmarkAtPlayhead(),
          emptyMessage: 'Move the playhead to set or remove a bookmark.',
        },
      ],
    },
    {
      title: 'Selection',
      commands: [
        {
          label: 'Select All',
          icon: CheckSquare,
          onRun: selectAllOpenCutElements,
          emptyMessage: 'No selectable editor elements.',
          disabled: elementCount === 0,
        },
        {
          label: 'Clear',
          icon: Eraser,
          onRun: clearOpenCutSelection,
          emptyMessage: 'No editor selection to clear.',
          disabled: selectionDisabled,
        },
        {
          label: 'Source Audio',
          icon: Waves,
          onRun: separateSelectedSourceAudio,
          emptyMessage: 'Select a video clip with source audio to separate.',
          disabled: mediaDisabled,
        },
      ],
    },
  ];

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="border-b border-white/10 px-3 py-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-orange-200/80">OpenCut</p>
        <h2 className="mt-1 text-sm font-semibold text-white">OpenCut Core</h2>
        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] tabular-nums text-zinc-400">
          <span>{snapshot.tracks.length} tracks</span>
          <span>{elementCount} elements</span>
          <span>{snapshot.scenes.length} scenes</span>
          <span>{selectedCount} selected</span>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-3 py-3">
        {commandGroups.map((group) => (
          <CommandSection key={group.title} title={group.title} commands={group.commands} />
        ))}
      </div>
    </div>
  );
}
