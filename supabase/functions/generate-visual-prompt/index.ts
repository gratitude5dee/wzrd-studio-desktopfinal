
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getVisualPromptSystemPrompt, getVisualPromptUserPrompt } from '../_shared/prompts.ts';
import { createPromptVersion } from '../_shared/observability.ts';
import { executeGmiChatCompletion } from '../_shared/gmi-client.ts';
import { getCatalogModelById } from '../_shared/ai-model-catalog.ts';
import { getStylePromptFragment, resolveBuiltInStyleReferenceUrl } from '../_shared/style-packs.ts';

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function resolveTextEndpoint(modelId: string, fallbackId: string): Promise<string> {
  const selected = await getCatalogModelById(modelId, { mediaType: 'text', enabledOnly: false });
  if (selected?.provider === 'gmi-cloud') {
    return selected.endpointId;
  }

  const fallback = await getCatalogModelById(fallbackId, { mediaType: 'text', enabledOnly: false });
  return fallback?.endpointId ?? 'google/gemini-3.1-flash-lite';
}

function normalizeOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function appendStylePrompt(prompt: string, stylePromptFragment?: string | null): string {
  const stylePrompt = normalizeOptionalString(stylePromptFragment);
  if (!stylePrompt) return prompt;
  return `${prompt}\n\nStyle direction: ${stylePrompt}`;
}

