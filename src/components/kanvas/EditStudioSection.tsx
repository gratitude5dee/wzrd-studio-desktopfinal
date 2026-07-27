/* Edit Studio — redesigned */
import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Paintbrush, Wand2, Eraser, Plus, Sparkles, Loader2, Upload,
  Video, Sun, Palette, ArrowUpCircle, ScanFace, RotateCcw, Hand, Undo2, Redo2,
  Download, X, MousePointer2, ChevronDown, Layers,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { imageEditService } from '@/services/imageEditService';
import type { ImageEditOperation } from '@/types/imageEdit';
import type { KanvasAsset, KanvasJob, KanvasAssetType, KanvasModel } from '@/features/kanvas/types';
import { normalizeKanvasAssetMedia, normalizeKanvasJobMedia } from '@/features/kanvas/helpers';
import { isFalKanvasModel } from '@/features/kanvas/modelProvider';
import EditCanvas, { type EditCanvasHandle } from './EditCanvas';
import { musicPolishAssets } from '@/lib/musicPolishAssets';
import { KanvasMediaPreview } from '@/components/kanvas/KanvasMediaPreview';

/* ── Types ── */
type EditFeature = 'inpaint' | 'removeBackground' | 'upscale' | 'relight' | 'stylize' | 'skinEnhance' | 'angles' | 'productPlacement';

interface FeatureItem {
  id: EditFeature;
  label: string;
  description: string;
  icon: LucideIcon;
  operation: ImageEditOperation | null;
  badge?: 'TOP' | 'NEW' | 'SOON';
}

interface EditModelItem {
  id: string;
  name: string;
  badge?: 'TOP' | 'NEW';
  credits: number;
  provider?: string;
  providerLabel?: string;
}

/* ── Data ── */
const FEATURES: FeatureItem[] = [
  { id: 'inpaint', label: 'Inpaint', description: 'Fill, replace, or extend regions with AI.', icon: Paintbrush, operation: 'inpaint', badge: 'TOP' },
  { id: 'removeBackground', label: 'Remove BG', description: 'Isolate subjects with precision cutouts.', icon: Wand2, operation: 'removeBackground' },
  { id: 'upscale', label: 'Upscale', description: 'Enhance resolution up to 4x with AI.', icon: ArrowUpCircle, operation: 'upscale' as ImageEditOperation },
  { id: 'productPlacement', label: 'Product Placement', description: 'Embed products into scenes naturally.', icon: Video, operation: 'productPlacement' as ImageEditOperation },
];

const HERO_FEATURES = FEATURES.filter(f => ['inpaint', 'removeBackground', 'upscale', 'productPlacement'].includes(f.id));
const TAB_FEATURES = FEATURES;

const FEATURE_IMAGES: Record<string, string> = {
  inpaint: musicPolishAssets.toolSurfaces.editWorkbench.src,
  removeBackground: musicPolishAssets.kanvas.backgroundReframe.src,
  upscale: musicPolishAssets.landing.platformDeliveryWall.src,
  relight: musicPolishAssets.cinema.soundstage.src,
  stylize: musicPolishAssets.lyrics.animatedRain.src,
  skinEnhance: musicPolishAssets.talent.faceWardrobe.src,
  angles: musicPolishAssets.landing.rooftopChoreography.src,
  productPlacement: musicPolishAssets.kanvas.stageProductVisual.src,
};

/* ── Helpers ── */
function resolveAssetUrl(asset: KanvasAsset): string | null {
  return asset.cdn_url ?? asset.preview_url ?? asset.thumbnail_url;
}

/* ── Props ── */
interface EditStudioProps {
  assets: KanvasAsset[];
  jobs: KanvasJob[];
  selectedJob: KanvasJob | null;
  models: KanvasModel[];
  uploading: boolean;
  onUpload: (file: File, assetType: KanvasAssetType) => void;
}

type CanvasTool = 'select' | 'draw' | 'eraser' | 'hand';

