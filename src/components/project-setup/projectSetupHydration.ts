import type { Database } from '@/integrations/supabase/types';
import {
  normalizeEvaluationThresholds,
  normalizeStringArray,
  type EvaluationMode,
} from '@/lib/evaluation';
import type {
  AdBriefData,
  CustomMetaPrompts,
  InfotainmentData,
  MusicVideoData,
  ProjectData,
  ProjectFormat,
  ShortFilmData,
} from './types';

type ProjectRow = Database['public']['Tables']['projects']['Row'];
type ProjectSettingsRow = Database['public']['Tables']['project_settings']['Row'];

export type ProjectSetupProjectRecord = Partial<ProjectRow> & Pick<ProjectRow, 'id'>;
export type ProjectSetupSettingsRecord = Partial<ProjectSettingsRow>;

const PROJECT_FORMATS: ProjectFormat[] = [
  'custom',
  'short_film',
  'commercial',
  'music_video',
  'infotainment',
];

const EVALUATION_MODES: EvaluationMode[] = ['off', 'shadow', 'soft_gate', 'hard_gate'];

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function nonEmptyStringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function objectValue<T extends object>(value: unknown, fallback: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  return { ...fallback, ...(value as Record<string, unknown>) } as T;
}

function projectFormatValue(value: unknown, fallback: ProjectFormat): ProjectFormat {
  return typeof value === 'string' && PROJECT_FORMATS.includes(value as ProjectFormat)
    ? (value as ProjectFormat)
    : fallback;
}

function conceptOptionValue(value: unknown, fallback: ProjectData['conceptOption']): ProjectData['conceptOption'] {
  return value === 'ai' || value === 'manual' ? value : fallback;
}

function evaluationModeValue(value: unknown, fallback: EvaluationMode): EvaluationMode {
  return typeof value === 'string' && EVALUATION_MODES.includes(value as EvaluationMode)
    ? (value as EvaluationMode)
    : fallback;
}

function customMetaPromptsValue(value: unknown, fallback: CustomMetaPrompts | undefined): CustomMetaPrompts | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  return value as CustomMetaPrompts;
}

export function getProjectSetupInitialProjectId(search: string): string | null {
  const projectId = new URLSearchParams(search).get('projectId')?.trim();
  return projectId || null;
}

export function hydrateProjectSetupData(
  base: ProjectData,
  project: ProjectSetupProjectRecord,
  settings?: ProjectSetupSettingsRecord | null
): ProjectData {
  return {
    ...base,
    title: nonEmptyStringValue(project.title, base.title),
    concept: stringValue(project.concept_text, base.concept),
    genre: stringValue(project.genre, base.genre),
    tone: stringValue(project.tone, base.tone),
    format: projectFormatValue(project.format, base.format),
    customFormat: stringValue(project.custom_format_description, base.customFormat ?? ''),
    specialRequests: stringValue(project.special_requests, base.specialRequests ?? ''),
    addVoiceover: booleanValue(project.add_voiceover, base.addVoiceover),
    product: stringValue(project.product_name, base.product ?? ''),
    targetAudience: stringValue(project.target_audience, base.targetAudience ?? ''),
    mainMessage: stringValue(project.main_message, base.mainMessage ?? ''),
    callToAction: stringValue(project.call_to_action, base.callToAction ?? ''),
    conceptOption: conceptOptionValue(project.concept_option, base.conceptOption),
    aspectRatio: nonEmptyStringValue(project.aspect_ratio, base.aspectRatio ?? '16:9'),
    videoStyle: nonEmptyStringValue(project.video_style, base.videoStyle ?? 'cinematic'),
    cinematicInspiration: stringValue(project.cinematic_inspiration, base.cinematicInspiration ?? ''),
    styleReferenceAssetId: stringValue(project.style_reference_asset_id, base.styleReferenceAssetId ?? ''),
    adBrief: objectValue<AdBriefData>(project.ad_brief_data, base.adBrief ?? ({} as AdBriefData)),
    musicVideoData: objectValue<MusicVideoData>(
      project.music_video_data,
      base.musicVideoData ?? ({} as MusicVideoData)
    ),
    infotainmentData: objectValue<InfotainmentData>(
      project.infotainment_data,
      base.infotainmentData ?? ({} as InfotainmentData)
    ),
    shortFilmData: objectValue<ShortFilmData>(
      project.short_film_data,
      base.shortFilmData ?? ({} as ShortFilmData)
    ),
    voiceoverId: stringValue(project.voiceover_id, base.voiceoverId ?? ''),
    voiceoverName: stringValue(project.voiceover_name, base.voiceoverName ?? ''),
    voiceoverPreviewUrl: stringValue(project.voiceover_preview_url, base.voiceoverPreviewUrl ?? ''),
    storylineTextModel: nonEmptyStringValue(
      settings?.storyline_text_model,
      base.storylineTextModel ?? 'gmi/gemini-3.1-flash-lite'
    ),
    storylineTextSettings: objectValue<Record<string, unknown>>(
      settings?.storyline_text_settings,
      base.storylineTextSettings ?? {}
    ),
    baseImageModel: nonEmptyStringValue(settings?.base_image_model, base.baseImageModel ?? 'gmi/seedream-5.0-lite'),
    baseVideoModel: nonEmptyStringValue(settings?.base_video_model, base.baseVideoModel ?? 'gmi/ltx-fast-i2v'),
    baseAudioModel: nonEmptyStringValue(
      settings?.base_audio_model,
      base.baseAudioModel ?? 'fal-ai/elevenlabs/tts/turbo-v2.5'
    ),
    evaluationMode: evaluationModeValue(settings?.evaluation_mode, base.evaluationMode ?? 'shadow'),
    evaluationThresholds: normalizeEvaluationThresholds(settings?.evaluation_thresholds ?? base.evaluationThresholds),
    canonFacts: normalizeStringArray(settings?.canon_facts ?? base.canonFacts),
    creativeConstraints: normalizeStringArray(settings?.creative_constraints ?? base.creativeConstraints),
    customMetaPrompts: customMetaPromptsValue(project.custom_meta_prompts, base.customMetaPrompts),
  };
}
