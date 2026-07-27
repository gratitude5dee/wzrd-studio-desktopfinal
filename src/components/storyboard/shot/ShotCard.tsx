
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import ShotForm from './ShotForm';
import ShotImage from './ShotImage';
import ShotAudio from './ShotAudio';
import { ShotDetails } from '@/types/storyboardTypes';
import { useShotCardState } from './useShotCardState';
import { useAIGeneration } from './useAIGeneration';
import { useAudioGeneration } from './useAudioGeneration';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2, Clock3, Expand, Film, Image as ImageIcon, Loader2, Move, Trash2, Volume2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ShotCardProps {
  shot: ShotDetails;
  onUpdate: (updates: Partial<ShotDetails>) => Promise<void>;
  onDelete: () => void;
  onConnectionPointClick?: (shotId: string, point: 'left' | 'right') => void;
  connectedPoints?: { left: boolean; right: boolean };
  isSelected?: boolean;
  isVoiceSelected?: boolean;
  isExpanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
}

type MediaStatusTone = 'ready' | 'active' | 'failed' | 'pending' | 'muted';

interface MediaStatusChip {
  key: 'image' | 'video' | 'audio';
  label: string;
  tone: MediaStatusTone;
  Icon: LucideIcon;
  spin?: boolean;
}

const hasMediaOutput = (url: string | null | undefined) =>
  typeof url === 'string' && url.trim().length > 0;

const mediaStatusToneClasses: Record<MediaStatusTone, string> = {
  ready: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200',
  active: 'border-sky-400/20 bg-sky-500/10 text-sky-200',
  failed: 'border-red-400/25 bg-red-500/10 text-red-100',
  pending: 'border-amber-400/20 bg-amber-500/10 text-amber-100',
  muted: 'border-zinc-600/30 bg-zinc-900/60 text-zinc-400'
};

const getImageChip = (
  status: ShotDetails['image_status'],
  imageUrl: string | null,
  isGenerating: boolean
): MediaStatusChip => {
  if (status === 'completed' && hasMediaOutput(imageUrl)) {
    return { key: 'image', label: 'Image ready', tone: 'ready', Icon: CheckCircle2 };
  }
  if (status === 'failed') {
    return { key: 'image', label: 'Image failed', tone: 'failed', Icon: AlertTriangle };
  }
  if (isGenerating || status === 'queued' || status === 'generating') {
    return { key: 'image', label: status === 'queued' ? 'Image queued' : 'Image running', tone: 'active', Icon: Loader2, spin: true };
  }
  return { key: 'image', label: status === 'prompt_ready' ? 'Prompt ready' : 'Image needed', tone: 'pending', Icon: ImageIcon };
};

const getVideoChip = (
  status: ShotDetails['video_status'],
  videoUrl: string | null,
  imageUrl: string | null
): MediaStatusChip => {
  if (status === 'completed' && hasMediaOutput(videoUrl)) {
    return { key: 'video', label: 'Video ready', tone: 'ready', Icon: CheckCircle2 };
  }
  if (status === 'failed') {
    return { key: 'video', label: 'Video failed', tone: 'failed', Icon: AlertTriangle };
  }
  if (status === 'queued' || status === 'generating') {
    return { key: 'video', label: status === 'queued' ? 'Video queued' : 'Video running', tone: 'active', Icon: Loader2, spin: true };
  }
  return {
    key: 'video',
    label: hasMediaOutput(imageUrl) ? 'Video needed' : 'Video waits',
    tone: hasMediaOutput(imageUrl) ? 'pending' : 'muted',
    Icon: hasMediaOutput(imageUrl) ? Film : Clock3
  };
};

const getAudioChip = (
  status: ShotDetails['audio_status'],
  audioUrl: string | null,
  hasDialogue: boolean,
  isGenerating: boolean
): MediaStatusChip => {
  if (!hasDialogue) {
    return { key: 'audio', label: 'No dialogue', tone: 'muted', Icon: Volume2 };
  }
  if (status === 'completed' && hasMediaOutput(audioUrl)) {
    return { key: 'audio', label: 'Audio ready', tone: 'ready', Icon: CheckCircle2 };
  }
  if (status === 'failed') {
    return { key: 'audio', label: 'Audio failed', tone: 'failed', Icon: AlertTriangle };
  }
  if (isGenerating || status === 'generating') {
    return { key: 'audio', label: 'Audio running', tone: 'active', Icon: Loader2, spin: true };
  }
  return { key: 'audio', label: 'Audio needed', tone: 'pending', Icon: Volume2 };
};