export default function EditStudioSection({ assets, jobs, selectedJob, models, uploading, onUpload }: EditStudioProps) {
  const [selectedFeature, setSelectedFeature] = useState<EditFeature>('inpaint');
  const [setupError, setSetupError] = useState<string | null>(null);
  const availableModels = useMemo<EditModelItem[]>(
    () =>
      models.filter(isFalKanvasModel).map((model) => ({
        id: model.id,
        name: model.name,
        credits: model.credits,
        provider: model.provider,
        providerLabel: model.providerLabel,
      })),
    [models]
  );
  const [selectedModelId, setSelectedModelId] = useState(availableModels[0]?.id ?? '');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<CanvasTool>('draw');
  const [inpaintPrompt, setInpaintPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(true);
  const [brushSize, setBrushSize] = useState(20);

  const canvasRef = useRef<EditCanvasHandle>(null);
  const prevAssetsLenRef = useRef(assets.length);

  useEffect(() => {
    if (assets.length > prevAssetsLenRef.current && !selectedAssetId) {
      const newest = assets[assets.length - 1];
      if (newest) setSelectedAssetId(newest.id);
    }
    prevAssetsLenRef.current = assets.length;
  }, [assets, selectedAssetId]);

  useEffect(() => {
    if (availableModels.some((model) => model.id === selectedModelId)) {
      return;
    }
    setSelectedModelId(availableModels[0]?.id ?? '');
  }, [availableModels, selectedModelId]);

  const selectedAsset = useMemo(
    () => assets.find((a) => a.id === selectedAssetId) ?? null,
    [assets, selectedAssetId]
  );

  const activeFeature = FEATURES.find((f) => f.id === selectedFeature)!;
  const selectedModel = availableModels.find((m) => m.id === selectedModelId) ?? availableModels[0] ?? null;
  const hasWorkspace = selectedAsset !== null;
  const canvasImageUrl = selectedAsset ? resolveAssetUrl(selectedAsset) : null;

  const completedJobs = useMemo(
    () => jobs.filter((j) => j.status === 'completed' && normalizeKanvasJobMedia(j).status === 'ready'),
    [jobs]
  );

  function handleUploadClick() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) onUpload(file, 'image');
    };
    input.click();
  }

  function handleToolChange(tool: CanvasTool) {
    setActiveTool(tool);
    canvasRef.current?.setTool(tool);
  }

  async function handleGenerate() {
    if (!selectedModelId) {
      toast.error('No edit models are available right now');
      return;
    }

    if (!selectedAsset) {
      toast.error('Select an asset first');
      return;
    }
    const imageUrl = resolveAssetUrl(selectedAsset);
    if (!imageUrl) {
      toast.error('Asset has no accessible URL');
      return;
    }
    const operation = activeFeature.operation;
    if (!operation) {
      toast.error(`${activeFeature.label} is unavailable for the selected asset.`);
      return;
    }

    setIsProcessing(true);
    setSetupError(null);
    try {
      let maskDataUrl: string | undefined;

      if (operation === 'inpaint') {
        if (!inpaintPrompt.trim()) {
          toast.error('Enter a prompt for inpainting');
          setIsProcessing(false);
          return;
        }
        maskDataUrl = (await canvasRef.current?.getMaskDataUrl()) ?? undefined;
        if (!maskDataUrl) {
          toast.error('Draw a mask on the image first');
          setIsProcessing(false);
          return;
        }
      }

      const result = await imageEditService.executeOperation({
        projectId: selectedAsset.project_id ?? selectedAsset.id,
        nodeId: selectedAsset.id,
        operation,
        prompt: operation === 'inpaint' ? inpaintPrompt : undefined,
        imageUrl,
        maskDataUrl,
        modelId: selectedModelId,
      });

      if (result.asset?.url) {
        canvasRef.current?.addResultImage(result.asset.url);
        toast.success(`${activeFeature.label} complete`);
      } else if (result.layers && result.layers.length > 0) {
        result.layers.forEach((l: { url: string }) => {
          canvasRef.current?.addResultImage(l.url);
        });
        toast.success(`Split into ${result.layers.length} layers`);
      } else {
        toast.error('No result returned');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Operation failed';
      if (/FAL_KEY/i.test(message)) {
        setSetupError(
          'Edit Studio is Fal-backed. Add FAL_KEY as a Supabase Edge Function secret, then retry this edit.'
        );
      }
      toast.error(message);
    } finally {
      setIsProcessing(false);
    }
  }

  /* ── LANDING STATE ── */
  if (!hasWorkspace) {
    return (
      <div className="fixed inset-0 top-[68px] bg-[#090909] z-20 overflow-y-auto overflow-x-hidden pb-16 md:pb-0" style={{ scrollbarWidth: 'none' }}>
        <style>{`::-webkit-scrollbar { display: none; }`}</style>

        {/* SVG noise overlay */}
        <div className="fixed inset-0 top-[68px] pointer-events-none z-30 opacity-[0.04] mix-blend-overlay"
          style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`, backgroundRepeat: 'repeat', backgroundSize: '128px 128px' }}
        />

        {/* Massive watermark */}
        <span className="absolute top-20 left-1/2 -translate-x-1/2 text-[280px] font-black text-white/[0.015] pointer-events-none select-none uppercase leading-none whitespace-nowrap"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          EDIT
        </span>

        {/* Hero section */}
        <div className="relative z-10 flex flex-col items-center pt-12 md:pt-24 pb-16 px-4 md:px-6">
          <p className="text-[10px] uppercase tracking-[0.3em] text-[#f97316] font-bold mb-4">AI-Powered Studio</p>
          <h1 className="text-3xl md:text-5xl lg:text-7xl font-black text-white uppercase tracking-[-0.03em] text-center mb-4"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            TRANSFORM YOUR<br />IMAGES
          </h1>
          <p className="text-sm text-zinc-500 max-w-md text-center mb-8 md:mb-12">
            Draw masks, inpaint, upscale, remove backgrounds, and relight — all on an infinite canvas powered by AI.
          </p>

          {/* Feature carousel — perspective tilted cards */}
          <div className="hidden md:flex gap-5 mb-16" style={{ perspective: '1200px' }}>
            {HERO_FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              const isActive = selectedFeature === feature.id;
              const rotations = [-6, -2, 2, 6];
              return (
                <button
                  key={feature.id}
                  onClick={() => setSelectedFeature(feature.id)}
                  className={`relative w-[200px] h-[280px] rounded-2xl overflow-hidden flex-shrink-0 transition-all duration-300 group ${
                    isActive ? 'ring-2 ring-[#f97316]/40 scale-105 z-10' : 'opacity-80 hover:opacity-100 hover:scale-[1.02]'
                  }`}
                  style={{ transform: `rotateY(${rotations[i]}deg)`, transformStyle: 'preserve-3d' }}
                >
                  <img
                    src={FEATURE_IMAGES[feature.id]}
                    alt={feature.label}
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Icon className="h-3.5 w-3.5 text-[#f97316]" />
                      {feature.badge && (
                        <span className={`text-[7px] font-bold px-1.5 py-0.5 rounded-full ${
                          feature.badge === 'TOP' ? 'bg-red-500/30 text-red-400' :
                          feature.badge === 'NEW' ? 'bg-[#f97316]/20 text-[#f97316]' :
                          'bg-zinc-700/50 text-zinc-500'
                        }`}>{feature.badge}</span>
                      )}
                    </div>
                    <h3 className="text-white font-bold text-sm uppercase tracking-wide">{feature.label}</h3>
                    <p className="text-zinc-400 text-[10px] mt-1 leading-tight">{feature.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* All features — horizontal scrollable pills */}
          <div className="w-full max-w-4xl mb-12">
            <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold mb-4 text-center">All Editing Tools</p>
            <div className="flex flex-wrap justify-center gap-2">
              {FEATURES.map((feature) => {
                const Icon = feature.icon;
                const isActive = selectedFeature === feature.id;
                return (
                  <button
                    key={feature.id}
                    onClick={() => setSelectedFeature(feature.id)}
                    className={`flex items-center gap-2.5 px-4 py-3 rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-[#1a1a1a] border border-[#f97316]/20 shadow-[0_0_20px_rgba(249,115,22,0.06)]'
                        : 'bg-[#111] border border-white/[0.04] hover:bg-[#161616] hover:border-white/[0.08]'
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${isActive ? 'text-[#f97316]' : 'text-zinc-500'}`} />
                    <div className="text-left">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-semibold ${isActive ? 'text-white' : 'text-zinc-400'}`}>{feature.label}</span>
                        {feature.badge && (
                          <span className={`text-[7px] font-bold px-1 py-0.5 rounded-full ${
                            feature.badge === 'TOP' ? 'bg-red-500/20 text-red-400' :
                            feature.badge === 'NEW' ? 'bg-[#f97316]/20 text-[#f97316]' :
                            'bg-zinc-700/50 text-zinc-500'
                          }`}>{feature.badge}</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Upload CTA */}
          <button
            onClick={handleUploadClick}
            disabled={uploading}
            className="bg-[#f97316] text-black font-bold uppercase tracking-widest text-[11px] px-10 py-4 rounded-full flex items-center gap-2.5 hover:shadow-[0_0_40px_rgba(249,115,22,0.3)] transition-all disabled:opacity-50 mb-6"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {uploading ? 'Uploading…' : 'Upload to Start Editing'}
          </button>
          <p className="mb-2 text-[10px] text-zinc-500">
            {selectedModel ? `Fal edit model: ${selectedModel.name}` : 'No Fal edit models available'}
          </p>
          <p className="text-[10px] text-zinc-600">Supports PNG, JPG, WebP up to 20MB</p>
        </div>
      </div>
    );
  }

  /* ── ACTIVE WORKSPACE (tldraw canvas) ── */
  const TOOLS: { id: CanvasTool; icon: LucideIcon; label: string }[] = [
    { id: 'select', icon: MousePointer2, label: 'Select' },
    { id: 'draw', icon: Paintbrush, label: 'Mask' },
    { id: 'eraser', icon: Eraser, label: 'Eraser' },
    { id: 'hand', icon: Hand, label: 'Pan' },
  ];

  return (
    <div className="fixed inset-0 top-[68px] bg-[#090909] z-20 overflow-hidden flex flex-col md:flex-row" style={{ scrollbarWidth: 'none' }}>
      <style>{`::-webkit-scrollbar { display: none; }`}</style>

      {/* SVG noise overlay */}
      <div className="fixed inset-0 top-[68px] pointer-events-none z-[60] opacity-[0.04] mix-blend-overlay"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`, backgroundRepeat: 'repeat', backgroundSize: '128px 128px' }}
      />

      {/* Left: Thumbnail Rail (80px) */}
      <div className="hidden md:flex w-20 flex-shrink-0 h-full bg-[#0a0a0a] border-r border-white/[0.06] flex-col py-4 px-2 gap-1.5 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        <p className="text-[8px] uppercase tracking-[0.2em] text-zinc-600 font-bold text-center mb-2">Assets</p>

        {/* Upload button */}
        <button
          onClick={handleUploadClick}
          disabled={uploading}
          className="w-full aspect-square rounded-xl bg-[#111] border border-dashed border-white/10 hover:border-[#f97316]/30 flex flex-col items-center justify-center text-zinc-500 hover:text-[#f97316] transition-all flex-shrink-0 gap-1"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="text-[7px] uppercase tracking-wider">Upload</span>
        </button>

        {/* Asset thumbnails */}
        {assets.map((asset) => {
          const media = normalizeKanvasAssetMedia(asset);
          const isActive = selectedAssetId === asset.id;
          return (
            <button
              key={asset.id}
              onClick={() => setSelectedAssetId(asset.id)}
              className={`w-full aspect-square rounded-xl overflow-hidden flex-shrink-0 transition-all duration-200 ${
                isActive
                  ? 'ring-2 ring-[#f97316] ring-offset-2 ring-offset-[#0a0a0a] scale-105'
                  : 'opacity-60 hover:opacity-100 hover:scale-[1.02]'
              }`}
            >
              <KanvasMediaPreview
                media={media}
                aspectClassName="aspect-square"
                className="h-full w-full"
                showErrorLabel={false}
              />
            </button>
          );
        })}

        {/* Results divider + thumbnails */}
        {completedJobs.length > 0 && (
          <>
            <div className="flex items-center gap-1 mt-2 mb-1">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <span className="text-[7px] uppercase tracking-[0.15em] text-zinc-600">Results</span>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
            {completedJobs.slice(0, 6).map((job) => {
              const media = normalizeKanvasJobMedia(job);
              const resultUrl = media.primaryUrl ?? media.previewUrl;
              return (
                <button
                  key={job.id}
                  onClick={() => resultUrl && canvasRef.current?.addResultImage(resultUrl)}
                  className="group relative aspect-square w-full flex-shrink-0 overflow-hidden rounded-xl opacity-60 transition-all hover:opacity-100"
                >
                  <KanvasMediaPreview media={media} aspectClassName="aspect-square" className="h-full w-full" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                    <Sparkles className="h-3 w-3 text-[#f97316]" />
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>

      {/* Center: Canvas + Chrome */}
      <main className="flex-1 h-full bg-[#0e0e0e] relative overflow-hidden">

        {/* Top bar — pill tab nav + model + close */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 py-3">
          {/* Left spacer */}
          <div className="w-32" />

          {/* Centered pill tab nav */}
          <div className="inline-flex bg-[#1A1A1A] rounded-full p-1 border border-white/[0.06]">
            {TAB_FEATURES.map((feature) => {
              const Icon = feature.icon;
              const isActive = selectedFeature === feature.id;
              return (
                <button
                  key={feature.id}
                  onClick={() => setSelectedFeature(feature.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-white/10 text-[#f97316] shadow-[inset_0_0_12px_rgba(249,115,22,0.06)]'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {feature.label}
                </button>
              );
            })}
          </div>

          {/* Right: Model dropdown + Close */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                disabled={!selectedModel}
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1A1A1A] border border-white/[0.06] text-xs text-zinc-400 hover:text-white transition-colors"
              >
                <span className="truncate max-w-[120px]">{selectedModel?.name ?? 'No models'}</span>
                {selectedModel && <span className="text-[9px] text-[#f97316] font-bold">{selectedModel.credits}cr</span>}
                <ChevronDown className="h-3 w-3" />
              </button>

              {showModelDropdown && availableModels.length > 0 && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-[#131313] border border-white/[0.08] rounded-xl p-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] z-50">
                  {availableModels.map((model) => {
                    const isActive = selectedModelId === model.id;
                    return (
                      <button
                        key={model.id}
                        onClick={() => { setSelectedModelId(model.id); setShowModelDropdown(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all ${
                          isActive ? 'bg-white/[0.08] text-white' : 'text-zinc-400 hover:bg-white/[0.04] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-medium truncate">{model.name}</span>
                          {model.credits === 0 && <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1.5 rounded-full">FREE</span>}
                          {model.badge && (
                            <span className={`text-[7px] font-bold px-1 py-0.5 rounded-full flex-shrink-0 ${
                              model.badge === 'TOP' ? 'bg-red-500/20 text-red-400' : 'bg-[#f97316]/20 text-[#f97316]'
                            }`}>{model.badge}</span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-600 flex-shrink-0">{model.credits}cr</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedAssetId(null)}
              className="text-zinc-500 hover:text-white p-1.5 rounded-full hover:bg-white/[0.05] transition-all"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Canvas crosshatch grid background */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }}
        />

        {/* tldraw Canvas */}
        <EditCanvas ref={canvasRef} imageUrl={canvasImageUrl} />

        {/* Floating left tool palette */}
        <div className="hidden md:flex absolute left-5 top-1/2 -translate-y-1/2 bg-[#131313]/95 backdrop-blur-xl border border-white/[0.08] rounded-2xl flex-col p-1.5 gap-0.5 z-20">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                onClick={() => handleToolChange(tool.id)}
                title={tool.label}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-2.5 transition-all duration-200 ${
                  isActive
                    ? 'bg-[#f97316] text-black shadow-[0_0_15px_rgba(249,115,22,0.2)]'
                    : 'text-zinc-500 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="text-[7px] font-medium uppercase tracking-wider">{tool.label}</span>
              </button>
            );
          })}

          {/* Brush size slider (shown when draw is active) */}
          {activeTool === 'draw' && (
            <>
              <div className="h-px bg-white/[0.06] my-1" />
              <div className="flex flex-col items-center gap-1 px-1 py-2">
                <span className="text-[7px] text-zinc-500 uppercase">Size</span>
                <input
                  type="range"
                  min={2}
                  max={60}
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-12 h-1 accent-[#f97316] [writing-mode:vertical-lr] rotate-180"
                  style={{ height: 60 }}
                />
                <span className="text-[8px] text-zinc-500 font-mono">{brushSize}px</span>
              </div>
            </>
          )}

          <div className="h-px bg-white/[0.06] my-1" />
          <button
            onClick={() => canvasRef.current?.undo()}
            className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-2.5 text-zinc-500 hover:text-white hover:bg-white/[0.05] transition-all"
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
            <span className="text-[7px] font-medium uppercase tracking-wider">Undo</span>
          </button>
          <button
            onClick={() => canvasRef.current?.redo()}
            className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-2.5 text-zinc-500 hover:text-white hover:bg-white/[0.05] transition-all"
            title="Redo"
          >
            <Redo2 className="h-4 w-4" />
            <span className="text-[7px] font-medium uppercase tracking-wider">Redo</span>
          </button>
          <div className="h-px bg-white/[0.06] my-1" />
          <button
            className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-2.5 text-zinc-500 hover:text-white hover:bg-white/[0.05] transition-all"
            title="Download"
          >
            <Download className="h-4 w-4" />
            <span className="text-[7px] font-medium uppercase tracking-wider">Save</span>
          </button>
        </div>

        {/* Right settings panel */}
        {showSettingsPanel && (
          <div className="hidden md:flex absolute right-0 top-14 bottom-20 w-60 bg-[#0e0e0e]/95 backdrop-blur-xl border-l border-white/[0.06] z-20 overflow-y-auto flex-col" style={{ scrollbarWidth: 'none' }}>
            {/* Feature controls header */}
            <div className="p-4 border-b border-white/[0.06]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-bold">Settings</p>
                <button onClick={() => setShowSettingsPanel(false)} className="text-zinc-600 hover:text-white transition-colors">
                  <X className="h-3 w-3" />
                </button>
              </div>

              {/* Active feature */}
              <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                <activeFeature.icon className="h-3.5 w-3.5 text-[#f97316]" />
                <span className="text-xs text-white font-medium">{activeFeature.label}</span>
              </div>

              {/* Model selector */}
              <div>
                <p className="text-[8px] uppercase tracking-[0.15em] text-zinc-600 mb-2">Model</p>
                <select
                  value={selectedModelId}
                  onChange={(e) => setSelectedModelId(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white appearance-none focus:outline-none focus:border-[#f97316]/30"
                  disabled={availableModels.length === 0}
                >
                  {availableModels.length === 0 ? (
                    <option value="">No models available</option>
                  ) : availableModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} — {m.credits}cr</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Feature-specific controls */}
            <div className="p-4 flex-1">
              {selectedFeature === 'inpaint' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.15em] text-zinc-600 mb-2">Brush Size</p>
                    <input
                      type="range" min={2} max={60} value={brushSize}
                      onChange={(e) => setBrushSize(Number(e.target.value))}
                      className="w-full h-1 accent-[#f97316]"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-[8px] text-zinc-600">2px</span>
                      <span className="text-[8px] text-[#f97316] font-mono">{brushSize}px</span>
                      <span className="text-[8px] text-zinc-600">60px</span>
                    </div>
                  </div>
                </div>
              )}

              {selectedFeature === 'upscale' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-[8px] uppercase tracking-[0.15em] text-zinc-600 mb-2">Scale Factor</p>
                    <div className="flex gap-1">
                      {['2x', '4x'].map((scale) => (
                        <button key={scale} className="flex-1 py-2 rounded-lg bg-[#1a1a1a] border border-white/[0.06] text-xs text-zinc-400 hover:text-white hover:border-white/[0.12] transition-all">
                          {scale}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Recent results */}
            {completedJobs.length > 0 && (
              <div className="p-4 border-t border-white/[0.06]">
                <p className="text-[8px] uppercase tracking-[0.15em] text-zinc-600 mb-2">Recent Results</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {completedJobs.slice(0, 4).map((job) => {
                    const media = normalizeKanvasJobMedia(job);
                    const resultUrl = media.primaryUrl ?? media.previewUrl;
                    return (
                      <button
                        key={job.id}
                        onClick={() => resultUrl && canvasRef.current?.addResultImage(resultUrl)}
                        className="aspect-square overflow-hidden rounded-lg opacity-70 transition-opacity hover:opacity-100"
                      >
                        <KanvasMediaPreview media={media} aspectClassName="aspect-square" className="h-full w-full" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Settings toggle (when panel closed) */}
        {!showSettingsPanel && (
          <button
            onClick={() => setShowSettingsPanel(true)}
            className="absolute right-5 top-16 z-20 p-2.5 rounded-xl bg-[#131313]/90 backdrop-blur-xl border border-white/[0.08] text-zinc-400 hover:text-white transition-colors"
          >
            <Layers className="h-4 w-4" />
          </button>
        )}

        {/* Bottom Prompt Bar (upgraded) */}
        <div className="absolute bottom-16 md:bottom-5 left-1/2 -translate-x-1/2 w-full max-w-4xl z-30 px-3 md:px-4">
          {/* Processing progress bar */}
          {isProcessing && (
            <div className="w-full h-0.5 bg-[#1a1a1a] rounded-full mb-2 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#f97316] to-[#f97316]/50 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          )}

          <div className="bg-[#131313]/95 backdrop-blur-2xl border border-white/[0.06] rounded-2xl p-3 flex items-center gap-3 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            {setupError && (
              <div className="absolute -top-14 left-3 right-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                {setupError}
              </div>
            )}
            {/* Active feature pill */}
            <div className="flex-none flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
              <activeFeature.icon className="h-3.5 w-3.5 text-[#f97316]" />
              <span className="text-[10px] text-zinc-400 font-medium uppercase tracking-wider">{activeFeature.label}</span>
            </div>

            {/* Prompt input */}
            <input
              type="text"
              value={inpaintPrompt}
              onChange={(e) => setInpaintPrompt(e.target.value)}
              placeholder={
                selectedFeature === 'inpaint'
                  ? 'Draw a mask, then describe what to fill…'
                  : `Describe your ${activeFeature.label.toLowerCase()} edit…`
              }
              className="flex-1 bg-transparent border-none text-white placeholder-zinc-600 text-sm h-12 focus:outline-none focus:ring-0"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            />

            {/* Model chip */}
            <button
              disabled={!selectedModel}
              onClick={() => setShowModelDropdown(!showModelDropdown)}
              className="flex-none flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <span className="truncate max-w-[80px]">{selectedModel ? selectedModel.name.split(' ').slice(0, 2).join(' ') : 'No models'}</span>
              <ChevronDown className="h-2.5 w-2.5" />
            </button>

            {/* Credit cost badge */}
            {selectedModel && (
              <span className="flex-none text-[10px] font-bold text-[#f97316] bg-[#f97316]/10 px-2 py-1 rounded-full">
                {selectedModel.credits}cr
              </span>
            )}

            {/* Generate button */}
            <button
              onClick={handleGenerate}
              disabled={isProcessing || !activeFeature.operation || !selectedModel}
              className="flex-none bg-[#f97316] text-black font-bold uppercase tracking-widest text-[11px] px-7 py-3 rounded-full flex items-center gap-2 hover:shadow-[0_0_25px_rgba(249,115,22,0.4)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {isProcessing ? 'Processing…' : 'Edit'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
