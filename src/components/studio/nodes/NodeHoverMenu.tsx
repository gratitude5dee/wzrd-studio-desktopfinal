import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Copy, Download, Lock, Play, Trash2, Wand2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import {
  FloraModelMarketplace,
  type FloraModelMarketplaceValue,
} from '@/components/studio/model-selector/FloraModelMarketplace';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CatalogMediaType, CatalogStudioSurface } from '@/hooks/useCatalogModels';
import { cn } from '@/lib/utils';

export interface NodeHoverActionItem {
  key: string;
  icon: LucideIcon;
  ariaLabel: string;
  onClick?: () => void;
  disabled?: boolean;
}

export interface NodeHoverToolItem {
  key: string;
  label: string;
  icon: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  trailing?: ReactNode;
}

export interface NodeHoverMenuProps {
  isVisible: boolean;
  mediaType?: CatalogMediaType;
  modelSelection?: FloraModelMarketplaceValue;
  onModelSelectionChange?: (value: FloraModelMarketplaceValue) => void;
  workflowType?: string;
  workflowTypes?: string[];
  provider?: string;
  studioSurface?: CatalogStudioSurface;
  allowAdvancedSearch?: boolean;
  selectedModel?: string;
  modelOptions?: Array<{ id: string; label: string }>;
  onModelChange?: (value: string) => void;
  leadingChipLabel?: string;
  aspectRatioLabel?: string;
  actionItems?: NodeHoverActionItem[];
  toolItems?: NodeHoverToolItem[];
  onGenerate?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onDownload?: () => void;
  onToolClick?: () => void;
  onLockClick?: () => void;
  className?: string;
  popoverBoundary?: HTMLElement | null;
  popoverContainer?: HTMLElement | null;
}

