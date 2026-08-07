import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Sparkles, ChevronDown, Image as ImageIcon,
  Video, Wand2, Check, MoreHorizontal, Zap, TrendingUp, Target
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ImageCountSelector } from './ImageCountSelector';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { normalizeFalModelId } from '@/lib/falModelNormalization';
import { useCatalogModels } from '@/hooks/useCatalogModels';

interface ToolbarModelMeta {
  id: string;
  name: string;
  description: string;
  badge: string;
  icon: LucideIcon;
  color: string;
  category: 'generation' | 'advanced';
}

const toToolbarModelMeta = (
  models: Array<{
    id: string;
    name: string;
    description: string;
    ui_group: 'generation' | 'advanced';
  }>,
  media: 'text' | 'image' | 'video'
): ToolbarModelMeta[] =>
  models.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    badge: m.id.startsWith('gmi/') ? 'GMI' : 'Credits',
    icon:
      media === 'text'
        ? m.id.startsWith('gmi/')
          ? Zap
          : Target
        : m.id.startsWith('gmi/')
        ? Zap
        : m.id.includes('pro') || m.id.includes('premium')
        ? Target
        : TrendingUp,
    color:
      m.id.startsWith('gmi/')
        ? 'text-amber-400'
        : m.id.includes('pro') || m.id.includes('premium')
        ? 'text-purple-400'
        : 'text-blue-400',
    category: m.ui_group === 'advanced' ? 'advanced' : 'generation',
  }));

interface BlockFloatingToolbarProps {
  blockType: 'text' | 'image' | 'video';
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  aspectRatio?: string;
  onAspectRatioChange?: (ratio: string) => void;
  onSettingsClick?: () => void;
  className?: string;
  generationCount?: number;
  onGenerationCountChange?: (count: number) => void;
  onAISuggestion?: () => void;
}

const ASPECT_RATIOS = [
  { label: '1:1', value: '1:1' },
  { label: '16:9', value: '16:9' },
  { label: '9:16', value: '9:16' },
  { label: '4:3', value: '4:3' },
  { label: '3:4', value: '3:4' },
];

