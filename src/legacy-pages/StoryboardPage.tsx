import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus, Loader2, AlertCircle, Film, Sparkles, CircleStop, Scissors } from 'lucide-react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { DitherGradient } from '@/components/dither-kit';
import { ditherBloom, ditherColors } from '@/lib/ditherTheme';
import { motion, AnimatePresence } from 'framer-motion';
import AppHeader from '@/components/AppHeader';
import { SettingsPanel } from '@/components/studio/panels/SettingsPanel';
import EnhancedStoryboardSidebar from '@/components/storyboard/EnhancedStoryboardSidebar';
import { GlowingTitle } from '@/components/timeline/GlowingTitle';
import ShotsRow from '@/components/storyboard/ShotsRow';
import { AddSceneButton } from '@/components/timeline/AddSceneButton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAppStore } from '@/store/appStore';
import { ProjectDetails, SceneDetails, CharacterDetails, SidebarData, ShotDetails } from '@/types/storyboardTypes';
import { cn } from '@/lib/utils';
import { useProjectAutoGenerate } from '@/hooks/useProjectAutoGenerate';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { appRoutes } from '@/lib/routes';
import { getShotImageCredits, getShotVideoCredits, DIRECTORS_CUT_CREDITS } from '@/lib/constants/credits';
import { useProjectSettingsStore } from '@/store/projectSettingsStore';
import { ConfirmGenerateDialog } from '@/components/ui/ConfirmGenerateDialog';
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { FloatingNavPill } from '@/components/home/FloatingNavPill';
import { PanelLeft, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useRegisterVoiceActions } from '@/voice/VoiceAgentProvider';
import type { VoiceActionRegistration, VoiceActionResult } from '@/voice/actions/registry';
import { scrollVoiceTargetIntoView, useVoiceSelection } from '@/voice/VoiceSelectionContext';
import useSaveToProjectAssets from '@/hooks/useSaveToProjectAssets';
import {
  NANO_BANANA_FAST_EDIT_ALIAS,
  resolveFrontendModelAlias,
  type StructuredImageEditPrompt,
} from '@/lib/modelAliases';

function completed(message: string, data?: unknown): VoiceActionResult {
  return { ok: true, status: 'completed', message, data };
}

