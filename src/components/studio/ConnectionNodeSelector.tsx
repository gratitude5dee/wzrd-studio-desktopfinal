import React from 'react';
import { Type, Image, Video, BookOpen, Layers, Rows3, Wand2, Music, Box, Globe2, Scissors, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useSmartBlockSuggestions } from '@/hooks/useSmartBlockSuggestions';
import {
  getActionsForSourceDataType,
  getPaletteMediaActions,
  type MediaActionDefinition,
} from '@/lib/studio/mediaActionRegistry';

interface ConnectionNodeSelectorProps {
  position: { x: number; y: number };
  onSelectType: (type: 'text' | 'image' | 'video' | 'imageEdit') => void;
  onSelectAction?: (actionId: string) => void;
  onNavigate: () => void;
  onCancel: () => void;
  isTransforming?: boolean;
  targetType?: 'text' | 'image' | 'video';
  sourceBlockType?: 'text' | 'image' | 'video';
  sourceBlockContent?: string;
}

const blockTypes = [
  { type: 'text' as const, label: 'Text', icon: Type, shortcut: 'T' },
  { type: 'image' as const, label: 'Image', icon: Image, shortcut: 'I' },
  { type: 'video' as const, label: 'Video', icon: Video, shortcut: 'V' },
  { type: 'imageEdit' as const, label: 'Layer Editor', icon: Layers, shortcut: 'E' },
];

const actionIconByMedia: Record<string, LucideIcon> = {
  text: Type,
  image: Image,
  video: Video,
  audio: Music,
  '3d': Box,
  json: Globe2,
  any: Sparkles,
};

function getActionIcon(action: MediaActionDefinition) {
  if (action.executor === 'ffmpeg') return Scissors;
  if (action.actionId.startsWith('batch.')) return Rows3;
  if (action.actionId.startsWith('embed.')) return Globe2;
  return actionIconByMedia[action.mediaType] ?? Wand2;
}

export const ConnectionNodeSelector: React.FC<ConnectionNodeSelectorProps> = ({
  position: _position,
  onSelectType,
  onSelectAction,
  onNavigate: _onNavigate,
  onCancel: _onCancel,
  isTransforming = false,
  targetType: _targetType,
  sourceBlockType,
  sourceBlockContent,
}) => {
  // Get smart suggestions based on context
  const suggestions = useSmartBlockSuggestions({
    sourceBlockType,
    sourceBlockContent,
    connectionType: 'output',
  });

  const getSuggestion = (type: 'text' | 'image' | 'video' | 'imageEdit') => {
    return suggestions.find(s => s.type === type);
  };
  
  // Sort block types by confidence
  const sortedBlockTypes = [...blockTypes].sort((a, b) => {
    const confA = getSuggestion(a.type)?.confidence || 0;
    const confB = getSuggestion(b.type)?.confidence || 0;
    return confB - confA;
  });
  const actionSuggestions = (
    sourceBlockType ? getActionsForSourceDataType(sourceBlockType) : getPaletteMediaActions()
  ).slice(0, 28);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0, width: 244 }}
      exit={{ opacity: 0, scale: 0.96, y: -10 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="z-50 overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={cn(
          'overflow-hidden rounded-[22px] border border-[rgba(249,115,22,0.15)] bg-[#111111]/97 shadow-[0_0_12px_rgba(249,115,22,0.06),0_20px_48px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all',
          isTransforming && 'shadow-[0_0_30px_rgba(249,115,22,0.18)]'
        )}
      >
        <div className="border-b border-[rgba(249,115,22,0.12)] bg-gradient-to-b from-zinc-800/35 to-transparent px-4 py-3">
          <div className="text-[11px] font-semibold tracking-[0.22em] text-zinc-500">
            TURN INTO
          </div>
        </div>

        <div className="max-h-[560px] space-y-1 overflow-y-auto p-2 nowheel">
          {sortedBlockTypes.map((block) => {
            const suggestion = getSuggestion(block.type);
            const isRecommended = Boolean(sourceBlockType) && Boolean(suggestion) && suggestion.confidence > 0.4;

            return (
              <motion.button
                key={block.type}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectType(block.type);
                }}
                whileHover={{ x: 2 }}
                className={cn(
                  'group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm transition-all duration-200',
                  isRecommended
                    ? 'border border-[#f97316]/18 bg-[#201a10] text-zinc-100 hover:border-[#f97316]/30 hover:bg-[#28200f]'
                    : 'text-zinc-300 hover:bg-[#1a1a1a] hover:text-white'
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-xl border transition-colors',
                    isRecommended
                      ? 'border-[#f97316]/25 bg-[#2d2010] text-[#d4a574]'
                      : 'border-white/8 bg-[#171717] text-zinc-400 group-hover:text-zinc-200'
                  )}
                >
                  <block.icon className="h-4 w-4" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{block.label}</div>
                </div>
                <kbd className="rounded-full border border-white/8 bg-[#171717] px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                  {block.shortcut}
                </kbd>
              </motion.button>
            );
          })}

          <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
            Actions
          </div>

          {actionSuggestions.map((action) => {
            const Icon = getActionIcon(action);
            return (
              <motion.button
                key={action.actionId}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelectAction?.(action.actionId);
                }}
                whileHover={{ x: 2 }}
                className="group flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm text-zinc-300 transition-all duration-200 hover:bg-[#1a1a1a] hover:text-white"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-[#171717] text-zinc-400 group-hover:text-zinc-200">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{action.label}</div>
                  <div className="truncate text-[10px] text-zinc-600">{action.workflowType}</div>
                </div>
                {action.batchPolicy === 'cartesian' ? (
                  <kbd className="rounded-full border border-white/8 bg-[#171717] px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                    Batch
                  </kbd>
                ) : null}
              </motion.button>
            );
          })}
        </div>

        <div className="border-t border-[rgba(249,115,22,0.12)] bg-gradient-to-t from-zinc-800/30 to-transparent px-4 py-3">
          <div className="flex items-center justify-between text-[10px] tracking-[0.16em] text-zinc-500">
            <span>Tab: Navigate</span>
            <span>↵ Select</span>
          </div>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
            }}
            className="mt-2 flex items-center gap-2 text-xs text-zinc-500 transition-colors hover:text-zinc-300 group"
          >
            <BookOpen className="h-3.5 w-3.5 transition-transform group-hover:scale-110" />
            <span>Learn about Nodes</span>
          </a>
        </div>
      </div>
    </motion.div>
  );
};
