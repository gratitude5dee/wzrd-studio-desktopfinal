import { describe, expect, it } from 'vitest';

import { DEFAULT_PROJECT_DATA } from '../projectSetupDefaults';
import {
  getProjectSetupInitialProjectId,
  hydrateProjectSetupData,
  type ProjectSetupProjectRecord,
  type ProjectSetupSettingsRecord,
} from '../projectSetupHydration';

describe('project setup hydration', () => {
  it('maps a stored project and settings row into wizard project data', () => {
    const project = {
      id: 'project-1',
      title: 'Loaded Project',
      concept_text: 'A noir music video in a neon train station.',
      concept_option: 'manual',
      format: 'music_video',
      genre: 'synthwave',
      tone: 'moody',
      aspect_ratio: '9:16',
      video_style: 'noir',
      add_voiceover: true,
      voiceover_id: 'voice-1',
      voiceover_name: 'Narrator',
      voiceover_preview_url: 'https://example.test/voice.mp3',
      music_video_data: {
        artistName: 'WZRD',
        trackTitle: 'Midnight Signal',
        genre: 'synthwave',
        lyrics: 'signal in the dark',
        performanceRatio: 30,
      },
      custom_meta_prompts: {
        version: 'v1',
        storylineSystem: 'Stay strange.',
      },
    } satisfies ProjectSetupProjectRecord;
    const settings = {
      storyline_text_model: 'gmi/gemini-3.1-pro',
      storyline_text_settings: { temperature: 0.4 },
      base_image_model: 'gmi/seedream-5.0',
      base_video_model: 'gmi/veo-4',
      base_audio_model: 'fal-ai/elevenlabs/tts/multilingual-v2',
      evaluation_mode: 'soft_gate',
      evaluation_thresholds: {
        storyline: 0.8,
        continuity: 0.81,
        character_consistency: 0.82,
        canon_compliance: 0.83,
        max_disagreement: 0.18,
      },
      canon_facts: ['the train never stops', 42],
      creative_constraints: ['avoid daylight'],
    } satisfies ProjectSetupSettingsRecord;

    const hydrated = hydrateProjectSetupData(DEFAULT_PROJECT_DATA, project, settings);

    expect(hydrated.title).toBe('Loaded Project');
    expect(hydrated.concept).toBe('A noir music video in a neon train station.');
    expect(hydrated.conceptOption).toBe('manual');
    expect(hydrated.format).toBe('music_video');
    expect(hydrated.musicVideoData?.trackTitle).toBe('Midnight Signal');
    expect(hydrated.storylineTextModel).toBe('gmi/gemini-3.1-pro');
    expect(hydrated.storylineTextSettings).toEqual({ temperature: 0.4 });
    expect(hydrated.baseAudioModel).toBe('fal-ai/elevenlabs/tts/multilingual-v2');
    expect(hydrated.evaluationMode).toBe('soft_gate');
    expect(hydrated.canonFacts).toEqual(['the train never stops']);
    expect(hydrated.creativeConstraints).toEqual(['avoid daylight']);
    expect(hydrated.customMetaPrompts?.storylineSystem).toBe('Stay strange.');
  });

  it('keeps current defaults when stored enum or JSON values are not usable', () => {
    const hydrated = hydrateProjectSetupData(
      DEFAULT_PROJECT_DATA,
      {
        id: 'project-2',
        title: '',
        concept_option: 'automatic',
        format: 'feature',
        ad_brief_data: 'not-an-object',
      },
      {
        evaluation_mode: 'strict',
        canon_facts: 'not-an-array',
        creative_constraints: [false, 'keep it grounded'],
      }
    );

    expect(hydrated.title).toBe(DEFAULT_PROJECT_DATA.title);
    expect(hydrated.conceptOption).toBe(DEFAULT_PROJECT_DATA.conceptOption);
    expect(hydrated.format).toBe(DEFAULT_PROJECT_DATA.format);
    expect(hydrated.adBrief).toBe(DEFAULT_PROJECT_DATA.adBrief);
    expect(hydrated.evaluationMode).toBe(DEFAULT_PROJECT_DATA.evaluationMode);
    expect(hydrated.canonFacts).toEqual([]);
    expect(hydrated.creativeConstraints).toEqual(['keep it grounded']);
  });

  it('parses the setup project id from the query string', () => {
    expect(getProjectSetupInitialProjectId('?projectId=%20project-1%20')).toBe('project-1');
    expect(getProjectSetupInitialProjectId('?tab=concept')).toBeNull();
    expect(getProjectSetupInitialProjectId('')).toBeNull();
  });
});