async function getStyleReferenceUrl(styleReferenceAssetId?: string | null): Promise<string | null> {
  if (!styleReferenceAssetId) return null;

  const { data: mediaItem, error: mediaError } = await supabase
    .from('media_items')
    .select('url, storage_bucket, storage_path')
    .eq('id', styleReferenceAssetId)
    .single();

  if (mediaError || !mediaItem) return null;
  if (mediaItem.url) return mediaItem.url;

  if (mediaItem.storage_bucket && mediaItem.storage_path) {
    return `${supabaseUrl}/storage/v1/object/public/${mediaItem.storage_bucket}/${mediaItem.storage_path}`;
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let shotId: string | null = null;
  try {
    const body = await req.json();
    shotId = body.shot_id;
    const styleReferenceOverride = normalizeOptionalString(body.style_reference_url);
    const stylePromptOverride = normalizeOptionalString(body.style_prompt_fragment);

    if (!shotId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing shot ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-visual-prompt][Shot ${shotId}] Request received.`);

    const { data: shot, error: shotError } = await supabase
      .from("shots")
      .select(`
        id, 
        project_id,
        scene_id,
        shot_type,
        prompt_idea,
        scenes(
          description,
          location,
          lighting,
          weather
        ),
        projects(
          genre,
          tone,
          video_style,
          cinematic_inspiration,
          style_reference_asset_id
        )
      `)
      .eq("id", shotId)
      .maybeSingle();

    if (shotError) {
      return new Response(
        JSON.stringify({ success: false, error: shotError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!shot) {
      return new Response(
        JSON.stringify({ success: false, error: "Shot not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sceneArray = Array.isArray(shot.scenes) ? shot.scenes : [];
    const sceneData = sceneArray[0] || { description: '', location: '', lighting: '', weather: '' };
    const projectArray = Array.isArray(shot.projects) ? shot.projects : [];
    const projectData = projectArray[0] || { genre: '', tone: '', video_style: '', cinematic_inspiration: '' };
    const projectStyleReferenceUrl = await getStyleReferenceUrl(projectData.style_reference_asset_id);
    const styleReferenceUrl =
      styleReferenceOverride ||
      projectStyleReferenceUrl ||
      resolveBuiltInStyleReferenceUrl(projectData.video_style);
    const stylePromptFragment = stylePromptOverride || getStylePromptFragment(projectData.video_style);

    const systemPrompt = getVisualPromptSystemPrompt();
    const userPrompt = getVisualPromptUserPrompt(
      shot.prompt_idea,
      shot.shot_type,
      {
        description: sceneData.description,
        location: sceneData.location,
        lighting: sceneData.lighting,
        weather: sceneData.weather
      },
      {
        genre: projectData.genre,
        tone: projectData.tone,
        video_style: projectData.video_style,
        cinematic_inspiration: projectData.cinematic_inspiration
      }
    );
    const styledUserPrompt = appendStylePrompt(userPrompt, stylePromptFragment);

    // Determine model: check project settings, fall back to GMI
    const { data: projectSettings } = await supabase
      .from('project_settings')
      .select('storyline_text_model')
      .eq('project_id', shot.project_id)
      .maybeSingle();

    const textModel = projectSettings?.storyline_text_model || 'gmi/gemini-3.1-flash-lite';
    const useGmi = textModel.startsWith('gmi/') || !Deno.env.get('GROQ_API_KEY');

    let visualPrompt: string;

    if (useGmi) {
      console.log(`[generate-visual-prompt][Shot ${shotId}] Using GMI Cloud (${textModel})...`);
      const gmiModelId = await resolveTextEndpoint(
        textModel.startsWith('gmi/') ? textModel : 'gmi/gemini-3.1-flash-lite',
        'gmi/gemini-3.1-flash-lite',
      );
      const result = await executeGmiChatCompletion(gmiModelId, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: styledUserPrompt },
      ], { temperature: 0.7, max_tokens: 200 });

      if (!result.success || !result.data) {
        throw new Error(result.error || 'GMI visual prompt generation failed');
      }
      visualPrompt = result.data.choices?.[0]?.message?.content?.trim() || '';
    } else {
      console.log(`[generate-visual-prompt][Shot ${shotId}] Using Groq API...`);
      const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')!;
      const aiResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: styledUserPrompt }
          ],
          temperature: 0.7,
          max_tokens: 200
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        // If Groq fails with 401, retry with GMI
        if (aiResponse.status === 401) {
          console.warn(`[generate-visual-prompt][Shot ${shotId}] Groq 401, falling back to GMI...`);
          const gmiModelId = await resolveTextEndpoint('gmi/gemini-3.1-flash-lite', 'gmi/gemini-3.1-flash-lite');
          const fallbackResult = await executeGmiChatCompletion(gmiModelId, [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: styledUserPrompt },
          ], { temperature: 0.7, max_tokens: 200 });
          if (!fallbackResult.success || !fallbackResult.data) {
            throw new Error(fallbackResult.error || 'GMI fallback failed');
          }
          visualPrompt = fallbackResult.data.choices?.[0]?.message?.content?.trim() || '';
        } else {
          throw new Error(`Groq API error: ${aiResponse.status} - ${errorText}`);
        }
      } else {
        const aiData = await aiResponse.json();
        visualPrompt = aiData.choices?.[0]?.message?.content?.trim() || '';
      }
    }

    if (!visualPrompt) {
      throw new Error('No visual prompt generated');
    }

    visualPrompt = appendStylePrompt(visualPrompt, stylePromptFragment);

    console.log(`[generate-visual-prompt][Shot ${shotId}] Generated visual prompt:`, visualPrompt);

    const { error: updateError } = await supabase
      .from("shots")
      .update({ 
        visual_prompt: visualPrompt,
        image_status: "prompt_ready",
        image_generation_error: null,
        failure_reason: null
      })
      .eq("id", shotId);

    if (updateError) {
      return new Response(
        JSON.stringify({ success: false, error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await createPromptVersion(supabase, {
      projectId: shot.project_id,
      stage: 'shot_prompt',
      authorType: 'system',
      text: visualPrompt,
      sourceEntityType: 'shot',
      sourceEntityId: shotId,
      metadata: {
        shot_type: shot.shot_type,
        scene_id: shot.scene_id,
        style_reference_url: styleReferenceUrl,
        style_prompt_fragment: stylePromptFragment,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        visual_prompt: visualPrompt,
        shot_id: shotId,
        style_reference_url: styleReferenceUrl,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[generate-visual-prompt][Shot ${shotId || 'UNKNOWN'}] Error: ${errorMessage}`);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
