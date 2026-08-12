import { useCallback, useState } from 'react';
import { Send, Loader2, Music, Disc3, Mic2, Megaphone, Film, Wand2, ChevronRight, Sparkles, X, CheckCircle2, AlertTriangle } from 'lucide-react';

import { PixelLoader } from '@/components/craft/PixelLoader';
import { Composer, ComposerContextChip } from '@/components/craft/Composer';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useWorkflowGeneration } from '@/hooks/studio/useWorkflowGeneration';
import type { NodeDefinition, EdgeDefinition } from '@/types/computeFlow';
import { WorkflowPromptAutocomplete, type AutocompleteSuggestion } from './WorkflowPromptAutocomplete';
import { WorkflowSettingsMenu, DEFAULT_SETTINGS, type WorkflowSettings } from './WorkflowSettingsMenu';

const WORKFLOW_EXAMPLES = [
  {
    id: 'music-video-treatment',
    prompt:
      'Generate a music video treatment workflow: mood board image nodes, a shot list of cinematic stills, and reference-to-video clips for each scene',
    title: 'Music video treatment',
    type: 'Multi-node workflow',
    icon: Film,
  },
  {
    id: 'album-cover-campaign',
    prompt:
      'Create an album cover campaign workflow: hero cover art, alternate covers, square + 9:16 story crops, and animated social teasers',
    title: 'Album cover campaign',
    type: 'Multi-node workflow',
    icon: Disc3,
  },
  {
    id: 'tour-visual-loop',
    prompt:
      'Build a tour visual loop pack: looping background visuals for stage screens in 16:9 and vertical, plus high-energy transition stings',
    title: 'Tour visual loop',
    type: 'Multi-node workflow',
    icon: Music,
  },
  {
    id: 'artist-promo-pack',
    prompt:
      'Generate an artist promo pack: press shots, EPK header image, square social avatars, and lyric story templates',
    title: 'Artist promo pack',
    type: 'Multi-node workflow',
    icon: Megaphone,
  },
  {
    id: 'lyric-video-starter',
    prompt:
      'Generate a lyric video starter: typography frames, kinetic backgrounds, and audio-reactive video clips for a visualizer',
    title: 'Lyric video / visualizer',
    type: 'Multi-node workflow',
    icon: Mic2,
  },
];

interface WorkflowGeneratorTabProps {
  projectId?: string;
  selectedNodeId?: string | null;
  onWorkflowGenerated: (nodes: NodeDefinition[], edges: EdgeDefinition[]) => void;
  onClose?: () => void;
  selectedNodeLabel?: string | null;
  variant?: 'panel' | 'popup';
  maxHeight?: number | string;
}

