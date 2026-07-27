
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { authenticateRequest, AuthError } from '../_shared/auth.ts';
import { errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import { executeGmiChatCompletion } from '../_shared/gmi-client.ts';
import { getCatalogModelById } from '../_shared/ai-model-catalog.ts';
import { 
  StorylineRequestBody, 
  StorylineResponseData, 
  AnalysisResponseData,
  StorylineGenerationResult
} from './types.ts';
import { 
  getStorylineSystemPrompt, 
  getStorylineUserPrompt, 
  getAnalysisSystemPrompt, 
  getAnalysisUserPrompt,
  getStoryNarrativeSystemPrompt,
  getStoryNarrativeUserPrompt,
  getQuickTitlePrompt
} from './prompts.ts';
import { 
  updateProjectSettings, 
  triggerCharacterImageGeneration,
  triggerShotVisualPromptGeneration 
} from './database.ts';
import {
  createNarrativeArtifacts,
  createPromptVersion,
  enqueueStoryboardEvaluation,
} from '../_shared/observability.ts';

const DEFAULT_STORYLINE_MODEL = 'gmi/gemini-3.1-flash-lite';
function isGmiModel(modelId: string): boolean {
  return modelId.startsWith('gmi/');
}

/**
 * Call GMI Cloud chat completions for storyline generation.
 * Returns parsed JSON content or raw text.
 */
async function callGmiForStoryline(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  options: { temperature?: number; maxTokens?: number; jsonMode?: boolean } = {}
): Promise<{ ok: boolean; parsed?: any; text?: string; error?: string }> {
  const catalogModel = await getCatalogModelById(modelId, { mediaType: 'text', enabledOnly: false });
  const resolvedModel = catalogModel?.provider === 'gmi-cloud'
    ? catalogModel.endpointId
    : modelId.replace(/^gmi\//, '');
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const result = await executeGmiChatCompletion(resolvedModel, messages, {
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 2000,
  });

  if (!result.success || !result.data) {
    return { ok: false, error: result.error || 'GMI call failed' };
  }

  const content = result.data.choices?.[0]?.message?.content || '';

  if (options.jsonMode) {
    try {
      const parsed = JSON.parse(content);
      return { ok: true, parsed, text: content };
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1].trim());
          return { ok: true, parsed, text: content };
        } catch { /* fall through */ }
      }
      return { ok: false, error: 'Failed to parse JSON from GMI response', text: content };
    }
  }

  return { ok: true, text: content };
}

const DEPRECATED_GROQ_MODELS = new Set(['llama-3.3-70b-versatile', 'llama-3.1-8b-instant']);

function resolveStorylineModel(modelId: unknown): { model: string; fallbackUsed: boolean; reason?: string } {
  if (typeof modelId !== 'string' || !modelId.trim()) {
    return { model: DEFAULT_STORYLINE_MODEL, fallbackUsed: false };
  }

  // Force-remap deprecated Groq models to GMI
  if (DEPRECATED_GROQ_MODELS.has(modelId)) {
    console.log(`Remapping deprecated Groq model "${modelId}" → "${DEFAULT_STORYLINE_MODEL}"`);
    return { model: DEFAULT_STORYLINE_MODEL, fallbackUsed: true, reason: 'groq_model_deprecated' };
  }

  return { model: modelId, fallbackUsed: false };
}

