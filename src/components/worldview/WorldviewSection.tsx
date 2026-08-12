import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Aperture,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Crosshair,
  Eye,
  Globe2,
  ImagePlus,
  Loader2,
  Minus,
  MoreHorizontal,
  Move3d,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import { KanvasEmptyState } from '@/components/kanvas/primitives';
import { kanvasStarterAssets } from '@/lib/kanvasStarterAssets';
import { useWorldviewStore } from '@/lib/stores/worldview-store';
import { useCanvasStore } from '@/lib/stores/canvas-store';
import { worldLabsService } from '@/services/worldLabsService';
import { supabase } from '@/integrations/supabase/client';
import { SparkSplatViewer } from './SparkSplatViewer';
import type { SparkSplatViewerHandle } from './SparkSplatViewer';
import type {
  AspectRatioType,
  CharacterRef,
  GenerationModel,
  LensType,
  ResolutionType,
  World,
  WorldModel,
  WorldviewScene,
  WorldviewTake,
  GeneratedShot,
} from '@/types/worldview';
import {
  GENERATION_MODELS,
  LENS_OPTIONS,
  ASPECT_RATIO_OPTIONS,
} from '@/types/worldview';

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const fadeIn = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.2 },
};

const collapseVariants = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1, transition: { duration: 0.25 } },
  exit: { height: 0, opacity: 0, transition: { duration: 0.2 } },
};

// ---------------------------------------------------------------------------
// SceneChip
// ---------------------------------------------------------------------------

