import React, { useCallback, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Save,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';
import {
  buildPromptFragment,
  toSlug,
  useCharacterCreationStore,
} from '@/lib/stores/character-creation-store';
import { createBlueprint, generateCharacterImage } from '@/services/characterBlueprintService';
import { CHARACTER_PRESETS, takePresetStarter, type CharacterPreset } from './characterPresets';
import { TraitGrid } from './TraitGrid';
import {
  AGE_OPTIONS,
  ART_STYLE_OPTIONS,
  BODY_BUILD_OPTIONS,
  BUILDER_STEPS,
  CHARACTER_TYPE_OPTIONS,
  ETHNICITY_OPTIONS,
  EYE_DETAIL_OPTIONS,
  EYE_TYPE_OPTIONS,
  GENDER_OPTIONS,
  MOUTH_TEETH_OPTIONS,
  SKIN_COLOR_OPTIONS,
  SKIN_CONDITION_OPTIONS,
} from '@/types/character-creation';
import type { BuilderStep } from '@/types/character-creation';

// ---------------------------------------------------------------------------
// Fade animation
// ---------------------------------------------------------------------------

const fadeSlide = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.25 } },
  exit: { opacity: 0, x: -20, transition: { duration: 0.15 } },
};

// ---------------------------------------------------------------------------
// CharacterBuilder — Stepped wizard
// ---------------------------------------------------------------------------