function invalid(message: string, data?: unknown): VoiceActionResult {
  return { ok: false, status: 'invalid_input', message, data };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

const StoryboardPage = () => {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { setActiveProject } = useAppStore();
  const isMobile = useIsMobile();
  const { selectedTargets, selectTarget, setExpandedShotId } = useVoiceSelection();
  const { saveAsset } = useSaveToProjectAssets(projectId);
  
  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [scenes, setScenes] = useState<SceneDetails[]>([]);
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
  const [characters, setCharacters] = useState<CharacterDetails[]>([]);
  const [selectedScene, setSelectedScene] = useState<SceneDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarData, setSidebarData] = useState<SidebarData | null>(null);
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [showProjectConfirmGenerate, setShowProjectConfirmGenerate] = useState(false);
  const [showDirectorsCutConfirm, setShowDirectorsCutConfirm] = useState(false);
  const [openReviewTaskCount, setOpenReviewTaskCount] = useState(0);
  // Get user-selected models from project settings store
  const { settings: projectSettings, fetchSettings: fetchProjectSettings } = useProjectSettingsStore();
  const selectedImageModel = projectSettings?.baseImageModel;
  const selectedVideoModel = projectSettings?.baseVideoModel;

  // Project-level auto-generate for all shots across all scenes
  const {
    state: projectAutoGenState,
    generationCounts,
    startAutoGenerate: startProjectAutoGenerate,
    cancelAutoGenerate: cancelProjectAutoGenerate,
    nextPhase: projectNextPhase,
    isProcessing: isProjectAutoGenerating,
    fetchAllProjectShots
  } = useProjectAutoGenerate(projectId || '');
  const estimatedProjectShotCount = generationCounts.totalShots || projectAutoGenState.progress.total || scenes.length * 3;
  const pendingProjectGenerationCount = generationCounts.totalShots > 0
    ? projectNextPhase === 'images'
      ? generationCounts.missingImages
      : generationCounts.missingVideos
    : projectAutoGenState.progress.total || estimatedProjectShotCount;
  
  // Validate that we have a projectId and fetch project settings
  useEffect(() => {
    if (!projectId) {
      toast.error('No project ID specified');
      navigate(appRoutes.home);
      return;
    }
    // Fetch project settings to get user-selected models for credit display
    fetchProjectSettings(projectId).catch(() => undefined);
  }, [projectId, navigate, fetchProjectSettings]);

  // Memoize fetchData to prevent unnecessary re-renders
  const fetchData = useCallback(async () => {
    if (!projectId) {
      toast.error("Project ID not found. Redirecting to home page.");
      setIsLoading(false);
      navigate(appRoutes.home);
      return;
    }

    setIsLoading(true);
    try {
      // Fetch project, scenes, and characters in parallel
      const [projectRes, scenesRes, charactersRes] = await Promise.all([
        supabase.from('projects').select('id, title, description, video_style').eq('id', projectId).single(),
        supabase.from('scenes').select('*').eq('project_id', projectId).order('scene_number', { ascending: true }),
        supabase.from('characters').select('*').eq('project_id', projectId)
      ]);

      // Process Project
      if (projectRes.error) {
        throw new Error(projectRes.error.message || 'Failed to fetch project details.');
      }
      const fetchedProject = projectRes.data as ProjectDetails;
      setProjectDetails(fetchedProject);
      
      // Update the global app state with the project details
      setActiveProject(projectId, fetchedProject.title || 'Untitled');
      
      console.log("StoryboardPage: Fetched Project:", fetchedProject);

      // Process Scenes
      if (scenesRes.error) {
        throw new Error(scenesRes.error.message || 'Failed to fetch scenes.');
      }
      const fetchedScenes = (scenesRes.data || []) as SceneDetails[];
      setScenes(fetchedScenes);
      console.log(`StoryboardPage: Fetched ${fetchedScenes.length} Scenes:`, fetchedScenes);

      // Set initial selected scene - prefer scene 1 if it exists
      const initialScene = fetchedScenes.find(s => s.scene_number === 1) || 
                          (fetchedScenes.length > 0 ? fetchedScenes[0] : null);
      setSelectedScene(initialScene);
      console.log("StoryboardPage: Initial Selected Scene:", initialScene);

      // Process Characters
      if (charactersRes.error) {
        throw new Error(charactersRes.error.message || 'Failed to fetch characters.');
      }
      const fetchedCharacters = (charactersRes.data || []) as CharacterDetails[];
      setCharacters(fetchedCharacters);
      console.log(`StoryboardPage: Fetched ${fetchedCharacters.length} Characters:`, fetchedCharacters);

      // Prepare Initial Sidebar Data
      setSidebarData({
        projectTitle: fetchedProject.title,
        projectDescription: fetchedProject.description,
        sceneDescription: initialScene?.description ?? null,
        sceneLocation: initialScene?.location ?? null,
        sceneLighting: initialScene?.lighting ?? null,
        sceneWeather: initialScene?.weather ?? null,
        videoStyle: fetchedProject.video_style ?? null,
        characters: fetchedCharacters
      });
      console.log("StoryboardPage: Initial Sidebar Data Set");

      // If there are no scenes, show a toast to help guide the user
      if (fetchedScenes.length === 0) {
        toast.info("No scenes found. You can add a scene using the + button.", {
          duration: 5000,
        });
      }

    } catch (error) {
      const message = getErrorMessage(error);
      console.error("Error fetching storyboard data:", error);
      toast.error(`Failed to load storyboard: ${message}`);
      setProjectDetails(null);
      setScenes([]);
      setCharacters([]);
      setSelectedScene(null);
      setSidebarData(null);
    } finally {
      setIsLoading(false);
      console.log("StoryboardPage: Fetching complete.");
    }
  }, [projectId, navigate, setActiveProject]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Fetch all project shots for the auto-generate hook when scenes are loaded
  useEffect(() => {
    if (scenes.length > 0 && projectId) {
      fetchAllProjectShots();
    }
  }, [scenes.length, projectId, fetchAllProjectShots]);

  // Set up realtime subscriptions to scenes and shots
  useEffect(() => {
    if (!projectId) return;
    
    console.log(`StoryboardPage: Setting up realtime subscriptions for project: ${projectId}`);
    
    // Subscribe to scene changes
    const scenesChannel = supabase
      .channel('scenes_channel')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'scenes',
          filter: `project_id=eq.${projectId}`
        }, 
        async (payload) => {
          console.log('Scenes realtime update:', payload);
          
          // Refresh the entire scene list on any change
          // This is simpler than trying to merge changes
          await fetchData();
          
          // Show a toast based on the event type
          if (payload.eventType === 'INSERT') {
            toast.success('New scene added');
          } else if (payload.eventType === 'UPDATE') {
            toast.success('Scene updated');
          } else if (payload.eventType === 'DELETE') {
            toast.info('Scene deleted');
          }
        })
      .subscribe();
      
    // Clean up subscriptions
    return () => {
      supabase.removeChannel(scenesChannel);
    };
  }, [projectId, fetchData]);

  useEffect(() => {
    if (!projectId) return;

    const fetchOpenReviewTasks = async () => {
      const { count, error } = await supabase
        .from('review_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .in('status', ['open', 'in_review']);

      if (!error) {
        setOpenReviewTaskCount(count ?? 0);
      }
    };

    void fetchOpenReviewTasks();

    const reviewChannel = supabase
      .channel(`review_tasks_${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'review_tasks',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          void fetchOpenReviewTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reviewChannel);
    };
  }, [projectId]);

  // Function to update scene details in the database
  const handleSceneUpdate = async (sceneId: string | undefined, updates: Partial<Omit<SceneDetails, 'id' | 'project_id' | 'scene_number'>>) => {
    if (!sceneId) {
      toast.error("Cannot update scene: Scene ID is missing.");
      return;
    }
    try {
      const { error } = await supabase
        .from('scenes')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updates as any)
        .eq('id', sceneId);
      if (error) throw error;

      // Update local state for immediate feedback
      setSelectedScene(prev => prev ? { ...prev, ...updates } : null);
      setScenes(prevScenes => prevScenes.map(s => s.id === sceneId ? { ...s, ...updates } : s));
      setSidebarData(prev => prev ? {
        ...prev,
        sceneDescription: updates.description ?? prev.sceneDescription,
        sceneLocation: updates.location ?? prev.sceneLocation,
        sceneLighting: updates.lighting ?? prev.sceneLighting,
        sceneWeather: updates.weather ?? prev.sceneWeather,
      } : null);

    } catch (error) {
      const message = getErrorMessage(error);
      console.error("Error updating scene:", error);
      toast.error(`Failed to update scene: ${message}`);
    }
  };

  const handleProjectUpdate = async (updates: { title?: string; description?: string }) => {
    if (!projectId) return;
    try {
      const { error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', projectId);
      if (error) throw error;
      setProjectDetails(prev => prev ? { ...prev, ...updates } : null);
      setSidebarData(prev => prev ? {
        ...prev,
        projectTitle: updates.title ?? prev.projectTitle,
        projectDescription: updates.description ?? prev.projectDescription,
      } : null);
    } catch (error) {
      const message = getErrorMessage(error);
      console.error("Error updating project:", error);
      toast.error(`Failed to update project: ${message}`);
    }
  };

  // Add scene function
  const addScene = async () => {
    if (!projectId) return;
    const newSceneNumber = scenes.length > 0 ? Math.max(...scenes.map(s => s.scene_number)) + 1 : 1;
    try {
      const { data, error } = await supabase
        .from('scenes')
        .insert({ project_id: projectId, scene_number: newSceneNumber, title: `Scene ${newSceneNumber}` })
        .select()
        .single();
      if (error) throw error;
      if (data) {
        setScenes(prev => [...prev, data as SceneDetails]);
        toast.success(`Scene ${newSceneNumber} added.`);
      }
    } catch (error) {
      const message = getErrorMessage(error);
      console.error("Error adding scene:", error);
      toast.error(`Failed to add scene: ${message}`);
    }
  };

  // Function to handle selecting a different scene
  const handleSelectScene = useCallback((scene: SceneDetails) => {
    setSelectedScene(scene);
    // Update sidebar data when scene changes
    setSidebarData(prev => projectDetails ? ({
      projectTitle: projectDetails.title,
      projectDescription: projectDetails.description,
      sceneDescription: scene.description ?? null,
      sceneLocation: scene.location ?? null,
      sceneLighting: scene.lighting ?? null,
      sceneWeather: scene.weather ?? null,
      videoStyle: projectDetails.video_style ?? null,
      characters: characters
    }) : null);
  }, [characters, projectDetails]);

  const fetchVoiceShots = useCallback(async () => {
    if (!projectId || scenes.length === 0) return [];
    const sceneIds = scenes.map((scene) => scene.id);
    const { data, error } = await supabase
      .from('shots')
      .select('*')
      .in('scene_id', sceneIds)
      .order('shot_number', { ascending: true });
    if (error) throw error;
    return (data || []) as ShotDetails[];
  }, [projectId, scenes]);

  const selectShotForVoice = useCallback(
    async (input: {
      shotId?: string;
      shotNumber?: number;
      sceneId?: string;
      sceneNumber?: number;
      open?: boolean;
    }) => {
      const shots = await fetchVoiceShots();
      const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
      const targetScene =
        (input.sceneId ? sceneById.get(input.sceneId) : undefined) ??
        (typeof input.sceneNumber === 'number'
          ? scenes.find((scene) => scene.scene_number === input.sceneNumber)
          : undefined) ??
        (selectedTargets.scene?.id ? sceneById.get(selectedTargets.scene.id) : undefined) ??
        selectedScene ??
        undefined;

      let matches = shots;
      if (input.shotId) {
        matches = shots.filter((shot) => shot.id === input.shotId);
      } else if (typeof input.shotNumber === 'number') {
        matches = shots.filter((shot) => shot.shot_number === input.shotNumber);
        if (targetScene) {
          matches = matches.filter((shot) => shot.scene_id === targetScene.id);
        }
      } else if (selectedTargets.shot?.id) {
        matches = shots.filter((shot) => shot.id === selectedTargets.shot?.id);
      }

      if (matches.length === 0) {
        return {
          result: invalid('Which shot number should I use?', {
            selectedSceneNumber: targetScene?.scene_number ?? null,
          }),
          shot: null,
          scene: null,
        };
      }

      if (!input.shotId && typeof input.shotNumber === 'number' && matches.length > 1 && !targetScene) {
        return {
          result: invalid('That shot number appears in more than one scene. Which scene number?', {
            shotNumber: input.shotNumber,
            matchingSceneNumbers: matches
              .map((shot) => sceneById.get(shot.scene_id)?.scene_number)
              .filter((value): value is number => typeof value === 'number'),
          }),
          shot: null,
          scene: null,
        };
      }

      const shot = matches[0];
      const scene = sceneById.get(shot.scene_id) ?? null;
      if (scene) {
        handleSelectScene(scene);
      }

      selectTarget({
        type: 'shot',
        id: shot.id,
        label: `Shot ${shot.shot_number}`,
        projectId,
        sceneId: shot.scene_id,
        sceneNumber: scene?.scene_number ?? null,
        shotNumber: shot.shot_number,
        sourceImageUrl: shot.image_url ?? null,
      });

      if (input.open) {
        setExpandedShotId(shot.id);
      }
      scrollVoiceTargetIntoView(`[data-shot-id="${shot.id}"]`);

      return {
        result: completed(`Shot ${shot.shot_number} is selected.`, {
          shotId: shot.id,
          shotNumber: shot.shot_number,
          sceneNumber: scene?.scene_number ?? null,
        }),
        shot,
        scene,
      };
    },
    [fetchVoiceShots, handleSelectScene, projectId, scenes, selectTarget, selectedScene, selectedTargets.scene?.id, selectedTargets.shot?.id, setExpandedShotId],
  );

  const voiceActions = useMemo<VoiceActionRegistration[]>(
    () => [
      {
        name: 'get_app_context',
        scope: 'timeline',
        handler: () =>
          completed('Timeline context loaded.', {
            route: window.location.pathname,
            projectId,
            selectedScene: selectedScene
              ? { id: selectedScene.id, sceneNumber: selectedScene.scene_number, title: selectedScene.title }
              : null,
            selectedShot: selectedTargets.shot ?? null,
            generationStatus: {
              projectPhase: projectAutoGenState.phase,
              projectProgress: projectAutoGenState.progress,
              nextPhase: projectNextPhase,
              isProjectAutoGenerating,
            },
            availableActions: [
              'timeline_select_shot',
              'timeline_open_shot',
              'timeline_update_shot_prompt',
              'timeline_generate_shot_image',
              'timeline_generate_all_images',
              'timeline_edit_shot_image',
              'timeline_start_directors_cut',
              'asset_store_save_current',
            ],
          }),
      },
      {
        name: 'timeline_select_shot',
        scope: 'timeline',
        handler: async (input) => {
          const payload = input as { shotId?: string; shotNumber?: number; sceneId?: string; sceneNumber?: number };
          const { result } = await selectShotForVoice(payload);
          return result;
        },
      },
      {
        name: 'timeline_open_shot',
        scope: 'timeline',
        handler: async (input) => {
          const payload = input as { shotId?: string; shotNumber?: number; sceneId?: string; sceneNumber?: number };
          const { result } = await selectShotForVoice({ ...payload, open: true });
          return result.ok
            ? completed('Shot card is open.', result.data)
            : result;
        },
      },
      {
        name: 'timeline_update_shot_prompt',
        scope: 'timeline',
        handler: async (input) => {
          const payload = input as {
            shotId?: string;
            shotNumber?: number;
            sceneId?: string;
            sceneNumber?: number;
            prompt_idea?: string;
            visual_prompt?: string;
            dialogue?: string;
            sound_effects?: string;
          };
          const { result, shot } = await selectShotForVoice(payload);
          if (!shot) return result;

          const updates = {
            prompt_idea: payload.prompt_idea,
            visual_prompt: payload.visual_prompt,
            dialogue: payload.dialogue,
            sound_effects: payload.sound_effects,
          };
          const compactUpdates = Object.fromEntries(
            Object.entries(updates).filter(([, value]) => typeof value === 'string'),
          );
          if (Object.keys(compactUpdates).length === 0) {
            return invalid('Tell me the shot prompt text to update.');
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await supabase.from('shots').update(compactUpdates as any).eq('id', shot.id);
          if (error) throw error;
          return completed(`Shot ${shot.shot_number} updated.`, { shotId: shot.id, updates: compactUpdates });
        },
      },
      {
        name: 'timeline_generate_shot_image',
        scope: 'timeline',
        confirmation: {
          risk: 'generation',
          message: 'This will spend credits. Should I continue?',
        },
        handler: async (input) => {
          const payload = input as { shotId?: string; shotNumber?: number; sceneId?: string; sceneNumber?: number };
          const { result, shot } = await selectShotForVoice(payload);
          if (!shot) return result;

          if (!shot.visual_prompt) {
            const { error: promptError } = await supabase.functions.invoke('generate-visual-prompt', {
              body: { shot_id: shot.id },
            });
            if (promptError) throw promptError;
          }

          const { error } = await supabase.functions.invoke('generate-shot-image', {
            body: { shot_id: shot.id, image_model: selectedImageModel || undefined },
          });
          if (error) throw error;

          return completed(`Image generation started for shot ${shot.shot_number}.`, { shotId: shot.id });
        },
      },
      {
        name: 'timeline_generate_all_images',
        scope: 'timeline',
        confirmation: {
          risk: 'generation',
          message: 'This will spend credits. Should I continue?',
        },
        handler: async () => {
          if (projectNextPhase !== 'images') {
            return completed('All missing images are already handled. The next available phase is video generation.', {
              nextPhase: projectNextPhase,
            });
          }
          await startProjectAutoGenerate({ imageModelId: selectedImageModel, videoModelId: selectedVideoModel });
          return completed('Generating all missing shot images.', {
            projectId,
            pendingProjectGenerationCount,
          });
        },
      },
      {
        name: 'timeline_edit_shot_image',
        scope: 'timeline',
        confirmation: {
          risk: 'generation',
          message: 'This will spend credits. Should I continue?',
        },
        handler: async (input) => {
          const payload = input as {
            shotId?: string;
            shotNumber?: number;
            sceneId?: string;
            sceneNumber?: number;
            edit_prompt?: string;
            preserve?: string[];
            avoid?: string[];
            aspect_ratio?: string;
          };
          const editPrompt = payload.edit_prompt?.trim();
          if (!editPrompt) return invalid('Tell me how to edit the shot image.');
          const { result, shot } = await selectShotForVoice(payload);
          if (!shot) return result;
          if (!shot.image_url) return invalid('Generate this shot image before editing it.');

          const editPayload: StructuredImageEditPrompt = {
            target_type: 'shot',
            target_id: shot.id,
            source_image_url: shot.image_url,
            edit_prompt: editPrompt,
            model_alias: NANO_BANANA_FAST_EDIT_ALIAS,
            preserve: payload.preserve ?? ['composition', 'main subject', 'camera angle', 'continuity'],
            avoid: payload.avoid ?? ['distortion', 'extra limbs', 'identity drift', 'text artifacts'],
            aspect_ratio: payload.aspect_ratio ?? 'auto',
          };

          const { data, error } = await supabase.functions.invoke('edit-shot-image', {
            body: {
              shot_id: shot.id,
              image_url: shot.image_url,
              edit_prompt: JSON.stringify(editPayload),
              original_prompt: shot.visual_prompt,
              model_alias: NANO_BANANA_FAST_EDIT_ALIAS,
              preferred_model: resolveFrontendModelAlias(NANO_BANANA_FAST_EDIT_ALIAS),
              structured_prompt: editPayload,
            },
          });
          if (error) throw error;

          return completed(`Shot ${shot.shot_number} image edit is ready.`, {
            shotId: shot.id,
            editPayload,
            imageUrl: data?.image_url ?? null,
          });
        },
      },
      {
        name: 'timeline_start_directors_cut',
        scope: 'timeline',
        confirmation: {
          risk: 'generation',
          message: 'This will spend credits. Should I continue?',
        },
        handler: async () => {
          if (!projectId) return invalid('I need an active project before starting Director\'s Cut.');
          navigate(appRoutes.projects.directorsCut(projectId));
          return completed('Director\'s Cut is open.', { path: appRoutes.projects.directorsCut(projectId) });
        },
      },
      {
        name: 'asset_store_save_current',
        scope: 'timeline',
        handler: async (input) => {
          const payload = input as { shotId?: string; shotNumber?: number; sceneId?: string; sceneNumber?: number };
          const { result, shot } = await selectShotForVoice(payload);
          if (!shot) return result;

          const url = shot.video_status === 'completed' && shot.video_url ? shot.video_url : shot.image_url;
          const type = shot.video_status === 'completed' && shot.video_url ? 'video' : 'image';
          if (!url) return invalid('There is no generated output on the selected shot to save yet.');

          const saved = await saveAsset({
            url,
            type,
            prompt: shot.visual_prompt || shot.prompt_idea || undefined,
            model: type === 'image' ? selectedImageModel : selectedVideoModel,
            name: `Scene ${selectedScene?.scene_number ?? 'selected'} Shot ${shot.shot_number}`,
            metadata: {
              source: 'voice_timeline',
              shotId: shot.id,
              sceneId: shot.scene_id,
              shotNumber: shot.shot_number,
            },
          });

          if (!saved) return invalid('I could not save that output to the Asset Store.');
          navigate(appRoutes.assets);
          return completed('Saved to Asset Store.', { assetId: saved.id, path: appRoutes.assets });
        },
      },
    ],
    [
      isProjectAutoGenerating,
      navigate,
      pendingProjectGenerationCount,
      projectAutoGenState.phase,
      projectAutoGenState.progress,
      projectId,
      projectNextPhase,
      saveAsset,
      selectShotForVoice,
      selectedImageModel,
      selectedScene,
      selectedTargets.shot,
      selectedVideoModel,
      startProjectAutoGenerate,
    ],
  );

  useRegisterVoiceActions(voiceActions);

  // Function to handle deleting a scene
  const handleDeleteScene = async (sceneId: string) => {
    if (!projectId) return;
    
    try {
      const { error } = await supabase
        .from('scenes')
        .delete()
        .eq('id', sceneId)
        .eq('project_id', projectId);
      
      if (error) throw error;
      
      // Update local state to remove the deleted scene
      setScenes(prev => prev.filter(scene => scene.id !== sceneId));
      
      // If the deleted scene was selected, select another scene or null
      if (selectedScene?.id === sceneId) {
        const remainingScenes = scenes.filter(scene => scene.id !== sceneId);
        setSelectedScene(remainingScenes.length > 0 ? remainingScenes[0] : null);
        
        // Update sidebar data if needed
        if (remainingScenes.length > 0 && projectDetails) {
          const nextScene = remainingScenes[0];
          setSidebarData({
            projectTitle: projectDetails.title,
            projectDescription: projectDetails.description,
            sceneDescription: nextScene.description ?? null,
            sceneLocation: nextScene.location ?? null,
            sceneLighting: nextScene.lighting ?? null,
            sceneWeather: nextScene.weather ?? null,
            videoStyle: projectDetails.video_style ?? null,
            characters: characters
          });
        }
      }
      
      toast.success('Scene deleted');
    } catch (error) {
      const message = getErrorMessage(error);
      console.error("Error deleting scene:", error);
      toast.error(`Failed to delete scene: ${message}`);
      throw error; // Re-throw so ShotsRow can handle it
    }
  };

  // Render logic
  if (isLoading && !projectDetails) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090909] text-white">
        <Loader2 className="h-8 w-8 animate-spin text-[#d4a574]" />
        <span className="ml-3">Loading Storyboard...</span>
      </div>
    );
  }

  if (!projectDetails && !isLoading) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#090909] p-6 text-white">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Error Loading Project</h2>
        <p className="text-zinc-400 mb-6">Could not load project data. The project ID might be missing or invalid.</p>
        <Button onClick={() => navigate('/home')}>Go to Projects</Button>
      </div>
    );
  }

  const sidebarNode = sidebarData ? (
    <EnhancedStoryboardSidebar
      key={selectedScene?.id || 'no-scene'}
      data={sidebarData}
      sceneId={selectedScene?.id || ''}
      onUpdate={(updates) => handleSceneUpdate(selectedScene?.id, updates)}
      onProjectUpdate={handleProjectUpdate}
    />
  ) : (
    <div className="p-6 text-zinc-500">Loading sidebar...</div>
  );

  const mainContent = (
    <div className="p-3 md:p-6 h-full overflow-y-auto relative">
      <DitherGradient
        from={ditherColors.primary}
        direction="down"
        bloom={ditherBloom.dashboard}
        opacity={0.09}
        className="pointer-events-none absolute inset-x-0 top-0 bottom-auto h-36 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      {projectDetails && (
        <div className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {!isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={isSidebarCollapsed ? 'Show scene details' : 'Hide scene details'}
                    onClick={() => {
                      const panel = sidebarPanelRef.current;
                      if (!panel) return;
                      if (panel.isCollapsed()) {
                        panel.expand();
                      } else {
                        panel.collapse();
                      }
                    }}
                    className="shrink-0 h-10 w-10 border-zinc-800 bg-[#141414] text-zinc-300 hover:bg-[#1a1a1a] hover:border-[rgba(249,115,22,0.25)]"
                  >
                    {isSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="glass-panel border-zinc-700">
                  <p className="text-xs">{isSidebarCollapsed ? 'Show scene details' : 'Hide scene details'}</p>
                </TooltipContent>
              </Tooltip>
            )}
            {isMobile && (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="shrink-0 h-10 w-10 border-zinc-800 bg-[#141414]">
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[88vw] max-w-sm p-0 bg-[#0a0a0a] border-zinc-800">
                  <SheetHeader className="p-4 border-b border-zinc-800">
                    <SheetTitle className="text-white text-left">Scene Details</SheetTitle>
                  </SheetHeader>
                  <div className="h-[calc(100vh-65px)] overflow-y-auto">{sidebarNode}</div>
                </SheetContent>
              </Sheet>
            )}
            <GlowingTitle title={projectDetails.title} glowColor="#d4a574" />
          </div>

          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            {projectId ? (
              <Button
                variant="outline"
                size={isMobile ? 'sm' : 'default'}
                onClick={() => navigate(appRoutes.projects.observability(projectId))}
                className="border-amber-400/20 bg-[#141414] text-zinc-100 hover:bg-[#1a1a1a] min-h-[40px]"
              >
                <AlertCircle className="mr-2 h-4 w-4 text-amber-300" />
                <span className="hidden sm:inline">Observability</span>
                <span className="sm:hidden">Obs</span>
                {openReviewTaskCount > 0 ? (
                  <Badge variant="destructive" className="ml-2">
                    {openReviewTaskCount}
                  </Badge>
                ) : null}
              </Button>
            ) : null}

            {projectId && (
              <Button
                size={isMobile ? 'sm' : 'default'}
                onClick={() => setShowDirectorsCutConfirm(true)}
                className={cn(
                  'relative overflow-hidden backdrop-blur-sm px-3 md:px-5 py-2 min-h-[40px]',
                  'bg-[#151515] border border-[rgba(249,115,22,0.15)] text-zinc-100',
                  'hover:border-[rgba(249,115,22,0.25)] hover:bg-[#1a1a1a]'
                )}
              >
                <Scissors className="h-4 w-4" />
                <span className="ml-2 hidden sm:inline">Director&apos;s Cut ({DIRECTORS_CUT_CREDITS} credits)</span>
                <span className="ml-2 sm:hidden">Cut</span>
              </Button>
            )}

            {scenes.length > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size={isMobile ? 'sm' : 'default'}
                    onClick={isProjectAutoGenerating ? cancelProjectAutoGenerate : () => setShowProjectConfirmGenerate(true)}
                    className={cn(
                      'relative overflow-hidden px-3 md:px-6 py-2 min-h-[40px]',
                      'bg-[#151210] border border-[rgba(249,115,22,0.15)] text-orange-50',
                      'hover:border-[rgba(249,115,22,0.3)] hover:bg-[#1b1b1b]'
                    )}
                  >
                    {isProjectAutoGenerating ? (
                      <>
                        <CircleStop className="h-4 w-4" />
                        <span className="ml-2">Stop {projectAutoGenState.progress.completed}/{projectAutoGenState.progress.total}</span>
                      </>
                    ) : projectNextPhase === 'images' ? (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span className="ml-2 hidden sm:inline">Generate Missing Images ({getShotImageCredits(selectedImageModel) * pendingProjectGenerationCount} credits)</span>
                        <span className="ml-2 sm:hidden">Images</span>
                      </>
                    ) : (
                      <>
                        <Film className="h-4 w-4" />
                        <span className="ml-2 hidden sm:inline">Generate Missing Videos ({getShotVideoCredits(selectedVideoModel) * pendingProjectGenerationCount} credits)</span>
                        <span className="ml-2 sm:hidden">Videos</span>
                      </>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="glass-panel border-zinc-700 max-w-xs">
                  <p className="text-xs">
                    {isProjectAutoGenerating
                      ? 'Cancel the current project-wide generation queue'
                      : projectNextPhase === 'images'
                      ? `Generate missing images for ${pendingProjectGenerationCount} shot(s)`
                      : `Generate missing videos for ${pendingProjectGenerationCount} shot(s)`}
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      )}
      {scenes.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className={cn(
            'text-center mt-12 md:mt-20 max-w-md mx-auto p-6 md:p-8 rounded-2xl',
            'bg-[#111111]/90 backdrop-blur-sm border border-white/8'
          )}
        >
          <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-zinc-800/50 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-zinc-500" />
          </div>
          <p className="text-xl font-semibold text-zinc-300 mb-2">No scenes found</p>
          <p className="text-sm text-zinc-500 mb-6">Add scenes manually or generate them in Project Setup.</p>
          <div className="flex items-center justify-center gap-3">
            <AddSceneButton onClick={addScene} />
            <span className="text-sm font-medium text-white/80">Add First Scene</span>
          </div>
        </motion.div>
      ) : (
        <AnimatePresence initial={false}>
          {scenes.map((scene, index) => (
            <motion.div
              key={scene.id}
              layout
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, delay: index * 0.05 }}
              onClick={() => handleSelectScene(scene)}
              className={`${selectedScene?.id === scene.id ? 'border-l-2 border-[#f97316] pl-2 md:pl-4 -ml-2 md:-ml-4 mb-8 md:mb-12' : 'mb-8 md:mb-12'}`}
            >
              <ShotsRow
                sceneId={scene.id}
                sceneNumber={scene.scene_number}
                projectId={projectId}
                onSceneDelete={handleDeleteScene}
                isSelected={selectedScene?.id === scene.id}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      )}
      <div className="fixed bottom-6 right-4 md:bottom-8 md:right-8 z-30 pb-[env(safe-area-inset-bottom)]">
        <motion.button
          onClick={addScene}
          className={cn(
            'relative w-14 h-14 md:w-16 md:h-16 rounded-2xl',
            'bg-gradient-to-br from-[#151515] to-[#1b1b1b]',
            'border border-[#f97316]/25',
            'shadow-[0_0_24px_rgba(249,115,22,0.18),0_8px_24px_rgba(0,0,0,0.35)]',
            'flex items-center justify-center'
          )}
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 400, damping: 15 }}
        >
          <Plus className="w-6 h-6 md:w-7 md:h-7 text-white drop-shadow-lg" />
        </motion.button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen flex-col bg-[#090909] text-white">
      {!isMobile && <FloatingNavPill activeView="timeline" />}
      <AppHeader onOpenSettings={() => setIsSettingsPanelOpen(true)} />
      {isMobile ? (
        <div className="flex-grow overflow-hidden">{mainContent}</div>
      ) : (
        <ResizablePanelGroup orientation="horizontal" className="flex-grow">
          <ResizablePanel
            panelRef={sidebarPanelRef}
            defaultSize="20%"
            minSize="15%"
            maxSize="30%"
            collapsible
            collapsedSize={0}
            onResize={(size) => setIsSidebarCollapsed(size.asPercentage === 0)}
            className="h-full"
          >
            <div className="h-full overflow-hidden">{sidebarNode}</div>
          </ResizablePanel>
          <ResizableHandle className="bg-white/[0.06] hover:bg-[rgba(249,115,22,0.35)] transition-colors" />
          <ResizablePanel defaultSize="80%">{mainContent}</ResizablePanel>
        </ResizablePanelGroup>
      )}
      
      {/* Enhanced Background */}
      {/* Base gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 -z-20" />
      
      {/* Animated gradient orbs */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <motion.div 
          className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-[#f97316]/8 blur-3xl"
          animate={{
            x: [0, 50, 0],
            y: [0, 30, 0],
            scale: [1, 1.1, 1]
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
        <motion.div 
          className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-[#d4a574]/6 blur-3xl"
          animate={{
            x: [0, -50, 0],
            y: [0, -30, 0],
            scale: [1, 1.2, 1]
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      </div>
      
      {/* Noise texture */}
      <div className="fixed inset-0 bg-noise opacity-[0.02] -z-10 mix-blend-overlay" 
        style={{ backgroundImage: 'url(/noise.png)' }} 
      />

      {/* Settings Panel Overlay */}
      {isSettingsPanelOpen && projectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <SettingsPanel projectId={projectId} onClose={() => setIsSettingsPanelOpen(false)} />
        </div>
      )}

      <ConfirmGenerateDialog
        open={showProjectConfirmGenerate}
        onOpenChange={setShowProjectConfirmGenerate}
        onConfirm={() => {
          setShowProjectConfirmGenerate(false);
          startProjectAutoGenerate({ imageModelId: selectedImageModel, videoModelId: selectedVideoModel });
        }}
        title={projectNextPhase === 'images' ? 'Generate Missing Images' : 'Generate Missing Videos'}
        description={`This will process ${pendingProjectGenerationCount} incomplete shot(s) and skip completed outputs.`}
        estimatedCredits={
          projectNextPhase === 'images'
            ? getShotImageCredits(selectedImageModel) * pendingProjectGenerationCount
            : getShotVideoCredits(selectedVideoModel) * pendingProjectGenerationCount
        }
      />

      <ConfirmGenerateDialog
        open={showDirectorsCutConfirm}
        onOpenChange={setShowDirectorsCutConfirm}
        onConfirm={() => {
          setShowDirectorsCutConfirm(false);
          if (projectId) navigate(appRoutes.projects.directorsCut(projectId));
        }}
        title="Confirm Director's Cut"
        description="Are you sure you wish to proceed with Director's Cut?"
        estimatedCredits={DIRECTORS_CUT_CREDITS}
      />
    </div>
  );
};

export default StoryboardPage;
