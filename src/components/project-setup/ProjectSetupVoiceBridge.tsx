import { useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { supabase } from '@/integrations/supabase/client';
import { appRoutes } from '@/lib/routes';
import {
  NANO_BANANA_FAST_EDIT_ALIAS,
  resolveFrontendModelAlias,
  type StructuredImageEditPrompt,
} from '@/lib/modelAliases';
import { supabaseService } from '@/services/supabaseService';
import { resolveStyleReferenceUrl } from '@/constants/stylePacks';
import { useRegisterVoiceActions } from '@/voice/VoiceAgentProvider';
import type { VoiceActionName, VoiceActionRegistration, VoiceActionResult } from '@/voice/actions/registry';
import { scrollVoiceTargetIntoView, useVoiceSelection } from '@/voice/VoiceSelectionContext';

import { useProjectContext } from './ProjectContext';
import type { ProjectData, ProjectSetupTab } from './types';

function isProjectSetupTab(value: unknown): value is ProjectSetupTab {
  return value === 'concept' || value === 'storyline' || value === 'settings' || value === 'breakdown';
}

function completed(message: string, data?: unknown): VoiceActionResult {
  return { ok: true, status: 'completed', message, data };
}

function invalid(message: string, data?: unknown): VoiceActionResult {
  return { ok: false, status: 'invalid_input', message, data };
}

function needsConfirmation(actionName: VoiceActionName, input: unknown, risk: 'write' | 'generation'): VoiceActionResult {
  return {
    ok: false,
    status: 'needs_confirmation',
    message: 'This will spend credits. Should I continue?',
    confirmation: {
      actionName,
      risk,
      message: 'This will spend credits. Should I continue?',
      input,
    },
  };
}

function matchesText(value: string | null | undefined, query: string) {
  return value?.toLowerCase().includes(query.toLowerCase()) ?? false;
}

function getBrowserOrigin() {
  return typeof window === 'undefined' ? undefined : window.location.origin;
}

function resolveProjectStyleReferenceUrl(projectData: ProjectData) {
  return resolveStyleReferenceUrl(
    {
      videoStyle: projectData.videoStyle,
      styleReferenceUrl: projectData.styleReferenceUrl,
      styleReferenceAssetId: projectData.styleReferenceAssetId,
    },
    getBrowserOrigin()
  );
}

type SceneVoiceUpdates = Partial<{
  title: string;
  description: string;
  location: string;
  lighting: string;
  weather: string;
  voiceover: string;
}>;

/** Maps voice-model aliases (logline, text, prompt, description) → canonical `concept`. */
function normalizeConceptInput(raw: Record<string, unknown>): Partial<ProjectData> {
  const result: Record<string, unknown> = {};
  const CONCEPT_ALIASES = ['logline', 'text', 'description', 'prompt'];
  const KNOWN_KEYS: (keyof ProjectData)[] = [
    'concept', 'title', 'format', 'genre', 'tone', 'customFormat',
    'specialRequests', 'addVoiceover', 'conceptOption', 'product',
    'targetAudience', 'mainMessage', 'callToAction', 'aspectRatio',
    'videoStyle', 'cinematicInspiration', 'styleReferenceUrl',
    'adBrief', 'musicVideoData', 'infotainmentData', 'shortFilmData',
    'voiceoverId', 'voiceoverName', 'voiceoverPreviewUrl',
  ];

  for (const [key, value] of Object.entries(raw)) {
    if (CONCEPT_ALIASES.includes(key) && typeof value === 'string') {
      if (!result.concept) result.concept = value;
    } else if (KNOWN_KEYS.includes(key as keyof ProjectData)) {
      result[key] = value;
    }
  }
  return result as Partial<ProjectData>;
}

export function ProjectSetupVoiceBridge() {
  const navigate = useNavigate();
  const {
    projectData,
    updateProjectData,
    activeTab,
    setActiveTab,
    saveProjectData,
    generateStoryline,
    finalizeProjectSetup,
    projectId,
    isGenerating,
    isFinalizing,
  } = useProjectContext();
  const { selectedTargets, selectTarget } = useVoiceSelection();

  // Mutable ref so voice handlers always read the latest projectData,
  // even when multiple tool calls arrive in the same tick before React re-renders.
  const projectDataRef = useRef(projectData);
  projectDataRef.current = projectData;

  const actions = useMemo<VoiceActionRegistration[]>(
    () => [
      {
        name: 'get_app_context',
        scope: 'project-setup',
        handler: () =>
          completed('Project setup context loaded.', {
            route: window.location.pathname,
            projectId,
            activeSetupTab: activeTab,
            selectedCharacter: selectedTargets.character ?? null,
            selectedLocation: selectedTargets.location ?? null,
            selectedScene: selectedTargets.scene ?? null,
            generationStatus: {
              isGenerating,
              isFinalizing,
            },
            availableActions: [
              'set_project_setup_fields',
              'project_setup_next',
              'storyline_update',
              'storyline_confirm',
              'settings_select_character',
              'settings_select_location',
              'settings_edit_selected_image',
              'breakdown_update_scene',
              'breakdown_start_storyboard',
            ],
          }),
      },
      {
        name: 'set_project_setup_fields',
        scope: 'project-setup',
        handler: async (input, context) => {
          const raw = input as Record<string, unknown>;
          const { tab, save, generateStoryline: shouldGenerateStoryline, finalize, ...rawFields } = raw as Record<string, unknown> & {
            tab?: ProjectSetupTab;
            save?: boolean;
            generateStoryline?: boolean;
            finalize?: boolean;
          };

          // Normalize voice aliases (logline, text, prompt → concept)
          const fields = normalizeConceptInput(rawFields);

          if (Object.keys(fields).length > 0) {
            updateProjectData(fields);
            projectDataRef.current = { ...projectDataRef.current, ...fields };
          }
          if (isProjectSetupTab(tab)) {
            setActiveTab(tab);
          }

          if ((save || shouldGenerateStoryline || finalize) && !context.confirmed) {
            return {
              ok: false,
              status: 'needs_confirmation',
              message: 'This will save or generate project data. Should I continue?',
              confirmation: {
                actionName: 'set_project_setup_fields',
                risk: shouldGenerateStoryline || finalize ? 'generation' : 'write',
                message: 'This will save or generate project data. Should I continue?',
                input,
              },
            };
          }

          let savedProjectId = projectId;
          if (save || shouldGenerateStoryline || finalize) {
            // Pass the eager fields as overrides so they're saved even if React state hasn't flushed
            savedProjectId = await saveProjectData(fields);
          }
          if (shouldGenerateStoryline && savedProjectId) {
            await generateStoryline(savedProjectId, fields);
          }
          if (finalize) {
            await finalizeProjectSetup();
          }

          return {
            ok: true,
            status: 'completed',
            message: `Project setup updated on ${tab ?? activeTab}.`,
            data: { projectId: savedProjectId, projectData: projectDataRef.current },
          };
        },
      },
      {
        name: 'project_setup_next',
        scope: 'project-setup',
        handler: async (input, context) => {
          if (activeTab === 'concept') {
            // Accept inline concept/logline in the input and merge into ref
            const rawInput = (input as Record<string, unknown>) ?? {};
            const inlineFields = normalizeConceptInput(rawInput);
            if (Object.keys(inlineFields).length > 0) {
              updateProjectData(inlineFields);
              projectDataRef.current = { ...projectDataRef.current, ...inlineFields };
            }

            const latestData = projectDataRef.current;
            const concept = latestData.concept?.trim();
            if (!concept || concept.length < 12) {
              return invalid('Please give me at least a short logline before I move to storyline.', {
                activeTab,
              });
            }

            if (!context.confirmed && latestData.conceptOption === 'ai') {
              return needsConfirmation('project_setup_next', input, 'generation');
            }

            // Pass eager ref state as overrides so the concept is saved even if React hasn't flushed
            const overrides: Partial<ProjectData> = { ...inlineFields, concept: latestData.concept };
            const savedProjectId = await saveProjectData(overrides);
            if (!savedProjectId) return invalid('I could not save the project yet.');

            if (latestData.conceptOption === 'ai') {
              await generateStoryline(savedProjectId, overrides);
            }
            setActiveTab('storyline');
            return completed('Storyline is open and generation has started.', {
              projectId: savedProjectId,
              activeSetupTab: 'storyline',
            });
          }

          if (activeTab === 'storyline') {
            await saveProjectData();
            setActiveTab('settings');
            return completed('Settings and Cast is open.', { activeSetupTab: 'settings', projectId });
          }

          if (activeTab === 'settings') {
            await saveProjectData();
            setActiveTab('breakdown');
            return completed('Breakdown is open for review.', { activeSetupTab: 'breakdown', projectId });
          }

          if (activeTab === 'breakdown') {
            if (!context.confirmed) {
              return needsConfirmation('project_setup_next', input, 'generation');
            }
            const ready = await finalizeProjectSetup();
            if (ready && projectId) {
              navigate(appRoutes.projects.studio(projectId));
              return completed('Studio is open and storyboard preparation is running.', {
                projectId,
                path: appRoutes.projects.studio(projectId),
              });
            }
            return invalid('I could not start storyboard creation yet.');
          }

          return invalid('I am not sure which setup step to advance from.');
        },
      },
      {
        name: 'storyline_update',
        scope: 'project-setup',
        handler: async (input) => {
          const payload = input as { storylineId?: string; full_story?: string; text?: string; notes?: string };
          const nextStory = (payload.full_story ?? payload.text)?.trim();
          if (!nextStory) {
            return invalid('Tell me the storyline text you want to save.');
          }
          if (!projectId) {
            updateProjectData({ specialRequests: nextStory });
            return completed('Storyline note saved in project setup.', { projectData: { specialRequests: nextStory } });
          }

          const selected = payload.storylineId
            ? { id: payload.storylineId }
            : await supabaseService.storylines.findSelected(projectId);
          if (!selected?.id) {
            updateProjectData({ specialRequests: nextStory });
            return completed('Storyline note saved in project setup.', { projectId });
          }

          const { error } = await supabase
            .from('storylines')
            .update({ full_story: nextStory, status: 'complete' })
            .eq('id', selected.id);
          if (error) throw error;

          return completed('Storyline updated.', { projectId, storylineId: selected.id });
        },
      },
      {
        name: 'storyline_confirm',
        scope: 'project-setup',
        handler: async () => {
          await saveProjectData();
          setActiveTab('settings');
          return completed('Storyline confirmed. Settings and Cast is open.', {
            projectId,
            activeSetupTab: 'settings',
          });
        },
      },
      {
        name: 'settings_select_character',
        scope: 'project-setup',
        handler: async (input) => {
          if (!projectId) return invalid('Please save the project before selecting a character.');
          const payload = input as { characterId?: string; characterName?: string; index?: number };
          const characters = await supabaseService.characters.listByProject(projectId);
          const character =
            characters.find((item) => item.id === payload.characterId) ??
            (payload.characterName
              ? characters.find((item) => matchesText(item.name, payload.characterName))
              : undefined) ??
            (typeof payload.index === 'number' ? characters[payload.index - 1] : undefined);

          if (!character) {
            return invalid('I could not find that character. Which character should I select?', {
              characterCount: characters.length,
            });
          }

          selectTarget({
            type: 'character',
            id: character.id,
            label: character.name,
            projectId,
            sourceImageUrl: character.image_url ?? null,
          });
          setActiveTab('settings');
          scrollVoiceTargetIntoView(`[data-voice-character-id="${character.id}"]`);
          return completed(`${character.name} is selected.`, { character });
        },
      },
      {
        name: 'settings_select_location',
        scope: 'project-setup',
        handler: async (input) => {
          if (!projectId) return invalid('Please save the project before selecting a location.');
          const payload = input as { sceneId?: string; sceneNumber?: number; location?: string };
          const scenes = await supabaseService.scenes.listByProject(projectId);
          const scene =
            scenes.find((item) => item.id === payload.sceneId) ??
            (typeof payload.sceneNumber === 'number'
              ? scenes.find((item) => item.scene_number === payload.sceneNumber)
              : undefined) ??
            (payload.location ? scenes.find((item) => matchesText(item.location, payload.location)) : undefined);

          if (!scene) {
            return invalid('I could not find that location. Which scene or location should I select?', {
              sceneCount: scenes.length,
            });
          }

          selectTarget({
            type: 'location',
            id: scene.id,
            label: scene.location || scene.title || `Scene ${scene.scene_number}`,
            projectId,
            sceneNumber: scene.scene_number,
          });
          setActiveTab('breakdown');
          scrollVoiceTargetIntoView(`[data-voice-scene-id="${scene.id}"]`);
          return completed(`${scene.location || scene.title || `Scene ${scene.scene_number}`} is selected.`, { scene });
        },
      },
      {
        name: 'settings_edit_selected_image',
        scope: 'project-setup',
        confirmation: {
          risk: 'generation',
          message: 'This will spend credits. Should I continue?',
        },
        handler: async (input) => {
          const payload = input as {
            characterId?: string;
            edit_prompt?: string;
            preserve?: string[];
            avoid?: string[];
            aspect_ratio?: string;
          };
          const editPrompt = payload.edit_prompt?.trim();
          if (!editPrompt) return invalid('Tell me the image edit you want.');
          if (!projectId) return invalid('Please save the project before editing an image.');

          const characterId = payload.characterId ?? selectedTargets.character?.id;
          if (!characterId) {
            return invalid('Which character should I edit?', { selectedCharacter: null });
          }

          const characters = await supabaseService.characters.listByProject(projectId);
          const character = characters.find((item) => item.id === characterId);
          if (!character) return invalid('I could not find the selected character.');
          if (!character.image_url) return invalid('Generate a character image before editing it.');

          const styleReferenceUrl = resolveProjectStyleReferenceUrl(projectData);
          const editPayload: StructuredImageEditPrompt = {
            target_type: 'character',
            target_id: character.id,
            source_image_url: character.image_url,
            edit_prompt: editPrompt,
            model_alias: NANO_BANANA_FAST_EDIT_ALIAS,
            style_reference_url: styleReferenceUrl ?? null,
            preserve: payload.preserve ?? ['identity', 'face', 'pose', 'character continuity'],
            avoid: payload.avoid ?? ['extra fingers', 'distorted face', 'identity drift'],
            aspect_ratio: payload.aspect_ratio ?? projectData.aspectRatio ?? 'auto',
          };

          const { data, error } = await supabase.functions.invoke('edit-character-image', {
            body: {
              character_id: character.id,
              source_image_url: character.image_url,
              edit_prompt: JSON.stringify(editPayload),
              style_reference_url: styleReferenceUrl,
              model_alias: NANO_BANANA_FAST_EDIT_ALIAS,
              preferred_model: resolveFrontendModelAlias(NANO_BANANA_FAST_EDIT_ALIAS),
              structured_prompt: editPayload,
            },
          });
          if (error) throw error;

          if (data?.edited_image_url) {
            await supabaseService.characters.update(character.id, { image_url: data.edited_image_url });
          }

          selectTarget({
            type: 'character',
            id: character.id,
            label: character.name,
            projectId,
            sourceImageUrl: data?.edited_image_url ?? character.image_url,
          });

          return completed(`${character.name}'s image edit is ready.`, {
            characterId: character.id,
            editPayload,
            editedImageUrl: data?.edited_image_url ?? null,
          });
        },
      },
      {
        name: 'breakdown_update_scene',
        scope: 'project-setup',
        handler: async (input) => {
          if (!projectId) return invalid('Please save the project before editing scenes.');
          const payload = input as {
            sceneId?: string;
            sceneNumber?: number;
            title?: string;
            description?: string;
            location?: string;
            lighting?: string;
            weather?: string;
            voiceover?: string;
          };
          const scenes = await supabaseService.scenes.listByProject(projectId);
          const scene =
            scenes.find((item) => item.id === payload.sceneId) ??
            (typeof payload.sceneNumber === 'number'
              ? scenes.find((item) => item.scene_number === payload.sceneNumber)
              : undefined) ??
            (selectedTargets.scene?.id ? scenes.find((item) => item.id === selectedTargets.scene?.id) : undefined) ??
            (selectedTargets.location?.id ? scenes.find((item) => item.id === selectedTargets.location?.id) : undefined);

          if (!scene) return invalid('Which scene should I update?');

          const updates = {
            title: payload.title,
            description: payload.description,
            location: payload.location,
            lighting: payload.lighting,
            weather: payload.weather,
            voiceover: payload.voiceover,
          };
          const compactUpdates = Object.fromEntries(
            Object.entries(updates).filter(([, value]) => typeof value === 'string'),
          ) as SceneVoiceUpdates;
          if (Object.keys(compactUpdates).length === 0) {
            return invalid('Tell me what scene text to update.');
          }

          await supabaseService.scenes.update(scene.id, compactUpdates);
          selectTarget({
            type: 'scene',
            id: scene.id,
            label: scene.title || `Scene ${scene.scene_number}`,
            projectId,
            sceneNumber: scene.scene_number,
          });
          setActiveTab('breakdown');
          scrollVoiceTargetIntoView(`[data-voice-scene-id="${scene.id}"]`);
          return completed(`Scene ${scene.scene_number} updated.`, { sceneId: scene.id, updates: compactUpdates });
        },
      },
      {
        name: 'breakdown_start_storyboard',
        scope: 'project-setup',
        confirmation: {
          risk: 'generation',
          message: 'This will spend credits. Should I continue?',
        },
        handler: async () => {
          const ready = await finalizeProjectSetup();
          if (ready && projectId) {
            navigate(appRoutes.projects.studio(projectId));
            return completed('Storyboard creation started. Studio is open.', {
              projectId,
              path: appRoutes.projects.studio(projectId),
            });
          }
          return invalid('I could not start storyboard creation yet.');
        },
      },
    ],
    [
      activeTab,
      finalizeProjectSetup,
      generateStoryline,
      isFinalizing,
      isGenerating,
      navigate,
      projectData,
      projectId,
      saveProjectData,
      selectTarget,
      selectedTargets.character,
      selectedTargets.location,
      selectedTargets.scene,
      setActiveTab,
      updateProjectData,
    ],
  );

  useRegisterVoiceActions(actions);
  return null;
}
