import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { errorResponse, successResponse, handleCors } from '../_shared/response.ts';
import { getCharacterVisualSystemPrompt, getCharacterVisualUserPrompt } from '../_shared/prompts.ts';
import { executeGmiChatCompletion } from '../_shared/gmi-client.ts';
import { submitToFalQueue } from '../_shared/falai-client.ts';
import { resolveBuiltInStyleReferenceUrl } from '../_shared/style-packs.ts';

interface RequestBody {
  character_id: string;
  project_id?: string;
  style_reference_url?: string;
  style_prompt_fragment?: string;
  character_reference_url?: string;
}

interface ProjectData {
  genre?: string | null;
  tone?: string | null;
  video_style?: string | null;
  cinematic_inspiration?: string | null;
  style_reference_asset_id?: string | null;
}

interface CharacterData {
  name: string;
  description?: string | null;
  project?: ProjectData | ProjectData[] | null;
}

interface CharacterImageJobContext {
  supabaseClient: any;
  characterId: string;
  charData: CharacterData;
  projectData?: ProjectData;
  styleReferenceUrl: string | null;
  stylePromptFragment?: string | null;
}

interface CharacterImageJobResult {
  image_url: string;
  visual_prompt: string;
  style_reference_url: string | null;
}

const CHARACTER_IMAGE_POLL_INTERVAL_MS = 3000;
const CHARACTER_IMAGE_MAX_ATTEMPTS = 35;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
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

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function appendStylePrompt(prompt: string, stylePromptFragment?: string | null): string {
  const stylePrompt = normalizeOptionalString(stylePromptFragment);
  if (!stylePrompt) return prompt;
  return `${prompt}\n\nStyle direction: ${stylePrompt}`;
}

async function markCharacterImageFailed(
  supabaseClient: any,
  characterId: string | null | undefined,
  message: string
) {
  if (!characterId) return;

  const { error } = await supabaseClient
    .from('characters')
    .update({ image_status: 'failed', image_generation_error: message })
    .eq('id', characterId);

  if (error) {
    console.error(`Failed to mark character ${characterId} image generation as failed:`, error);
  }
}

async function markCharacterImageCompleted(
  supabaseClient: any,
  characterId: string,
  imageUrl: string
) {
  const { error } = await supabaseClient
    .from('characters')
    .update({ image_url: imageUrl, image_status: 'completed', image_generation_error: null })
    .eq('id', characterId);

  if (error) {
    throw error;
  }
}