export function WorkflowGeneratorTab({
  projectId,
  selectedNodeId,
  onWorkflowGenerated,
  onClose,
  selectedNodeLabel,
  variant = 'panel',
  maxHeight,
}: WorkflowGeneratorTabProps) {
  const [settings, setSettings] = useState<WorkflowSettings>(DEFAULT_SETTINGS);
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  const {
    prompt,
    setPrompt,
    isGenerating,
    phase,
    assistantMessage,
    questions,
    answers,
    setupError,
    setAnswer,
    handleGenerate,
    handleMaterialize,
    handleExampleClick,
    handleKeyDown,
    resetAgent,
  } =
    useWorkflowGeneration({
      projectId,
      selectedNodeId,
      onWorkflowGenerated,
      onComplete: onClose,
      settings,
    });

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setPrompt(value);
      setShowAutocomplete(value.trim().length > 0);
    },
    [setPrompt]
  );

  const handleSuggestionSelect = useCallback(
    (suggestion: AutocompleteSuggestion) => {
      setPrompt(suggestion.prompt);
      setShowAutocomplete(false);
    },
    [setPrompt]
  );

  const handlePromptFocus = useCallback(() => {
    if (prompt.trim().length > 0) {
      setShowAutocomplete(true);
    }
  }, [prompt]);

  const handlePromptBlur = useCallback(() => {
    // Delay to allow click on suggestion
    setTimeout(() => setShowAutocomplete(false), 200);
  }, []);

  const wrappedHandleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't trigger generate when autocomplete is open and Tab is pressed
      if (showAutocomplete && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Tab')) {
        return; // Let the autocomplete handle these keys
      }
      if (e.key === 'Escape') {
        setShowAutocomplete(false);
        return;
      }
      handleKeyDown(e);
    },
    [handleKeyDown, showAutocomplete]
  );

  const isPopup = variant === 'popup';
  const hasQuestions = questions.length > 0;
  const canSubmit = prompt.trim().length > 0 && !isGenerating;
  const primaryAction = hasQuestions ? handleMaterialize : handleGenerate;
  const primaryLabel = hasQuestions ? 'Generate Nodes' : 'Plan Workflow';

  const renderQuestionControl = (question: (typeof questions)[number]) => {
    const value = answers[question.id] ?? question.defaultValue ?? '';
    const setQuestionValue = (nextValue: unknown) => setAnswer(question.id, nextValue);

    if (question.controlType === 'segmented' || question.controlType === 'select' || question.controlType === 'image-role') {
      return (
        <div className="flex flex-wrap gap-2">
          {(question.options ?? []).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setQuestionValue(option.value)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs transition-colors',
                value === option.value
                  ? 'border-[#f97316]/50 bg-[#2a170e] text-[#fdba74]'
                  : 'border-white/10 bg-[#171717] text-zinc-300 hover:border-white/20'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      );
    }

    if (question.controlType === 'slider') {
      const numericValue = typeof value === 'number' ? value : 50;
      return (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            value={numericValue}
            onChange={(event) => setQuestionValue(Number(event.target.value))}
            className="h-2 flex-1 accent-[#f97316]"
          />
          <span className="w-10 text-right text-xs text-zinc-400">{numericValue}</span>
        </div>
      );
    }

    if (question.controlType === 'audio-clip' || question.controlType === 'video-trim') {
      const rangeValue =
        value && typeof value === 'object'
          ? (value as { trimStartMs?: number; trimEndMs?: number; role?: string })
          : {};
      const durationMs = question.assetRef?.durationMs ?? rangeValue.trimEndMs ?? 10000;
      return (
        <div className="space-y-3">
          <div className="h-10 rounded-xl border border-white/10 bg-[#0f0f0f] px-3 py-2">
            <div className="h-full rounded-lg bg-gradient-to-r from-[#f97316]/20 via-[#fdba74]/30 to-[#f97316]/10" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={0}
              max={durationMs}
              value={rangeValue.trimStartMs ?? 0}
              onChange={(event) => setQuestionValue({ ...rangeValue, trimStartMs: Number(event.target.value) })}
              className="rounded-xl border border-white/10 bg-[#171717] px-3 py-2 text-xs text-white outline-none"
              aria-label="Clip start"
            />
            <input
              type="number"
              min={0}
              max={durationMs}
              value={rangeValue.trimEndMs ?? durationMs}
              onChange={(event) => setQuestionValue({ ...rangeValue, trimEndMs: Number(event.target.value) })}
              className="rounded-xl border border-white/10 bg-[#171717] px-3 py-2 text-xs text-white outline-none"
              aria-label="Clip end"
            />
          </div>
        </div>
      );
    }

    if (question.controlType === 'checkbox') {
      return (
        <label className="flex items-center gap-2 text-xs text-zinc-300">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => setQuestionValue(event.target.checked)}
            className="accent-[#f97316]"
          />
          Enabled
        </label>
      );
    }

    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => setQuestionValue(event.target.value)}
        className="min-h-[72px] w-full resize-none rounded-xl border border-white/10 bg-[#171717] px-3 py-2 text-xs text-white outline-none placeholder:text-zinc-600"
      />
    );
  };

  return (
    <div
      className={cn(
        'flex overflow-hidden border border-[rgba(249,115,22,0.12)] bg-[#0f0f0f]/98 text-white shadow-[0_24px_72px_rgba(0,0,0,0.38)]',
        isPopup ? 'rounded-[30px] bg-[#111111]/98 backdrop-blur-2xl' : 'rounded-[28px]'
      )}
      style={maxHeight ? { maxHeight } : undefined}
    >
      <div className="flex min-h-0 flex-1 flex-col">
      <div className={cn('border-b border-[rgba(249,115,22,0.10)]', isPopup ? 'px-5 py-4' : 'px-5 py-4')}>
        <div className="flex items-start gap-3">
          <motion.div
            className={cn(
              'flex items-center justify-center border border-[#f97316]/20 bg-[#1c1510] text-[#fdba74]',
              isPopup ? 'h-10 w-10 rounded-2xl' : 'h-11 w-11 rounded-2xl'
            )}
            animate={{ boxShadow: ['0 0 0 rgba(249,115,22,0)', '0 0 18px rgba(249,115,22,0.18)', '0 0 0 rgba(249,115,22,0)'] }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Wand2 className="h-4 w-4" />
          </motion.div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className={cn('font-medium text-white', isPopup ? 'text-base' : 'text-sm')}>WZRD Agent</h3>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  Chat through a graph plan before nodes are created.
                </p>
              </div>
              {isPopup && onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(249,115,22,0.12)] bg-[#141414] text-zinc-400 transition-colors hover:border-[rgba(249,115,22,0.20)] hover:bg-[#1b1b1b] hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>

          </div>
        </div>
      </div>

      <div className={cn('min-h-0 flex-1 overflow-y-auto space-y-4', isPopup ? 'p-4' : 'p-5')}>
        <div className={cn('border border-[rgba(249,115,22,0.10)] bg-[#121212]', isPopup ? 'rounded-[24px] p-4' : 'rounded-[22px] p-4')}>
          <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-zinc-500">
            <Sparkles className="h-3.5 w-3.5" />
            <span>{isPopup ? 'Starter workflows' : 'Prompt'}</span>
          </div>
          <div className="space-y-2">
            {WORKFLOW_EXAMPLES.map((example, index) => {
              const Icon = example.icon;
              return (
                <motion.button
                  key={example.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.22, ease: 'easeOut' }}
                  whileHover={{ x: 4 }}
                  onClick={() => handleExampleClick(example.prompt)}
                  className={cn(
                    'group flex w-full items-center gap-3 rounded-[18px] border border-[rgba(249,115,22,0.10)] bg-[#171717] px-3 py-3 text-left transition-colors hover:border-[rgba(249,115,22,0.18)] hover:bg-[#1b1b1b]'
                  )}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[rgba(249,115,22,0.10)] bg-[#111111] text-zinc-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{example.title}</p>
                    <p className="text-[11px] text-zinc-500">{example.type}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-600 transition-colors group-hover:text-zinc-300" />
                </motion.button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <Composer
            className={cn(
              'dark',
              prompt.trim() ? (isPopup ? 'rounded-[24px]' : 'rounded-[22px]') : 'rounded-xl',
            )}
            disabled={isGenerating}
            busy={isGenerating}
            context={
              <>
                <ComposerContextChip>
                  {phase === 'ready_to_run' ? 'Ready' : 'Nodes only'}
                </ComposerContextChip>
                {isPopup ? <ComposerContextChip>New workflow</ComposerContextChip> : null}
                {selectedNodeLabel ? (
                  <ComposerContextChip accent>{selectedNodeLabel}</ComposerContextChip>
                ) : null}
              </>
            }
            leading={
              <WorkflowSettingsMenu
                settings={settings}
                onSettingsChange={setSettings}
              />
            }
            trailing={
              <button
                type="button"
                onClick={primaryAction}
                disabled={!canSubmit}
                aria-label={primaryLabel}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGenerating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : hasQuestions ? (
                  <CheckCircle2 className="size-4" />
                ) : (
                  <Send className="size-4" />
                )}
                <span>{primaryLabel}</span>
              </button>
            }
          >
            <div className="relative">
              <WorkflowPromptAutocomplete
                query={prompt}
                visible={showAutocomplete && !isGenerating}
                onSelect={handleSuggestionSelect}
              />
              <textarea
                value={prompt}
                onChange={handlePromptChange}
                onKeyDown={wrappedHandleKeyDown}
                onFocus={handlePromptFocus}
                onBlur={handlePromptBlur}
                placeholder="Describe the workflow you want to create..."
                className={cn(
                  'w-full resize-none bg-transparent px-1 py-1 text-sm text-foreground placeholder:text-muted-foreground outline-none',
                  isPopup ? 'min-h-[108px]' : 'min-h-[96px]'
                )}
                disabled={isGenerating}
              />
            </div>
          </Composer>
          {isPopup ? (
            <p className="px-1 text-[11px] text-muted-foreground">
              Uses your current canvas context
            </p>
          ) : null}
          {assistantMessage ? (
            <div className="mt-3 rounded-[18px] border border-[rgba(249,115,22,0.12)] bg-[#171717] px-3 py-3 text-xs leading-5 text-zinc-300">
              {assistantMessage}
            </div>
          ) : null}
          {setupError ? (
            <div className="mt-3 rounded-[18px] border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-xs leading-5 text-amber-100">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <div className="min-w-0">
                  <p className="font-medium text-amber-100">{setupError.message}</p>
                  <p className="mt-1 text-amber-100/70">
                    Add `OPENAI_API_KEY` and `WZRD_AGENT_MODEL` as Supabase Edge Function secrets, then redeploy the function.
                  </p>
                  {setupError.setupErrors.length > 0 ? (
                    <div className="mt-2 space-y-1 text-amber-100/80">
                      {setupError.setupErrors.map((item) => (
                        <p key={item}>{item}</p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          {hasQuestions ? (
            <div className="mt-3 space-y-3 rounded-[20px] border border-[#f97316]/15 bg-[#151210] p-3">
              {questions.map((question, index) => (
                <div key={question.id} className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-zinc-300">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f97316]/15 text-[10px] text-[#fdba74]">
                      {index + 1}
                    </span>
                    <span>{question.label}</span>
                  </div>
                  {question.assetRef?.name ? (
                    <div className="rounded-xl border border-white/10 bg-[#111111] px-3 py-2 text-[11px] text-zinc-500">
                      {question.assetRef.name}
                    </div>
                  ) : null}
                  {renderQuestionControl(question)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="shrink-0 border-t border-[rgba(249,115,22,0.10)] px-5 py-3">
        <AnimatePresence initial={false}>
          {isGenerating ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              className="mb-3 flex items-center gap-2 rounded-[18px] border border-[#f97316]/15 bg-[#1c1510] px-3 py-3"
            >
              <PixelLoader
                className="dark"
                label={phase === 'materializing' ? 'Creating WZRD nodes' : 'WZRD is planning the graph'}
                showElapsed
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={resetAgent}
            disabled={isGenerating}
            className="inline-flex h-10 items-center justify-center rounded-full border border-white/10 px-4 text-xs text-zinc-300 transition-colors hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reset
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-500">
          {isPopup
            ? 'Starter workflows insert through the same Studio graph path as manual node creation.'
            : 'Press Enter to generate with the current canvas context.'}
        </p>
      </div>
      </div>
    </div>
  );
}
