
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { corsHeaders, errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import {
  getShotIdeasSystemPrompt,
  getShotIdeasUserPrompt,
  getVisualPromptSystemPrompt,
  getVisualPromptUserPrompt,
  getDialogueSystemPrompt,
  getDialogueUserPrompt,
  getSoundEffectsSystemPrompt,
  getSoundEffectsUserPrompt
} from '../_shared/prompts.ts';

interface ConceptPayload {
  option: 'ai' | 'manual';
  text: string;
  format: string;
  customFormat?: string | null;
  genre?: string | null;
  tone?: string | null;
  specialRequests?: string | null;
  adBrief?: Record<string, unknown> | null;
  musicVideoData?: Record<string, unknown> | null;
  infotainmentData?: Record<string, unknown> | null;
  shortFilmData?: Record<string, unknown> | null;
}

interface StorylinePayload {
  model: string;
  settings: Record<string, unknown>;
}

interface SettingsPayload {
  aspectRatio: string;
  videoStyle: string;
  cinematicInspiration?: string | null;
  baseImageModel: string;
  baseVideoModel: string;
  styleReferenceAssetId?: string | null;
  styleReferenceUrl?: string | null;
  stylePromptFragment?: string | null;
}

interface CastPayload {
  addVoiceover: boolean;
  voiceoverId?: string | null;
  voiceoverName?: string | null;
}

interface RequestBody {
  project_id: string;
  concept?: ConceptPayload;
  storyline?: StorylinePayload;
  settings?: SettingsPayload;
  cast?: CastPayload;
  breakdown?: Record<string, unknown>;
}

const DEFAULT_STORYLINE_MODEL = 'llama-3.3-70b-versatile';
const ALLOWED_STORYLINE_MODELS = new Set([
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
]);

function resolveStorylineModel(modelId: unknown): string {
  if (typeof modelId === 'string' && ALLOWED_STORYLINE_MODELS.has(modelId)) {
    return modelId;
  }
  return DEFAULT_STORYLINE_MODEL;
}

// Helper function to introduce delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function appendStylePrompt(prompt: string, stylePromptFragment?: string | null): string {
  const stylePrompt = normalizeOptionalString(stylePromptFragment);
  if (!stylePrompt) return prompt;
  return `${prompt}\n\nStyle direction: ${stylePrompt}`;
}

