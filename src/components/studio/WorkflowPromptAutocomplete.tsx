import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Workflow, Type, Image, Video, Sparkles, Music, Disc3, Mic2, Megaphone, Film } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useComputeFlowStore } from '@/store/computeFlowStore';

export interface AutocompleteSuggestion {
  id: string;
  label: string;
  prompt: string;
  category: 'workflow' | 'single-node' | 'action';
  icon: LucideIcon;
}

/** Music-industry workflow starters + general single-node helpers */
const BASE_SUGGESTIONS: AutocompleteSuggestion[] = [
  { id: 'music-video-treatment', label: 'Music video treatment', prompt: 'Generate a music video treatment workflow with mood boards, shot list stills, and reference-to-video clips', category: 'workflow', icon: Film },
  { id: 'album-cover-campaign', label: 'Album cover campaign', prompt: 'Create an album cover campaign workflow with hero art, alternates, story crops, and teaser videos', category: 'workflow', icon: Disc3 },
  { id: 'tour-visual-loop', label: 'Tour visual loop pack', prompt: 'Build a tour visual loop pack with looping stage visuals in multiple aspect ratios', category: 'workflow', icon: Music },
  { id: 'artist-promo-pack', label: 'Artist promo pack', prompt: 'Generate an artist promo pack with press shots, EPK header, social avatars, and lyric story templates', category: 'workflow', icon: Megaphone },
  { id: 'lyric-video-starter', label: 'Lyric video / visualizer', prompt: 'Generate a lyric video starter with typography frames, kinetic backgrounds, and visualizer clips', category: 'workflow', icon: Mic2 },
  { id: 'add-text-node', label: 'Add a text generation node', prompt: 'Add a text node for lyrics, treatment notes, or descriptions', category: 'single-node', icon: Type },
  { id: 'add-image-node', label: 'Add an image generation node', prompt: 'Add an image node for visual design', category: 'single-node', icon: Image },
  { id: 'add-video-node', label: 'Add a video generation node', prompt: 'Add a video node for video creation', category: 'single-node', icon: Video },
  { id: 'add-audio-node', label: 'Add an audio generation node', prompt: 'Add an audio node for sound design or score', category: 'single-node', icon: Music },
  { id: 'fresh-start', label: 'Start with a music workflow', prompt: 'Generate a complete music-industry creative workflow from scratch', category: 'workflow', icon: Sparkles },
  { id: 'fresh-generic', label: 'Start with a generic workflow', prompt: 'Generate a creative content workflow from scratch', category: 'workflow', icon: Workflow },
];

/** Returns context-aware suggestions based on canvas state */
function getContextualSuggestions(
  nodeKinds: string[],
  query: string
): AutocompleteSuggestion[] {
  const suggestions = [...BASE_SUGGESTIONS];

  const hasImage = nodeKinds.includes('Image');
  const hasText = nodeKinds.includes('Text');
  const hasVideo = nodeKinds.includes('Video');

  // Add contextual suggestions based on what's already on the canvas
  if (hasText && !hasImage) {
    suggestions.unshift({
      id: 'ctx-visualize-text',
      label: 'Visualize text as images',
      prompt: 'Add image nodes to visualize the text content on the canvas',
      category: 'action',
      icon: Image,
    });
  }

  if (hasImage && !hasVideo) {
    suggestions.unshift({
      id: 'ctx-animate-images',
      label: 'Animate images to video',
      prompt: 'Add video nodes to animate the images on the canvas',
      category: 'action',
      icon: Video,
    });
  }

  if (hasText && hasImage && !hasVideo) {
    suggestions.unshift({
      id: 'ctx-full-pipeline',
      label: 'Complete content pipeline',
      prompt: 'Complete the content pipeline by adding video generation from the existing text and images',
      category: 'workflow',
      icon: Workflow,
    });
  }

  if (nodeKinds.length === 0) {
    suggestions.unshift({
      id: 'ctx-start-fresh',
      label: 'Start with a content workflow',
      prompt: 'Generate a complete content creation workflow from scratch',
      category: 'workflow',
      icon: Sparkles,
    });
  }

  // Filter by query
  if (!query.trim()) {
    return suggestions.slice(0, 6);
  }

  const lowerQuery = query.toLowerCase();
  return suggestions
    .filter(
      (s) =>
        s.label.toLowerCase().includes(lowerQuery) ||
        s.prompt.toLowerCase().includes(lowerQuery)
    )
    .slice(0, 6);
}

interface WorkflowPromptAutocompleteProps {
  query: string;
  visible: boolean;
  onSelect: (suggestion: AutocompleteSuggestion) => void;
  className?: string;
}

export function WorkflowPromptAutocomplete({
  query,
  visible,
  onSelect,
  className,
}: WorkflowPromptAutocompleteProps) {
  const nodeDefinitions = useComputeFlowStore((state) => state.nodeDefinitions);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const nodeKinds = useMemo(
    () => [...new Set(nodeDefinitions.map((n) => n.kind))],
    [nodeDefinitions]
  );

  const suggestions = useMemo(
    () => getContextualSuggestions(nodeKinds, query),
    [nodeKinds, query]
  );

  // Reset active index when suggestions change
  useEffect(() => {
    setActiveIndex(0);
  }, [suggestions.length, query]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!visible || suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        onSelect(suggestions[activeIndex]);
      }
    },
    [visible, suggestions, activeIndex, onSelect]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!visible || suggestions.length === 0) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        ref={listRef}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
        className={cn(
          'absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-[18px] border border-white/10 bg-[#111111]/98 shadow-[0_-12px_48px_rgba(0,0,0,0.4)] backdrop-blur-2xl',
          className
        )}
        role="listbox"
        aria-label="Workflow suggestions"
      >
        <div className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500">
          Suggestions
        </div>
        <div className="max-h-[280px] overflow-y-auto pb-1">
          {suggestions.map((suggestion, index) => {
            const Icon = suggestion.icon;
            const isActive = index === activeIndex;
            return (
              <button
                key={suggestion.id}
                role="option"
                aria-selected={isActive}
                onClick={() => onSelect(suggestion)}
                onMouseEnter={() => setActiveIndex(index)}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                  isActive
                    ? 'bg-white/8 text-white'
                    : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border',
                    isActive
                      ? 'border-orange-500/30 bg-orange-500/10 text-orange-400'
                      : 'border-white/8 bg-[#151515] text-zinc-400'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{suggestion.label}</p>
                  <p className="truncate text-[11px] text-zinc-500">
                    {suggestion.category === 'workflow'
                      ? 'Multi-node workflow'
                      : suggestion.category === 'single-node'
                        ? 'Single node'
                        : 'Action'}
                  </p>
                </div>
                {isActive && (
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400">
                    Tab
                  </kbd>
                )}
              </button>
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default WorkflowPromptAutocomplete;