export function CharacterBuilder() {
  const store = useCharacterCreationStore();
  const {
    currentStep,
    draftName,
    draftKind,
    draftTraits,
    draftFaceDetails,
    draftBodyDetails,
    draftStyleDetails,
    generating,
    nextStep,
    prevStep,
    setCurrentStep,
    setDraftName,
    updateDraftTraits,
    updateDraftFaceDetails,
    updateDraftBodyDetails,
    updateDraftStyleDetails,
    setMode,
    addBlueprint,
    setGenerating,
    resetDraft,
  } = store;

  const [showStepNav, setShowStepNav] = useState(true);
  const [starterPreset, setStarterPreset] = useState<CharacterPreset | null>(() => takePresetStarter());
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [generatingPortrait, setGeneratingPortrait] = useState(false);

  const promptFragment = useMemo(
    () => buildPromptFragment(draftTraits, draftFaceDetails, draftBodyDetails, draftStyleDetails),
    [draftTraits, draftFaceDetails, draftBodyDetails, draftStyleDetails],
  );

  const currentStepIndex = BUILDER_STEPS.findIndex((s) => s.id === currentStep);

  const starterImageUrl = generatedImageUrl ?? starterPreset?.imageUrl ?? null;

  const handlePresetSelect = useCallback((preset: CharacterPreset) => {
    if (starterPreset?.id === preset.id) {
      setStarterPreset(null);
      return;
    }
    updateDraftTraits(preset.traits);
    updateDraftStyleDetails(preset.styleDetails);
    setStarterPreset(preset);
  }, [starterPreset, updateDraftTraits, updateDraftStyleDetails]);

  const handleGeneratePortrait = useCallback(async () => {
    if (!promptFragment.trim()) {
      toast.error('Add some traits or style details first.');
      return;
    }
    setGeneratingPortrait(true);
    try {
      const url = await generateCharacterImage(promptFragment);
      if (url) {
        setGeneratedImageUrl(url);
        toast.success('Portrait generated.');
      } else {
        toast.error('Portrait generation did not return an image.');
      }
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to generate portrait.');
    } finally {
      setGeneratingPortrait(false);
    }
  }, [promptFragment]);
  const isFirst = currentStepIndex === 0;
  const isLast = currentStepIndex === BUILDER_STEPS.length - 1;

  // -- Finalize & save --------------------------------------------------------

  const handleSave = useCallback(async () => {
    if (!draftName.trim()) {
      toast.error('Please give your character a name.');
      return;
    }

    setGenerating(true);
    try {
      const blueprint = await createBlueprint({
        name: draftName.trim(),
        kind: draftKind,
        traits: draftTraits,
        faceDetails: draftFaceDetails,
        bodyDetails: draftBodyDetails,
        styleDetails: draftStyleDetails,
        promptFragment,
        imageUrl: starterImageUrl,
        thumbnailUrl: starterImageUrl,
        referenceImages: starterImageUrl
          ? [{
              imageUrl: starterImageUrl,
              label: generatedImageUrl ? 'Generated portrait' : `Preset starter: ${starterPreset?.name}`,
              generationRole: 'primary',
              isPrimary: true,
            }]
          : [],
      });

      addBlueprint(blueprint);
      toast.success(`"${blueprint.name}" saved! Use @${blueprint.slug} to reference.`);
      resetDraft();
      setMode('gallery');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to save character.');
    } finally {
      setGenerating(false);
    }
  }, [
    draftName,
    draftKind,
    draftTraits,
    draftFaceDetails,
    draftBodyDetails,
    draftStyleDetails,
    promptFragment,
    starterImageUrl,
    generatedImageUrl,
    starterPreset,
    setGenerating,
    addBlueprint,
    resetDraft,
    setMode,
  ]);

  // -- Step renderer ----------------------------------------------------------

  const renderStep = () => {
    switch (currentStep) {
      case 'character-type':
        return (
          <TraitGrid
            title="Character Type"
            options={CHARACTER_TYPE_OPTIONS}
            selected={draftTraits.characterType}
            onSelect={(v) => updateDraftTraits({ characterType: v })}
          />
        );
      case 'gender':
        return (
          <TraitGrid
            title="Gender"
            options={GENDER_OPTIONS}
            selected={draftTraits.gender}
            onSelect={(v) => updateDraftTraits({ gender: v })}
            columns={3}
          />
        );
      case 'ethnicity':
        return (
          <TraitGrid
            title="Ethnicity / Origin Base"
            options={ETHNICITY_OPTIONS}
            selected={draftTraits.ethnicity}
            onSelect={(v) => updateDraftTraits({ ethnicity: v })}
          />
        );
      case 'skin-color':
        return (
          <TraitGrid
            title="Skin Color"
            options={SKIN_COLOR_OPTIONS}
            selected={draftTraits.skinColor}
            onSelect={(v) => updateDraftTraits({ skinColor: v })}
          />
        );
      case 'skin-condition':
        return (
          <TraitGrid
            title="Skin Conditions"
            options={SKIN_CONDITION_OPTIONS}
            selected={draftTraits.skinCondition}
            onSelect={(v) => updateDraftTraits({ skinCondition: v })}
          />
        );
      case 'age':
        return (
          <TraitGrid
            title="Age"
            options={AGE_OPTIONS}
            selected={draftTraits.age}
            onSelect={(v) => updateDraftTraits({ age: v })}
          />
        );
      case 'face':
        return (
          <div className="space-y-6">
            <TraitGrid
              title="Eyes - Type"
              options={EYE_TYPE_OPTIONS}
              selected={draftFaceDetails.eyeType}
              onSelect={(v) => updateDraftFaceDetails({ eyeType: v })}
            />
            <TraitGrid
              title="Eyes - Details"
              options={EYE_DETAIL_OPTIONS}
              selected={draftFaceDetails.eyeDetail}
              onSelect={(v) => updateDraftFaceDetails({ eyeDetail: v })}
            />
            <TraitGrid
              title="Mouth & Teeth"
              options={MOUTH_TEETH_OPTIONS}
              selected={draftFaceDetails.mouthTeeth}
              onSelect={(v) => updateDraftFaceDetails({ mouthTeeth: v })}
            />
          </div>
        );
      case 'body':
        return (
          <TraitGrid
            title="Body Build"
            options={BODY_BUILD_OPTIONS}
            selected={draftBodyDetails.build}
            onSelect={(v) => updateDraftBodyDetails({ build: v })}
          />
        );
      case 'style':
        return (
          <div className="space-y-6">
            <TraitGrid
              title="Art Style"
              options={ART_STYLE_OPTIONS}
              selected={draftStyleDetails.artStyle}
              onSelect={(v) => updateDraftStyleDetails({ artStyle: v })}
            />
            <div className="space-y-3">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.25em] text-zinc-400">
                <span className="inline-block h-2 w-2 rounded-full bg-lime-400" />
                Custom Prompt Addition
              </h3>
              <textarea
                rows={3}
                value={draftStyleDetails.customPrompt ?? ''}
                onChange={(e) => updateDraftStyleDetails({ customPrompt: e.target.value })}
                placeholder="Add extra styling details (e.g. cyberpunk armor, flowing cape)..."
                className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-lime-300/40 focus:outline-none"
              />
            </div>
          </div>
        );
      case 'review':
        return (
          <ReviewPanel
            promptFragment={promptFragment}
            starterImageUrl={starterImageUrl}
            generatingPortrait={generatingPortrait}
            onGeneratePortrait={handleGeneratePortrait}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            resetDraft();
            setMode('gallery');
          }}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Library
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            Step {currentStepIndex + 1}/{BUILDER_STEPS.length}
          </span>
        </div>
      </div>

      {/* Name input */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.25em] text-zinc-400">
          Character Name
        </label>
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="Give your character a name..."
          className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-lime-300/40 focus:outline-none"
        />
        {draftName.trim() && (
          <p className="mt-1.5 text-xs text-zinc-500">
            @mention slug: <span className="text-lime-300/70">@{toSlug(draftName)}</span>
          </p>
        )}
      </div>

      {/* Preset starters */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.25em] text-zinc-400">
          Preset Starters
        </label>
        <div className="flex flex-wrap gap-3">
          {CHARACTER_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetSelect(preset)}
              aria-label={`Use preset ${preset.name}`}
              aria-pressed={starterPreset?.id === preset.id}
              className={cn(
                'group w-24 overflow-hidden rounded-xl border text-left transition-all',
                starterPreset?.id === preset.id
                  ? 'border-lime-300/60 shadow-[0_0_20px_rgba(163,230,53,0.15)]'
                  : 'border-white/10 hover:border-white/25',
              )}
            >
              <div className="aspect-square w-full bg-zinc-900">
                <img src={preset.imageUrl} alt={preset.alt} className="h-full w-full object-cover" loading="lazy" />
              </div>
              <p className="truncate px-2 py-1.5 text-[10px] font-semibold text-zinc-300">{preset.name}</p>
            </button>
          ))}
        </div>
        {starterPreset && (
          <p className="mt-2 text-xs text-zinc-500">
            Seeding from <span className="text-lime-300/70">{starterPreset.name}</span> — traits and style applied.
          </p>
        )}
      </div>

      {/* Step navigation (collapsible sidebar) */}
      <button
        type="button"
        onClick={() => setShowStepNav(!showStepNav)}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs text-zinc-400 lg:hidden"
      >
        <span>{BUILDER_STEPS[currentStepIndex].label}</span>
        {showStepNav ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      <div className="flex gap-6">
        {/* Step sidebar */}
        <nav
          className={cn(
            'hidden w-44 flex-col gap-1 lg:flex',
            showStepNav ? 'max-lg:flex' : 'max-lg:hidden',
          )}
        >
          {BUILDER_STEPS.map((step, i) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setCurrentStep(step.id)}
              className={cn(
                'rounded-xl px-3 py-2 text-left text-xs font-medium transition-all',
                currentStep === step.id
                  ? 'bg-lime-300/10 text-white'
                  : i <= currentStepIndex
                    ? 'text-zinc-300 hover:bg-white/[0.04]'
                    : 'text-zinc-600 hover:text-zinc-400',
              )}
            >
              {step.label}
            </button>
          ))}
        </nav>

        {/* Step content */}
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div key={currentStep} {...fadeSlide}>
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Prompt preview strip */}
      {promptFragment && (
        <div className="rounded-2xl border border-white/5 bg-black/40 p-4">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
            Auto-composed Prompt Fragment
          </p>
          <p className="text-xs leading-relaxed text-zinc-300">{promptFragment}</p>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={prevStep}
          disabled={isFirst}
          className={cn(
            'flex items-center gap-2 rounded-2xl border px-5 py-2.5 text-sm font-semibold transition-all',
            isFirst
              ? 'cursor-not-allowed border-white/5 text-zinc-600'
              : 'border-white/10 text-zinc-300 hover:border-white/20 hover:text-white',
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Previous
        </button>

        {isLast ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={generating || !draftName.trim()}
            className={cn(
              'flex items-center gap-2 rounded-2xl border px-6 py-2.5 text-sm font-semibold transition-all',
              generating || !draftName.trim()
                ? 'cursor-not-allowed border-lime-300/20 bg-lime-300/5 text-zinc-500'
                : 'border-lime-300/40 bg-lime-300/10 text-white hover:bg-lime-300/20',
            )}
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4 text-lime-300" />
            )}
            Save Character
          </button>
        ) : (
          <button
            type="button"
            onClick={nextStep}
            className="flex items-center gap-2 rounded-2xl border border-lime-300/40 bg-lime-300/10 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-lime-300/20"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ReviewPanel — Final summary before save
// ---------------------------------------------------------------------------

function ReviewPanel({
  promptFragment,
  starterImageUrl,
  generatingPortrait,
  onGeneratePortrait,
}: {
  promptFragment: string;
  starterImageUrl: string | null;
  generatingPortrait: boolean;
  onGeneratePortrait: () => void;
}) {
  const {
    draftName,
    draftKind,
    draftTraits,
    draftFaceDetails,
    draftBodyDetails,
    draftStyleDetails,
  } = useCharacterCreationStore();

  const sections = [
    {
      label: 'Identity',
      items: [
        draftName && `Name: ${draftName}`,
        `Kind: ${draftKind}`,
        draftTraits.characterType && `Type: ${draftTraits.characterType}`,
      ].filter(Boolean),
    },
    {
      label: 'Traits',
      items: [
        draftTraits.gender && `Gender: ${draftTraits.gender}`,
        draftTraits.ethnicity && `Ethnicity: ${draftTraits.ethnicity}`,
        draftTraits.skinColor && `Skin: ${draftTraits.skinColor}`,
        draftTraits.skinCondition && `Condition: ${draftTraits.skinCondition}`,
        draftTraits.age && `Age: ${draftTraits.age}`,
      ].filter(Boolean),
    },
    {
      label: 'Face',
      items: [
        draftFaceDetails.eyeType && `Eyes: ${draftFaceDetails.eyeType}`,
        draftFaceDetails.eyeDetail && `Detail: ${draftFaceDetails.eyeDetail}`,
        draftFaceDetails.mouthTeeth && `Mouth: ${draftFaceDetails.mouthTeeth}`,
      ].filter(Boolean),
    },
    {
      label: 'Body & Style',
      items: [
        draftBodyDetails.build && `Build: ${draftBodyDetails.build}`,
        draftStyleDetails.artStyle && `Style: ${draftStyleDetails.artStyle}`,
        draftStyleDetails.clothing && `Clothing: ${draftStyleDetails.clothing}`,
      ].filter(Boolean),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-lime-300" />
        <h3 className="text-sm font-semibold text-white">Review Your Character</h3>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sections.map(
          (section) =>
            section.items.length > 0 && (
              <div
                key={section.label}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
              >
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
                  {section.label}
                </p>
                <div className="space-y-1">
                  {section.items.map((item, i) => (
                    <p key={i} className="text-xs text-zinc-300">
                      {item}
                    </p>
                  ))}
                </div>
              </div>
            ),
        )}
      </div>

      {promptFragment && (
        <div className="rounded-2xl border border-lime-300/20 bg-lime-300/5 p-4">
          <p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-lime-300/70">
            <Sparkles className="h-3 w-3" />
            Generated Prompt Fragment
          </p>
          <p className="text-sm leading-relaxed text-white">{promptFragment}</p>
        </div>
      )}

      {/* Portrait preview + generation */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-zinc-500">
          Character Portrait
        </p>
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-zinc-900">
            {starterImageUrl ? (
              <img src={starterImageUrl} alt="Character portrait" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-600">
                No image
              </div>
            )}
          </div>
          <div className="space-y-2">
            <button
              type="button"
              onClick={onGeneratePortrait}
              disabled={generatingPortrait}
              className={cn(
                'flex items-center gap-2 rounded-2xl border px-4 py-2 text-xs font-semibold transition-all',
                generatingPortrait
                  ? 'cursor-not-allowed border-lime-300/20 bg-lime-300/5 text-zinc-500'
                  : 'border-lime-300/40 bg-lime-300/10 text-white hover:bg-lime-300/20',
              )}
            >
              {generatingPortrait ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5 text-lime-300" />
              )}
              {starterImageUrl ? 'Regenerate Portrait' : 'Generate Portrait'}
            </button>
            <p className="text-[10px] text-zinc-500">
              Uses your traits and style to generate a portrait. Preset starter images are used until you generate.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
