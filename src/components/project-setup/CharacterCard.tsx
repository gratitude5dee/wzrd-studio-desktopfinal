import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  User,
  Pencil,
  Trash2,
  Sparkles,
  Loader2,
  ImagePlus,
  CheckCircle2,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CharacterEditDialog } from './CharacterEditDialog';
import { Character } from './types';
import { musicTalentRange } from '@/lib/musicPolishAssets';

interface CharacterCardProps {
  character: Character;
  onDelete: (characterId: string) => Promise<void> | void;
  styleReferenceUrl?: string;
  isVoiceSelected?: boolean;
  onSelect?: (character: Character) => void;
  onGenerate?: (character: Character) => Promise<boolean | void> | boolean | void;
  onGenerationTimeout?: (character: Character, message: string) => Promise<void> | void;
  generationTimeoutMs?: number;
}

const DEFAULT_GENERATION_TIMEOUT_MS = 120_000;

const STATUS_BADGE: Record<string, { icon: React.ReactNode; label: string; className: string }> = {
  pending: {
    icon: <Clock className="w-3 h-3" />,
    label: 'Pending',
    className: 'bg-zinc-700/80 text-zinc-300',
  },
  generating: {
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
    label: 'Generating',
    className: 'bg-primary/20 text-primary',
  },
  completed: {
    icon: <CheckCircle2 className="w-3 h-3" />,
    label: 'Ready',
    className: 'bg-green-500/20 text-green-400',
  },
  failed: {
    icon: <AlertCircle className="w-3 h-3" />,
    label: 'Failed',
    className: 'bg-red-500/20 text-red-400',
  },
};

const getCharacterFallback = (name: string) => {
  const hash = Array.from(name || 'character').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return musicTalentRange[hash % musicTalentRange.length];
};