function ActionButton({ item }: { item: NodeHoverActionItem }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        item.onClick?.();
      }}
      aria-label={item.ariaLabel}
      disabled={item.disabled || !item.onClick}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-transparent bg-transparent text-zinc-300 transition-colors',
        item.disabled || !item.onClick
          ? 'cursor-not-allowed opacity-40'
          : 'hover:border-[rgba(249,115,22,0.15)] hover:bg-[#1B1B1B] hover:text-white'
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export const NodeHoverMenu = ({
  isVisible,
  mediaType,
  modelSelection,
  onModelSelectionChange,
  workflowType,
  workflowTypes,
  provider,
  studioSurface,
  allowAdvancedSearch,
  selectedModel,
  modelOptions,
  onModelChange,
  leadingChipLabel,
  aspectRatioLabel,
  actionItems = [],
  toolItems = [],
  onGenerate,
  onDuplicate,
  onDelete,
  onDownload,
  onToolClick,
  onLockClick,
  className,
  popoverBoundary,
  popoverContainer,
}: NodeHoverMenuProps) => {
  const hasModelSelector = Boolean(mediaType && modelSelection && onModelSelectionChange);
  const legacyChipLabel =
    !hasModelSelector && selectedModel
      ? modelOptions?.find((option) => option.id === selectedModel)?.label || selectedModel
      : undefined;
  const hasLeadingChip = Boolean(leadingChipLabel || legacyChipLabel);
  const resolvedToolItems =
    toolItems.length > 0
      ? toolItems
      : onToolClick
        ? [
            {
              key: 'legacy-tools',
              label: 'Open tools',
              icon: Wand2,
              onClick: onToolClick,
            },
          ]
        : [];
  const resolvedActionItems =
    actionItems.length > 0
      ? actionItems
      : [
          onGenerate
            ? { key: 'generate', icon: Play, ariaLabel: 'Generate', onClick: onGenerate }
            : null,
          onLockClick
            ? { key: 'lock', icon: Lock, ariaLabel: 'Lock', onClick: onLockClick }
            : null,
          onDownload
            ? { key: 'download', icon: Download, ariaLabel: 'Download', onClick: onDownload }
            : null,
          onDuplicate
            ? { key: 'duplicate', icon: Copy, ariaLabel: 'Duplicate', onClick: onDuplicate }
            : null,
          onDelete
            ? { key: 'delete', icon: Trash2, ariaLabel: 'Delete', onClick: onDelete }
            : null,
        ].filter(Boolean) as NodeHoverActionItem[];
  const hasTools = resolvedToolItems.length > 0;
  const hasActions = resolvedActionItems.length > 0;

  if (!hasModelSelector && !hasLeadingChip && !aspectRatioLabel && !hasTools && !hasActions) {
    return null;
  }

  return (
    <AnimatePresence>
      {isVisible ? (
        <div
          className="absolute left-1/2 top-0 z-30 -translate-x-1/2 -translate-y-[calc(100%+5px)]"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'flex items-center gap-1 rounded-[16px] border border-[rgba(249,115,22,0.12)] bg-[#111111] px-1.5 py-1 shadow-[0_0_12px_rgba(249,115,22,0.08),0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-md',
              className
            )}
          >
          {hasModelSelector ? (
            <FloraModelMarketplace
              mediaType={mediaType!}
              value={modelSelection!}
              onChange={onModelSelectionChange!}
              workflowType={workflowType}
              workflowTypes={workflowTypes}
              provider={provider}
              studioSurface={studioSurface}
              allowAdvancedSearch={allowAdvancedSearch}
              compact
              align="start"
              triggerVariant="toolbar"
              collisionBoundary={popoverBoundary}
              portalContainer={popoverContainer}
            />
          ) : null}

          {!hasModelSelector && hasLeadingChip ? (
            <div className="inline-flex h-9 items-center rounded-[12px] border border-[rgba(249,115,22,0.12)] bg-[#101010] px-3 text-[11px] font-medium text-zinc-200">
              {leadingChipLabel || legacyChipLabel}
            </div>
          ) : null}

          {aspectRatioLabel ? (
            <div className="inline-flex h-9 items-center rounded-[12px] border border-[rgba(249,115,22,0.12)] bg-[#101010] px-3 text-[11px] font-medium text-zinc-300">
              {aspectRatioLabel}
            </div>
          ) : null}

          {(hasModelSelector || hasLeadingChip || aspectRatioLabel) && (hasTools || hasActions) ? (
            <div className="mx-1 h-5 w-px bg-[rgba(249,115,22,0.1)]" />
          ) : null}

          {hasTools ? (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-[12px] border border-[rgba(249,115,22,0.12)] bg-[#101010] px-3 text-[11px] font-medium text-zinc-200 transition-colors hover:bg-[#191919] hover:text-white"
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  <span>Tools</span>
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                side="bottom"
                sideOffset={8}
                container={popoverContainer}
                collisionBoundary={popoverBoundary ?? undefined}
                collisionPadding={{ top: 12, left: 16, right: 16, bottom: 16 }}
                className="w-[296px] rounded-[20px] border border-[rgba(249,115,22,0.12)] bg-[#171717]/98 p-2 text-white shadow-[0_0_12px_rgba(249,115,22,0.06),0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
                style={{ maxHeight: 'min(420px, calc(100vh - 168px))' }}
              >
                <div className="max-h-full space-y-1 overflow-y-auto">
                  {resolvedToolItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          item.onClick?.();
                        }}
                        disabled={item.disabled || !item.onClick}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-[16px] px-3 py-3 text-left text-sm transition-colors',
                          item.disabled || !item.onClick
                            ? 'cursor-not-allowed text-zinc-500'
                            : 'hover:bg-[#232323] text-zinc-100'
                        )}
                      >
                        <div
                          className={cn(
                            'flex h-8 w-8 items-center justify-center rounded-xl border',
                            item.disabled || !item.onClick
                              ? 'border-[rgba(249,115,22,0.08)] bg-[#151515] text-zinc-600'
                              : 'border-[rgba(249,115,22,0.1)] bg-[#141414] text-zinc-300'
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="flex-1">{item.label}</span>
                        {item.trailing ? (
                          <span className="flex items-center gap-1 text-[11px] text-zinc-400">{item.trailing}</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          ) : null}

          {hasTools && hasActions ? <div className="mx-1 h-5 w-px bg-[rgba(249,115,22,0.1)]" /> : null}

          {resolvedActionItems.map((item) => (
            <ActionButton key={item.key} item={item} />
          ))}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};

NodeHoverMenu.displayName = 'NodeHoverMenu';
