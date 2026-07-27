import type { EvaluationMode, EvaluationThresholds } from '@/lib/evaluation';

export type ProjectSetupTab = 'concept' | 'storyline' | 'settings' | 'breakdown';

export type ProjectFormat =
  | 'custom'
  | 'short_film'
  | 'commercial'
  | 'music_video'
  | 'infotainment';

export interface AdBriefData {
  product: string;
  targetAudience: string;
  mainMessage: string;
  callToAction: string;
  adDuration: '15s' | '30s' | '60s' | '90s';
  platform: 'tv' | 'social' | 'youtube' | 'streaming' | 'all';
  brandGuidelines?: string;
  competitorAnalysis?: string;
  kpis?: string[];
  brandName?: string;
  productType?: string;
  tone?: string;
  productImageUrl?: string;
}

export type StemName = 'vocals' | 'drums' | 'bass' | 'other' | 'guitar' | 'piano';

export interface StemAsset {
  stem: StemName;
  url: string;
  selected: boolean;
  asset_id?: string | null;
  duration_ms?: number | null;
}

export interface AnnotatedSection {
  section: 'Intro' | 'Verse' | 'Pre-Chorus' | 'Chorus' | 'Bridge' | 'Outro' | 'Hook' | 'Interlude' | 'Instrumental' | 'Unknown';
  label?: string | null;
  start_ms?: number | null;
  end_ms?: number | null;
  instrumentation_notes?: string[];
  energy?: 'low' | 'medium' | 'high' | 'peak' | null;
  lines: string[];
}

export interface MusicVideoData {
  artistName: string;
  trackTitle: string;
  genre: string;
  lyrics?: string;
  moodBoard?: string[];
  performanceRatio: number;
  audioFileUrl?: string;
  audioFileName?: string;
  bpm?: number;
  beatTimeline?: number[];
  // Stem split (Demucs)
  stemSplitJobId?: string;
  stems?: StemAsset[];
  // Annotated transcription (GMI Gemini)
  transcriptionModel?: 'gmi/gemini-3.1-flash' | 'gmi/gemini-3.1-pro';
  annotatedLyrics?: string;
  transcriptionSections?: AnnotatedSection[];
}

export interface CustomMetaPrompts {
  storylineSystem?: string;
  storylineStructure?: string;
  shotPrompting?: string;
  characterExtraction?: string;
  negativeConstraints?: string;
  version?: string;
}

export interface InfotainmentData {
  topic: string;
  educationalGoals: string[];
  targetDemographic: string;
  hostStyle: 'casual' | 'professional' | 'documentary';
  segments?: string[];
  keyFacts?: string;
  visualStyle?: string;
}

export interface ShortFilmData {
  genre: string;
  tone: string;
  duration: string;
  visualStyle: string;
}

export interface ProjectData {
  title: string;
  concept: string;
  genre: string;
  tone: string;
  format: ProjectFormat;
  customFormat?: string;
  specialRequests?: string;
  addVoiceover: boolean;
  // Commercial-specific fields
  product?: string;
  targetAudience?: string;
  mainMessage?: string;
  callToAction?: string;
  // Additional field to track AI or manual mode
  conceptOption: 'ai' | 'manual';

  // Settings fields
  aspectRatio?: string;
  videoStyle?: string;
  cinematicInspiration?: string;
  styleReferenceUrl?: string;
  styleReferenceAssetId?: string;

  // Format-specific data
  adBrief?: AdBriefData;
  musicVideoData?: MusicVideoData;
  infotainmentData?: InfotainmentData;
  shortFilmData?: ShortFilmData;

  // VoiceOver selection
  voiceoverId?: string;
  voiceoverName?: string;
  voiceoverPreviewUrl?: string;

  // Generation model settings
  storylineTextModel?: string;
  storylineTextSettings?: Record<string, unknown>;
  baseImageModel?: string;
  baseVideoModel?: string;
  evaluationMode?: EvaluationMode;
  baseAudioModel?: string;
  evaluationThresholds?: EvaluationThresholds;
  canonFacts?: string[];
  creativeConstraints?: string[];

  // Custom format meta prompt overrides (only used when format === 'custom')
  customMetaPrompts?: CustomMetaPrompts;
}

// Character type definition for reuse across components
export interface Character {
  id: string;
  project_id?: string;
  name: string;
  description?: string | null;
  image_url?: string | null;
  image_status?: 'pending' | 'generating' | 'completed' | 'failed';
  image_generation_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

// Storyline type definition
export interface Storyline {
  id: string;
  project_id: string;
  title: string;
  description: string;
  full_story: string;
  tags?: string[];
  is_selected?: boolean;
  status?: 'pending' | 'generating' | 'complete' | 'failed';
  failure_reason?: string | null;
  created_at?: string;
}