// Helper function to call Groq API
async function callGroqAI(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
  model: string = DEFAULT_STORYLINE_MODEL
): Promise<string> {
  const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
  if (!GROQ_API_KEY) {
    throw new Error('GROQ_API_KEY not configured');
  }
  
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens
    }),
  });
  
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    const errorText = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Process a single shot: generate all content and trigger image generation
async function processSingleShot(
  shot: any,
  scene: any,
  projectData: any,
  styleReferenceUrl: string | null,
  baseImageModel: string | null,
  storylineTextModel: string,
  supabaseClient: any
) {
  try {
    console.log(`[Shot ${shot.id}] Starting content generation...`);
    
    // Generate all content using Groq AI
    let visualPrompt = '';
    let dialogue = '';
    let soundEffects = '';
    
    try {
      [visualPrompt, dialogue, soundEffects] = await Promise.all([
        // Visual Prompt using Groq AI
        callGroqAI(
          getVisualPromptSystemPrompt(),
          getVisualPromptUserPrompt(shot.prompt_idea || '', shot.shot_type || 'medium', scene, projectData),
          300,
          storylineTextModel
        ),
        // Dialogue using Groq AI
        callGroqAI(
          getDialogueSystemPrompt(),
          getDialogueUserPrompt(shot.prompt_idea, shot.shot_type, scene, projectData),
          150,
          storylineTextModel
        ),
        // Sound Effects using Groq AI
        callGroqAI(
          getSoundEffectsSystemPrompt(),
          getSoundEffectsUserPrompt(shot.prompt_idea, shot.shot_type, scene),
          100,
          storylineTextModel
        )
      ]);
    } catch (aiError: any) {
      console.warn(`[Shot ${shot.id}] AI generation failed, using fallback:`, aiError.message);
      // Fallback: Create basic prompts from available data
      const sceneDesc = scene.description || scene.title || '';
      const shotDesc = shot.prompt_idea || sceneDesc;
      visualPrompt = `${shot.shot_type || 'Medium'} shot: ${shotDesc.substring(0, 150)}, professional cinematography, dramatic lighting, cinematic composition`;
      dialogue = '';
      soundEffects = `Ambient sound appropriate for ${scene.location || 'the scene'}`;
    }
    
    // Clean up responses
    const cleanedVisualPrompt = visualPrompt.trim().replace(/^"|"$/g, '');
    const styledVisualPrompt = appendStylePrompt(
      cleanedVisualPrompt,
      projectData?._settings?.stylePromptFragment
    );
    const cleanedDialogue = dialogue.trim().replace(/^"|"$/g, '');
    const cleanedSoundEffects = soundEffects.trim().replace(/^"|"$/g, '');
    
    console.log(`[Shot ${shot.id}] Generated content - Visual: ${styledVisualPrompt.substring(0, 50)}..., Dialogue: ${cleanedDialogue.substring(0, 30)}..., SFX: ${cleanedSoundEffects.substring(0, 30)}...`);
    
    // Update shot with ALL generated content
    const { error: updateErr } = await supabaseClient
      .from('shots')
      .update({ 
        visual_prompt: styledVisualPrompt,
        dialogue: cleanedDialogue,
        sound_effects: cleanedSoundEffects,
        image_status: 'prompt_ready',
        image_generation_error: null
      })
      .eq('id', shot.id);
    
    if (updateErr) {
      console.error(`[Shot ${shot.id}] Failed to update:`, updateErr);
      throw updateErr;
    }
    
    console.log(`[Shot ${shot.id}] All content saved to DB. Triggering image generation.`);
    
    // Trigger image generation asynchronously (no await - fire and forget)
    supabaseClient.functions.invoke('generate-shot-image', {
      body: {
        shot_id: shot.id,
        style_reference_url: styleReferenceUrl,
        image_model: baseImageModel || undefined,
      }
    }).catch((invokeError: any) => {
      console.error(`[Shot ${shot.id}] Error invoking generate-shot-image:`, invokeError);
    });
    
    // No delay needed - parallel processing handles rate limiting via batches
    
  } catch (error: any) {
    console.error(`[Shot ${shot.id}] Error: ${error.message}`);
    // Mark as failed
    await supabaseClient.from('shots')
      .update({ 
        image_status: 'failed', 
        image_generation_error: error.message,
        failure_reason: error.message 
      })
      .eq('id', shot.id);
  }
}

