
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fal } from "https://esm.sh/@fal-ai/client@1.2.3";
import { mergeFalModelInputs, resolveFalModelOrFallback } from "../_shared/falai-client.ts";
import { executeGmiQueueModel, pollGmiQueueStatus } from "../_shared/gmi-client.ts";
import { getCatalogModelById } from "../_shared/ai-model-catalog.ts";
import {
  createAssetLineage,
  createGenerationJob,
  createProjectAsset,
  createPromptVersion,
  enqueueStoryboardEvaluation,
  updateGenerationJob,
} from "../_shared/observability.ts";
import {
  buildCreditIdempotencyKey,
  commitCredits,
  getCreditCostForModel,
  InsufficientCreditsError,
  insufficientCreditsResponse,
  releaseCredits,
  reserveCredits,
  shouldSkipCreditBilling,
} from "../_shared/credits.ts";
import { resolveImageGenerationPlan } from "../_shared/image-fallback.ts";
import { resolveBuiltInStyleReferenceUrl } from "../_shared/style-packs.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-credit-billing",
};

// Configure FAL client
fal.config({
  credentials: Deno.env.get('FAL_KEY')
});

// Convert image size string to FAL.AI format
function convertImageSizeToFalFormat(imageSize: string): { width: number; height: number } | string {
  const dimensions = imageSize.split('x');
  if (dimensions.length !== 2) {
    return "landscape_4_3"; // Default fallback
  }
  
  const width = parseInt(dimensions[0]);
  const height = parseInt(dimensions[1]);
  
  // Check for standard sizes that have enum values
  if (width === 1024 && height === 1024) return "square_hd";
  if (width === 1536 && height === 1024) return "landscape_16_9";
  if (width === 1024 && height === 1536) return "portrait_16_9";
  if (width === 1152 && height === 1024) return "landscape_4_3";
  if (width === 1024 && height === 1152) return "portrait_4_3";
  
  // For custom sizes, return width/height object
  return { width, height };
}

