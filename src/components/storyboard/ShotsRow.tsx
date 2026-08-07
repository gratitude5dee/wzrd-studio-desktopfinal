import React, { useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { AnimatePresence, motion } from 'framer-motion';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, AlertCircle, Sparkles, Loader2, CircleStop, Image, Film } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ShotCard } from './shot';
import ShotConnectionLines from './shot/ShotConnectionLines';
import ShotCardSkeleton from './shot/ShotCardSkeleton';
import { supabaseService } from '@/services/supabaseService';
import { toast } from 'sonner';
import { ShotDetails } from '@/types/storyboardTypes';
import { cn } from '@/lib/utils';
import { useShotStream, ShotStreamStatus } from '@/hooks/useShotStream';
import ShotStreamProgress from './shot/ShotStreamProgress';
import { useAutoGenerate } from '@/hooks/useAutoGenerate';
import { supabase } from '@/integrations/supabase/client';
import { getShotImageCredits, getShotVideoCredits } from '@/lib/constants/credits';
import { useProjectSettingsStore } from '@/store/projectSettingsStore';
import { ConfirmGenerateDialog } from '@/components/ui/ConfirmGenerateDialog';
import { useVoiceSelection } from '@/voice/VoiceSelectionContext';
import { DitherGradient } from '@/components/dither-kit';
import { ditherBloom, ditherColors } from '@/lib/ditherTheme';

interface ShotConnection {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePoint: 'left' | 'right';
  targetPoint: 'left' | 'right';
}

interface ActiveConnection {
  sourceId: string;
  sourcePoint: 'left' | 'right';
  cursorX: number;
  cursorY: number;
}

interface ShotsRowProps {
  sceneId: string;
  sceneNumber: number;
  projectId: string;
  onSceneDelete?: (sceneId: string) => void;
  isSelected?: boolean;
}

const buildShotFromPartial = (
  partial: Partial<ShotDetails>,
  defaults: { sceneId: string; projectId: string; fallbackNumber: number }
): ShotDetails => ({
  id: partial.id ?? crypto.randomUUID(),
  scene_id: partial.scene_id ?? defaults.sceneId,
  project_id: partial.project_id ?? defaults.projectId,
  shot_number: partial.shot_number ?? defaults.fallbackNumber,
  shot_type: partial.shot_type ?? 'medium',
  prompt_idea: partial.prompt_idea ?? '',
  visual_prompt: partial.visual_prompt ?? '',
  dialogue: partial.dialogue ?? '',
  sound_effects: partial.sound_effects ?? '',
  image_url: partial.image_url ?? null,
  image_asset_id: partial.image_asset_id ?? null,
  image_status: partial.image_status ?? 'completed',
  video_url: partial.video_url ?? null,
  video_asset_id: partial.video_asset_id ?? null,
  video_status: partial.video_status ?? 'pending',
  luma_generation_id: partial.luma_generation_id ?? null,
  audio_url: partial.audio_url ?? null,
  audio_status: partial.audio_status ?? 'pending',
  shot_packet: partial.shot_packet ?? null,
  evaluation_summary: partial.evaluation_summary ?? null,
  review_status: partial.review_status ?? 'not_reviewed',
  failure_reason: partial.failure_reason ?? null,
  created_at: partial.created_at ?? new Date().toISOString(),
  updated_at: partial.updated_at ?? new Date().toISOString()
});

const placeholderCopy: Record<ShotStreamStatus, string> = {
  creating: 'Creating shot shell…',
  drafting: 'Drafting narrative…',
  enriching: 'Enriching details…',
  ready: 'Shot ready'
};