// Process a single scene: generate shot ideas and process each shot
async function processSingleScene(
  scene: any,
  projectData: any,
  project_id: string,
  styleReferenceUrl: string | null,
  baseImageModel: string | null,
  storylineTextModel: string,
  supabaseClient: any
) {
  try {
    console.log(`[Scene ${scene.scene_number}] Generating shot ideas...`);
    
    let shotIdeasContent = '';
    try {
      shotIdeasContent = await callGroqAI(
        getShotIdeasSystemPrompt(),
        getShotIdeasUserPrompt(scene),
        150,
        storylineTextModel
      );
    } catch (aiError: any) {
      console.warn(`[Scene ${scene.scene_number}] AI shot generation failed, using fallback:`, aiError.message);
    }
    
    let shotIdeas: string[] = [];
    try {
      if (shotIdeasContent) {
        shotIdeas = JSON.parse(shotIdeasContent);
        if (!Array.isArray(shotIdeas)) throw new Error("Not an array");
        console.log(`[Scene ${scene.scene_number}] Got ${shotIdeas.length} shot ideas:`, shotIdeas);
      }
    } catch (parseError: any) {
      console.error(`[Scene ${scene.scene_number}] Failed to parse shot ideas: ${parseError.message}. Using default.`);
    }
    
    // Fallback: Create default shots with scene context
    if (shotIdeas.length === 0) {
      console.log(`[Scene ${scene.scene_number}] Using fallback shot structure (3 default shots)`);
      const sceneDesc = scene.description || '';
      const sceneTitle = scene.title || `Scene ${scene.scene_number}`;
      
      shotIdeas = [
        `Establishing wide shot: ${sceneTitle} - ${sceneDesc.substring(0, 80)}`,
        `Medium shot capturing the main action: ${sceneDesc.substring(0, 80)}`,
        `Close-up detail shot emphasizing key moment in ${sceneTitle}`
      ];
    }

    const shotsToInsert: any[] = [];

    // Prepare shot records - determine shot types
    for (let i = 0; i < shotIdeas.length; i++) {
      const idea = shotIdeas[i];
      const shotNumber = i + 1;

      // Determine shot type based on position and content
      let shotType = 'medium';
      if (i === 0) {
        shotType = 'wide'; // First shot is usually establishing
      } else if (idea.toLowerCase().includes('close') || idea.toLowerCase().includes('detail')) {
        shotType = 'close_up';
      } else if (idea.toLowerCase().includes('wide') || idea.toLowerCase().includes('establishing')) {
        shotType = 'wide';
      }
      
      console.log(`[Scene ${scene.scene_number} / Shot ${shotNumber}] Shot type: ${shotType}`);

      shotsToInsert.push({
        scene_id: scene.id,
        project_id: project_id,
        shot_number: shotNumber,
        shot_type: shotType,
        prompt_idea: idea,
        image_status: 'pending',
        image_generation_error: null,
      });
    }

    // Insert shots
    if (shotsToInsert.length > 0) {
      const { data: existingShots } = await supabaseClient
        .from('shots')
        .select('shot_number')
        .eq('scene_id', scene.id);

      const existingShotNumbers = new Set(existingShots?.map((s: any) => s.shot_number) || []);
      const newShotsToInsert = shotsToInsert.filter(shot => !existingShotNumbers.has(shot.shot_number));

      if (newShotsToInsert.length === 0) {
        console.log(`[Scene ${scene.scene_number}] All shots already exist, skipping.`);
        return 0;
      }

      const { data: insertedShots, error: insertErr } = await supabaseClient
        .from('shots')
        .insert(newShotsToInsert)
        .select('id, prompt_idea, shot_type');

      if (insertErr) {
        console.error(`[Scene ${scene.scene_number}] Error inserting shots:`, insertErr);
        return 0;
      }
      
      if (!insertedShots || insertedShots.length === 0) {
        console.warn(`[Scene ${scene.scene_number}] No new shots inserted.`);
        return 0;
      }

      console.log(`[Scene ${scene.scene_number}] Inserted ${insertedShots.length} shots. Processing in parallel batches...`);

      // Process ALL shots in parallel for maximum speed (no batching within scene)
      console.log(`[Scene ${scene.scene_number}] Processing all ${insertedShots.length} shots in parallel...`);
      
      await Promise.all(
        insertedShots.map((shot: any) =>
          processSingleShot(
            shot,
            scene,
            projectData,
            styleReferenceUrl,
            baseImageModel,
            storylineTextModel,
            supabaseClient
          )
        )
      );
      
      console.log(`[Scene ${scene.scene_number}] Finished processing all shots.`);
      
      return insertedShots.length;
    }
    return 0;
  } catch (sceneError: any) {
    console.error(`[Scene ${scene.scene_number}] Error processing scene: ${sceneError.message}`);
    return 0;
  }
}

async function getStyleReferenceUrl(
  supabaseClient: any,
  styleReferenceAssetId: string | null
): Promise<string | null> {
  if (!styleReferenceAssetId) return null;

  const { data: mediaItem, error: mediaError } = await supabaseClient
    .from('media_items')
    .select('url, storage_bucket, storage_path')
    .eq('id', styleReferenceAssetId)
    .single();

  if (mediaError || !mediaItem) return null;

  if (mediaItem.url) return mediaItem.url;

  if (mediaItem.storage_bucket && mediaItem.storage_path) {
    return `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/${mediaItem.storage_bucket}/${mediaItem.storage_path}`;
  }

  return null;
}