export const BlockFloatingToolbar: React.FC<BlockFloatingToolbarProps> = ({
  blockType,
  selectedModel,
  onModelChange,
  aspectRatio,
  onAspectRatioChange,
  onSettingsClick,
  className,
  generationCount = 1,
  onGenerationCountChange,
  onAISuggestion
}) => {
  const [isModelMenuOpen, setIsModelMenuOpen] = useState(false);
  const { models: catalogModels } = useCatalogModels({ autoFetch: true });
  const metadataModels = useMemo(() => {
    const filtered = catalogModels.filter((model) => {
      if (blockType === 'text') {
        return model.media_type === 'text' && model.ui_group === 'generation';
      }
      if (blockType === 'image') {
        return model.media_type === 'image' && model.workflow_type === 'text-to-image';
      }
      return model.media_type === 'video' && model.workflow_type !== 'lip-sync' && model.workflow_type !== 'talking-head';
    });

    return toToolbarModelMeta(filtered, blockType);
  }, [blockType, catalogModels]);
  const generationModels = metadataModels.filter((model) => model.category === 'generation');
  const advancedModels = metadataModels.filter((model) => model.category === 'advanced');
  const normalizedSelectedModel =
    blockType === 'image' || blockType === 'video'
      ? normalizeFalModelId(selectedModel)
      : selectedModel;
  const currentModel =
    metadataModels?.find((m) => m.id === normalizedSelectedModel) || metadataModels?.[0];
  const showAspectRatio = (blockType === 'image' || blockType === 'video') && aspectRatio && onAspectRatioChange;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ 
        duration: 0.2,
        type: 'spring',
        stiffness: 300,
        damping: 25
      }}
      className={cn(
        "flex items-center gap-2 px-3 py-2",
        "bg-gradient-to-br from-zinc-900/98 to-zinc-800/98 backdrop-blur-xl",
        "border border-zinc-700/50 rounded-xl",
        "shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.05)]",
        className
      )}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <TooltipProvider>
        {/* Magic Wand Icon with keyboard hint */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="p-1.5 hover:bg-zinc-800/70 rounded-lg transition-all hover:scale-105 group/btn relative"
              onClick={(e) => {
                e.stopPropagation();
                onAISuggestion?.();
              }}
            >
              <Wand2 className="w-4 h-4 text-zinc-400 group-hover/btn:text-purple-400 transition-colors" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="flex items-center gap-2">
            <span>AI Suggestions</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-zinc-800 rounded">⌘K</kbd>
          </TooltipContent>
        </Tooltip>

        {/* Count Selector for Image/Video blocks */}
        {(blockType === 'image' || blockType === 'video') && onGenerationCountChange && (
          <>
            <div className="w-px h-5 bg-zinc-800" />
            <ImageCountSelector
              value={generationCount}
              onChange={onGenerationCountChange}
              min={1}
              max={20}
            />
          </>
        )}

        {showAspectRatio && (
          <>
            <div className="w-px h-5 bg-zinc-800" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-8 px-2.5 text-[11px] font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-1.5"
                >
                  <span>{aspectRatio}</span>
                  <ChevronDown className="w-3 h-3 text-zinc-500" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-28 bg-zinc-900/98 backdrop-blur-md border-zinc-800"
                align="start"
                sideOffset={6}
              >
                {ASPECT_RATIOS.map((ratio) => (
                  <DropdownMenuItem
                    key={ratio.value}
                    className="text-xs cursor-pointer focus:bg-zinc-800"
                    onClick={() => onAspectRatioChange?.(ratio.value)}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span>{ratio.label}</span>
                      {aspectRatio === ratio.value && <Check className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        <div className="w-px h-5 bg-zinc-800" />

        {/* Enhanced Model Selector Dropdown */}
        <DropdownMenu open={isModelMenuOpen} onOpenChange={setIsModelMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-8 px-3 text-xs font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 flex items-center gap-2"
            >
              {currentModel && <currentModel.icon className={`w-3.5 h-3.5 ${currentModel.color}`} />}
              <span>{currentModel?.name || 'Select Model'}</span>
              <ChevronDown className="w-3 h-3 text-zinc-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent 
            className="w-64 bg-zinc-900/98 backdrop-blur-md border-zinc-800 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
            align="start"
            sideOffset={8}
          >
            {generationModels.length > 0 && (
              <>
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Generation
                </DropdownMenuLabel>
                {generationModels.map((model, index) => (
                  <div key={model.id}>
                    {index > 0 && <DropdownMenuSeparator className="bg-zinc-800" />}
                    <DropdownMenuItem
                      className="flex items-start gap-3 p-3 cursor-pointer focus:bg-zinc-800 group"
                      onClick={() => {
                        onModelChange(model.id);
                        setIsModelMenuOpen(false);
                      }}
                    >
                      <div className="w-8 h-8 rounded-lg bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center flex-shrink-0 group-hover:bg-zinc-700 transition-colors">
                        <model.icon className={`w-4 h-4 ${model.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-sm text-white">{model.name}</span>
                          {normalizedSelectedModel === model.id && (
                            <Check className="w-3.5 h-3.5 text-blue-400 ml-auto flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 leading-tight">{model.description}</p>
                        <Badge
                          className={`mt-1.5 text-[10px] h-4 px-1.5 ${
                            model.badge === 'GMI'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : model.badge === 'Premium'
                              ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                              : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          }`}
                        >
                          {model.badge}
                        </Badge>
                      </div>
                    </DropdownMenuItem>
                  </div>
                ))}
              </>
            )}

            {advancedModels.length > 0 && (
              <>
                {generationModels.length > 0 && <DropdownMenuSeparator className="bg-zinc-700/80" />}
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-zinc-500">
                  Advanced
                </DropdownMenuLabel>
                {advancedModels.map((model, index) => (
                  <div key={model.id}>
                    {index > 0 && <DropdownMenuSeparator className="bg-zinc-800" />}
                    <DropdownMenuItem
                      className="flex items-start gap-3 p-3 cursor-pointer focus:bg-zinc-800 group"
                      onClick={() => {
                        onModelChange(model.id);
                        setIsModelMenuOpen(false);
                      }}
                    >
                      <div className="w-8 h-8 rounded-lg bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center flex-shrink-0 group-hover:bg-zinc-700 transition-colors">
                        <model.icon className={`w-4 h-4 ${model.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold text-sm text-white">{model.name}</span>
                          {normalizedSelectedModel === model.id && (
                            <Check className="w-3.5 h-3.5 text-blue-400 ml-auto flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-zinc-400 leading-tight">{model.description}</p>
                        <Badge className="mt-1.5 text-[10px] h-4 px-1.5 bg-zinc-800 text-zinc-300 border-zinc-700">
                          Advanced
                        </Badge>
                      </div>
                    </DropdownMenuItem>
                  </div>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="w-px h-5 bg-zinc-800" />

        {/* More Options Button with keyboard hint */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSettingsClick?.();
              }}
              className="p-1.5 hover:bg-zinc-800/70 rounded-lg transition-all hover:scale-105 group/btn"
            >
              <MoreHorizontal className="w-4 h-4 text-zinc-400 group-hover/btn:text-white transition-colors" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="flex items-center gap-2">
            <span>More Options</span>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-zinc-800 rounded">⌘.</kbd>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </motion.div>
  );
};