const ShotsRow = ({ sceneId, sceneNumber, projectId, onSceneDelete, isSelected = false }: ShotsRowProps) => {
  const { settings: projectSettings } = useProjectSettingsStore();
  const { selectedTargets, expandedShotId, setExpandedShotId, selectTarget } = useVoiceSelection();
  const selectedImageModel = projectSettings?.baseImageModel;
  const [showConfirmGenerate, setShowConfirmGenerate] = useState(false);
  const selectedVideoModel = projectSettings?.baseVideoModel;
  const [shots, setShots] = useState<ShotDetails[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [connections, setConnections] = useState<ShotConnection[]>([]);
  const [activeConnection, setActiveConnection] = useState<ActiveConnection | null>(null);
  const [shotRefs, setShotRefs] = useState<Map<string, { x: number; y: number; width: number; height: number }>>(new Map());
  const [generationState, setGenerationState] = useState<'idle' | 'preparing' | 'generating' | 'visualizing' | 'complete'>('idle');
  const [generationProgress, setGenerationProgress] = useState({ completed: 0, total: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const autoStartRef = useRef(false);
  const lastMetaRequestRef = useRef<string | null>(null);
  
  // Track user-edited shots to preserve edits across regeneration cycles
  const userEditedShotsRef = useRef<Set<string>>(new Set());

  // Auto-generate hook for two-phase image/video generation
  const { 
    state: autoGenState, 
    startAutoGenerate, 
    cancelAutoGenerate,
    nextPhase, 
    isProcessing: isAutoGenerating 
  } = useAutoGenerate(sceneId);

  const streamingEnabled = (import.meta.env.VITE_ENABLE_SHOT_STREAM ?? 'true') !== 'false';
  const streamTelemetryEnabled = (import.meta.env.VITE_ENABLE_STREAM_TELEMETRY ?? 'true') !== 'false';

  const handleStreamError = useCallback((error: Error) => {
    toast.error(`Shot streaming failed: ${error.message}`);
  }, []);

  const handleStreamReady = useCallback(
    (shot: Partial<ShotDetails>) => {
      if (!shot.id) return;
      startTransition(() => {
        setShots(prev => {
          const existingIndex = prev.findIndex(item => item.id === shot.id);
          if (existingIndex >= 0) {
            // If the shot has user edits, only update non-content fields
            // (e.g., image_url, image_status) to preserve user modifications
            if (userEditedShotsRef.current.has(shot.id)) {
              const next = [...prev];
              const preserved = { ...shot };
              // Remove user-editable fields to avoid overwriting
              delete preserved.prompt_idea;
              delete preserved.visual_prompt;
              delete preserved.dialogue;
              delete preserved.sound_effects;
              delete preserved.shot_type;
              next[existingIndex] = { ...next[existingIndex], ...preserved };
              return next;
            }
            const next = [...prev];
            next[existingIndex] = { ...next[existingIndex], ...shot };
            return next;
          }
          const fallback = buildShotFromPartial(shot, {
            sceneId,
            projectId,
            fallbackNumber: prev.length + 1
          });
          return [...prev, fallback];
        });
      });
    },
    [projectId, sceneId]
  );

  const { isStreaming, latencyMs, messages, meta, phaseDurations, progress, start: startStream, cancel: cancelStream } = useShotStream(projectId, {
    onShotReady: handleStreamReady,
    onError: handleStreamError
  });

  const streamingPlaceholders = useMemo(
    () => messages.filter(message => message.status !== 'ready'),
    [messages]
  );

  const currentStatus = useMemo<ShotStreamStatus | null>(() => {
    if (streamingPlaceholders.length > 0) {
      return streamingPlaceholders[streamingPlaceholders.length - 1]?.status ?? null;
    }
    const latest = [...messages].reverse().find(message => message.status);
    return latest?.status ?? null;
  }, [messages, streamingPlaceholders]);

  const showStreamTelemetry = streamTelemetryEnabled && streamingEnabled && (isStreaming || progress > 0 || !!meta);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const hasShots = shots.length > 0;
  const hasPlaceholders = streamingEnabled && streamingPlaceholders.length > 0;

  const startShotGeneration = useCallback(() => {
    if (!streamingEnabled) return;
    performance.mark(`shot-stream:request:${sceneId}`);
    startStream({
      sceneId,
      existingShots: shots.map(s => ({ id: s.id, shot_number: s.shot_number }))
    });
    toast.info('Generating shots', {
      description: 'Streaming creative beats as they arrive'
    });
  }, [streamingEnabled, startStream, sceneId, shots]);

  // Fetch shots for this scene
  useEffect(() => {
    autoStartRef.current = false;
  }, [sceneId]);

  useEffect(() => {
    const fetchShots = async () => {
      setIsLoading(true);
      try {
        const fetched = await supabaseService.shots.listByScene(sceneId);
        setShots(fetched as ShotDetails[]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Failed to load shots: ${message}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchShots();
  }, [sceneId]);

  useEffect(() => {
    if (!streamingEnabled || autoStartRef.current) return;
    if (!isLoading && shots.length === 0) {
      autoStartRef.current = true;
      startShotGeneration();
    }
  }, [streamingEnabled, isLoading, shots.length, startShotGeneration]);

  useEffect(() => {
    if (!streamTelemetryEnabled || !meta) return;
    if (meta.requestId === lastMetaRequestRef.current) return;
    lastMetaRequestRef.current = meta.requestId;
  }, [meta, streamTelemetryEnabled]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setIsSavingOrder(true);
      try {
        const oldIndex = shots.findIndex((item) => item.id === active.id);
        const newIndex = shots.findIndex((item) => item.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const reorderedItems = arrayMove(shots, oldIndex, newIndex).map((item, index) => ({
          ...item,
          shot_number: index + 1,
        }));

        setShots(reorderedItems);

        // Batch reorder: first set all to negative values to avoid unique constraint
        const negativeUpdates = reorderedItems.map((shot, idx) =>
          supabaseService.shots.update(shot.id, { shot_number: -(idx + 1) })
        );
        await Promise.all(negativeUpdates);

        // Then set final values
        const finalUpdates = reorderedItems.map((shot) =>
          supabaseService.shots.update(shot.id, { shot_number: shot.shot_number })
        );
        await Promise.all(finalUpdates);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`Failed to save shot order: ${message}`);
        // Refresh shots on error to get correct state
        try {
          const fetched = await supabaseService.shots.listByScene(sceneId);
          setShots(fetched as ShotDetails[]);
        } catch {
          // Keep the optimistic list if the refresh also fails.
        }
      } finally {
        setIsSavingOrder(false);
      }
    }
  };

  const addShot = async () => {
    try {
      const newShotNumber = shots.length > 0
        ? Math.max(...shots.map(s => s.shot_number)) + 1
        : 1;

      const shotId = await supabaseService.shots.create({
        scene_id: sceneId,
        project_id: projectId,
        shot_number: newShotNumber,
        shot_type: 'medium',
        prompt_idea: '',
        image_status: 'pending'
      });

      const newShot = buildShotFromPartial(
        {
          id: shotId,
          shot_number: newShotNumber,
          shot_type: 'medium',
          prompt_idea: '',
          image_status: 'pending',
          image_url: '',
          audio_url: '',
          video_url: null,
          luma_generation_id: ''
        },
        { sceneId, projectId, fallbackNumber: newShotNumber }
      );

      setShots(prev => [...prev, newShot]);
      toast.success('Shot added');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to add shot: ${message}`);
    }
  };

  const handleDeleteShot = async (shotId: string) => {
    try {
      await supabaseService.shots.delete(shotId);
      setShots(current => current.filter(shot => shot.id !== shotId));
      toast.success('Shot deleted');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to delete shot: ${message}`);
    }
  };

  const handleDeleteScene = async () => {
    if (!onSceneDelete) return;

    if (window.confirm(`Are you sure you want to delete Scene ${sceneNumber}? This will also delete all shots in this scene.`)) {
      setIsDeleting(true);
      try {
        await onSceneDelete(sceneId);
      } catch (error) {
        setIsDeleting(false);
      }
    }
  };

  const handleShotUpdate = async (shotId: string, updates: Partial<ShotDetails>) => {
    try {
      // Mark shot as user-edited to preserve edits during regeneration
      userEditedShotsRef.current.add(shotId);
      await supabaseService.shots.update(shotId, updates);
      setShots(prev => prev.map(shot =>
        shot.id === shotId ? { ...shot, ...updates } : shot
      ));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to update shot: ${message}`);
    }
  };

  const handleConnectionPointClick = (shotId: string, point: 'left' | 'right') => {
    if (activeConnection) {
      if (activeConnection.sourceId !== shotId) {
        const newConnection: ShotConnection = {
          id: `${activeConnection.sourceId}-${shotId}`,
          sourceId: activeConnection.sourceId,
          targetId: shotId,
          sourcePoint: activeConnection.sourcePoint,
          targetPoint: point
        };
        setConnections(prev => [...prev, newConnection]);
        toast.success('Shots connected');
      }
      setActiveConnection(null);
    } else {
      setActiveConnection({
        sourceId: shotId,
        sourcePoint: point,
        cursorX: 0,
        cursorY: 0
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (activeConnection && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setActiveConnection({
        ...activeConnection,
        cursorX: e.clientX - rect.left,
        cursorY: e.clientY - rect.top
      });
    }
  };

  const handleMouseUp = () => {
    if (activeConnection) {
      setActiveConnection(null);
    }
  };

  const getConnectedPoints = (shotId: string) => {
    return {
      left: connections.some(c => (c.sourceId === shotId && c.sourcePoint === 'left') || (c.targetId === shotId && c.targetPoint === 'left')),
      right: connections.some(c => (c.sourceId === shotId && c.sourcePoint === 'right') || (c.targetId === shotId && c.targetPoint === 'right'))
    };
  };

  useEffect(() => {
    const updateRefs = () => {
      const newRefs = new Map();
      shots.forEach(shot => {
        const element = document.querySelector(`[data-shot-id="${shot.id}"]`);
        if (element) {
          const rect = element.getBoundingClientRect();
          const containerRect = containerRef.current?.getBoundingClientRect();
          if (containerRect) {
            newRefs.set(shot.id, {
              x: rect.left - containerRect.left,
              y: rect.top - containerRect.top,
              width: rect.width,
              height: rect.height
            });
          }
        }
      });
      setShotRefs(newRefs);
    };

    const timer = setTimeout(updateRefs, 100);
    return () => clearTimeout(timer);
  }, [shots]);

  // Real-time subscription for shot changes (insert/update/delete)
  useEffect(() => {
    const channel = supabase
      .channel(`shots-realtime-${sceneId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shots',
          filter: `scene_id=eq.${sceneId}`
        },
        (payload) => {
          startTransition(() => {
            if (payload.eventType === 'INSERT') {
              const insertedShot = payload.new as ShotDetails;
              setShots((prev) => {
                if (prev.some((shot) => shot.id === insertedShot.id)) return prev;
                return [...prev, insertedShot].sort((a, b) => a.shot_number - b.shot_number);
              });
              return;
            }

            if (payload.eventType === 'UPDATE') {
              const updatedShot = payload.new as ShotDetails;
              setShots((prev) =>
                prev
                  .map((shot) => {
                    if (shot.id !== updatedShot.id) return shot;
                    // If user has edited this shot, only merge non-content fields
                    // to preserve user modifications to prompts/dialogue
                    if (userEditedShotsRef.current.has(shot.id)) {
                      return {
                        ...shot,
                        image_url: updatedShot.image_url ?? shot.image_url,
                        image_status: updatedShot.image_status ?? shot.image_status,
                        video_url: updatedShot.video_url ?? shot.video_url,
                        video_status: updatedShot.video_status ?? shot.video_status,
                        audio_url: updatedShot.audio_url ?? shot.audio_url,
                        audio_status: updatedShot.audio_status ?? shot.audio_status,
                        failure_reason: updatedShot.failure_reason ?? shot.failure_reason,
                        updated_at: updatedShot.updated_at ?? shot.updated_at,
                      };
                    }
                    return { ...shot, ...updatedShot };
                  })
                  .sort((a, b) => a.shot_number - b.shot_number)
              );
              return;
            }

            if (payload.eventType === 'DELETE') {
              const deletedShot = payload.old as ShotDetails;
              setShots((prev) => prev.filter((shot) => shot.id !== deletedShot.id));
            }
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sceneId]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className={cn(
        'relative group mb-8 p-6 rounded-[24px] backdrop-blur-xl transition-all duration-300',
        'bg-[rgba(17,17,17,0.88)]',
        'border border-purple-500/[0.08] hover:border-purple-500/[0.18]',
        'shadow-[0_8px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.03)]',
        isSelected && [
          'border-purple-500/40',
          'shadow-[0_0_0_4px_rgba(139,92,246,0.08),0_12px_48px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.05)]',
          'ring-2 ring-purple-500/30',
          'bg-[rgba(18,14,24,0.92)]'
        ]
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[24px]">
        <DitherGradient
          from={isSelected ? ditherColors.secondary : ditherColors.primary}
          direction="up"
          bloom={ditherBloom.perf}
          opacity={isSelected ? 0.1 : 0.06}
          className="pointer-events-none absolute inset-x-0 top-auto bottom-0 h-1/2 [mask-image:linear-gradient(to_top,black,transparent)]"
        />
      </div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center",
                "bg-[#141414]",
                "backdrop-blur-md border border-white/10"
              )}
            >
              <span className="text-2xl font-bold text-[#d4a574]">
                {sceneNumber}
              </span>
            </motion.div>
            <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[#f97316]/35 blur-sm animate-pulse" />
          </div>

          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-0.5">
              Scene
            </div>
            
            {/* Generation progress badge */}
            {generationState !== 'idle' && generationState !== 'complete' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 rounded-full border border-[#f97316]/20 bg-[#1a1510] px-3 py-1.5 backdrop-blur-sm"
              >
                <motion.div
                  className="h-4 w-4 rounded-full border-2 border-[#f97316]/20 border-t-[#f97316]"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <span className="text-xs font-medium text-[#fdba74]">
                  {generationState === 'preparing' && 'Preparing shots...'}
                  {generationState === 'generating' && `Generating ${generationProgress.completed}/${generationProgress.total}`}
                  {generationState === 'visualizing' && 'Creating visuals...'}
                </span>
              </motion.div>
            )}
            
            {generationState === 'complete' && generationProgress.total > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-orange-950/40 border border-orange-500/30 backdrop-blur-sm"
              >
                <span className="text-orange-400">✓</span>
                <span className="text-xs text-orange-400 font-medium">
                  Complete
                </span>
              </motion.div>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex flex-wrap items-center justify-end gap-3">
            {streamingEnabled && (
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={startShotGeneration}
                  size="sm"
                  className={cn(
                    'relative overflow-hidden backdrop-blur-sm',
                    'border border-[#f97316]/20 bg-[#1a1510] text-[#FDE8D0]',
                    'shadow-[0_4px_20px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.08)]',
                    'hover:bg-[#19231c] hover:shadow-[0_8px_28px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.12)]',
                    'transition-all duration-300'
                  )}
                  disabled={isLoading || isStreaming}
                  aria-live="polite"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/10" />
                  {isStreaming ? (
                    <Loader2 className="relative z-10 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="relative z-10 h-4 w-4" />
                  )}
                  <span className="relative z-10 ml-2">{isStreaming ? 'Streaming…' : 'Auto-generate'}</span>
                </Button>
              </motion.div>
            )}

            {isStreaming && (
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={cancelStream}
                  size="sm"
                  variant="ghost"
                  className={cn(
                    'relative overflow-hidden backdrop-blur-sm text-red-200',
                    'border border-red-500/40 bg-red-500/10',
                    'hover:bg-red-500/20 hover:text-red-100',
                    'transition-all duration-300'
                  )}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-transparent to-red-500/10" />
                  <CircleStop className="relative z-10 h-4 w-4" />
                  <span className="relative z-10 ml-2">Cancel</span>
                </Button>
              </motion.div>
            )}

            {/* Two-phase Auto-generate button for Images/Videos */}
            {hasShots && !isStreaming && (
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={isAutoGenerating ? cancelAutoGenerate : () => setShowConfirmGenerate(true)}
                      size="sm"
                      className={cn(
                        'relative overflow-hidden backdrop-blur-sm',
                        nextPhase === 'images' 
                          ? 'border border-[#f97316]/20 bg-[#1a1510] text-[#FDE8D0]'
                          : 'border border-[#d4a574]/18 bg-[#171614] text-[#E8E2CF]',
                        'shadow-[0_4px_20px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.08)]',
                        'hover:bg-[#1b1b1b] hover:shadow-[0_8px_28px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.12)]',
                        'transition-all duration-300'
                      )}
                    >
                      <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/10" />
                      {isAutoGenerating ? (
                        <>
                          <CircleStop className="relative z-10 h-4 w-4" />
                          <span className="relative z-10 ml-2">
                            Stop ({autoGenState.progress.completed}/{autoGenState.progress.total})
                          </span>
                        </>
                      ) : nextPhase === 'images' ? (
                        <>
                          <Image className="relative z-10 h-4 w-4" />
                          <span className="relative z-10 ml-2">Generate Images ({getShotImageCredits(selectedImageModel) * shots.length} credits)</span>
                        </>
                      ) : (
                        <>
                          <Film className="relative z-10 h-4 w-4" />
                          <span className="relative z-10 ml-2">Generate Videos ({getShotVideoCredits(selectedVideoModel) * shots.length} credits)</span>
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="glass-panel border-zinc-700">
                    <p className="text-xs">
                      {isAutoGenerating
                        ? 'Cancel current generation queue'
                        : nextPhase === 'images' 
                        ? 'Generate images for all shots in parallel'
                        : 'Generate videos from all images in parallel'}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </motion.div>
            )}

            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={addShot}
                size="sm"
                className={cn(
                  'relative overflow-hidden backdrop-blur-sm',
                  'border border-white/10 bg-[#151515] text-zinc-100',
                  'shadow-[0_4px_20px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.08)]',
                  'hover:bg-[#1a1a1a] hover:shadow-[0_6px_28px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.12)]',
                  'transition-all duration-300'
                )}
                disabled={isLoading || isSavingOrder}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-transparent to-white/10" />
                <Plus className="w-4 h-4 mr-2 relative z-10" />
                <span className="relative z-10">Add Shot</span>
              </Button>
            </motion.div>

            {onSceneDelete && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isDeleting}
                      onClick={handleDeleteScene}
                      className={cn(
                        'backdrop-blur-sm bg-red-950/20 border border-red-500/30',
                        'hover:bg-red-900/40 hover:border-red-500/50',
                        'shadow-[0_2px_12px_rgba(239,68,68,0.2)]',
                        'hover:shadow-[0_4px_20px_rgba(239,68,68,0.3)]',
                        'transition-all duration-300'
                      )}
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </Button>
                  </motion.div>
                </TooltipTrigger>
                <TooltipContent className="glass-panel border-zinc-700">
                  <p className="text-xs">Delete scene and all shots</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {showStreamTelemetry && (
            <ShotStreamProgress
              status={currentStatus}
              isStreaming={isStreaming}
              latencyMs={latencyMs}
              meta={meta}
              phaseDurations={phaseDurations}
              progress={progress}
            />
          )}
        </div>
      </div>

      <ScrollArea className="pb-3">
        <div
          ref={containerRef}
          className={cn(
            'flex space-x-4 pb-3 px-2 min-h-[180px]',
            'perspective-1000 transform-style-3d relative',
            'before:absolute before:inset-0 before:pointer-events-none',
            'before:bg-[radial-gradient(circle,rgba(255,255,255,0.06)_1px,transparent_1px)]',
            'before:bg-[length:20px_20px]',
            'before:opacity-25'
          )}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <ShotConnectionLines connections={connections} shotRefs={shotRefs} />

          {activeConnection && shotRefs.get(activeConnection.sourceId) && (
            <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 10 }}>
              <defs>
                <linearGradient id="preview-gradient">
                  <stop offset="0%" stopColor="#555555" stopOpacity="0.65" />
                  <stop offset="100%" stopColor="#f97316" stopOpacity="0.5" />
                </linearGradient>
              </defs>
              <path
                d={(() => {
                  const source = shotRefs.get(activeConnection.sourceId)!;
                  const sourceX = activeConnection.sourcePoint === 'left' ? source.x : source.x + source.width;
                  const sourceY = source.y + source.height / 2;
                  return `M ${sourceX} ${sourceY} L ${activeConnection.cursorX} ${activeConnection.cursorY}`;
                })()}
                stroke="url(#preview-gradient)"
                strokeWidth="2"
                strokeDasharray="5,5"
                fill="none"
                className="animate-[dash_1s_linear_infinite]"
              />
            </svg>
          )}

          {isLoading ? (
            <div className="flex gap-4">
              {[0, 1, 2].map((i) => (
                <ShotCardSkeleton key={i} />
              ))}
            </div>
          ) : hasShots ? (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext items={shots.map(shot => shot.id)} strategy={horizontalListSortingStrategy}>
                <AnimatePresence initial={false}>
                  {shots.map((shot, index) => (
                    <motion.div
                      key={shot.id}
                      layout
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.2, delay: index * 0.05 }}
                      data-shot-id={shot.id}
                      onClick={() =>
                        selectTarget({
                          type: 'shot',
                          id: shot.id,
                          label: `Shot ${shot.shot_number}`,
                          projectId,
                          sceneId,
                          sceneNumber,
                          shotNumber: shot.shot_number,
                          sourceImageUrl: shot.image_url ?? null,
                        })
                      }
                    >
                      <ShotCard
                        shot={shot}
                        onUpdate={(updates) => handleShotUpdate(shot.id, updates)}
                        onDelete={() => handleDeleteShot(shot.id)}
                        onConnectionPointClick={handleConnectionPointClick}
                        connectedPoints={getConnectedPoints(shot.id)}
                        isSelected={selectedTargets.shot?.id === shot.id}
                        isExpanded={expandedShotId === shot.id}
                        onExpandedChange={(expanded) => setExpandedShotId(expanded ? shot.id : null)}
                      />
                    </motion.div>
                  ))}
                  {streamingEnabled && streamingPlaceholders.map((placeholder, index) => (
                    <motion.div
                      key={`placeholder-${placeholder.id}`}
                      layout
                      initial={{ opacity: 0, scale: 0.85 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{ duration: 0.25, delay: index * 0.08 }}
                    >
                      <ShotCardSkeleton
                        label={placeholderCopy[placeholder.status]}
                        animateLabel
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </SortableContext>
            </DndContext>
          ) : hasPlaceholders ? (
            <div className="flex flex-wrap gap-4">
              {streamingPlaceholders.map((placeholder, index) => (
                <motion.div
                  key={`placeholder-${placeholder.id}`}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25, delay: index * 0.08 }}
                >
                  <ShotCardSkeleton
                    label={placeholderCopy[placeholder.status]}
                    animateLabel
                  />
                </motion.div>
              ))}
            </div>
          ) : (
            <div className={cn(
              'flex flex-col items-center justify-center w-full py-12',
              'rounded-xl bg-zinc-900/20 backdrop-blur-sm',
              'border border-dashed border-zinc-700/50'
            )}>
              <div className="w-12 h-12 rounded-xl bg-zinc-800/50 flex items-center justify-center mb-4
                shadow-[inset_0_2px_8px_rgba(0,0,0,0.3)]">
                <AlertCircle className="w-6 h-6 text-zinc-500" />
              </div>

              <p className="text-zinc-400 text-sm mb-4">No shots in this scene yet.</p>

              <Button
                variant="ghost"
                className={cn(
                  'border border-zinc-700/50 bg-zinc-900/30',
                  'hover:bg-zinc-800/50 hover:border-zinc-600/50',
                  'text-zinc-300 hover:text-white'
                )}
                onClick={addShot}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add your first shot
              </Button>
            </div>
          )}
        </div>
        <ScrollBar orientation="horizontal" className="h-2" />
      </ScrollArea>

      <ConfirmGenerateDialog
        open={showConfirmGenerate}
        onOpenChange={setShowConfirmGenerate}
        onConfirm={() => {
          setShowConfirmGenerate(false);
          startAutoGenerate();
        }}
        title="Confirm Auto-Generate"
        description="Are you sure you wish to proceed with auto generate?"
        estimatedCredits={
          nextPhase === 'images'
            ? getShotImageCredits(selectedImageModel) * shots.length
            : getShotVideoCredits(selectedVideoModel) * shots.length
        }
      />
    </motion.div>
  );
};

export default ShotsRow;