// Main processing function that runs in background
async function processProjectSetup(
  project_id: string,
  user_id: string,
  supabaseClient: any,
  clientPayload?: RequestBody
) {
  console.log(`[Background Processing ${project_id}] Starting...`);
  
  try {
    // Fetch project and scenes
    const { data: projectData, error: projectErr } = await supabaseClient
      .from('projects')
      .select('id, title, description, genre, tone, video_style, cinematic_inspiration, aspect_ratio, style_reference_asset_id')
      .eq('id', project_id)
      .eq('user_id', user_id)
      .single();

    if (projectErr || !projectData) {
      console.error(`[Background Processing ${project_id}] Project not found:`, projectErr?.message);
      return;
    }

    // Enrich projectData with structured payload from the client (concept, storyline, settings, cast)
    // This ensures prompts have access to all prior step data
    if (clientPayload) {
      if (clientPayload.concept) {
        projectData._concept = clientPayload.concept;
        // Merge format-specific data for richer prompts
        projectData.genre = clientPayload.concept.genre || projectData.genre;
        projectData.tone = clientPayload.concept.tone || projectData.tone;
      }
      if (clientPayload.settings) {
        projectData._settings = clientPayload.settings;
        projectData.video_style = clientPayload.settings.videoStyle || projectData.video_style;
        projectData.cinematic_inspiration = clientPayload.settings.cinematicInspiration || projectData.cinematic_inspiration;
        projectData.aspect_ratio = clientPayload.settings.aspectRatio || projectData.aspect_ratio;
      }
      if (clientPayload.cast) {
        projectData._cast = clientPayload.cast;
      }
      if (clientPayload.storyline) {
        projectData._storyline = clientPayload.storyline;
      }
      console.log(`[Background Processing ${project_id}] Enriched with structured payload: concept=${!!clientPayload.concept} storyline=${!!clientPayload.storyline} settings=${!!clientPayload.settings} cast=${!!clientPayload.cast}`);
    }

    const { data: projectSettings } = await supabaseClient
      .from('project_settings')
      .select('base_image_model, base_video_model, storyline_text_model')
      .eq('project_id', project_id)
      .maybeSingle();

    const baseImageModel = clientPayload?.settings?.baseImageModel || projectSettings?.base_image_model || null;
    const baseVideoModel = clientPayload?.settings?.baseVideoModel || projectSettings?.base_video_model || null;
    const storylineTextModel = resolveStorylineModel(
      clientPayload?.storyline?.model || projectSettings?.storyline_text_model
    );
    console.log(
      `[Background Processing ${project_id}] Using settings image=${baseImageModel || 'default'} video=${baseVideoModel || 'default'} storyline=${storylineTextModel}`
    );

    const styleReferenceAssetUrl = await getStyleReferenceUrl(
      supabaseClient,
      clientPayload?.settings?.styleReferenceAssetId || projectData.style_reference_asset_id || null
    );
    const styleReferenceUrl =
      styleReferenceAssetUrl ||
      normalizeOptionalString(clientPayload?.settings?.styleReferenceUrl);

    // Fetch characters (cast) from database for prompt enrichment
    const { data: charactersData } = await supabaseClient
      .from('characters')
      .select('id, name, description, image_url')
      .eq('project_id', project_id);

    if (charactersData && charactersData.length > 0) {
      projectData._characters = charactersData;
      console.log(`[Background Processing ${project_id}] Loaded ${charactersData.length} characters for enrichment`);
    }

    // Fetch selected storyline from database for prompt enrichment
    const { data: storylineData } = await supabaseClient
      .from('storylines')
      .select('id, title, description, full_story')
      .eq('project_id', project_id)
      .eq('is_selected', true)
      .maybeSingle();

    if (storylineData) {
      projectData._selectedStoryline = storylineData;
      console.log(`[Background Processing ${project_id}] Loaded selected storyline: ${storylineData.title}`);
    }

    const { data: scenesData, error: scenesErr } = await supabaseClient
      .from('scenes')
      .select('id, scene_number, title, description, location, lighting, weather')
      .eq('project_id', project_id)
      .order('scene_number');

    if (scenesErr || !scenesData || scenesData.length === 0) {
      console.log(`[Background Processing ${project_id}] No scenes found. Exiting.`);
      return;
    }

    console.log(`[Background Processing ${project_id}] Processing ${scenesData.length} scenes in PARALLEL...`);

    // Process ALL scenes in parallel batches of 4 (no Scene 1 priority blocking)
    const SCENE_BATCH_SIZE = 4;
    let totalShotsCreated = 0;
    
    for (let i = 0; i < scenesData.length; i += SCENE_BATCH_SIZE) {
      const batch = scenesData.slice(i, i + SCENE_BATCH_SIZE);
      console.log(`[Background Processing ${project_id}] Processing scene batch ${Math.floor(i / SCENE_BATCH_SIZE) + 1}: scenes ${batch.map((s: any) => s.scene_number).join(', ')}`);
      
      // Process all scenes in this batch simultaneously
      const results = await Promise.all(
        batch.map((scene: any) => processSingleScene(
            scene,
            projectData,
            project_id,
            styleReferenceUrl,
            baseImageModel,
            storylineTextModel,
            supabaseClient
        ))
      );
      
      totalShotsCreated += results.reduce((sum, count) => sum + count, 0);
      
      // Small delay between scene batches to avoid API overwhelm
      if (i + SCENE_BATCH_SIZE < scenesData.length) {
        await delay(200);
      }
    }

    console.log(`[Background Processing ${project_id}] Complete. Created ${totalShotsCreated} shots across all scenes.`);
    
  } catch (error: any) {
    console.error(`[Background Processing ${project_id}] Error:`, error.message);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();

  try {
    const user = await authenticateRequest(req.headers);
    const requestBody: RequestBody = await req.json();
    const { project_id } = requestBody;
    if (!project_id) return errorResponse('project_id is required', 400);

    console.log(`[Finalize Setup ${project_id}] Starting with structured payload...`);
    if (requestBody.concept) {
      console.log(`[Finalize Setup ${project_id}] Concept: format=${requestBody.concept.format}, genre=${requestBody.concept.genre}`);
    }
    if (requestBody.settings) {
      console.log(`[Finalize Setup ${project_id}] Settings: imageModel=${requestBody.settings.baseImageModel}, videoModel=${requestBody.settings.baseVideoModel}`);
    }
    if (requestBody.cast) {
      console.log(`[Finalize Setup ${project_id}] Cast: voiceover=${requestBody.cast.addVoiceover}, voiceId=${requestBody.cast.voiceoverId}`);
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 1. Fetch Project and Scene Data
    const { data: projectData, error: projectErr } = await supabaseClient
      .from('projects')
      .select('id, title, description, genre, tone, video_style, cinematic_inspiration, aspect_ratio')
      .eq('id', project_id)
      .eq('user_id', user.id)
      .single();

    if (projectErr || !projectData) {
      return errorResponse('Project not found or access denied', 404, projectErr?.message);
    }

    const { data: scenesData, error: scenesErr } = await supabaseClient
      .from('scenes')
      .select('id, scene_number, title, description, location, lighting, weather')
      .eq('project_id', project_id)
      .order('scene_number');

    if (scenesErr) return errorResponse('Failed to fetch scenes', 500, scenesErr.message);
    if (!scenesData || scenesData.length === 0) {
      console.log(`[Finalize Setup ${project_id}] No scenes found. Skipping shot generation.`);
      return successResponse({ message: 'Project setup finalized. No scenes to process.' });
    }

    console.log(`[Finalize Setup ${project_id}] Found ${scenesData.length} scenes. Starting background processing...`);

    // Start background processing immediately, passing structured payload
    if (typeof EdgeRuntime !== 'undefined') {
      EdgeRuntime.waitUntil(
        processProjectSetup(project_id, user.id, supabaseClient, requestBody)
      );
    } else {
      // Fallback for local development
      processProjectSetup(project_id, user.id, supabaseClient, requestBody).catch(err => {
        console.error('Background processing error:', err);
      });
    }

    // Return immediately to allow UI to navigate
    console.log(`[Finalize Setup ${project_id}] Background processing initiated. Returning response.`);
    
    return successResponse({
      message: `Storyboard preparation started for ${scenesData.length} scenes. Generation will continue in background.`,
      projectId: project_id,
      scenesProcessed: scenesData.length,
      status: 'processing'
    });

  } catch (error: unknown) {
    console.error('[Finalize Setup] Top-level error:', error);
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(message, 500);
  }
});