async function getStyleReferenceUrl(
  supabaseClient: any,
  styleReferenceAssetId?: string | null
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

async function runCharacterImageGenerationJob({
  supabaseClient,
  characterId,
  charData,
  projectData,
  styleReferenceUrl,
  stylePromptFragment,
}: CharacterImageJobContext): Promise<CharacterImageJobResult> {
  try {
    // 1. Generate Visual Prompt using GMI Cloud LLM
    console.log(`Generating visual prompt for character: ${charData.name}`);

    const visualPromptSystem = getCharacterVisualSystemPrompt();
    const visualPromptUser = getCharacterVisualUserPrompt(
      charData.name,
      charData.description,
      projectData
    );

    const promptResult = await executeGmiChatCompletion(
      'google/gemini-3.1-flash-lite-preview',
      [
        { role: 'system', content: visualPromptSystem },
        { role: 'user', content: visualPromptUser }
      ],
      { temperature: 0.7, max_tokens: 150 }
    );

    if (!promptResult.success || !promptResult.data) {
      const message = promptResult.error || 'Failed to generate visual prompt';
      console.error('GMI prompt generation failed:', promptResult.error);
      throw new Error(message);
    }

    const visualPrompt = promptResult.data.choices?.[0]?.message?.content?.trim();
    if (!visualPrompt) {
      throw new Error('Failed to generate visual prompt');
    }

    const styledVisualPrompt = appendStylePrompt(visualPrompt, stylePromptFragment);
    console.log(`Generated visual prompt: ${styledVisualPrompt}`);

    // 2. Generate Image using fal.ai nano-banana-2
    const imageModelId = styleReferenceUrl ? 'fal-ai/nano-banana-2/edit' : 'fal-ai/nano-banana-2';
    console.log(`Calling ${imageModelId} for image generation...`);

    const falInput: Record<string, unknown> = {
      prompt: styledVisualPrompt,
      aspect_ratio: '1:1',
      output_format: 'jpeg',
      num_images: 1,
    };

    if (styleReferenceUrl) {
      falInput.image_urls = [styleReferenceUrl];
    } else {
      falInput.resolution = '1K';
    }

    const falResult = await submitToFalQueue<{ images: Array<{ url: string }>; description?: string }>(
      imageModelId,
      falInput,
      {
        pollInterval: CHARACTER_IMAGE_POLL_INTERVAL_MS,
        maxAttempts: CHARACTER_IMAGE_MAX_ATTEMPTS,
      }
    );

    if (!falResult.success || !falResult.data) {
      console.error('fal.ai image generation failed:', falResult.error);
      throw new Error(falResult.error || 'fal.ai image generation failed');
    }

    const imageUrl = falResult.data.images?.[0]?.url;
    if (!imageUrl) {
      throw new Error('No image URL in fal.ai response');
    }

    console.log(`Generated Image URL: ${imageUrl}`);
    await markCharacterImageCompleted(supabaseClient, characterId, imageUrl);

    return {
      image_url: imageUrl,
      visual_prompt: styledVisualPrompt,
      style_reference_url: styleReferenceUrl,
    };
  } catch (error: unknown) {
    const errorMsg = getErrorMessage(error);
    console.error(`Character image generation job failed for ${characterId}:`, error);
    await markCharacterImageFailed(supabaseClient, characterId, errorMsg);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors();

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );

  let requestBody: RequestBody | null = null;
  let characterId: string | undefined;

  try {
    requestBody = await req.json();
    const { character_id, style_prompt_fragment } = requestBody;
    characterId = character_id;
    if (!characterId) return errorResponse('character_id is required', 400);

    console.log(`Queueing image generation for character ID: ${characterId}`);

    await supabaseClient
      .from('characters')
      .update({ image_status: 'generating', image_generation_error: null })
      .eq('id', characterId);

    // 1. Fetch Character Data
    const { data: charData, error: fetchError } = await supabaseClient
      .from('characters')
      .select(`
        name,
        description,
        project:projects (
          genre, tone, video_style, cinematic_inspiration, style_reference_asset_id
        )
      `)
      .eq('id', characterId)
      .single();

    if (fetchError || !charData) {
      const message = fetchError?.message || 'Character not found';
      await markCharacterImageFailed(supabaseClient, characterId, message);
      return errorResponse('Character not found', 404, message);
    }

    const projectData: ProjectData | undefined = Array.isArray(charData.project)
      ? charData.project[0]
      : charData.project;

    const projectStyleReferenceUrl = await getStyleReferenceUrl(
      supabaseClient,
      projectData?.style_reference_asset_id
    );
    const styleReferenceUrl =
      projectStyleReferenceUrl ||
      normalizeOptionalString(requestBody.style_reference_url) ||
      resolveBuiltInStyleReferenceUrl(projectData?.video_style);

    const jobPromise = runCharacterImageGenerationJob({
      supabaseClient,
      characterId,
      charData,
      projectData,
      styleReferenceUrl,
      stylePromptFragment: style_prompt_fragment,
    });

    if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
      EdgeRuntime.waitUntil(
        jobPromise.catch((error) => {
          console.error(`Background character image job failed for ${characterId}:`, error);
        })
      );

      return successResponse({
        success: true,
        job: 'queued',
        status: 'generating',
        character_id: characterId,
        style_reference_url: styleReferenceUrl,
      }, 202);
    }

    const result = await jobPromise;
    return successResponse({
      success: true,
      job: 'completed',
      character_id: characterId,
      ...result,
    });

  } catch (error: unknown) {
    console.error(`Error in generate-character-image:`, error);
    const errorMsg = getErrorMessage(error);

    try {
      await markCharacterImageFailed(supabaseClient, characterId ?? requestBody?.character_id, errorMsg);
    } catch { /* ignore */ }

    return errorResponse(errorMsg, 500);
  }
});
