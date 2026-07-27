import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { Character, ProjectData, ProjectSetupTab } from './types';
import { supabase } from '@/integrations/supabase/client';
import { supabaseService } from '@/services/supabaseService';
import { toast } from 'sonner';
import { useAuth } from '@/providers/AuthProvider';
import { extractInsufficientCreditsError, routeToBillingTopUp } from '@/lib/billing-errors';
import { buildConceptPayload } from '@/services/conceptPayloadService';
import { DEFAULT_EVALUATION_THRESHOLDS } from '@/lib/evaluation';
import { upsertProjectCharacterBlueprints } from '@/services/characterBlueprintService';
import { getStylePromptFragment, resolveStyleReferenceUrl } from '@/constants/stylePacks';
import { appRoutes } from '@/lib/routes';
import { DEFAULT_PROJECT_DATA } from './projectSetupDefaults';
import { hydrateProjectSetupData } from './projectSetupHydration';
import {
  CHARACTER_GENERATION_TIMEOUT_MESSAGE,
  getStaleCharacterGenerationCutoff,
} from './characterGenerationWatchdog';

interface ProjectContextProps {
  projectData: ProjectData;
  updateProjectData: (data: Partial<ProjectData>) => void;
  activeTab: ProjectSetupTab;
  setActiveTab: (tab: ProjectSetupTab) => void;
  saveProjectData: (overrides?: Partial<ProjectData>) => Promise<string | null>;
  projectId: string | null;
  getVisibleTabs: () => ProjectSetupTab[];
  previousOption: 'ai' | 'manual';
  isCreating: boolean;
  setIsCreating: (creating: boolean) => void;
  isGenerating: boolean; 
  setIsGenerating: (generating: boolean) => void;
  isFinalizing: boolean; // New state for finalization process
  generateStoryline: (projectId: string, overrides?: Partial<ProjectData>) => Promise<boolean>;
  handleCreateProject: () => Promise<void>;
  finalizeProjectSetup: () => Promise<boolean>; // New method to invoke the orchestrator
  generationCompletedSignal: number;
  characters: Character[];
  isLoadingCharacters: boolean;
  refreshCharacters: () => Promise<void>;
  addCharacter: (name?: string, description?: string) => Promise<Character | null>;
  deleteCharacter: (characterId: string) => Promise<boolean>;
  generateCharacterImage: (characterId: string, styleReferenceUrl?: string) => Promise<boolean>;
  failCharacterImageGeneration: (characterId: string, message: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextProps | undefined>(undefined);

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return 'Unknown error';
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

function sortCharactersByCreation(characters: Character[]) {
  return [...characters].sort((a, b) => {
    const left = a.created_at ?? '';
    const right = b.created_at ?? '';
    return left.localeCompare(right);
  });
}

interface ProjectProviderProps {
  children: ReactNode;
  initialProjectId?: string | null;
}

export const ProjectProvider = ({ children, initialProjectId = null }: ProjectProviderProps) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<ProjectSetupTab>('concept');
  const [isCreating, setIsCreating] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false); // New state
  const [previousOption, setPreviousOption] = useState<'ai' | 'manual'>('ai');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<ProjectData>(DEFAULT_PROJECT_DATA);
  const [generationCompletedSignal, setGenerationCompletedSignal] = useState(0);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [isLoadingCharacters, setIsLoadingCharacters] = useState(false);
  const charactersRef = useRef<Character[]>([]);
  const characterStatusRef = useRef<Record<string, Character['image_status'] | undefined>>({});
  const hydratedProjectIdRef = useRef<string | null>(null);

  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);
  
  // Track option changes for smooth transitions
  useEffect(() => {
    if (previousOption !== projectData.conceptOption) {
      setPreviousOption(projectData.conceptOption);
      
      // If switching from AI to manual and currently on storyline tab, move to settings
      if (previousOption === 'ai' && projectData.conceptOption === 'manual' && activeTab === 'storyline') {
        setActiveTab('settings');
      }
    }
  }, [projectData.conceptOption, activeTab, previousOption]);
  
  const updateProjectData = (data: Partial<ProjectData>) => {
    setProjectData(prev => ({ ...prev, ...data }));
  };

  const replaceCharacters = useCallback((nextCharacters: Character[]) => {
    const sortedCharacters = sortCharactersByCreation(nextCharacters);
    characterStatusRef.current = Object.fromEntries(
      sortedCharacters.map((character) => [character.id, character.image_status])
    );
    setCharacters(sortedCharacters);
  }, []);

  useEffect(() => {
    const normalizedProjectId = initialProjectId?.trim() || null;

    if (!normalizedProjectId) {
      if (hydratedProjectIdRef.current) {
        hydratedProjectIdRef.current = null;
        setProjectId(null);
        setProjectData(DEFAULT_PROJECT_DATA);
        setPreviousOption(DEFAULT_PROJECT_DATA.conceptOption);
        setActiveTab('concept');
        replaceCharacters([]);
      }
      return;
    }

    if (hydratedProjectIdRef.current === normalizedProjectId) {
      return;
    }

    let isCancelled = false;
    hydratedProjectIdRef.current = normalizedProjectId;
    setProjectId(normalizedProjectId);

    const hydrateProject = async () => {
      try {
        const [projectResult, settingsResult] = await Promise.all([
          supabase.from('projects').select('*').eq('id', normalizedProjectId).maybeSingle(),
          supabase.from('project_settings').select('*').eq('project_id', normalizedProjectId).maybeSingle(),
        ]);

        if (projectResult.error) throw projectResult.error;
        if (settingsResult.error) throw settingsResult.error;
        if (!projectResult.data) throw new Error('Project not found');
        if (isCancelled) return;

        const hydratedProjectData = hydrateProjectSetupData(
          DEFAULT_PROJECT_DATA,
          projectResult.data,
          settingsResult.data
        );
        setProjectData(hydratedProjectData);
        setPreviousOption(hydratedProjectData.conceptOption);
      } catch (error) {
        if (isCancelled) return;
        console.error('Failed to hydrate project setup:', error);
        hydratedProjectIdRef.current = null;
        setProjectId(null);
        setProjectData(DEFAULT_PROJECT_DATA);
        replaceCharacters([]);
        toast.error('Failed to load project setup');
      }
    };

    void hydrateProject();

    return () => {
      isCancelled = true;
    };
  }, [initialProjectId, replaceCharacters]);

  const upsertCharacter = useCallback((character: Character) => {
    setCharacters((prev) => {
      const exists = prev.some((item) => item.id === character.id);
      const nextCharacters = exists
        ? prev.map((item) => (item.id === character.id ? { ...item, ...character } : item))
        : [...prev, character];

      characterStatusRef.current[character.id] = character.image_status;
      return sortCharactersByCreation(nextCharacters);
    });
  }, []);

  const removeCharacterFromState = useCallback((characterId: string) => {
    setCharacters((prev) => prev.filter((character) => character.id !== characterId));
    delete characterStatusRef.current[characterId];
  }, []);

  const updateCharacterState = useCallback((characterId: string, updates: Partial<Character>) => {
    setCharacters((prev) =>
      prev.map((character) =>
        character.id === characterId ? { ...character, ...updates } : character
      )
    );
    if ('image_status' in updates) {
      characterStatusRef.current[characterId] = updates.image_status;
    }
  }, []);

  const notifyCharacterStatusChange = useCallback((character: Character) => {
    const previousStatus = characterStatusRef.current[character.id];
    const nextStatus = character.image_status;

    if (!nextStatus || previousStatus === nextStatus) {
      return;
    }

    if (nextStatus === 'generating') {
      toast.info(`Generating image for ${character.name}...`);
    } else if (nextStatus === 'completed' && character.image_url) {
      toast.success(`Image generated for ${character.name}`);
    } else if (nextStatus === 'failed') {
      toast.error(`Failed to generate image for ${character.name}`, {
        description: character.image_generation_error || 'Unknown error',
      });
    }
  }, []);

  const markStaleCharacterGenerationsFailed = useCallback(async (currentProjectId: string) => {
    const { error } = await supabase
      .from('characters')
      .update({
        image_status: 'failed',
        image_generation_error: CHARACTER_GENERATION_TIMEOUT_MESSAGE,
      })
      .eq('project_id', currentProjectId)
      .eq('image_status', 'generating')
      .lt('updated_at', getStaleCharacterGenerationCutoff());

    if (error) {
      console.error('Failed to mark stale character image generations as failed:', error);
    }
  }, []);

  const refreshCharacters = useCallback(async () => {
    if (!projectId) {
      replaceCharacters([]);
      setIsLoadingCharacters(false);
      return;
    }

    setIsLoadingCharacters(true);
    try {
      console.log(`Fetching characters for project: ${projectId}`);
      await markStaleCharacterGenerationsFailed(projectId);
      const nextCharacters = await supabaseService.characters.listByProject(projectId);
      console.log(`Found ${nextCharacters?.length || 0} characters for project`);
      replaceCharacters((nextCharacters || []) as Character[]);
    } catch (error) {
      console.error("Error fetching characters:", error);
      toast.error("Failed to load characters");
      replaceCharacters([]);
    } finally {
      setIsLoadingCharacters(false);
    }
  }, [markStaleCharacterGenerationsFailed, projectId, replaceCharacters]);

  useEffect(() => {
    refreshCharacters();
  }, [refreshCharacters, generationCompletedSignal]);

  useEffect(() => {
    if (!projectId) return;

    console.log(`Setting up project character realtime subscription for project: ${projectId}`);
    const channel = supabase
      .channel(`project-context-characters-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'characters',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const eventType = payload.eventType;

          if (eventType === 'DELETE') {
            const deletedId = (payload.old as Partial<Character>)?.id;
            if (deletedId) removeCharacterFromState(deletedId);
            return;
          }

          const nextCharacter = payload.new as Character;
          notifyCharacterStatusChange(nextCharacter);
          upsertCharacter(nextCharacter);
        }
      )
      .subscribe();

    return () => {
      console.log(`Cleaning up project character realtime subscription for project: ${projectId}`);
      supabase.removeChannel(channel);
    };
  }, [notifyCharacterStatusChange, projectId, removeCharacterFromState, upsertCharacter]);

  const addCharacter = useCallback(async (name?: string, description?: string): Promise<Character | null> => {
    if (!projectId) {
      toast.error("Please save the project first");
      return null;
    }

    try {
      const nextName = name?.trim() || `Character ${charactersRef.current.length + 1}`;
      const nextDescription = description?.trim() || "A new character.";
      const characterId = await supabaseService.characters.create({
        project_id: projectId,
        name: nextName,
        description: nextDescription,
        image_status: 'pending',
      });

      const newCharacter: Character = {
        id: characterId,
        project_id: projectId,
        name: nextName,
        description: nextDescription,
        image_url: null,
        image_status: 'pending',
        image_generation_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      upsertCharacter(newCharacter);
      toast.success(`Added ${nextName}`);
      return newCharacter;
    } catch (error) {
      const message = getErrorMessage(error);
      console.error("Error adding character:", error);
      toast.error(message || "Failed to add character");
      return null;
    }
  }, [projectId, upsertCharacter]);

  const deleteCharacter = useCallback(async (characterId: string): Promise<boolean> => {
    try {
      await supabaseService.characters.delete(characterId);
      removeCharacterFromState(characterId);
      toast.success("Character deleted");
      return true;
    } catch (error) {
      console.error("Error deleting character:", error);
      toast.error("Failed to delete character");
      return false;
    }
  }, [removeCharacterFromState]);

  const failCharacterImageGeneration = useCallback(async (characterId: string, message: string) => {
    updateCharacterState(characterId, {
      image_status: 'failed',
      image_generation_error: message,
    });

    await supabaseService.characters.update(characterId, {
      image_status: 'failed',
      image_generation_error: message,
    });
  }, [updateCharacterState]);

  const generateCharacterImage = useCallback(async (
    characterId: string,
    styleReferenceUrl?: string
  ): Promise<boolean> => {
    const character = charactersRef.current.find((item) => item.id === characterId);
    const resolvedStyleReferenceUrl = styleReferenceUrl || resolveProjectStyleReferenceUrl(projectData);

    updateCharacterState(characterId, {
      image_status: 'generating',
      image_generation_error: null,
    });

    try {
      const { data, error } = await supabase.functions.invoke('generate-character-image', {
        body: {
          character_id: characterId,
          style_reference_url: resolvedStyleReferenceUrl,
          style_prompt_fragment: getStylePromptFragment(projectData.videoStyle),
        },
      });

      if (error) throw error;

      if (data?.job === 'queued') {
        toast.success(character?.name ? `Image generation queued for ${character.name}` : 'Character image generation queued');
        return true;
      }

      if (data?.success && data.image_url) {
        updateCharacterState(characterId, {
          image_url: data.image_url,
          image_status: 'completed',
          image_generation_error: null,
        });
      }

      toast.success(character?.name ? `Image generated for ${character.name}` : 'Character image generated');
      return true;
    } catch (error) {
      const message = getErrorMessage(error);
      console.error('Generate character image error:', error);
      await failCharacterImageGeneration(characterId, message);
      toast.error(message || 'Failed to generate image');
      return false;
    }
  }, [failCharacterImageGeneration, projectData, updateCharacterState]);

  const saveProjectSettings = async (currentProjectId: string): Promise<void> => {
    const storylineSettings =
      projectData.storylineTextSettings && typeof projectData.storylineTextSettings === 'object'
        ? projectData.storylineTextSettings
        : {};

    const { error } = await (supabase
      .from('project_settings' as any)
      .upsert(
        {
          project_id: currentProjectId,
          storyline_text_model: projectData.storylineTextModel || 'gmi/gemini-3.1-flash-lite',
          storyline_text_settings: storylineSettings,
          base_image_model: projectData.baseImageModel || 'gmi/seedream-5.0-lite',
          base_video_model: projectData.baseVideoModel || 'gmi/ltx-fast-i2v',
          base_audio_model: projectData.baseAudioModel || 'fal-ai/elevenlabs/tts/turbo-v2.5',
          evaluation_mode: projectData.evaluationMode || 'shadow',
          evaluation_thresholds: projectData.evaluationThresholds || DEFAULT_EVALUATION_THRESHOLDS,
          canon_facts: projectData.canonFacts || [],
          creative_constraints: projectData.creativeConstraints || [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'project_id' }
      ) as any);

    if (error) {
      throw error;
    }
  };

  // Save project data to Supabase
  const saveProjectData = async (overrides?: Partial<ProjectData>): Promise<string | null> => {
    if (!user) {
      toast.error("Please log in to create a project");
      return null;
    }

    // Merge overrides so voice-bridge can pass eager state that hasn't flushed to React yet
    const merged = overrides ? { ...projectData, ...overrides } : projectData;

    let currentProjectId = projectId;
    try {
      console.log('Saving project data:', merged);
      
      const projectPayload = {
        user_id: user.id,
        title: merged.title || 'Untitled Project',
        concept_text: merged.concept,
        concept_option: merged.conceptOption,
        format: merged.format,
        custom_format_description: merged.customFormat,
        genre: merged.genre,
        tone: merged.tone,
        add_voiceover: merged.addVoiceover,
        special_requests: merged.specialRequests,
        product_name: merged.product,
        target_audience: merged.targetAudience,
        main_message: merged.mainMessage,
        call_to_action: merged.callToAction,
        ad_brief_data: merged.adBrief,
        music_video_data: merged.musicVideoData,
        infotainment_data: merged.infotainmentData,
        short_film_data: merged.shortFilmData,
        voiceover_id: merged.voiceoverId,
        voiceover_name: merged.voiceoverName,
        voiceover_preview_url: merged.voiceoverPreviewUrl,
        style_reference_asset_id: merged.styleReferenceAssetId,
        // Add settings fields
        aspect_ratio: merged.aspectRatio,
        video_style: merged.videoStyle,
        cinematic_inspiration: merged.cinematicInspiration,
        // Custom format meta prompts (only persisted when format === 'custom')
        custom_meta_prompts: merged.format === 'custom' ? (merged.customMetaPrompts ?? null) : null,
      };
      
      console.log('Project payload:', projectPayload);

      // If project already exists, update it
      if (currentProjectId) {
        console.log(`Updating existing project ID: ${currentProjectId}`);
        await supabaseService.projects.update(currentProjectId, projectPayload);
        await saveProjectSettings(currentProjectId);
        
        toast.info("Project data saved");
        return currentProjectId;
      } else {
        // Create new project
        console.log('Creating new project...');
        const newProjectId = await supabaseService.projects.create(projectPayload);
        
	        console.log(`New project created with ID: ${newProjectId}`);
	        setProjectId(newProjectId);
	        currentProjectId = newProjectId;
	        window.history.replaceState({}, '', appRoutes.projects.setup(newProjectId));
	        await saveProjectSettings(newProjectId);
        toast.success("Project created successfully");
        return newProjectId;
      }
    } catch (error: any) {
      console.error('Error saving project:', error);
      toast.error(`Failed to save project: ${error.message}`);
      return null;
    }
  };

  // Non-blocking storyline generation with streaming
  const generateStoryline = async (currentProjectId: string, overrides?: Partial<ProjectData>): Promise<boolean> => {
    if (!user) {
      toast.error("Please log in to generate storylines");
      return false;
    }
    
    if (!currentProjectId) {
      toast.error("Cannot generate storyline without a project ID");
      return false;
    }

    try {
      setIsGenerating(true);
      console.log(`Invoking generate-storylines for project: ${currentProjectId}`);
      
      // Build structured concept payload, merging overrides so voice-bridge eager state is used
      const merged = overrides ? { ...projectData, ...overrides } : projectData;
      const conceptPayload = buildConceptPayload(merged);

      // Non-blocking call - edge function returns immediately
      const { data, error } = await supabase.functions.invoke('generate-storylines', {
        body: { project_id: currentProjectId, concept_payload: conceptPayload }
      });
      
      if (error) {
        const insufficient = await extractInsufficientCreditsError(error);
        if (insufficient) {
          routeToBillingTopUp(insufficient);
          toast.error(
            `Insufficient credits. Required ${Math.ceil(insufficient.required)} / available ${Math.ceil(
              insufficient.available
            )}.`
          );
          return false;
        }
        console.error('Error invoking generate-storylines function:', error);
        toast.error(`Storyline generation failed: ${error.message}`);
        return false;
      }
      
      const responseInsufficient = await extractInsufficientCreditsError(data);
      if (responseInsufficient) {
        routeToBillingTopUp(responseInsufficient);
        toast.error(
          `Insufficient credits. Required ${Math.ceil(responseInsufficient.required)} / available ${Math.ceil(
            responseInsufficient.available
          )}.`
        );
        return false;
      }

      console.log('Storyline generation started:', data);
      
      // Immediate success - generation happening in background
      toast.success('Storyline generation started! Watch it appear in real-time.', {
        duration: 5000
      });
      
      return true; // Allow navigation immediately
      
    } catch (error: any) {
      console.error('Error in generateStoryline:', error);
      toast.error(`Storyline generation failed: ${error.message}`);
      return false;
    } finally {
      setIsGenerating(false); // Release immediately
    }
  };

  // Function to get visible tabs based on the conceptOption
  const getVisibleTabs = (): ProjectSetupTab[] => {
    if (projectData.conceptOption === 'manual') {
      // Skip storyline tab for manual mode
      return ['concept', 'settings', 'breakdown'];
    } else {
      // Show all tabs for AI mode
      return ['concept', 'storyline', 'settings', 'breakdown'];
    }
  };

  const handleCreateProject = async () => {
    if (!user) {
      toast.error("Please log in to create a project");
      return;
    }

    try {
      setIsCreating(true);
      
      // Save final project data if needed
      const savedProjectId = await saveProjectData();
      if (!savedProjectId) {
        throw new Error("Failed to save project data before completing setup");
      }
      
      toast.success("Project setup complete!");
      
      // Navigation happens in the NavigationFooter component
    } catch (error: any) {
      console.error('Error completing project setup:', error);
      toast.error(`Failed to complete project setup: ${error.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  // New function to finalize project setup
  const finalizeProjectSetup = async (): Promise<boolean> => {
    if (!user) {
      toast.error("Please log in to create a project");
      return false;
    }

    if (!projectId) {
      toast.error("Project ID not found. Please save the project first.");
      return false;
    }

    setIsFinalizing(true);
    toast.info("Preparing your timeline, please wait...", { duration: 10000 }); // Longer duration

    try {
      // Ensure latest data is saved before finalizing
      const finalSaveId = await saveProjectData();
      
      if (!finalSaveId) {
        throw new Error("Failed to save final project settings.");
      }

      await upsertProjectCharacterBlueprints(projectId);

      console.log(`Invoking finalize-project-setup for project: ${projectId}`);
      
      // Build structured JSON payload with ALL prior step data using the shared conceptPayloadService
      const conceptPayload = buildConceptPayload(projectData);
      const styleReferenceUrl = resolveProjectStyleReferenceUrl(projectData);
      const structuredPayload = {
        project_id: projectId,
        concept: conceptPayload,
        storyline: {
          model: projectData.storylineTextModel || 'gmi/gemini-3.1-flash-lite',
          settings: projectData.storylineTextSettings || {},
        },
        settings: {
          aspectRatio: projectData.aspectRatio || '16:9',
          videoStyle: projectData.videoStyle || 'cinematic',
          cinematicInspiration: projectData.cinematicInspiration || null,
          baseImageModel: projectData.baseImageModel || 'gmi/seedream-5.0-lite',
          baseVideoModel: projectData.baseVideoModel || 'gmi/ltx-fast-i2v',
          styleReferenceAssetId: projectData.styleReferenceAssetId || null,
          styleReferenceUrl: styleReferenceUrl || null,
          stylePromptFragment: getStylePromptFragment(projectData.videoStyle),
          evaluationMode: projectData.evaluationMode || 'shadow',
          evaluationThresholds: projectData.evaluationThresholds || DEFAULT_EVALUATION_THRESHOLDS,
          canonFacts: projectData.canonFacts || [],
          creativeConstraints: projectData.creativeConstraints || [],
        },
        cast: {
          addVoiceover: projectData.addVoiceover,
          voiceoverId: projectData.voiceoverId || null,
          voiceoverName: projectData.voiceoverName || null,
        },
      };

      const { data, error } = await supabase.functions.invoke('finalize-project-setup', {
        body: structuredPayload
      });

      if (error) {
        console.error('Error invoking finalize-project-setup:', error);
        throw new Error(error.message || "Failed to start timeline preparation.");
      }

      console.log('Finalize project setup response:', data);
      toast.success(data.message || "Timeline preparation started!");
      return true; // Indicate invocation success
    } catch (error: any) {
      console.error('Error finalizing project setup:', error);
      toast.error(`Timeline preparation failed: ${error.message}`);
      return false;
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <ProjectContext.Provider value={{
      projectData,
      updateProjectData,
      activeTab,
      setActiveTab,
      saveProjectData,
      projectId,
      getVisibleTabs,
      previousOption,
      isCreating,
      setIsCreating,
      isGenerating,
      setIsGenerating,
      isFinalizing,
      generateStoryline,
      handleCreateProject,
      finalizeProjectSetup,
      generationCompletedSignal,
      characters,
      isLoadingCharacters,
      refreshCharacters,
      addCharacter,
      deleteCharacter,
      generateCharacterImage,
      failCharacterImageGeneration,
    }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProjectContext = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
};

export default ProjectProvider;