const CharacterCard: React.FC<CharacterCardProps> = ({
  character,
  onDelete,
  styleReferenceUrl,
  isVoiceSelected = false,
  onSelect,
  onGenerate,
  onGenerationTimeout,
  generationTimeoutMs = DEFAULT_GENERATION_TIMEOUT_MS,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const onGenerationTimeoutRef = useRef(onGenerationTimeout);

  const hasImage = !!character.image_url;
  const rawImageStatus = isGenerating
    ? 'generating'
    : (character.image_status || (hasImage ? 'completed' : 'pending'));
  const imageStatus = hasTimedOut && rawImageStatus === 'generating' ? 'failed' : rawImageStatus;
  const isActivelyGenerating = imageStatus === 'generating';
  const timeoutSeconds = Math.round(generationTimeoutMs / 1000);
  const timeoutMessage = `Generation timed out after ${timeoutSeconds} seconds. Try again.`;
  const generationError = hasTimedOut ? timeoutMessage : character.image_generation_error;
  const fallbackImage = getCharacterFallback(character.name);

  useEffect(() => {
    onGenerationTimeoutRef.current = onGenerationTimeout;
  }, [onGenerationTimeout]);

  useEffect(() => {
    if (character.image_status !== 'generating') {
      setHasTimedOut(false);
    }
  }, [character.id, character.image_status]);

  useEffect(() => {
    if (!isActivelyGenerating) return;

    const timeout = window.setTimeout(() => {
      setHasTimedOut(true);
      setIsGenerating(false);
      void onGenerationTimeoutRef.current?.(character, timeoutMessage);
    }, generationTimeoutMs);

    return () => window.clearTimeout(timeout);
  }, [character, generationTimeoutMs, isActivelyGenerating, timeoutMessage]);

  const handleGenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isActivelyGenerating) return;
    if (!onGenerate) {
      toast.error('Character image generation is unavailable');
      return;
    }

    setIsGenerating(true);
    setHasTimedOut(false);
    toast.info('Generating character image...');

    try {
      await onGenerate(character);
    } catch (err) {
      console.error('Generate error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to generate image');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasImage) {
      toast.info('Generate an image first before editing');
      return;
    }
    setShowEditDialog(true);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete ${character.name}?`)) return;

    setIsDeleting(true);
    try {
      await onDelete(character.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const badge = STATUS_BADGE[imageStatus];
  const generateLabel = imageStatus === 'failed' ? 'Retry' : hasImage ? 'Regenerate' : 'Generate';

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
      >
        <Card
          data-voice-character-id={character.id}
          onClick={() => onSelect?.(character)}
          className={cn(
            'relative bg-[#18191E] border border-zinc-700/60 w-56 aspect-[3/4] flex flex-col overflow-hidden transition-all duration-300 group hover:border-zinc-600 hover:shadow-lg hover:shadow-black/20',
            onSelect && 'cursor-pointer',
            isVoiceSelected &&
              'border-[#f97316]/70 ring-2 ring-[#f97316]/50 shadow-[0_0_0_4px_rgba(249,115,22,0.12),0_0_34px_rgba(249,115,22,0.28)]',
          )}
        >
          {isVoiceSelected && (
            <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] border border-[#fed7aa]/40" />
          )}
          {/* Status Badge */}
          {badge && (
            <div className={cn(
              'absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium backdrop-blur-sm',
              badge.className
            )}>
              {badge.icon}
              {badge.label}
            </div>
          )}

          {/* Progress Bar */}
          {isActivelyGenerating && (
            <div className="absolute top-0 left-0 right-0 z-20 h-1 bg-zinc-800">
              <style>{`
                @keyframes character-card-indeterminate {
                  0% { transform: translateX(-120%); }
                  100% { transform: translateX(220%); }
                }
              `}</style>
              <div
                data-testid="character-generation-progress"
                className="h-full w-1/2 rounded-full bg-primary"
                style={{ animation: 'character-card-indeterminate 1.1s ease-in-out infinite' }}
              />
            </div>
          )}

          {/* Image Area */}
          <div className="flex-1 bg-[#0D0E12] flex items-center justify-center relative overflow-hidden">
            <AnimatePresence mode="wait">
              {character.image_url ? (
                <motion.img
                  key="image"
                  src={character.image_url}
                  alt={character.name}
                  initial={{ opacity: 0, scale: 1.05 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              ) : isActivelyGenerating ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center text-center p-4"
                >
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                      <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    </div>
                    <Sparkles className="h-4 w-4 text-primary absolute -top-1 -right-1 animate-pulse" />
                  </div>
                  <p className="text-xs text-zinc-400 mt-3">
                    Generating image...
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-1">This card updates when ready</p>
                </motion.div>
              ) : (
                <motion.div
                  key="placeholder"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden text-zinc-300"
                >
                  <img
                    src={fallbackImage.src}
                    alt={fallbackImage.alt}
                    className="absolute inset-0 h-full w-full object-cover opacity-55"
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/20" />
                  <div className="relative w-16 h-16 rounded-full bg-black/45 border border-white/10 backdrop-blur-sm flex items-center justify-center">
                    <User className="h-10 w-10" />
                  </div>
                  <p className="relative text-xs text-zinc-400 mt-2">No image</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-end p-3">
              {!isActivelyGenerating && (
                <div className="w-full space-y-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    className={cn(
                      'w-full h-8 text-xs bg-white/10 hover:bg-white/20 text-white border-0 backdrop-blur-sm',
                      !hasImage && 'opacity-40 cursor-not-allowed'
                    )}
                    onClick={handleEdit}
                    disabled={!hasImage}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-1.5" />
                    Edit
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full h-8 text-xs bg-primary/20 hover:bg-primary/30 text-primary border-0 backdrop-blur-sm"
                    onClick={handleGenerate}
                    disabled={isActivelyGenerating}
                  >
                    {isGenerating ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <ImagePlus className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    {generateLabel}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full h-8 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border-0 backdrop-blur-sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Delete
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Info Footer */}
          <CardContent className="p-3 bg-[#18191E] border-t border-zinc-800/50">
            <h3 className="font-medium text-sm text-white truncate">{character.name}</h3>
            <p className="text-xs text-zinc-500 mt-0.5 line-clamp-1">
              {character.description || 'No description'}
            </p>
            {imageStatus === 'failed' && generationError && (
              <p className="text-[10px] text-red-400/80 mt-1 truncate">
                {generationError}
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <CharacterEditDialog
        character={character}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        styleReferenceUrl={styleReferenceUrl}
      />
    </>
  );
};

export default CharacterCard;
