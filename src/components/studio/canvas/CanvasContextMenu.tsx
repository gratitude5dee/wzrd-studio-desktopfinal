import { useEffect, useState } from 'react';
import {
  Copy,
  Frame,
  Image,
  Layers,
  MousePointer2,
  Plus,
  Sparkles,
  Trash2,
  Type,
  Video,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  selectedCount: number;
  onClose: () => void;
  onOpenNodeSelector: () => void;
  onAddNode: (type: 'text' | 'image' | 'video' | 'imageEdit') => void;
  onDuplicateSelected: () => void;
  onGroupSelected: () => void;
  onDeleteSelected: () => void;
}

export function CanvasContextMenu({
  x,
  y,
  selectedCount,
  onClose,
  onOpenNodeSelector,
  onAddNode,
  onDuplicateSelected,
  onGroupSelected,
  onDeleteSelected,
}: CanvasContextMenuProps) {
  const [position, setPosition] = useState({ x, y });
  const hasSelection = selectedCount > 0;
  const canGroup = selectedCount > 1;

  useEffect(() => {
    const menuWidth = 230;
    const menuHeight = hasSelection ? 260 : 286;
    setPosition({
      x: x + menuWidth > window.innerWidth ? Math.max(8, x - menuWidth) : x,
      y: y + menuHeight > window.innerHeight ? Math.max(8, y - menuHeight) : y,
    });
  }, [hasSelection, x, y]);

  const runAction = (action: () => void) => {
    action();
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[90]" onClick={onClose} />
      <div
        className="fixed z-[91] w-[230px] overflow-hidden rounded-lg border border-white/10 bg-[#121212]/98 py-1.5 shadow-2xl shadow-black/45 backdrop-blur-xl"
        style={{ left: position.x, top: position.y }}
        role="menu"
      >
        {hasSelection ? (
          <>
            <div className="px-3 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
              {selectedCount} selected
            </div>
            <MenuItem
              icon={<Copy className="h-4 w-4" />}
              label="Duplicate"
              shortcut="⌘D"
              onClick={() => runAction(onDuplicateSelected)}
            />
            <MenuItem
              icon={<Frame className="h-4 w-4" />}
              label="Group into Frame"
              shortcut="⌘G"
              disabled={!canGroup}
              onClick={() => runAction(onGroupSelected)}
            />
            <div className="my-1 h-px bg-white/8" />
            <MenuItem
              icon={<Sparkles className="h-4 w-4" />}
              label="Insert Action"
              onClick={() => runAction(onOpenNodeSelector)}
            />
            <div className="my-1 h-px bg-white/8" />
            <MenuItem
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete"
              shortcut="⌫"
              danger
              onClick={() => runAction(onDeleteSelected)}
            />
          </>
        ) : (
          <>
            <div className="px-3 pb-1.5 pt-2 text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
              Add here
            </div>
            <MenuItem
              icon={<Sparkles className="h-4 w-4" />}
              label="Node Selector"
              onClick={() => runAction(onOpenNodeSelector)}
            />
            <div className="my-1 h-px bg-white/8" />
            <MenuItem
              icon={<Type className="h-4 w-4" />}
              label="Text"
              shortcut="T"
              onClick={() => runAction(() => onAddNode('text'))}
            />
            <MenuItem
              icon={<Image className="h-4 w-4" />}
              label="Image"
              shortcut="I"
              onClick={() => runAction(() => onAddNode('image'))}
            />
            <MenuItem
              icon={<Video className="h-4 w-4" />}
              label="Video"
              shortcut="V"
              onClick={() => runAction(() => onAddNode('video'))}
            />
            <MenuItem
              icon={<Layers className="h-4 w-4" />}
              label="Image Edit"
              onClick={() => runAction(() => onAddNode('imageEdit'))}
            />
          </>
        )}
        <div className="my-1 h-px bg-white/8" />
        <MenuItem
          icon={hasSelection ? <MousePointer2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          label={hasSelection ? 'Clear Menu' : 'Close'}
          onClick={onClose}
        />
      </div>
    </>
  );
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function MenuItem({ icon, label, shortcut, danger, disabled, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors',
        disabled
          ? 'cursor-not-allowed text-zinc-600'
          : danger
            ? 'text-red-300 hover:bg-red-500/10 hover:text-red-200'
            : 'text-zinc-300 hover:bg-white/7 hover:text-white'
      )}
    >
      <span className={cn('flex h-7 w-7 items-center justify-center rounded-md border border-white/8 bg-[#1a1a1a]', danger && 'border-red-500/20 bg-red-500/8')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut ? (
        <kbd className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-zinc-500">
          {shortcut}
        </kbd>
      ) : null}
    </button>
  );
}