// Map aspect ratios to image sizes for backwards compatibility
function getImageSizeFromAspectRatio(aspectRatio: string): string {
  switch (aspectRatio) {
    case "16:9":
      return "1536x1024"; // Landscape 16:9
    case "9:16":
      return "1024x1536"; // Portrait 9:16
    case "1:1":
      return "1024x1024"; // Square
    case "4:3":
      return "1152x1024"; // Landscape 4:3
    case "3:4":
      return "1024x1152"; // Portrait 3:4
    default:
      return "1536x1024"; // Default landscape 16:9
  }
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    });
  }

  // Authenticate the request
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing authorization" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid or expired token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }


  let shotId: string | null = null;
  let imageGenerationJobId: string | null = null;
  let creditReservation: { holdId: string | null; requestedAmount: number; skipped: boolean } | null = null;
  try {
    const body = await req.json();
    shotId = body.shot_id;
    const requestId = typeof body.request_id === 'string' ? body.request_id : crypto.randomUUID();
    const styleReferenceOverride = normalizeOptionalString(body.style_reference_url);
    const requestedImageModel = typeof body.image_model === 'string' ? body.image_model : null;
    
    if (!shotId) {
      console.error("[generate-shot-image] Missing shot_id in request");
      return new Response(
        JSON.stringify({ success: false, error: "Missing shot ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-shot-image][Shot ${shotId}] Request received.`);

    // Get shot information including the visual prompt
    console.log(`[generate-shot-image][Shot ${shotId}] Fetching shot data...`);
    const { data: shot, error: shotError } = await supabase
      .from("shots")
      .select("id, project_id, scene_id, visual_prompt, image_status, image_generation_attempts")
      .eq("id", shotId)
      .single();

    if (shotError || !shot) {
      console.error(`[generate-shot-image][Shot ${shotId}] Error fetching shot: ${shotError?.message}`);
      return new Response(
        JSON.stringify({ success: false, error: shotError?.message || "Shot not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if shot already has a visual prompt
    if (!shot.visual_prompt || shot.visual_prompt.trim() === "") {
      console.error(`[generate-shot-image][Shot ${shotId}] Visual prompt is missing or empty.`);
      return new Response(
        JSON.stringify({ success: false, error: "Shot doesn't have a visual prompt" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update shot status to generating immediately (instant UI feedback)
    console.log(`[generate-shot-image][Shot ${shotId}] Updating status to 'generating' with progress 0.`);
    const { error: statusUpdateError } = await supabase
      .from("shots")
      .update({ 
        image_status: "generating",
        image_progress: 0,
        image_generation_attempts: Number(shot.image_generation_attempts || 0) + 1,
        image_generation_error: null,
        failure_reason: null // Clear any previous failure reason
      })
      .eq("id", shotId);
      
    if (statusUpdateError) {
      console.error(`[generate-shot-image][Shot ${shotId}] Failed to update status: ${statusUpdateError.message}`);
    }

    // Get project's aspect ratio (default to 16:9 if not found)
    console.log(`[generate-shot-image][Shot ${shotId}] Fetching project data for aspect ratio...`);
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("aspect_ratio, video_style, style_reference_asset_id")
      .eq("id", shot.project_id)
      .single();

    if (projectError) {
      console.warn(`[generate-shot-image][Shot ${shotId}] Error fetching project: ${projectError.message}, using default aspect ratio.`);
    }

    const aspectRatio = project?.aspect_ratio || "16:9";
    const imageSize = getImageSizeFromAspectRatio(aspectRatio);
    const falImageSize = convertImageSizeToFalFormat(imageSize);
    console.log(`[generate-shot-image][Shot ${shotId}] Using aspect ratio: ${aspectRatio}, FAL image size:`, falImageSize);

    let styleReferenceUrl: string | undefined = styleReferenceOverride;
    if (!styleReferenceUrl && project?.style_reference_asset_id) {
      const { data: mediaItem, error: mediaError } = await supabase
        .from("media_items")
        .select("url, storage_bucket, storage_path")
        .eq("id", project.style_reference_asset_id)
        .single();

      if (!mediaError && mediaItem) {
        styleReferenceUrl =
          normalizeOptionalString(mediaItem.url) ||
          (mediaItem.storage_bucket && mediaItem.storage_path
            ? `${supabaseUrl}/storage/v1/object/public/${mediaItem.storage_bucket}/${mediaItem.storage_path}`
            : undefined);
      }
    }

    if (!styleReferenceUrl) {
      styleReferenceUrl = resolveBuiltInStyleReferenceUrl(project?.video_style) ?? undefined;
    }

    const { data: projectSettings } = await supabase
      .from('project_settings')
      .select('base_image_model')
      .eq('project_id', shot.project_id)
      .maybeSingle();

    const selectedImageModel =
      requestedImageModel ||
      projectSettings?.base_image_model ||
      'gmi/gemini-3.1-flash-image-preview';
    const selectedCatalogModel = await getCatalogModelById(selectedImageModel, {
      mediaType: 'image',
      enabledOnly: false,
    });

    // ── GMI Cloud path ──────────────────────────────────────────────────────
    if (selectedCatalogModel?.provider === 'gmi-cloud') {
      const gmiApiModelId = selectedCatalogModel.endpointId;
      console.log(`[generate-shot-image][Shot ${shotId}] Using GMI Cloud model: ${gmiApiModelId}`);

      // GMI fallback model IDs to try if the primary model is unavailable
      const GMI_FALLBACK_MODELS = ['gemini-3.1-flash-image-preview', 'seedream-4-0-250828', 'seedream-3-0'];

      imageGenerationJobId = await createGenerationJob(supabase, {
        userId: user.id,
        projectId: shot.project_id,
        jobType: 'image',
        modelId: selectedImageModel,
        status: 'running',
        config: {
          shot_id: shotId,
          aspect_ratio: aspectRatio,
          image_size: imageSize,
          style_reference_url: styleReferenceUrl ?? null,
        },
      });

      const gmiCreditCost = getCreditCostForModel(selectedImageModel, 'image');
      creditReservation = await reserveCredits({
        supabase,
        userId: user.id,
        resourceType: 'image',
        requestedAmount: gmiCreditCost,
        referenceType: 'shot_image_generation',
        referenceId: shotId,
        idempotencyKey: buildCreditIdempotencyKey('generate-shot-image', shotId, requestId, selectedImageModel),
        metadata: {
          endpoint: 'generate-shot-image',
          project_id: shot.project_id,
          shot_id: shotId,
          model: selectedImageModel,
          provider: 'gmi-cloud',
        },
        skipBilling: shouldSkipCreditBilling(req.headers),
      });

      // Convert aspect ratio to WxH for Seedream
      const sizeMap: Record<string, string> = {
        '16:9': '2560x1440', '9:16': '1440x2560', '1:1': '2048x2048',
        '4:3': '2048x1536', '3:4': '1536x2048',
      };
      const gmiSize = sizeMap[aspectRatio] || '2048x2048';

      const gmiPayload = {
        prompt: shot.visual_prompt,
        image_size: '1K',
        aspect_ratio: aspectRatio,
        image_output_format: 'png',
      };

      // Try primary model, then fallbacks
      let submitResult: Awaited<ReturnType<typeof executeGmiQueueModel>> | null = null;
      let usedModelId = gmiApiModelId;
      const modelsToTry = [gmiApiModelId, ...GMI_FALLBACK_MODELS.filter(m => m !== gmiApiModelId)];

      for (const modelId of modelsToTry) {
        try {
          console.log(`[generate-shot-image][Shot ${shotId}] Trying GMI model: ${modelId}`);
          submitResult = await executeGmiQueueModel(modelId, gmiPayload, selectedCatalogModel.payloadKeys);
          if (submitResult.success && submitResult.requestId) {
            usedModelId = modelId;
            break;
          }
          // If submission failed but not "does not exist", throw to outer catch
          if (submitResult.error && !submitResult.error.includes('does not exist')) {
            throw new Error(submitResult.error);
          }
          console.warn(`[generate-shot-image][Shot ${shotId}] GMI model ${modelId} does not exist, trying next...`);
          submitResult = null;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('does not exist')) {
            console.warn(`[generate-shot-image][Shot ${shotId}] GMI model ${modelId} does not exist, trying next...`);
            submitResult = null;
            continue;
          }
          throw err;
        }
      }

      // If all GMI models failed, fall through to FAL path
      if (!submitResult || !submitResult.success || !submitResult.requestId) {
        console.warn(`[generate-shot-image][Shot ${shotId}] All GMI models unavailable, falling through to FAL path`);
        await releaseCredits({
          supabase,
          holdId: creditReservation.holdId,
          skipped: creditReservation.skipped,
          reason: 'gmi_unavailable_fallback_to_fal',
          userId: user.id,
          metadata: {
            endpoint: 'generate-shot-image',
            shot_id: shotId,
            provider: 'gmi-cloud',
          },
        });
        creditReservation = null;
      } else {
        await supabase.from("shots").update({ image_progress: 30 }).eq("id", shotId);

        // Poll for completion
        const maxPollTime = 120_000;
        const pollInterval = 3_000;
        const startTime = Date.now();
        let imageUrl: string | null = null;

        while (Date.now() - startTime < maxPollTime) {
          await new Promise(r => setTimeout(r, pollInterval));
          const pollResult = await pollGmiQueueStatus(submitResult.requestId!);
          if (!pollResult.success) continue;

          const status = pollResult.data?.status;
          if (status === 'processing') {
            await supabase.from("shots").update({ image_progress: 60 }).eq("id", shotId);
          } else if (status === 'success') {
            imageUrl = pollResult.data?.outcome?.media_urls?.[0]?.url || null;
            break;
          } else if (status === 'failed' || status === 'cancelled') {
            throw new Error(`GMI image generation ${status}`);
          }
        }

        if (!imageUrl) throw new Error('GMI image generation timed out');

        await supabase.from("shots").update({ image_progress: 90 }).eq("id", shotId);

        // Download and upload to storage
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) throw new Error(`Failed to download GMI image: ${imageResponse.status}`);
        const imageBuffer = new Uint8Array(await imageResponse.arrayBuffer());
        const fileName = `shot-${shotId}-${Date.now()}.jpg`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('workflow-media')
          .upload(fileName, imageBuffer, { contentType: 'image/jpeg', upsert: false });
        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        const { data: { publicUrl } } = supabase.storage.from('workflow-media').getPublicUrl(fileName);

        const promptVersionId = await createPromptVersion(supabase, {
          projectId: shot.project_id, stage: 'shot_image', authorType: 'system',
          text: shot.visual_prompt, sourceEntityType: 'shot', sourceEntityId: shotId,
          metadata: {
            model_id: usedModelId,
            storage_path: uploadData?.path ?? fileName,
            public_url: publicUrl,
            style_reference_url: styleReferenceUrl ?? null,
          },
        });

        const imageAssetId = await createProjectAsset(supabase, {
          projectId: shot.project_id, userId: user.id, name: fileName, type: 'image',
          url: publicUrl, size: imageBuffer.byteLength, storageBucket: 'workflow-media',
          storagePath: uploadData?.path ?? fileName,
          metadata: { shot_id: shotId, model_id: usedModelId },
        });

        await supabase.from("shots").update({
          image_url: publicUrl,
          image_asset_id: imageAssetId,
          image_status: "completed",
          image_progress: 100,
          image_generation_error: null,
          failure_reason: null,
          style_reference_used: !!styleReferenceUrl,
        }).eq("id", shotId);

        await createAssetLineage(supabase, {
          projectId: shot.project_id, promptVersionId, generationJobId: imageGenerationJobId,
          outputAssetId: imageAssetId, shotId, sceneId: shot.scene_id ?? null,
          relationType: 'output', metadata: { kind: 'shot_image', model_id: usedModelId },
        });

        await commitCredits({
          supabase,
          holdId: creditReservation.holdId,
          skipped: creditReservation.skipped,
          amount: gmiCreditCost,
          metadata: {
            endpoint: 'generate-shot-image',
            shot_id: shotId,
            image_url: publicUrl,
            provider: 'gmi-cloud',
          },
        });
        await updateGenerationJob(supabase, imageGenerationJobId, {
          status: 'completed', progress: 100, result_url: publicUrl,
          result_payload: { shot_id: shotId, asset_id: imageAssetId },
          completed_at: new Date().toISOString(),
        });

        await enqueueStoryboardEvaluation(supabase, {
          userId: user.id, projectId: shot.project_id,
          targetType: 'shot', targetId: shotId, sourceGenerationJobId: imageGenerationJobId,
        });

        console.log(`[generate-shot-image][Shot ${shotId}] GMI image generation completed successfully (model: ${usedModelId})`);
        return new Response(
          JSON.stringify({ success: true, image_url: publicUrl, status: "completed" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── FAL path (existing) ─────────────────────────────────────────────────
    const resolvedModel = resolveFalModelOrFallback(selectedImageModel, {
      mediaTypeHint: 'image',
      uiGroup: 'generation',
    });
    const mergedInputResult = mergeFalModelInputs(resolvedModel.model.id, {
      prompt: shot.visual_prompt,
      image_size: falImageSize,
      aspect_ratio: aspectRatio,
      num_images: 1,
      safety_tolerance: 3,
    });
    const finalModelId = mergedInputResult.modelId;
    const finalModelInputs = mergedInputResult.inputs;
    if (resolvedModel.fallbackUsed) {
      console.warn(
        `[generate-shot-image][Shot ${shotId}] Model fallback requested=${selectedImageModel} resolved=${finalModelId} reason=${resolvedModel.fallbackReason}`
      );
    }

    imageGenerationJobId = await createGenerationJob(supabase, {
      userId: user.id,
      projectId: shot.project_id,
      jobType: 'image',
      modelId: finalModelId,
      status: 'running',
      config: {
        shot_id: shotId,
        aspect_ratio: aspectRatio,
        image_size: imageSize,
      },
    });

    const creditCost = getCreditCostForModel(finalModelId, 'image');
    creditReservation = await reserveCredits({
      supabase,
      userId: user.id,
      resourceType: 'image',
      requestedAmount: creditCost,
      referenceType: 'shot_image_generation',
      referenceId: shotId,
      idempotencyKey: buildCreditIdempotencyKey('generate-shot-image', shotId, requestId),
      metadata: {
        endpoint: 'generate-shot-image',
        project_id: shot.project_id,
        shot_id: shotId,
        model: finalModelId,
      },
      skipBilling: shouldSkipCreditBilling(req.headers),
    });

    console.log(`[generate-shot-image][Shot ${shotId}] Starting image generation with streaming.`);

    // Deterministic fallback decision (never hard-fail when prompt exists)
    let fallbackDecision: ReturnType<typeof resolveImageGenerationPlan> | null = null;
    try {
      fallbackDecision = resolveImageGenerationPlan({
        styleRefUrl: styleReferenceUrl ?? null,
        characterRefUrl: null,
        textPrompt: shot.visual_prompt ?? '',
        refModelId: finalModelId,
        defaultModelId: finalModelId,
      });
      console.log(`[generate-shot-image][Shot ${shotId}] fallback_decision`, fallbackDecision);
    } catch (e) {
      console.warn(`[generate-shot-image][Shot ${shotId}] fallback resolver error`, e);
    }

    try {
      console.log(`[generate-shot-image][Shot ${shotId}] Starting FAL.AI generation with model ${finalModelId}...`);
      
      let lastProgress = 0;

      const falInput: Record<string, unknown> = {
        ...finalModelInputs,
        prompt: shot.visual_prompt,
        image_size: falImageSize,
        aspect_ratio: aspectRatio,
        num_images: 1,
      };

      if (styleReferenceUrl) {
        falInput.ip_adapter_style_reference = styleReferenceUrl;
        falInput.style_strength = 0.6;
      }

      const result = await fal.subscribe(finalModelId, {
        input: falInput as Record<string, unknown>,
        logs: true,
        onQueueUpdate: async (update) => {
          console.log(`[generate-shot-image][Shot ${shotId}] Queue update: ${update.status}`);
          
          let progress = 0;
          if (update.status === 'IN_QUEUE') {
            progress = 10;
            console.log(`[generate-shot-image][Shot ${shotId}] In queue, position: ${(update as any).position || 'unknown'}`);
          } else if (update.status === 'IN_PROGRESS') {
            progress = 50;
            // Log any progress messages from the model
            if ((update as any).logs) {
              (update as any).logs.forEach((log: any) => {
                console.log(`[generate-shot-image][Shot ${shotId}] Log: ${log.message}`);
              });
            }
          } else if (update.status === 'COMPLETED') {
            progress = 85;
          }
          
          // Update DB if progress increased
          if (progress > lastProgress) {
            lastProgress = progress;
            console.log(`[generate-shot-image][Shot ${shotId}] Updating progress to ${progress}%`);
            await supabase
              .from("shots")
              .update({ image_progress: progress })
              .eq("id", shotId);
          }
        },
      });

      console.log(`[generate-shot-image][Shot ${shotId}] Generation completed, result received`);

      // Access image URL from result (fal.subscribe returns the result directly)
      const resultData = result as { images?: Array<{ url: string }>; data?: { images?: Array<{ url: string }> } };
      const imageUrl = resultData?.images?.[0]?.url || resultData?.data?.images?.[0]?.url;
      if (!imageUrl) {
        throw new Error('No image URL returned from FAL.AI');
      }

      // Update progress to 90% before download/upload
      await supabase
        .from("shots")
        .update({ image_progress: 90, style_reference_used: !!styleReferenceUrl })
        .eq("id", shotId);

      console.log(`[generate-shot-image][Shot ${shotId}] Image generated successfully, downloading and uploading to storage...`);

      // Download the image from FAL.AI
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to download image from FAL.AI: ${imageResponse.status}`);
      }
      
      const imageBuffer = new Uint8Array(await imageResponse.arrayBuffer());
      const fileName = `shot-${shotId}-${Date.now()}.png`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('workflow-media')
        .upload(fileName, imageBuffer, {
          contentType: 'image/png',
          upsert: false
        });

      if (uploadError) {
        console.error(`[generate-shot-image][Shot ${shotId}] Failed to upload image: ${uploadError.message}`);
        throw new Error(`Failed to upload image: ${uploadError.message}`);
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('workflow-media')
        .getPublicUrl(fileName);

      // Update shot with the generated image and 100% progress
      const promptVersionId = await createPromptVersion(supabase, {
        projectId: shot.project_id,
        stage: 'shot_image',
        authorType: 'system',
        text: shot.visual_prompt,
        sourceEntityType: 'shot',
        sourceEntityId: shotId,
        metadata: {
          model_id: finalModelId,
          storage_path: uploadData?.path ?? fileName,
          public_url: publicUrl,
        },
      });

      const imageAssetId = await createProjectAsset(supabase, {
        projectId: shot.project_id,
        userId: user.id,
        name: fileName,
        type: 'image',
        url: publicUrl,
        size: imageBuffer.byteLength,
        storageBucket: 'workflow-media',
        storagePath: uploadData?.path ?? fileName,
        metadata: {
          shot_id: shotId,
          storage_bucket: 'workflow-media',
          storage_path: uploadData?.path ?? fileName,
          model_id: finalModelId,
          fallback_decision: fallbackDecision ?? undefined,
        },
      });

      const { error: updateError } = await supabase
        .from("shots")
        .update({ 
          image_url: publicUrl,
          image_asset_id: imageAssetId,
          image_status: "completed",
          image_progress: 100,
          image_generation_error: null,
          failure_reason: null
        })
        .eq("id", shotId);

      if (updateError) {
        console.error(`[generate-shot-image][Shot ${shotId}] Failed to update shot with image: ${updateError.message}`);
        throw new Error(`Failed to update shot: ${updateError.message}`);
      }

      await createAssetLineage(supabase, {
        projectId: shot.project_id,
        promptVersionId,
        generationJobId: imageGenerationJobId,
        outputAssetId: imageAssetId,
        shotId,
        sceneId: shot.scene_id ?? null,
        relationType: 'output',
        metadata: {
          kind: 'shot_image',
          model_id: finalModelId,
        },
      });

      await commitCredits({
        supabase,
        holdId: creditReservation.holdId,
        skipped: creditReservation.skipped,
        amount: creditCost,
        metadata: {
          endpoint: 'generate-shot-image',
          shot_id: shotId,
          image_url: publicUrl,
        },
      });

      await updateGenerationJob(supabase, imageGenerationJobId, {
        status: 'completed',
        progress: 100,
        result_url: publicUrl,
        result_payload: {
          shot_id: shotId,
          asset_id: imageAssetId,
        },
        completed_at: new Date().toISOString(),
      });

      await enqueueStoryboardEvaluation(supabase, {
        userId: user.id,
        projectId: shot.project_id,
        targetType: 'shot',
        targetId: shotId,
        sourceGenerationJobId: imageGenerationJobId,
      });

      console.log(`[generate-shot-image][Shot ${shotId}] Image generation completed successfully`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          image_url: publicUrl,
          status: "completed"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } catch (error: unknown) {
      if (error instanceof InsufficientCreditsError) {
        throw error;
      }

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error(`[generate-shot-image][Shot ${shotId}] Error in image generation: ${errorMsg}`);
      
      // Update shot status to failed
      console.log(`[generate-shot-image][Shot ${shotId}] Updating status to 'failed' due to error.`);
      await supabase
        .from("shots")
        .update({ 
          image_status: "failed",
          image_progress: 0,
          image_generation_error: errorMsg,
          failure_reason: errorMsg
        })
        .eq("id", shotId);

      if (creditReservation) {
        await releaseCredits({
          supabase,
          holdId: creditReservation.holdId,
          skipped: creditReservation.skipped,
          reason: 'generation_failed',
          metadata: {
            endpoint: 'generate-shot-image',
            shot_id: shotId,
            error: errorMsg,
            user_id: user.id,
          },
        });
      }

      await updateGenerationJob(supabase, imageGenerationJobId, {
        status: 'failed',
        error_message: errorMsg,
        completed_at: new Date().toISOString(),
      });
        
      console.log(`[generate-shot-image][Shot ${shotId}] Status updated to 'failed' with reason: ${errorMsg}`);

      return new Response(
        JSON.stringify({ success: false, error: 'Image generation failed. Please try again.' }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    if (error instanceof InsufficientCreditsError) {
      await updateGenerationJob(supabase, imageGenerationJobId, {
        status: 'failed',
        error_message: 'Insufficient credits',
        completed_at: new Date().toISOString(),
      });
      if (shotId) {
        await supabase
          .from("shots")
          .update({
            image_status: "failed",
            image_progress: 0,
            image_generation_error: "Insufficient credits",
            failure_reason: "Insufficient credits",
          })
          .eq("id", shotId);
      }
      return insufficientCreditsResponse(error, corsHeaders);
    }
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error(`[generate-shot-image][Shot ${shotId || 'UNKNOWN'}] Unexpected error: ${errorMsg}`, errorStack);
    return new Response(
      JSON.stringify({ success: false, error: 'An unexpected error occurred. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