function SceneChip({
  scene,
  index,
  isActive,
  onSelect,
  onRemove,
}: {
  scene: WorldviewScene;
  index: number;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const takeThumbs = scene.takes.slice(0, 4);
  const overflowCount = scene.takes.length - 4;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-label={`Scene ${index + 1}`}
      aria-selected={isActive}
      className={cn(
        'group relative flex shrink-0 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition-all',
        isActive
          ? 'border-[#f97316]/30 bg-[#f97316]/10 text-[#f97316] shadow-[0_0_20px_rgba(249,115,22,0.12)]'
          : 'border-zinc-700/40 bg-zinc-900/40 text-zinc-400 hover:border-zinc-600/60 hover:text-zinc-200',
      )}
    >
      <span className="font-mono text-xs tabular-nums">{index + 1}</span>
      <span className="max-w-[80px] truncate">{scene.name}</span>

      {/* Mini thumbnail strip */}
      {takeThumbs.length > 0 && (
        <div className="flex -space-x-1">
          {takeThumbs.map((take) => (
            <div
              key={take.id}
              className="h-4 w-4 overflow-hidden rounded-sm border border-zinc-700/60 bg-zinc-800"
            >
              {take.imageUrl && (
                <img src={take.imageUrl} alt="" className="h-full w-full object-cover" />
              )}
            </div>
          ))}
          {overflowCount > 0 && (
            <span className="flex h-4 items-center rounded-sm bg-zinc-800 px-1 text-[9px] text-zinc-500">
              +{overflowCount}
            </span>
          )}
        </div>
      )}

      <ChevronRight className="h-3 w-3 text-zinc-600" />

      {/* Remove button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${scene.name}`}
        className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:bg-red-900/60 hover:text-red-300 group-hover:flex"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SceneStrip
// ---------------------------------------------------------------------------

function SceneStrip({
  scenes,
  activeSceneId,
  onSelect,
  onAddScene,
  onRemoveScene,
}: {
  scenes: WorldviewScene[];
  activeSceneId: string | null;
  onSelect: (id: string) => void;
  onAddScene: () => void;
  onRemoveScene: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Camera className="h-4 w-4 shrink-0 text-zinc-500" />
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-hide">
        {scenes.map((scene, idx) => (
          <SceneChip
            key={scene.id}
            scene={scene}
            index={idx}
            isActive={scene.id === activeSceneId}
            onSelect={() => onSelect(scene.id)}
            onRemove={() => onRemoveScene(scene.id)}
          />
        ))}
        <button
          type="button"
          onClick={onAddScene}
          aria-label="New Scene"
          className="flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-zinc-700/50 px-3 py-2 text-xs font-medium text-zinc-500 transition-colors hover:border-[#f97316]/30 hover:text-[#f97316]"
        >
          <Plus className="h-3 w-3" />
          New Scene
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorldCreatorPanel
// ---------------------------------------------------------------------------

function WorldCreatorPanel({
  onGenerate,
}: {
  onGenerate: (prompt: string, model: WorldModel, imageFile?: File) => void;
}) {
  const [promptMode, setPromptMode] = useState<'text' | 'image'>('text');
  const [textPrompt, setTextPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState<WorldModel>('Marble 0.1-plus');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.currentTarget.value = '';
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = () => {
    const prompt = textPrompt.trim();
    if (!prompt) return;
    onGenerate(prompt, selectedModel, promptMode === 'image' ? imageFile ?? undefined : undefined);
  };

  const canGenerate = textPrompt.trim().length > 0;

  return (
    <motion.div {...fadeIn} className="rounded-2xl border border-zinc-700/40 bg-zinc-900/40 p-4 backdrop-blur-xl">
      <p className="mb-3 text-sm font-semibold text-white">Create a 3D World</p>

      {/* Text / Image toggle */}
      <div className="mb-3 flex gap-2">
        <button
          type="button"
          onClick={() => setPromptMode('text')}
          aria-label="Text prompt mode"
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            promptMode === 'text'
              ? 'bg-[#f97316]/10 text-[#f97316]'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
          )}
        >
          Text
        </button>
        <button
          type="button"
          onClick={() => setPromptMode('image')}
          aria-label="Image prompt mode"
          className={cn(
            'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            promptMode === 'image'
              ? 'bg-[#f97316]/10 text-[#f97316]'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200',
          )}
        >
          Image
        </button>
      </div>

      {/* Textarea */}
      <textarea
        value={textPrompt}
        onChange={(e) => setTextPrompt(e.target.value)}
        placeholder="Describe the 3D world you want to create..."
        className="mb-3 w-full resize-none rounded-xl border border-zinc-700/40 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-[#f97316]/30 focus:outline-none"
        rows={3}
      />

      {/* Image upload for image mode */}
      {promptMode === 'image' && (
        <div className="mb-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Upload image"
            className="flex items-center gap-2 rounded-lg border border-dashed border-zinc-700/50 px-3 py-2 text-xs text-zinc-400 transition-colors hover:border-[#f97316]/30 hover:text-[#f97316]"
          >
            <Upload className="h-3.5 w-3.5" />
            {imageFile ? imageFile.name : 'Select image file'}
          </button>
          {imagePreview && (
            <div className="mt-2 h-20 w-20 overflow-hidden rounded-lg border border-zinc-700/40">
              <img src={imagePreview} alt="Preview" className="h-full w-full object-cover" />
            </div>
          )}
        </div>
      )}

      {/* Model select */}
      <div className="mb-4">
        <p className="mb-1.5 text-xs text-zinc-500">Model</p>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value as WorldModel)}
          aria-label="Select model"
          className="w-full rounded-lg border border-zinc-700/40 bg-black/40 px-3 py-2 text-sm text-white focus:border-[#f97316]/30 focus:outline-none"
        >
          <option value="Marble 0.1-plus">Marble 0.1-plus</option>
          <option value="Marble 0.1-mini">Marble 0.1-mini</option>
        </select>
      </div>

      {/* Generate button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate}
        aria-label="Generate World"
        className={cn(
          'flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all',
          canGenerate
            ? 'bg-[#f97316] text-black hover:bg-[#fb923c] shadow-[0_0_20px_rgba(249,115,22,0.15)]'
            : 'bg-zinc-800 text-zinc-600 cursor-not-allowed',
        )}
      >
        <Zap className="h-4 w-4" />
        Generate World
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// WorldGeneratingCard
// ---------------------------------------------------------------------------

function WorldGeneratingCard({ progress }: { progress?: number }) {
  return (
    <motion.div
      {...fadeIn}
      className="flex flex-col items-center gap-3 rounded-2xl border border-[#f97316]/20 bg-zinc-900/40 p-6 backdrop-blur-xl"
    >
      <Loader2 className="h-8 w-8 animate-spin text-[#f97316]" />
      <p className="text-sm font-medium text-white">Generating world…</p>
      <p className="text-xs text-zinc-500">This may take a few minutes</p>
      <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-zinc-800">
        <motion.div
          className="h-full rounded-full bg-[#f97316]"
          initial={{ width: '5%' }}
          animate={{ width: `${progress ?? 15}%` }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
        />
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// WorldCard
// ---------------------------------------------------------------------------

function WorldCard({
  world,
  onEnterWorld,
}: {
  world: World;
  onEnterWorld: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <motion.div
      {...fadeIn}
      className="group relative overflow-hidden rounded-2xl border border-zinc-700/40 bg-zinc-900/40 backdrop-blur-xl"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video w-full bg-zinc-800">
        {world.assets.thumbnailUrl ? (
          <img
            src={world.assets.thumbnailUrl}
            alt={world.displayName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Globe2 className="h-10 w-10 text-zinc-700" />
          </div>
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

        {/* Enter World button on hover */}
        <AnimatePresence>
          {hovered && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 flex items-center justify-center bg-black/30"
            >
              <button
                type="button"
                onClick={onEnterWorld}
                aria-label="Enter World"
                className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg transition-transform hover:scale-105"
              >
                <Eye className="h-4 w-4" />
                Enter World
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-sm font-semibold text-white">{world.displayName}</p>
        <div className="mt-1 flex items-center gap-2">
          <span className="rounded-md bg-[#f97316]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#f97316]">
            {world.model}
          </span>
          {world.assets.viewerUrl && (
            <a
              href={world.assets.viewerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-zinc-500 underline hover:text-[#f97316]"
              aria-label="Open in Marble"
            >
              Open in Marble
            </a>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// TakeCard
// ---------------------------------------------------------------------------

function TakeCard({
  take,
  onCompose,
  onRefresh,
}: {
  take: WorldviewTake;
  onCompose: () => void;
  onRefresh: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="group relative overflow-hidden rounded-xl border border-zinc-700/40 bg-zinc-900/40 backdrop-blur-xl"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="relative aspect-video w-full bg-zinc-800">
        {take.imageUrl ? (
          <img src={take.imageUrl} alt="Take" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Camera className="h-6 w-6 text-zinc-700" />
          </div>
        )}

        {/* Camera info badges */}
        <div className="absolute bottom-1.5 left-1.5 flex gap-1">
          <span className="rounded bg-black/60 px-1 py-0.5 font-mono text-[9px] text-zinc-300 backdrop-blur-sm">
            {take.camera.lens}
          </span>
          <span className="rounded bg-black/60 px-1 py-0.5 font-mono text-[9px] text-zinc-300 backdrop-blur-sm">
            {take.camera.aperture}
          </span>
        </div>

        {/* Compose Shot overlay */}
        <AnimatePresence>
          {hovered && take.status === 'ready' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center bg-black/40"
            >
              <button
                type="button"
                onClick={onCompose}
                aria-label="Compose Shot"
                className="rounded-lg bg-[#f97316]/90 px-3 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-[#fb923c]"
              >
                Compose Shot
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading state */}
        {take.status === 'capturing' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="h-5 w-5 animate-spin text-[#f97316]" />
          </div>
        )}
      </div>

      {/* Refresh button */}
      <button
        type="button"
        onClick={onRefresh}
        aria-label="Refresh take"
        className="absolute right-1.5 top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-black/60 text-zinc-400 hover:text-white group-hover:flex"
      >
        <RefreshCw className="h-3 w-3" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GeneratedImageCard
// ---------------------------------------------------------------------------

function GeneratedImageCard({
  shot,
  onAddToCanvas,
}: {
  shot: GeneratedShot;
  onAddToCanvas: (imageUrl: string) => void;
}) {
  const imageUrl = shot.images[0]?.url;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-zinc-700/40 bg-zinc-900/40 backdrop-blur-xl">
      <div className="relative aspect-video w-full bg-zinc-800">
        {imageUrl ? (
          <img src={imageUrl} alt="Generated" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Sparkles className="h-6 w-6 text-zinc-700" />
          </div>
        )}

        {/* Plus button — add to canvas */}
        {imageUrl && (
          <button
            type="button"
            onClick={() => onAddToCanvas(imageUrl)}
            aria-label="Add to canvas"
            title="Add to canvas"
            className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-full bg-black/60 text-zinc-400 transition-colors hover:text-white group-hover:flex"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Model badge */}
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-[#f97316] backdrop-blur-sm">
          <Sparkles className="h-2.5 w-2.5" />
          {shot.model}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorldviewCanvas — Grid view for canvas mode
// ---------------------------------------------------------------------------

function WorldviewCanvas({
  scene,
  world,
  generating,
  generationProgress,
  generationError,
  showCreator,
  onCreateWorld,
  onEnterWorld,
  onComposeTake,
  onRetryGeneration,
  onSetShowCreator,
  onAddToCanvas,
}: {
  scene: WorldviewScene;
  world: World | null;
  generating: boolean;
  generationProgress?: number;
  generationError: string | null;
  showCreator: boolean;
  onCreateWorld: (prompt: string, model: WorldModel, imageFile?: File) => void;
  onEnterWorld: () => void;
  onComposeTake: (takeId: string) => void;
  onRetryGeneration: () => void;
  onSetShowCreator: (show: boolean) => void;
  onAddToCanvas: (imageUrl: string) => void;
}) {

  return (
    <motion.div key="canvas" {...fadeIn} className="space-y-4">
      {/* World area */}
      {generating ? (
        <WorldGeneratingCard progress={generationProgress} />
      ) : generationError ? (
        <motion.div
          {...fadeIn}
          className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/20 bg-zinc-900/40 p-6 backdrop-blur-xl"
        >
          <p className="text-sm font-medium text-red-400">World generation failed</p>
          <p className="text-xs text-zinc-500">{generationError}</p>
          <button
            type="button"
            onClick={onRetryGeneration}
            aria-label="Retry generation"
            className="flex items-center gap-1.5 rounded-lg bg-[#f97316]/10 px-3 py-1.5 text-xs font-medium text-[#f97316] transition-colors hover:bg-[#f97316]/30"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        </motion.div>
      ) : world ? (
        <WorldCard world={world} onEnterWorld={onEnterWorld} />
      ) : showCreator ? (
        <WorldCreatorPanel onGenerate={onCreateWorld} />
      ) : (
        <motion.button
          {...fadeIn}
          type="button"
          onClick={() => onSetShowCreator(true)}
          aria-label="Create a 3D World"
          className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-zinc-700/40 bg-zinc-900/20 p-8 text-zinc-500 transition-all hover:border-[#f97316]/30 hover:text-[#f97316] hover:shadow-[0_0_30px_rgba(249,115,22,0.08)]"
        >
          <Globe2 className="h-8 w-8" />
          <span className="text-sm font-medium">Create a 3D World</span>
        </motion.button>
      )}

      {/* Takes grid */}
      {scene.takes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Takes
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {scene.takes.map((take) => (
              <TakeCard
                key={take.id}
                take={take}
                onCompose={() => onComposeTake(take.id)}
                onRefresh={() => {}}
              />
            ))}
          </div>
        </div>
      )}

      {/* Generated shots grid */}
      {scene.generatedShots.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Generated Shots
          </p>
          <div className="grid grid-cols-2 gap-3">
            {scene.generatedShots.map((shot) => (
              <GeneratedImageCard key={shot.id} shot={shot} onAddToCanvas={onAddToCanvas} />
            ))}
          </div>
        </div>
      )}

      {/* Bottom prompt bar */}
      <div className="flex items-center gap-3 rounded-xl border border-zinc-700/40 bg-zinc-900/40 px-4 py-3 backdrop-blur-xl">
        <Sparkles className="h-4 w-4 shrink-0 text-[#f97316]" />
        <input
          type="text"
          placeholder="Describe what you'd like to create…"
          aria-label="Prompt"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
        />
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// SparkErrorBoundary — catches WASM/WebGL crashes in the 3D viewer
// ---------------------------------------------------------------------------

interface SparkErrorBoundaryProps {
  viewerUrl?: string;
  fallbackImageUrl?: string;
  children: React.ReactNode;
}

interface SparkErrorBoundaryState {
  hasError: boolean;
}

class SparkErrorBoundary extends React.Component<SparkErrorBoundaryProps, SparkErrorBoundaryState> {
  constructor(props: SparkErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): SparkErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn('SparkErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      const { viewerUrl, fallbackImageUrl } = this.props;
      if (viewerUrl) {
        return (
          <iframe
            src={viewerUrl}
            title="World Viewer (fallback)"
            className="absolute inset-0 h-full w-full border-0"
            allow="accelerometer; autoplay; encrypted-media; gyroscope"
          />
        );
      }
      if (fallbackImageUrl) {
        return <img src={fallbackImageUrl} alt="World" className="absolute inset-0 h-full w-full object-cover" />;
      }
      return (
        <div className="flex h-full w-full items-center justify-center">
          <p className="text-sm text-zinc-400">3D viewer unavailable</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// GSplatViewer — World viewer mode with camera HUD and capture
// ---------------------------------------------------------------------------

function GSplatViewer({
  world,
  onClose,
}: {
  world: World | null;
  onClose: () => void;
}) {
  const {
    camera,
    cameraTransform,
    capturing,
    motionEnabled,
    updateCamera,
    resetCamera,
    setCapturing,
    addTake,
    updateTakeStatus,
    toggleMotion,
    setMode,
    activeSceneId,
  } = useWorldviewStore();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const sparkRef = useRef<SparkSplatViewerHandle>(null);
  const [lensOpen, setLensOpen] = useState(false);

  const activeLens = LENS_OPTIONS.find((l) => l.value === camera.lens);
  const activeRatio = ASPECT_RATIO_OPTIONS.find((r) => r.value === camera.aspectRatio);
  const fov = activeLens?.fov ?? 47;
  const viewfinderWidthPercent = Math.min(90, 60 * (camera.zoom / 100));
  const viewfinderRatio = activeRatio?.ratio ?? 16 / 9;

  const splatUrl = world?.assets.splatUrl;
  const viewerUrl = world?.assets.viewerUrl;
  const fallbackImageUrl = world?.assets.panoramaUrl ?? world?.assets.thumbnailUrl;

  const handleZoomIn = useCallback(() => {
    updateCamera({ zoom: Math.min(camera.zoom + 10, 300) });
  }, [camera.zoom, updateCamera]);

  const handleZoomOut = useCallback(() => {
    updateCamera({ zoom: Math.max(camera.zoom - 10, 10) });
  }, [camera.zoom, updateCamera]);

  const handleLensChange = useCallback(
    (lens: LensType) => {
      updateCamera({ lens });
      setLensOpen(false);
    },
    [updateCamera],
  );

  const handleCaptureTake = useCallback(async () => {
    if (capturing || !activeSceneId) return;
    const takeId = crypto.randomUUID();

    const take: WorldviewTake = {
      id: takeId,
      sceneId: activeSceneId,
      imageUrl: '',
      camera: { ...camera },
      cameraTransform: { ...cameraTransform },
      status: 'capturing',
      createdAt: new Date().toISOString(),
    };

    addTake(take);
    setCapturing(true);

    try {
      // Try capturing from SparkJS canvas first, fall back to static image
      const canvasCapture = sparkRef.current?.captureFrame();
      const imageUrl = canvasCapture || fallbackImageUrl || '';
      if (!imageUrl) throw new Error('No image source available for capture');

      updateTakeStatus(takeId, 'ready');
      useWorldviewStore.setState((state) => ({
        scenes: state.scenes.map((s) => ({
          ...s,
          takes: s.takes.map((t) =>
            t.id === takeId ? { ...t, imageUrl, status: 'ready' as const } : t,
          ),
        })),
      }));
      toast.success('Take captured!', {
        action: { label: 'View', onClick: () => setMode('canvas') },
      });
    } catch (err) {
      updateTakeStatus(takeId, 'failed');
      toast.error(err instanceof Error ? err.message : 'Failed to capture take');
    } finally {
      setCapturing(false);
    }
  }, [capturing, activeSceneId, camera, cameraTransform, fallbackImageUrl, addTake, setCapturing, updateTakeStatus, setMode]);

  const handleResetCamera = useCallback(() => { resetCamera(); }, [resetCamera]);

  return (
    <motion.div
      key="world-viewer"
      {...fadeIn}
      ref={containerRef}
      className="relative h-[520px] w-full overflow-hidden rounded-2xl border border-zinc-700/40 bg-black"
    >
      {/* SparkJS Gaussian Splat Viewer with fallbacks */}
      <SparkErrorBoundary viewerUrl={viewerUrl} fallbackImageUrl={fallbackImageUrl}>
        <SparkSplatViewer
          ref={sparkRef}
          splatUrl={splatUrl}
          viewerUrl={viewerUrl}
          fallbackImageUrl={fallbackImageUrl}
          displayName={world?.displayName}
          className="absolute inset-0 h-full w-full"
        />
      </SparkErrorBoundary>

      {/* Camera HUD — top-left */}
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-2">
        <div className="relative">
          <button type="button" onClick={() => setLensOpen((o) => !o)} aria-label="Select lens"
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700/40 bg-zinc-900/70 px-2.5 py-1.5 font-mono text-xs text-[#f97316] backdrop-blur-xl transition-colors hover:border-[#f97316]/30">
            {camera.lens}
            <ChevronDown className={cn('h-3 w-3 transition-transform', lensOpen && 'rotate-180')} />
          </button>
          <AnimatePresence>
            {lensOpen && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="absolute left-0 top-full z-20 mt-1 flex flex-col overflow-hidden rounded-lg border border-zinc-700/40 bg-zinc-900/90 backdrop-blur-xl">
                {LENS_OPTIONS.map((opt) => (
                  <button key={opt.value} type="button" onClick={() => handleLensChange(opt.value)} aria-label={`Lens ${opt.value}`}
                    className={cn('px-3 py-1.5 text-left font-mono text-xs transition-colors',
                      camera.lens === opt.value ? 'bg-[#f97316]/10 text-[#f97316]' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200')}>
                    {opt.value}<span className="ml-2 text-[10px] text-zinc-500">fov {opt.fov}°</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-700/40 bg-zinc-900/70 px-2 py-1 backdrop-blur-xl">
          <button type="button" onClick={handleZoomOut} aria-label="Zoom out" className="rounded p-0.5 text-zinc-400 transition-colors hover:text-white">
            <Minus className="h-3 w-3" />
          </button>
          <span className="min-w-[3ch] text-center font-mono text-xs text-[#f97316]">{camera.zoom}%</span>
          <button type="button" onClick={handleZoomIn} aria-label="Zoom in" className="rounded p-0.5 text-zinc-400 transition-colors hover:text-white">
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <button type="button" aria-label="Help"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700/40 bg-zinc-900/70 text-zinc-400 backdrop-blur-xl transition-colors hover:text-[#f97316]">
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Close button */}
      <button type="button" onClick={onClose} aria-label="Close viewer"
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-700/40 bg-zinc-900/70 text-zinc-400 backdrop-blur-xl transition-colors hover:text-white">
        <X className="h-4 w-4" />
      </button>

      {/* Viewfinder frame */}
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center" aria-hidden="true">
        <div className="relative border-2 border-white/30" style={{ width: `${viewfinderWidthPercent}%`, aspectRatio: `${viewfinderRatio}` }}>
          <div className="absolute -left-px -top-px h-4 w-4"><div className="absolute left-0 top-0 h-full w-[2px] bg-white" /><div className="absolute left-0 top-0 h-[2px] w-full bg-white" /></div>
          <div className="absolute -right-px -top-px h-4 w-4"><div className="absolute right-0 top-0 h-full w-[2px] bg-white" /><div className="absolute right-0 top-0 h-[2px] w-full bg-white" /></div>
          <div className="absolute -bottom-px -left-px h-4 w-4"><div className="absolute bottom-0 left-0 h-full w-[2px] bg-white" /><div className="absolute bottom-0 left-0 h-[2px] w-full bg-white" /></div>
          <div className="absolute -bottom-px -right-px h-4 w-4"><div className="absolute bottom-0 right-0 h-full w-[2px] bg-white" /><div className="absolute bottom-0 right-0 h-[2px] w-full bg-white" /></div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"><Crosshair className="h-5 w-5 text-white/50" /></div>
          <div className="absolute -bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
            <span className="rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] uppercase text-zinc-300 backdrop-blur-sm">{camera.lens}</span>
            <span className="rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-zinc-300 backdrop-blur-sm">{camera.aperture}</span>
            <span className="rounded bg-black/60 px-1.5 py-0.5 font-mono text-[9px] text-zinc-300 backdrop-blur-sm">{camera.aspectRatio}</span>
            <span className="rounded bg-[#f97316]/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#f97316] backdrop-blur-sm">AF</span>
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3">
        <button type="button" onClick={handleResetCamera} aria-label="Reset camera"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-700/40 bg-zinc-900/70 text-zinc-400 backdrop-blur-xl transition-colors hover:text-[#f97316]">
          <RotateCcw className="h-4 w-4" />
        </button>
        <button type="button" onClick={toggleMotion} aria-label="Toggle motion" aria-pressed={motionEnabled}
          className={cn('flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-xl transition-colors',
            motionEnabled ? 'border-[#f97316]/30 bg-[#f97316]/10 text-[#f97316]' : 'border-zinc-700/40 bg-zinc-900/70 text-zinc-400 hover:text-zinc-200')}>
          <Move3d className="h-4 w-4" />
        </button>
        <button type="button" onClick={handleCaptureTake} disabled={capturing} aria-label="Capture Take"
          className={cn('flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all',
            capturing ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed' : 'bg-white text-black hover:bg-zinc-100')}>
          {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          Capture Take
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// ShotComposer — Shot composition mode
// ---------------------------------------------------------------------------

const RESOLUTION_OPTIONS: ResolutionType[] = ['512', '1K', '2K', '4K'];
const ASPECT_RATIO_CYCLE: AspectRatioType[] = ['16:9', '4:3', '1:1', '2.39:1', '9:16'];
const BATCH_SIZE_OPTIONS = [1, 2, 4, 8] as const;

function ShotComposer({
  scene,
  onBack,
}: {
  scene: WorldviewScene;
  onBack: () => void;
}) {
  const {
    activeTakeId,
    characters,
    generatingShot,
    setActiveTake,
    setGeneratingShot,
    addGeneratedShot,
    addShotResults,
    setMode,
  } = useWorldviewStore();

  // Local UI state
  const [promptText, setPromptText] = useState('');
  const [selectedModel, setSelectedModel] = useState<GenerationModel>('nano-banana');
  const [resolution, setResolution] = useState<ResolutionType>('1K');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>('16:9');
  const [batchSize, setBatchSize] = useState<number>(1);
  const [selectedCharacterIds, setSelectedCharacterIds] = useState<Set<string>>(new Set());
  const [takeRefEnabled, setTakeRefEnabled] = useState(true);
  const [cameraBagOn, setCameraBagOn] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [charMenuOpen, setCharMenuOpen] = useState(false);

  // Find active take
  const activeTake = activeTakeId
    ? scene.takes.find((t) => t.id === activeTakeId) ?? null
    : null;

  // Cycle helpers
  const cycleResolution = useCallback(() => {
    setResolution((prev) => {
      const idx = RESOLUTION_OPTIONS.indexOf(prev);
      return RESOLUTION_OPTIONS[(idx + 1) % RESOLUTION_OPTIONS.length];
    });
  }, []);

  const cycleAspectRatio = useCallback(() => {
    setAspectRatio((prev) => {
      const idx = ASPECT_RATIO_CYCLE.indexOf(prev);
      return ASPECT_RATIO_CYCLE[(idx + 1) % ASPECT_RATIO_CYCLE.length];
    });
  }, []);

  const cycleBatchSize = useCallback(() => {
    setBatchSize((prev) => {
      const idx = BATCH_SIZE_OPTIONS.indexOf(prev as typeof BATCH_SIZE_OPTIONS[number]);
      return BATCH_SIZE_OPTIONS[(idx + 1) % BATCH_SIZE_OPTIONS.length];
    });
  }, []);

  // Next take
  const cycleToNextTake = useCallback(() => {
    if (!activeTakeId) return;
    const readyTakes = scene.takes.filter((t) => t.status === 'ready');
    if (readyTakes.length <= 1) return;
    const idx = readyTakes.findIndex((t) => t.id === activeTakeId);
    const nextIdx = (idx + 1) % readyTakes.length;
    setActiveTake(readyTakes[nextIdx].id);
  }, [activeTakeId, scene.takes, setActiveTake]);

  // Toggle character
  const toggleCharacter = useCallback((charId: string) => {
    setSelectedCharacterIds((prev) => {
      const next = new Set(prev);
      if (next.has(charId)) {
        next.delete(charId);
      } else {
        next.add(charId);
      }
      return next;
    });
  }, []);

  // Remove character chip
  const removeCharacterChip = useCallback((charId: string) => {
    setSelectedCharacterIds((prev) => {
      const next = new Set(prev);
      next.delete(charId);
      return next;
    });
  }, []);

  // Get selected characters
  const selectedCharacters = characters.filter((c) => selectedCharacterIds.has(c.id));

  // Active model info
  const activeModelInfo = GENERATION_MODELS.find((m) => m.id === selectedModel) ?? GENERATION_MODELS[0];

  // Submit handler
  const handleSubmit = useCallback(async () => {
    if (!promptText.trim() || generatingShot) return;

    // Build composite prompt
    const charNames = selectedCharacters.map((c) => c.name);
    const charPrefix = charNames.length > 0 ? `[${charNames.join(', ')}] ` : '';
    const takeSuffix = takeRefEnabled && activeTake ? ' [Take reference]' : '';
    const compositePrompt = `${charPrefix}${promptText.trim()}${takeSuffix}`;

    const shotId = crypto.randomUUID();
    const shot: GeneratedShot = {
      id: shotId,
      sceneId: scene.id,
      takeId: activeTake?.id,
      prompt: compositePrompt,
      model: selectedModel,
      status: 'generating',
      images: [],
      createdAt: new Date().toISOString(),
    };

    setGeneratingShot(true);
    addGeneratedShot(shot);

    try {
      const result = await worldLabsService.generateShot({
        prompt: compositePrompt,
        model: selectedModel,
        resolution,
        aspectRatio,
        imageUrl: takeRefEnabled && activeTake?.imageUrl ? activeTake.imageUrl : undefined,
        numImages: batchSize,
      });

      // Extract images from result
      const resultData = result.result as { images?: Array<{ url: string; width: number; height: number }> } | undefined;
      const images = resultData?.images ?? [];

      addShotResults(shotId, images);
      setGeneratingShot(false);
      toast.success('Shot generated successfully!');
      setMode('canvas');
    } catch (err) {
      setGeneratingShot(false);
      useWorldviewStore.getState().updateShotStatus(shotId, 'failed');
      toast.error(err instanceof Error ? err.message : 'Failed to generate shot');
    }
  }, [
    promptText,
    generatingShot,
    selectedCharacters,
    takeRefEnabled,
    activeTake,
    scene.id,
    selectedModel,
    resolution,
    aspectRatio,
    batchSize,
    setGeneratingShot,
    addGeneratedShot,
    addShotResults,
    setMode,
  ]);

  // Handle Enter key
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const canSend = promptText.trim().length > 0 && !generatingShot;

  return (
    <motion.div key="shot-composer" {...fadeIn} className="space-y-4">
      {/* Active take preview */}
      {activeTake && (
        <div className="relative h-64 w-full overflow-hidden rounded-2xl border border-zinc-700/40 bg-zinc-900/40">
          {activeTake.imageUrl ? (
            <img
              src={activeTake.imageUrl}
              alt="Active take"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-800">
              <Camera className="h-10 w-10 text-zinc-700" />
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />

          {/* Next take floating button */}
          {scene.takes.filter((t) => t.status === 'ready').length > 1 && (
            <button
              type="button"
              onClick={cycleToNextTake}
              aria-label="Next take"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-zinc-300 backdrop-blur-sm transition-colors hover:text-white"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          )}

          {/* Action buttons column */}
          <div className="absolute bottom-3 right-3 flex flex-col gap-2">
            {[
              { icon: MoreHorizontal, label: 'More options' },
              { icon: RefreshCw, label: 'Refresh' },
              { icon: Target, label: 'Target' },
              { icon: Sparkles, label: 'Enhance' },
            ].map(({ icon: Icon, label }) => (
              <button
                key={label}
                type="button"
                aria-label={label}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-zinc-400 backdrop-blur-sm transition-colors hover:text-white"
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Prompt composer panel */}
      <div className="relative rounded-xl border border-zinc-700/40 bg-zinc-900/40 p-3 backdrop-blur-xl">
        {/* Building overlay during generation */}
        {generatingShot && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-black/60 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin text-[#f97316]" />
              <span className="text-sm font-medium text-[#f97316]">Building…</span>
            </div>
          </div>
        )}

        {/* Top row */}
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            aria-label="Aperture"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700/40 bg-zinc-800 text-zinc-400 transition-colors hover:text-[#f97316]"
          >
            <Aperture className="h-4 w-4" />
          </button>

          {/* Camera Bag toggle */}
          <button
            type="button"
            onClick={() => setCameraBagOn((v) => !v)}
            aria-label="Camera Bag"
            aria-pressed={cameraBagOn}
            className={cn(
              'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
              cameraBagOn
                ? 'bg-[#f97316]/10 text-[#f97316] border border-[#f97316]/30'
                : 'bg-zinc-800 text-zinc-400 border border-zinc-700/40 hover:text-zinc-200',
            )}
          >
            Camera Bag
          </button>

          {/* Clear button */}
          <button
            type="button"
            onClick={() => {
              setPromptText('');
              setSelectedCharacterIds(new Set());
              setTakeRefEnabled(false);
            }}
            aria-label="Clear prompt"
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-full text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Prompt input area */}
        <div className="mb-3 flex min-h-[44px] flex-wrap items-center gap-2 rounded-lg border border-zinc-700/40 bg-black/30 px-3 py-2">
          {/* Character chips */}
          {selectedCharacters.map((char) => (
            <span
              key={char.id}
              className="flex items-center gap-1.5 rounded-full bg-violet-500/20 px-2.5 py-1 text-xs font-medium text-violet-300"
            >
              {char.imageUrl && (
                <img
                  src={char.imageUrl}
                  alt={char.name}
                  className="h-4 w-4 rounded-full object-cover"
                />
              )}
              {char.name}
              <button
                type="button"
                onClick={() => removeCharacterChip(char.id)}
                aria-label={`Remove ${char.name}`}
                className="ml-0.5 text-violet-400 transition-colors hover:text-violet-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {/* Text input */}
          <input
            type="text"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe the shot you want to compose…"
            aria-label="Shot prompt"
            className="min-w-[200px] flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
          />

          {/* Take reference chip */}
          {takeRefEnabled && activeTake && (
            <span className="flex items-center gap-1.5 rounded-full bg-sky-500/20 px-2.5 py-1 text-xs font-medium text-sky-300">
              {activeTake.imageUrl && (
                <img
                  src={activeTake.imageUrl}
                  alt="Take"
                  className="h-4 w-4 rounded object-cover"
                />
              )}
              Take
              <button
                type="button"
                onClick={() => setTakeRefEnabled(false)}
                aria-label="Remove take reference"
                className="ml-0.5 text-sky-400 transition-colors hover:text-sky-200"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>

        {/* Bottom toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Add character (+) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setCharMenuOpen((o) => !o)}
              aria-label="Add character"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700/40 bg-zinc-800 text-zinc-400 transition-colors hover:text-violet-400"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>

            {/* Character selection dropdown */}
            <AnimatePresence>
              {charMenuOpen && characters.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute bottom-full left-0 z-20 mb-1 flex flex-col overflow-hidden rounded-lg border border-zinc-700/40 bg-zinc-900/90 backdrop-blur-xl"
                >
                  {characters.map((char) => (
                    <button
                      key={char.id}
                      type="button"
                      onClick={() => {
                        toggleCharacter(char.id);
                        setCharMenuOpen(false);
                      }}
                      aria-label={`Toggle ${char.name}`}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 text-xs transition-colors',
                        selectedCharacterIds.has(char.id)
                          ? 'bg-violet-500/20 text-violet-300'
                          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
                      )}
                    >
                      {char.imageUrl && (
                        <img
                          src={char.imageUrl}
                          alt={char.name}
                          className="h-4 w-4 rounded-full object-cover"
                        />
                      )}
                      {char.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Add Image */}
          <button
            type="button"
            aria-label="Add image"
            className="flex h-7 items-center gap-1.5 rounded-lg border border-zinc-700/40 bg-zinc-800 px-2 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
          >
            <ImagePlus className="h-3.5 w-3.5" />
          </button>

          {/* Model selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setModelDropdownOpen((o) => !o)}
              aria-label="Select model"
              className="flex items-center gap-1.5 rounded-full border border-orange-500/40 bg-zinc-800 px-2.5 py-1 text-xs font-medium text-orange-300 transition-colors hover:border-orange-400/60"
            >
              <span>{activeModelInfo.icon}</span>
              <span>{activeModelInfo.name}</span>
              <ChevronDown className={cn('h-3 w-3 transition-transform', modelDropdownOpen && 'rotate-180')} />
            </button>

            <AnimatePresence>
              {modelDropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  className="absolute bottom-full left-0 z-20 mb-1 flex flex-col overflow-hidden rounded-lg border border-zinc-700/40 bg-zinc-900/90 backdrop-blur-xl"
                >
                  {GENERATION_MODELS.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        setSelectedModel(model.id);
                        setModelDropdownOpen(false);
                      }}
                      aria-label={`Model ${model.name}`}
                      className={cn(
                        'flex items-center gap-2 whitespace-nowrap px-3 py-1.5 text-xs transition-colors',
                        selectedModel === model.id
                          ? 'bg-orange-500/20 text-orange-300'
                          : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200',
                      )}
                    >
                      <span>{model.icon}</span>
                      {model.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Resolution cycle */}
          <button
            type="button"
            onClick={cycleResolution}
            aria-label="Cycle resolution"
            className="rounded-lg border border-zinc-700/40 bg-zinc-800 px-2.5 py-1 font-mono text-xs text-zinc-300 transition-colors hover:text-white"
          >
            {resolution}
          </button>

          {/* Aspect ratio cycle */}
          <button
            type="button"
            onClick={cycleAspectRatio}
            aria-label="Cycle aspect ratio"
            className="rounded-lg border border-zinc-700/40 bg-zinc-800 px-2.5 py-1 font-mono text-xs text-zinc-300 transition-colors hover:text-white"
          >
            {aspectRatio}
          </button>

          {/* Batch size cycle */}
          <button
            type="button"
            onClick={cycleBatchSize}
            aria-label="Cycle batch size"
            className="rounded-lg border border-zinc-700/40 bg-zinc-800 px-2.5 py-1 font-mono text-xs text-zinc-300 transition-colors hover:text-white"
          >
            {batchSize}x
          </button>

          {/* Send button */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSend}
            aria-label="Send"
            className={cn(
              'ml-auto flex h-8 w-8 items-center justify-center rounded-full transition-all',
              canSend
                ? 'bg-[#f97316] text-black hover:bg-[#fb923c]'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed opacity-50',
            )}
          >
            {generatingShot ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Character roster */}
      {characters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {characters.map((char) => (
            <button
              key={char.id}
              type="button"
              onClick={() => toggleCharacter(char.id)}
              aria-label={`Toggle ${char.name}`}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                selectedCharacterIds.has(char.id)
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700/40 hover:text-zinc-200',
              )}
            >
              {char.imageUrl && (
                <img
                  src={char.imageUrl}
                  alt={char.name}
                  className="h-5 w-5 rounded-full object-cover"
                />
              )}
              {char.name}
            </button>
          ))}
        </div>
      )}

      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to canvas"
        className="flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-[#f97316]"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to canvas
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// WorldviewSection — main export (redesigned)
// ---------------------------------------------------------------------------

export function WorldviewSection() {
  const {
    mode,
    scenes,
    activeSceneId,
    worlds,
    addScene,
    removeScene,
    setActiveScene,
    setMode,
    addWorld,
    assignWorldToScene,
    setSceneGenerationError,
    setSceneShowCreator,
  } = useWorldviewStore();

  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<number | undefined>(undefined);

  const activeScene = scenes.find((s) => s.id === activeSceneId) ?? null;
  const generationError = activeScene?.generationError ?? null;
  const showCreator = activeScene?.showCreator ?? false;
  const activeWorld = activeScene?.worldId
    ? worlds.find((w) => w.id === activeScene.worldId) ?? null
    : null;

  // Determine if we have any content (worlds or scenes with worlds)
  const hasContent = worlds.length > 0 || activeWorld !== null;

  const handleAddScene = useCallback(() => {
    addScene();
  }, [addScene]);

  const handleRemoveScene = useCallback(
    (id: string) => {
      const sceneToRemove = scenes.find((s) => s.id === id);
      if (sceneToRemove && sceneToRemove.takes.length > 0) {
        const filePaths = sceneToRemove.takes
          .filter((t) => t.imageUrl && !t.imageUrl.startsWith('data:'))
          .map((t) => {
            const url = t.imageUrl;
            const parts = url.split('/');
            return parts[parts.length - 1];
          })
          .filter(Boolean);

        if (filePaths.length > 0) {
          supabase.storage
            .from('worldview-takes')
            .remove(filePaths)
            .catch(() => {});
        }
      }
      removeScene(id);
    },
    [removeScene, scenes],
  );

  const handleCreateWorld = useCallback(
    async (prompt: string, model: WorldModel, imageFile?: File) => {
      if (!activeScene) return;

      setGenerating(true);
      setGenerationProgress(10);
      setSceneGenerationError(activeScene.id, null);

      try {
        let imageUrl: string | undefined;
        if (imageFile) {
          const asset = await worldLabsService.uploadMediaAsset(imageFile);
          imageUrl = asset.url;
          setGenerationProgress(20);
        }

        const { operation } = await worldLabsService.generateWorld(
          prompt,
          `World for ${activeScene.name}`,
          model,
          imageUrl,
        );

        setGenerationProgress(30);

        const finalOp = await worldLabsService.pollOperation(
          operation.id,
          (status) => {
            if (status === 'running') {
              setGenerationProgress((prev) => Math.min((prev ?? 30) + 10, 90));
            }
          },
        );

        if (finalOp.status === 'failed') {
          throw new Error(finalOp.error ?? 'World generation failed');
        }

        if (finalOp.worldId) {
          const world = await worldLabsService.getWorld(finalOp.worldId);
          addWorld(world);
          assignWorldToScene(activeScene.id, world.id);
          toast.success('World created successfully!');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to generate world';
        setSceneGenerationError(activeScene.id, message);
        toast.error(message);
      } finally {
        setGenerating(false);
        setGenerationProgress(undefined);
      }
    },
    [activeScene, addWorld, assignWorldToScene, setSceneGenerationError],
  );

  const handleEnterWorld = useCallback(() => {
    setMode('world-viewer');
  }, [setMode]);

  const handleComposeTake = useCallback(
    (takeId: string) => {
      useWorldviewStore.getState().setActiveTake(takeId);
      setMode('shot-composer');
    },
    [setMode],
  );

  const handleRetryGeneration = useCallback(() => {
    if (activeSceneId) {
      setSceneGenerationError(activeSceneId, null);
    }
  }, [activeSceneId, setSceneGenerationError]);

  const handleSetShowCreator = useCallback(
    (show: boolean) => {
      if (activeSceneId) {
        setSceneShowCreator(activeSceneId, show);
      }
    },
    [activeSceneId, setSceneShowCreator],
  );

  const handleAddToCanvas = useCallback(
    (imageUrl: string) => {
      const store = useCanvasStore.getState();
      const canvasObject = {
        id: crypto.randomUUID(),
        type: 'image' as const,
        layerIndex: store.objects.length,
        transform: {
          x: Math.random() * 200 + 100,
          y: Math.random() * 200 + 100,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
        },
        visibility: true,
        locked: false,
        data: {
          url: imageUrl,
          width: 512,
          height: 288,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.addObject(canvasObject);
      toast.success('Added to canvas!');
    },
    [],
  );

  // Enter a world from the history gallery
  const handleEnterHistoryWorld = useCallback(
    (worldId: string) => {
      // Find or create a scene for this world
      const existingScene = scenes.find((s) => s.worldId === worldId);
      if (existingScene) {
        setActiveScene(existingScene.id);
      } else {
        // Create a new scene and assign the world
        const newSceneId = addScene();
        if (newSceneId) {
          assignWorldToScene(newSceneId, worldId);
        }
      }
      setMode('world-viewer');
    },
    [scenes, setActiveScene, addScene, assignWorldToScene, setMode],
  );

  useEffect(() => {
    if (activeSceneId) {
      setSceneShowCreator(activeSceneId, false);
    }
  }, [activeSceneId]); // eslint-disable-line react-hooks/exhaustive-deps

  const contentRef = useRef<HTMLDivElement>(null);
  const prevModeRef = useRef(mode);

  useEffect(() => {
    if (prevModeRef.current !== mode) {
      prevModeRef.current = mode;
      const timer = setTimeout(() => {
        const container = contentRef.current;
        if (!container) return;
        const focusable = container.querySelector<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        focusable?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  // ── Landing state: no active world ──
  if (!hasContent && !activeScene?.showCreator && !generating) {
    return (
      <div className="relative min-h-[calc(100vh-60px)] flex flex-col">
        {/* Watermark */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <span
            className="select-none text-[12vw] font-black uppercase tracking-[-0.04em] text-white/[0.02]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            WORLDVIEW
          </span>
        </div>

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-16">
          {/* Hero */}
          <div className="mb-3 flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-[#f97316]" />
            <span className="rounded-full bg-[#f97316]/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#f97316]">
              3D Worlds
            </span>
          </div>
          <h1
            className="mb-3 text-center text-4xl font-black uppercase tracking-tight text-white md:text-5xl"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            CREATE 3D WORLDS
          </h1>
          <p className="mb-10 max-w-lg text-center text-sm text-zinc-500">
            Generate immersive environments, capture camera takes, and compose AI-powered shots
          </p>

          {/* Feature cards */}
          <div className="mb-10 grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { icon: Globe2, title: 'Text to World', desc: 'Describe any environment', asset: kanvasStarterAssets.worldview.text },
              { icon: ImagePlus, title: 'Image to World', desc: 'Upload a reference image', asset: kanvasStarterAssets.worldview.image },
              { icon: Camera, title: 'Camera Takes', desc: 'Capture 3D viewpoints', asset: kanvasStarterAssets.worldview.camera },
              { icon: Sparkles, title: 'Shot Composer', desc: 'AI-driven compositions', asset: kanvasStarterAssets.worldview.composer },
            ].map(({ icon: Icon, title, desc, asset }) => (
              <div
                key={title}
                className="group relative flex min-h-[190px] flex-col justify-end overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-5 text-center transition-all duration-300 hover:border-[#f97316]/20 hover:bg-white/[0.04] hover:shadow-[0_0_30px_rgba(249,115,22,0.05)]"
              >
                <img src={asset.src} alt={asset.alt} className="absolute inset-0 h-full w-full object-cover opacity-55 transition duration-500 group-hover:scale-105 group-hover:opacity-70" loading="lazy" decoding="async" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/5" />
                <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2 py-1 text-[8px] font-bold uppercase tracking-widest text-white/75 backdrop-blur-sm">Example</span>
                <div className="relative mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-[#f97316]/10 text-[#f97316] transition-colors group-hover:bg-[#f97316]/20">
                  <Icon className="h-5 w-5" />
                </div>
                <p className="relative mt-3 text-sm font-semibold text-white">{title}</p>
                <p className="relative text-xs text-zinc-300">{desc}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <button
            type="button"
            onClick={() => {
              if (!activeScene) addScene();
              const sceneId = activeSceneId ?? scenes[0]?.id;
              if (sceneId) setSceneShowCreator(sceneId, true);
            }}
            className="flex items-center gap-2 rounded-full bg-[#f97316] px-6 py-3 text-sm font-bold text-black transition-all duration-200 hover:bg-[#fb923c] hover:shadow-[0_0_30px_rgba(249,115,22,0.2)]"
          >
            <Zap className="h-4 w-4" />
            Create Your First World
          </button>
        </div>
      </div>
    );
  }

  // ── Workspace state ──
  return (
    <div className="min-w-0 space-y-4 px-2 sm:px-0">
      {/* Mode pill-tab nav (centered) */}
      <div className="flex justify-center pt-2">
        <div className="inline-flex rounded-full bg-[#1A1A1A] p-1 border border-white/[0.06]">
          {(['canvas', 'world-viewer', 'shot-composer'] as const).map((m) => {
            const labels = { canvas: 'Canvas', 'world-viewer': 'World Viewer', 'shot-composer': 'Shot Composer' };
            const isActive = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'px-5 py-2 rounded-full text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-white/10 text-[#f97316] shadow-[inset_0_0_12px_rgba(249,115,22,0.06)]'
                    : 'text-zinc-500 hover:text-zinc-300',
                )}
              >
                {labels[m]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Scene strip */}
      <SceneStrip
        scenes={scenes}
        activeSceneId={activeSceneId}
        onSelect={setActiveScene}
        onAddScene={handleAddScene}
        onRemoveScene={handleRemoveScene}
      />

      {/* Mode-dependent content */}
      <div ref={contentRef}>
        <AnimatePresence mode="wait">
          {activeScene ? (
            mode === 'canvas' ? (
              <WorldviewCanvas
                key="canvas"
                scene={activeScene}
                world={activeWorld}
                generating={generating}
                generationProgress={generationProgress}
                generationError={generationError}
                showCreator={showCreator}
                onCreateWorld={handleCreateWorld}
                onEnterWorld={handleEnterWorld}
                onComposeTake={handleComposeTake}
                onRetryGeneration={handleRetryGeneration}
                onSetShowCreator={handleSetShowCreator}
                onAddToCanvas={handleAddToCanvas}
              />
            ) : mode === 'world-viewer' ? (
              <GSplatViewer
                key="world-viewer"
                world={activeWorld}
                onClose={() => setMode('canvas')}
              />
            ) : (
              <ShotComposer
                key="shot-composer"
                scene={activeScene}
                onBack={() => setMode('canvas')}
              />
            )
          ) : (
            <motion.div key="empty" {...fadeIn}>
              <KanvasEmptyState bare className="py-6" title="Create a new scene to get started" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── YOUR WORLDS — History Gallery ── */}
      {worlds.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Your Worlds
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {worlds.map((world) => (
              <WorldCard
                key={world.id}
                world={world}
                onEnterWorld={() => handleEnterHistoryWorld(world.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