export const ShotCard: React.FC<ShotCardProps> = ({ 
  shot, 
  onUpdate, 
  onDelete, 
  onConnectionPointClick,
  connectedPoints = { left: false, right: false },
  isSelected = false,
  isVoiceSelected = false,
  isExpanded: controlledExpanded,
  onExpandedChange,
}) => {
  const {
    // State
    shotType,
    promptIdea,
    dialogue,
    soundEffects,
    localVisualPrompt,
    localImageUrl,
    localImageStatus,
    localImageProgress,
    localAudioUrl,
    localAudioStatus,
    localVideoUrl,
    localVideoStatus,
    isDeleting,
    isSaving,
    isGeneratingPrompt,
    isGeneratingImage,
    isGeneratingAudio,
    isGeneratingRef,
    
    // Setters
    setShotType,
    setPromptIdea,
    setDialogue,
    setSoundEffects,
    setLocalVisualPrompt,
    setLocalImageStatus,
    setLocalAudioUrl,
    setLocalAudioStatus,
    setLocalVideoUrl,
    setLocalVideoStatus,
    setIsDeleting,
    setIsGeneratingPrompt,
    setIsGeneratingImage,
    setIsGeneratingAudio,
    
    // Handlers
    handleShotTypeChange
  } = useShotCardState(shot, onUpdate);

  // Create additional state for expanded view and editing mode
  const [internalExpanded, setInternalExpanded] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const isExpanded = controlledExpanded ?? internalExpanded;
  const setIsExpanded = (expanded: boolean) => {
    if (controlledExpanded === undefined) {
      setInternalExpanded(expanded);
    }
    onExpandedChange?.(expanded);
  };

  const { handleGenerateVisualPrompt, handleGenerateImage } = useAIGeneration({
    shotId: shot.id,
    isGeneratingRef,
    setIsGeneratingPrompt,
    setIsGeneratingImage,
    setLocalVisualPrompt,
    setLocalImageStatus,
    localVisualPrompt
  });

  const { handleGenerateAudio } = useAudioGeneration({
    shotId: shot.id,
    isGeneratingRef,
    setIsGeneratingAudio,
    setLocalAudioUrl,
    setLocalAudioStatus
  });

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: shot.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  // Create proper event handlers for text inputs that work with the state setters
  const handlePromptIdeaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPromptIdea(e.target.value);
  };

  const handleDialogueChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDialogue(e.target.value);
  };

  const handleSoundEffectsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSoundEffects(e.target.value);
  };

  // Handlers for edit form
  const handleSave = async () => {
    setIsEditing(false);
    // No Promise is being returned here, which was causing the type error
    // But our updated interface will handle this correctly now
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleAddShotType = () => {
    setIsEditing(true);
  };

  const validateAndDelete = () => {
    if (window.confirm('Are you sure you want to delete this shot?')) {
      setIsDeleting(true);
      onDelete();
    }
  };

  const hasDialogueContent = !!dialogue?.trim();
  const mediaStatusChips: MediaStatusChip[] = [
    getImageChip(localImageStatus, localImageUrl, isGeneratingPrompt || isGeneratingImage),
    getVideoChip(localVideoStatus || 'pending', localVideoUrl, localImageUrl),
    getAudioChip(localAudioStatus, localAudioUrl, hasDialogueContent, isGeneratingAudio)
  ];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ 
        y: -2,
        transition: { duration: 0.15, ease: "easeOut" }
      }}
      style={style}
      ref={setNodeRef}
      data-voice-shot-id={shot.id}
      className={cn(
        "relative flex flex-col rounded-2xl backdrop-blur-xl w-[280px] min-h-[320px] group",
        "shot-card-glass transition-all duration-300",
        isSelected
          ? 'border-2 border-[#f97316]/60 ring-2 ring-[#f97316]/45 shadow-[0_0_0_4px_rgba(249,115,22,0.12),0_0_34px_rgba(249,115,22,0.24),0_8px_32px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.04)]'
          : isVoiceSelected
            ? 'border-2 border-[#f97316]/50 ring-2 ring-[#f97316]/30 shadow-[0_0_12px_rgba(249,115,22,0.3),0_8px_32px_rgba(0,0,0,0.28)]'
            : 'border border-white/[0.08] hover:border-white/[0.15]',
        "shadow-[0_4px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.03)]",
        "hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.05)]",
        isExpanded && "min-h-[480px] w-[360px]"
      )}
    >
      {/* Connection Points - Glass style */}
      <div 
        className={cn(
          "absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-30",
          "w-3.5 h-3.5 rounded-full transition-all duration-300 cursor-crosshair",
          connectedPoints.left
            ? "border-2 border-[#f97316]/50 bg-[#f97316]/85 shadow-[0_0_16px_rgba(249,115,22,0.45)] animate-pulse opacity-100"
            : "bg-[rgba(24,24,32,0.8)] border-2 border-white/[0.15] opacity-0 group-hover:opacity-100 hover:w-4 hover:h-4 hover:bg-[#f97316]/80 hover:border-[#f97316]/40 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
        )}
        onClick={(e) => {
          e.stopPropagation();
          onConnectionPointClick?.(shot.id, 'left');
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white">
          {connectedPoints.left ? '✓' : '+'}
        </div>
      </div>
      
      <div 
        className={cn(
          "absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-30",
          "w-3.5 h-3.5 rounded-full transition-all duration-300 cursor-crosshair",
          connectedPoints.right
            ? "border-2 border-[#f97316]/50 bg-[#f97316]/85 shadow-[0_0_16px_rgba(249,115,22,0.45)] animate-pulse opacity-100"
            : "bg-[rgba(24,24,32,0.8)] border-2 border-white/[0.15] opacity-0 group-hover:opacity-100 hover:w-4 hover:h-4 hover:bg-[#f97316]/80 hover:border-[#f97316]/40 hover:shadow-[0_0_16px_rgba(249,115,22,0.35)]"
        )}
        onClick={(e) => {
          e.stopPropagation();
          onConnectionPointClick?.(shot.id, 'right');
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white">
          {connectedPoints.right ? '✓' : '+'}
        </div>
      </div>

      {/* Drag handle - Glass style */}
      <div
        {...attributes}
        {...listeners}
        className={cn(
          "absolute top-2 left-2 z-20 cursor-grab active:cursor-grabbing",
          "bg-[rgba(0,0,0,0.4)] hover:bg-[rgba(0,0,0,0.6)]",
          "backdrop-blur-md p-1.5 rounded-xl border border-white/[0.1]",
          "opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-auto",
          "shadow-[0_2px_12px_rgba(0,0,0,0.4)]"
        )}
        style={{ touchAction: 'none' }}
      >
        <Move className="h-4 w-4 text-zinc-400 pointer-events-none" />
      </div>
      
      {/* Expand/Collapse button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-10 z-30 h-8 w-8 p-1 bg-black/30 hover:bg-black/50 backdrop-blur-sm opacity-70 hover:opacity-100 transition-opacity pointer-events-auto"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Expand className="h-5 w-5 text-white" />
      </Button>
      
      {/* Delete button */}
      <Button
        variant="ghost"
        size="icon"
        className="absolute bottom-2 right-2 z-30 h-8 w-8 p-1 bg-black/30 hover:bg-black/50 backdrop-blur-sm opacity-70 hover:opacity-100 transition-opacity text-red-400 hover:text-red-300 pointer-events-auto"
        onClick={validateAndDelete}
        disabled={isDeleting}
      >
        <Trash2 className="h-5 w-5" />
      </Button>

      {/* Shot number badge - Glass pill style */}
      <motion.div 
        className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/10 bg-[#141414] px-2.5 py-1 text-[10px] font-semibold text-[#d4a574] backdrop-blur-md"
        whileHover={{ scale: 1.05 }}
      >
        Shot {shot.shot_number}
      </motion.div>

      {shot.review_status && shot.review_status !== 'not_reviewed' ? (
        <div className="absolute top-11 left-1/2 z-10 -translate-x-1/2">
          <Badge variant={shot.review_status === 'clear' ? 'secondary' : 'destructive'} className="text-[10px]">
            {shot.review_status}
          </Badge>
        </div>
      ) : null}

      {/* Image section */}
      <div className="flex-shrink-0 pointer-events-auto" style={{ touchAction: 'auto' }}>
        <ShotImage
          shotId={shot.id}
          imageUrl={localImageUrl}
          videoUrl={localVideoUrl}
          videoStatus={localVideoStatus || 'pending'}
          status={localImageStatus}
          imageProgress={localImageProgress}
          isGenerating={isGeneratingPrompt || isGeneratingImage}
          hasVisualPrompt={!!localVisualPrompt}
          visualPrompt={localVisualPrompt}
          upscaleStatus={shot.upscale_status}
          onGenerateImage={handleGenerateImage}
          onGenerateVisualPrompt={handleGenerateVisualPrompt}
          onUpdate={(updates) => onUpdate(updates)}
        />
      </div>

      <div className="flex flex-wrap gap-1.5 px-3 pt-2" aria-label="Shot media status">
        {mediaStatusChips.map(({ key, label, tone, Icon, spin }) => (
          <div
            key={key}
            className={cn(
              'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium leading-none',
              mediaStatusToneClasses[tone]
            )}
          >
            <Icon className={cn('h-3 w-3 shrink-0', spin && 'animate-spin')} />
            <span className="truncate">{label}</span>
          </div>
        ))}
      </div>

      {/* Shot details */}
      <div className="flex-1 p-3 flex flex-col justify-between">
        {isEditing ? (
          <ShotForm
            id={shot.id}
            shotType={shotType}
            promptIdea={promptIdea}
            dialogue={dialogue}
            soundEffects={soundEffects}
            visualPrompt={localVisualPrompt}
            imageStatus={localImageStatus}
            audioUrl={localAudioUrl}
            audioStatus={localAudioStatus}
            isGeneratingPrompt={isGeneratingPrompt}
            isGeneratingImage={isGeneratingImage}
            isGeneratingAudio={isGeneratingAudio}
            isGeneratingRef={isGeneratingRef}
            onShotTypeChange={handleShotTypeChange}
            onPromptIdeaChange={handlePromptIdeaChange}
            onDialogueChange={handleDialogueChange}
            onSoundEffectsChange={handleSoundEffectsChange}
            setLocalVisualPrompt={setLocalVisualPrompt}
            setLocalImageStatus={setLocalImageStatus}
            setIsGeneratingPrompt={setIsGeneratingPrompt}
            setIsGeneratingImage={setIsGeneratingImage}
            setLocalAudioUrl={setLocalAudioUrl}
            setLocalAudioStatus={setLocalAudioStatus}
            setIsGeneratingAudio={setIsGeneratingAudio}
            onSave={handleSave}
            onCancel={handleCancel}
            isExpanded={isExpanded}
          />
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex-1 mb-2">
              {!shotType ? (
                <button 
                  onClick={handleAddShotType}
                  className="text-xs text-zinc-400 hover:text-zinc-300 mb-1 hover:underline"
                >
                  + Add shot type
                </button>
              ) : (
                <div className="mb-1 text-xs text-[#d4a574]">
                  {shotType.replace(/_/g, ' ')}
                </div>
              )}
              
              <div className="text-xs text-zinc-400 line-clamp-3 mb-2">
                {promptIdea || "No description"}
              </div>
              
              {isExpanded && localVisualPrompt && (
                <div className="text-xs text-zinc-500 mt-1 border-t border-white/10 pt-1">
                  <span className="text-zinc-400 font-medium">Visual Prompt:</span>
                  <p className="line-clamp-4">{localVisualPrompt}</p>
                </div>
              )}
            </div>

            <div className="flex flex-col mt-auto">
              {dialogue && (
                <div className="text-xs text-zinc-400 border-t border-white/10 pt-1 mb-1">
                  <span className="text-zinc-300 font-medium">Dialogue:</span>
                  <p className="italic line-clamp-2">{dialogue}</p>
                </div>
              )}
              
              <div className="flex justify-between mt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-1 text-xs text-[#fdba74] hover:bg-[#1a1510] hover:text-[#FDE8D0]"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </Button>
              </div>
              
              {/* Audio generation */}
              <ShotAudio
                audioUrl={localAudioUrl}
                status={localAudioStatus}
                isGenerating={isGeneratingAudio}
                hasDialogue={hasDialogueContent}
                onGenerateAudio={handleGenerateAudio}
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};