function parseStorylineSettings(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Process SSE stream from Groq and update database with streamed content
 */
async function processGroqStream(
  response: Response, 
  supabaseClient: any, 
  storylineId: string,
  updateInterval: number = 150
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');
  
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  let lastUpdateLength = 0;
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    buffer += decoder.decode(value, { stream: true });
    
    // Process complete SSE lines
    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      let line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      
      if (line.endsWith('\r')) line = line.slice(0, -1);
      if (!line.startsWith('data: ')) continue;
      
      const jsonStr = line.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      
      try {
        const parsed = JSON.parse(jsonStr);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) {
          fullText += content;
          
          // Update DB every ~150 characters for smooth streaming
          if (fullText.length - lastUpdateLength >= updateInterval) {
            await supabaseClient
              .from('storylines')
              .update({ full_story: fullText })
              .eq('id', storylineId);
            lastUpdateLength = fullText.length;
          }
        }
      } catch {
        // Incomplete JSON, will be handled in next iteration
      }
    }
  }
  
  // Final update with complete text
  if (fullText.length > lastUpdateLength) {
    await supabaseClient
      .from('storylines')
      .update({ full_story: fullText })
      .eq('id', storylineId);
  }
  
  return fullText;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCors();
  }
  
  try {
    // Authenticate the request
    const user = await authenticateRequest(req.headers);
    
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    
    // Parse request body
    const { project_id, generate_alternative = false, concept_payload }: StorylineRequestBody = await req.json();
    if (!project_id) {
      return errorResponse('Project ID is required', 400);
    }
    const customMetaPrompts = concept_payload?.metaPrompts;
    const musicAnnotation = concept_payload?.musicVideo
      ? {
          selectedStems: Array.isArray((concept_payload.musicVideo as any).selectedStems)
            ? (concept_payload.musicVideo as any).selectedStems
            : Array.isArray((concept_payload.musicVideo as any).stems)
              ? ((concept_payload.musicVideo as any).stems as Array<{ stem: string; url: string; selected?: boolean }>)
                  .filter((s) => s?.selected)
                  .map((s) => ({ stem: s.stem, url: s.url }))
              : undefined,
          annotatedLyrics: (concept_payload.musicVideo as any).annotatedLyrics,
          transcriptionModel: (concept_payload.musicVideo as any).transcriptionModel,
        }
      : undefined;
    console.log(`Received request for project ${project_id}. Generate alternative: ${generate_alternative}`);

    // Fetch project details
    const { data: project, error: projectError } = await supabaseClient
      .from('projects')
      .select('title, concept_text, genre, tone, format, custom_format_description, special_requests, product_name, target_audience, main_message, call_to_action, ad_brief_data, music_video_data, infotainment_data, short_film_data')
      .eq('id', project_id)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      console.error('Project error:', projectError?.message);
      return errorResponse('Project not found or access denied', 404, projectError?.message);
    }

    const { data: projectSettings } = await supabaseClient
      .from('project_settings')
      .select('storyline_text_model, storyline_text_settings')
      .eq('project_id', project_id)
      .maybeSingle();

    const resolvedStorylineModel = resolveStorylineModel(projectSettings?.storyline_text_model);
    if (resolvedStorylineModel.fallbackUsed) {
      console.warn(
        `[generate-storylines] Falling back to ${resolvedStorylineModel.model}: ${resolvedStorylineModel.reason}`
      );
    }
    const storylineTextSettings = parseStorylineSettings(projectSettings?.storyline_text_settings);
    const storylineTemperature = asNumber(storylineTextSettings.temperature, generate_alternative ? 0.9 : 0.7);
    const storylineMaxTokens = Math.max(
      512,
      Math.min(4096, Math.round(asNumber(storylineTextSettings.maxTokens ?? storylineTextSettings.max_tokens, 2048)))
    );
    console.log(
      `[generate-storylines] Using model=${resolvedStorylineModel.model}, temperature=${storylineTemperature}, maxTokens=${storylineMaxTokens}`
    );

    // Fetch existing storylines if generating an alternative
    let existingStorylines: any[] = [];
    if (generate_alternative) {
      const { data: storylines, error: storylinesError } = await supabaseClient
        .from('storylines')
        .select('title, description')
        .eq('project_id', project_id)
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (!storylinesError && storylines) {
        existingStorylines = storylines;
        console.log(`Found ${existingStorylines.length} existing storylines to avoid duplicating`);
      }
    }

    // Start background processing with EdgeRuntime.waitUntil()
    const backgroundProcessing = (async () => {
      let storyline_id: string | null = null;
      
      try {
        // ========== PHASE 1: INSTANT SKELETON ==========
        // Generate quick title/description for immediate user feedback
        console.log('Phase 1: Generating quick title for instant skeleton...');
        const quickTitlePrompt = getQuickTitlePrompt(project);
        const quickTitlePromptId = await createPromptVersion(supabaseClient, {
          projectId: project_id,
          stage: 'storyline_title',
          authorType: 'system',
          text: quickTitlePrompt,
          sourceEntityType: 'project',
          sourceEntityId: project_id,
          metadata: {
            model: resolvedStorylineModel.model,
            temperature: storylineTemperature,
          },
        });
        
        let quickTitle = project.title || 'Untitled Story';
        let quickDescription = project.concept_text || 'A creative narrative';

        if (isGmiModel(resolvedStorylineModel.model)) {
          // GMI Cloud path
          const gmiResult = await callGmiForStoryline(
            'You are a creative writer. Return valid JSON only with keys "title" and "description".',
            quickTitlePrompt,
            resolvedStorylineModel.model,
            { temperature: storylineTemperature, maxTokens: 200, jsonMode: true }
          );
          if (gmiResult.ok && gmiResult.parsed) {
            if (gmiResult.parsed.title) quickTitle = gmiResult.parsed.title;
            if (gmiResult.parsed.description) quickDescription = gmiResult.parsed.description;
          }
        } else {
          // Groq path (legacy)
          const quickTitleResponse = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/gemini-storyline-generation`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemPrompt: 'You are a creative writer. Return valid JSON only.',
                prompt: quickTitlePrompt,
                model: resolvedStorylineModel.model,
                temperature: storylineTemperature
              }),
            }
          );
          if (quickTitleResponse.ok) {
            try {
              const quickData = await quickTitleResponse.json();
              if (quickData.parsed?.title) quickTitle = quickData.parsed.title;
              if (quickData.parsed?.description) quickDescription = quickData.parsed.description;
            } catch { /* ignore */ }
          }
        }

        // Create storyline skeleton IMMEDIATELY (user sees this in <1 second)
        const { data: storylineRecord, error: storylineError } = await supabaseClient
          .from('storylines')
          .insert({
            project_id,
            title: quickTitle,
            description: quickDescription,
            full_story: '', // Will be streamed
            status: 'generating',
            is_selected: !generate_alternative
          })
          .select()
          .single();
        
        if (storylineError) throw storylineError;
        storyline_id = storylineRecord.id;
        console.log(`Created instant skeleton with ID: ${storyline_id}`);

        // ========== PHASE 2: TRUE STREAMING ==========
        // Stream the full story narrative token-by-token
        console.log('Phase 2: Starting true Groq streaming for story narrative...');
        const narrativePrompt = getStoryNarrativeUserPrompt(project);
        const narrativePromptId = await createPromptVersion(supabaseClient, {
          projectId: project_id,
          stage: 'storyline_narrative',
          authorType: 'system',
          text: narrativePrompt,
          sourceEntityType: 'storyline',
          sourceEntityId: storyline_id,
          parentPromptId: quickTitlePromptId,
          metadata: {
            model: resolvedStorylineModel.model,
            temperature: storylineTemperature,
            maxTokens: storylineMaxTokens,
          },
        });
        
        let fullStoryText = '';

        if (isGmiModel(resolvedStorylineModel.model)) {
          // GMI Cloud path — no streaming, get full text
          console.log('Phase 2: Using GMI Cloud for narrative...');
          const gmiNarrative = await callGmiForStoryline(
            getStoryNarrativeSystemPrompt(),
            narrativePrompt,
            resolvedStorylineModel.model,
            { temperature: storylineTemperature, maxTokens: storylineMaxTokens }
          );
          if (!gmiNarrative.ok) {
            throw new Error(`GMI narrative generation failed: ${gmiNarrative.error}`);
          }
          fullStoryText = gmiNarrative.text || '';
          // Update DB with full text
          await supabaseClient
            .from('storylines')
            .update({ full_story: fullStoryText })
            .eq('id', storyline_id);
          console.log(`Completed GMI narrative: ${fullStoryText.length} characters`);
        } else {
          // Groq streaming path (legacy)
          const streamResponse = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/groq-stream`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemPrompt: getStoryNarrativeSystemPrompt(),
                prompt: narrativePrompt,
                model: resolvedStorylineModel.model,
                temperature: storylineTemperature,
                maxTokens: storylineMaxTokens
              }),
            }
          );

          if (!streamResponse.ok || !storyline_id) {
            const errorText = await streamResponse.text();
            console.error('Stream error:', errorText);
            if (!storyline_id) {
              throw new Error('Failed to create storyline record');
            }
            if (streamResponse.status === 429) {
              throw new Error('429: Rate limited. Please wait a moment and try again.');
            }
            throw new Error(`Streaming failed: ${streamResponse.statusText}`);
          }

          fullStoryText = await processGroqStream(streamResponse, supabaseClient, storyline_id);
          console.log(`Completed streaming story: ${fullStoryText.length} characters`);
        }

        // ========== PHASE 3: STRUCTURED DATA ==========
        // Generate scenes with JSON mode (existing logic)
        console.log('Phase 3: Generating structured scene data...');
        const useCustomMeta = (project.format === 'custom') ? customMetaPrompts : undefined;
        const storylineSystemPrompt = getStorylineSystemPrompt(generate_alternative, useCustomMeta);
        const storylineUserPrompt = getStorylineUserPrompt(project, generate_alternative, existingStorylines, useCustomMeta, musicAnnotation);
        const structurePromptId = await createPromptVersion(supabaseClient, {
          projectId: project_id,
          stage: 'storyline_structure',
          authorType: 'system',
          text: storylineUserPrompt,
          sourceEntityType: 'storyline',
          sourceEntityId: storyline_id,
          parentPromptId: narrativePromptId,
          metadata: {
            model: resolvedStorylineModel.model,
            temperature: storylineTemperature,
            generate_alternative,
          },
        });
        
        const { STORYLINE_RESPONSE_SCHEMA, ALTERNATIVE_STORYLINE_SCHEMA } = await import('./gemini-schemas.ts');
        const responseSchema = generate_alternative ? ALTERNATIVE_STORYLINE_SCHEMA : STORYLINE_RESPONSE_SCHEMA;
        
        let storylineData: StorylineResponseData | null = null;

        if (isGmiModel(resolvedStorylineModel.model)) {
          // GMI Cloud path for structured scenes
          console.log('Phase 3: Using GMI Cloud for structured scenes...');
          const schemaHint = `\n\nIMPORTANT: You MUST respond with valid JSON that matches this exact schema:\n${JSON.stringify(responseSchema, null, 2)}\n\nDo not include any text before or after the JSON. Only output the JSON object.`;
          const gmiStructured = await callGmiForStoryline(
            storylineSystemPrompt + schemaHint,
            storylineUserPrompt,
            resolvedStorylineModel.model,
            { temperature: storylineTemperature, maxTokens: 4096, jsonMode: true }
          );
          if (!gmiStructured.ok) {
            console.error('GMI structured generation failed:', gmiStructured.error);
          } else {
            storylineData = gmiStructured.parsed as StorylineResponseData;
          }
        } else {
          // Groq path (legacy)
          const structuredResponse = await fetch(
            `${Deno.env.get('SUPABASE_URL')}/functions/v1/gemini-storyline-generation`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemPrompt: storylineSystemPrompt,
                prompt: storylineUserPrompt,
                model: resolvedStorylineModel.model,
                responseSchema: responseSchema,
                temperature: storylineTemperature
              }),
            }
          );

          if (!structuredResponse.ok) {
            const errorData = await structuredResponse.json().catch(() => ({ error: 'Unknown error' }));
            if (structuredResponse.status === 402) {
              throw new Error('402: AI credits exhausted. Please add funds to continue generating.');
            }
            if (structuredResponse.status === 429) {
              throw new Error('429: Rate limited. Please wait a moment and try again.');
            }
            throw new Error(`Groq generation failed: ${errorData.error || structuredResponse.statusText}`);
          }

          const structuredData = await structuredResponse.json();
          storylineData = structuredData.parsed as StorylineResponseData;
        }

        if (!storylineData || !storylineData.primary_storyline) {
          console.warn('No structured data, continuing with streamed story only');
        } else {
          // Update storyline with better title/description if available
          if (storylineData.primary_storyline.title || storylineData.primary_storyline.description) {
            await supabaseClient
              .from('storylines')
              .update({ 
                title: storylineData.primary_storyline.title || quickTitle,
                description: storylineData.primary_storyline.description || quickDescription
              })
              .eq('id', storyline_id);
          }
        }

        // Step 4: Stream scenes (one by one)
        const sceneBreakdown = storylineData?.scene_breakdown || [];
        for (const scene of sceneBreakdown) {
          await supabaseClient
            .from('scenes')
            .insert({
              project_id,
              storyline_id: storyline_id,
              scene_number: scene.scene_number,
              title: scene.title,
              description: scene.description,
              location: scene.location,
              lighting: scene.lighting,
              weather: scene.weather,
              story_goal: scene.description,
            });
          
          await new Promise(resolve => setTimeout(resolve, 100)); // Smooth scene appearance
        }

        console.log(`Completed streaming ${sceneBreakdown.length} scenes`);

        // Step 5: Analysis and character discovery (only for main storyline)
        let analysisData: AnalysisResponseData | null = null;
        if (!generate_alternative) {
          try {
            console.log('Analyzing storyline for characters and settings...');
            const analysisSystemPrompt = getAnalysisSystemPrompt();
            const analysisUserPrompt = getAnalysisUserPrompt(fullStoryText);
            const { ANALYSIS_RESPONSE_SCHEMA } = await import('./gemini-schemas.ts');

            if (isGmiModel(resolvedStorylineModel.model)) {
              // GMI Cloud path for analysis
              const schemaHint = `\n\nIMPORTANT: You MUST respond with valid JSON that matches this exact schema:\n${JSON.stringify(ANALYSIS_RESPONSE_SCHEMA, null, 2)}\n\nDo not include any text before or after the JSON. Only output the JSON object.`;
              const gmiAnalysis = await callGmiForStoryline(
                analysisSystemPrompt + schemaHint,
                analysisUserPrompt,
                resolvedStorylineModel.model,
                { temperature: 0.5, maxTokens: 2048, jsonMode: true }
              );
              if (gmiAnalysis.ok && gmiAnalysis.parsed) {
                analysisData = gmiAnalysis.parsed as AnalysisResponseData;
              }
            } else {
              // Groq path (legacy)
              const analysisResponse = await fetch(
                `${Deno.env.get('SUPABASE_URL')}/functions/v1/gemini-storyline-generation`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    systemPrompt: analysisSystemPrompt,
                    prompt: analysisUserPrompt,
                    model: 'llama-3.1-8b-instant',
                    responseSchema: ANALYSIS_RESPONSE_SCHEMA,
                    temperature: 0.5
                  }),
                }
              );

              if (analysisResponse.ok) {
                const analysisData_raw = await analysisResponse.json();
                analysisData = analysisData_raw.parsed as AnalysisResponseData;
              }
            }

            // Stream characters (shared path for both GMI and Groq)
            if (analysisData?.characters) {
              for (const char of analysisData.characters) {
                await supabaseClient
                  .from('characters')
                  .insert({
                    project_id,
                    name: char.name,
                    description: char.description,
                    identity_profile: {
                      canon_facts: [char.description],
                      movement_tags: [],
                      voice_tags: [],
                      wardrobe_tags: [],
                      hairstyle_tags: [],
                      body_shape_tags: [],
                      face_refs: [],
                    }
                  });
                
                await new Promise(resolve => setTimeout(resolve, 100));
              }
              console.log(`Completed streaming ${analysisData.characters.length} characters`);
            }
          } catch (analysisError: unknown) {
            const msg = analysisError instanceof Error ? analysisError.message : 'Unknown error';
            console.warn('Failed to analyze storyline:', msg);
          }
        }

        // Step 6: Complete the storyline
        await supabaseClient
          .from('storylines')
          .update({ status: 'complete' })
          .eq('id', storyline_id);

        // Step 7: Generate shots from scenes (only for main storyline)
        if (!generate_alternative && sceneBreakdown.length > 0) {
          const { data: scenesWithIds } = await supabaseClient
            .from('scenes')
            .select('id, scene_number, title, description, location, lighting, story_goal')
            .eq('storyline_id', storyline_id)
            .order('scene_number');

          if (scenesWithIds) {
            await createNarrativeArtifacts(supabaseClient, {
              projectId: project_id,
              storylineId: storyline_id!,
              scenes: scenesWithIds.map((scene) => ({
                id: scene.id,
                scene_number: scene.scene_number,
                title: scene.title,
                description: scene.description,
                story_goal: scene.story_goal,
              })),
              fullStory: fullStoryText,
            });

            const shotsToInsert: any[] = [];
            
            scenesWithIds.forEach((scene, sceneIdx) => {
              const sceneData = sceneBreakdown[sceneIdx];
              let shotIdeas = sceneData?.shot_ideas || [];
              
              // FALLBACK: If no shot ideas provided, create 3 default shots using scene data from DB
              if (shotIdeas.length === 0) {
                console.warn(`[Scene ${scene.scene_number}] No shot_ideas from Gemini. Creating default shots using DB scene data.`);
                
                const sceneTitle = scene.title || sceneData?.title || `Scene ${scene.scene_number}`;
                const sceneDesc = scene.description || sceneData?.description || 'the scene unfolds';
                const location = scene.location || sceneData?.location || 'the location';
                const lighting = scene.lighting || sceneData?.lighting || 'cinematic lighting';
                const tone = sceneData?.emotional_tone || 'dramatic';
                const palette = sceneData?.color_palette || 'cinematic color grading';
                
                shotIdeas = [
                  {
                    shot_type: 'wide',
                    description: `Establishing shot: ${sceneTitle}`,
                    visual_prompt: `Wide angle establishing shot of ${location}, ${sceneDesc}, ${lighting}, professional cinematography, ${palette}`,
                    camera_movement: 'static',
                    duration_seconds: 4,
                    composition_notes: 'Establishing context'
                  },
                  {
                    shot_type: 'medium',
                    description: `Main action: ${sceneDesc.slice(0, 80)}`,
                    visual_prompt: `Medium shot, ${tone} atmosphere, ${sceneDesc}, ${lighting}, ${palette}, professional photography`,
                    camera_movement: 'subtle pan',
                    duration_seconds: 5,
                    composition_notes: 'Core narrative beat'
                  },
                  {
                    shot_type: 'close_up',
                    description: `Emotional close-up for ${sceneTitle}`,
                    visual_prompt: `Close-up shot, ${tone} mood, ${lighting}, shallow depth of field, 85mm lens, ${palette}`,
                    camera_movement: 'static',
                    duration_seconds: 3,
                    composition_notes: 'Emotional emphasis'
                  }
                ];
              }
              
              // Generate shots for this scene
              shotIdeas.forEach((shotIdea, index) => {
                shotsToInsert.push({
                  scene_id: scene.id,
                  project_id: project_id,
                  shot_number: index + 1,
                  shot_type: shotIdea.shot_type || 'medium',
                  prompt_idea: shotIdea.description,
                  visual_prompt: shotIdea.visual_prompt,
                  shot_packet: {
                    story_goal: scene.story_goal || scene.description || scene.title,
                    camera_movement: shotIdea.camera_movement,
                    composition_notes: shotIdea.composition_notes,
                    continuity_refs: sceneIdx > 0 ? [`scene_${scenesWithIds[sceneIdx - 1].scene_number}`] : [],
                    canon_constraints: [],
                    style_bundle: { lighting: scene.lighting },
                    camera_bundle: { movement: shotIdea.camera_movement },
                  },
                  camera_movement: shotIdea.camera_movement,
                  duration_seconds: shotIdea.duration_seconds,
                  composition_notes: shotIdea.composition_notes,
                  image_status: 'prompt_ready',
                  image_generation_error: null
                });
              });
            });

            if (shotsToInsert.length > 0) {
              const { data: newShots } = await supabaseClient
                .from('shots')
                .insert(shotsToInsert)
                .select('id, scene_id, visual_prompt');
              
              if (newShots) {
                console.log(`Created ${newShots.length} shots`);
                for (const shot of newShots) {
                  await createPromptVersion(supabaseClient, {
                    projectId: project_id,
                    stage: 'shot_prompt',
                    authorType: 'system',
                    text: shot.visual_prompt || '',
                    sourceEntityType: 'shot',
                    sourceEntityId: shot.id,
                    parentPromptId: structurePromptId,
                    metadata: {
                      storyline_id,
                      scene_id: shot.scene_id,
                    },
                  });
                }
                await triggerShotVisualPromptGeneration(supabaseClient, newShots.map(s => s.id));
              }
            }

            await enqueueStoryboardEvaluation(supabaseClient, {
              userId: user.id,
              projectId: project_id,
              targetType: 'storyline',
              targetId: storyline_id!,
            });
            for (const scene of scenesWithIds) {
              await enqueueStoryboardEvaluation(supabaseClient, {
                userId: user.id,
                projectId: project_id,
                targetType: 'scene',
                targetId: scene.id,
              });
            }
          }
        }

        // Step 8: Update project settings (only for main storyline)
        if (!generate_alternative) {
          const updatedSettings: any = { selected_storyline_id: storyline_id };
          
          if (analysisData?.potential_genre) {
            updatedSettings.genre = analysisData.potential_genre;
          }
          if (analysisData?.potential_tone) {
            updatedSettings.tone = analysisData.potential_tone;
          }
          
          await updateProjectSettings(supabaseClient, project_id, updatedSettings);

          // Trigger character image generation
          if (analysisData?.characters && analysisData.characters.length > 0) {
            const { data: characters } = await supabaseClient
              .from('characters')
              .select('id, name')
              .eq('project_id', project_id);
            
            if (characters) {
              await triggerCharacterImageGeneration(supabaseClient, project_id, characters);
            }
          }
        }

        console.log('Background storyline generation completed successfully');

      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('Background generation error:', error);
        if (storyline_id) {
          await supabaseClient
            .from('storylines')
            .update({ 
              status: 'failed', 
              failure_reason: errorMsg 
            })
            .eq('id', storyline_id);
        }
      }
    })();

    // Use EdgeRuntime.waitUntil to keep function alive for background processing
    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(backgroundProcessing);
    }

    // Return immediately with 202 Accepted
    return successResponse({
      success: true,
      message: 'Storyline generation started',
      project_id
    }, 202);

  } catch (error: unknown) {
    console.error('Error in generate-storylines function:', error);
    if (error instanceof AuthError) {
      return errorResponse(error.message, 401);
    }
    if (error instanceof SyntaxError) {
      console.error('JSON Parsing Error:', error.message);
      return errorResponse('Failed to parse request body or API response', 400, { detail: error.message });
    }
    const errorMsg = error instanceof Error ? error.message : 'Internal server error';
    return errorResponse(errorMsg, 500);
  }
});
