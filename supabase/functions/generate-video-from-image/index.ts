import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { executeGmiQueueModel, isInactiveModelError, pollGmiQueueStatus } from "../_shared/gmi-client.ts";
import {
  getCatalogModelById,
  listCatalogModels,
} from "../_shared/ai-model-catalog.ts";
import {
  buildGmiVideoQueueRequest,
  type GmiVideoQueueRequest,
} from "../_shared/gmi-video-request.ts";
import type { CatalogModel } from "../_shared/ai-model-catalog.ts";
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
} from "../_shared/credits.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_VIDEO_MODEL = 'gmi/ltx-fast-i2v';

function isCompatibleImageDrivenWorkflow(workflowType: string): boolean {
  return workflowType === 'image-to-video' || workflowType === 'reference-to-video';
}

function getModelFamilyKey(modelId: string): string {
  const workflowSuffixes = ['-r2v', '-i2v', '-t2v'];

  for (const suffix of workflowSuffixes) {
    if (modelId.endsWith(suffix)) {
      return modelId.slice(0, -suffix.length);
    }
  }

  return modelId;
}

async function resolveShotVideoModel(requestedModelId: string): Promise<{
  model: CatalogModel;
  alternates: CatalogModel[];
  fallbackUsed: boolean;
  fallbackReason?: string;
}> {
  const gmiVideoModels = await listCatalogModels({
    provider: 'gmi-cloud',
    mediaType: 'video',
    studioSurface: 'studio:video',
    enabledOnly: false,
  });
  const compatibleModels = gmiVideoModels.filter((model) =>
    isCompatibleImageDrivenWorkflow(model.workflowType)
  );
  const defaultCompatibleModel =
    compatibleModels.find((model) => model.id === DEFAULT_VIDEO_MODEL) ?? compatibleModels[0];

  if (!defaultCompatibleModel) {
    throw new Error('No compatible GMI Cloud image-driven video model is configured.');
  }

  const alternatesFor = (chosen: CatalogModel): CatalogModel[] =>
    compatibleModels.filter((model) => model.id !== chosen.id);

  const requestedModel = await getCatalogModelById(requestedModelId, {
    mediaType: 'video',
    enabledOnly: false,
  });

  if (!requestedModel) {
    return {
      model: defaultCompatibleModel,
      alternates: alternatesFor(defaultCompatibleModel),
      fallbackUsed: true,
      fallbackReason: `unknown_model:${requestedModelId}->default:${defaultCompatibleModel.id}`,
    };
  }

  if (
    requestedModel.provider === 'gmi-cloud' &&
    requestedModel.mediaType === 'video' &&
    isCompatibleImageDrivenWorkflow(requestedModel.workflowType)
  ) {
    return {
      model: requestedModel,
      alternates: alternatesFor(requestedModel),
      fallbackUsed: false,
    };
  }

  const sameFamilyCompatibleModel =
    requestedModel.provider === 'gmi-cloud'
      ? compatibleModels.find(
          (model) =>
            model.id !== requestedModel.id &&
            getModelFamilyKey(model.id) === getModelFamilyKey(requestedModel.id),
        )
      : undefined;

  if (sameFamilyCompatibleModel) {
    return {
      model: sameFamilyCompatibleModel,
      alternates: alternatesFor(sameFamilyCompatibleModel),
      fallbackUsed: true,
      fallbackReason:
        `incompatible_with_image_input:${requestedModel.workflowType}` +
        `->same_family:${sameFamilyCompatibleModel.id}`,
    };
  }

  if (requestedModel.provider !== 'gmi-cloud') {
    return {
      model: defaultCompatibleModel,
      alternates: alternatesFor(defaultCompatibleModel),
      fallbackUsed: true,
      fallbackReason: `unsupported_provider:${requestedModel.provider}->default:${defaultCompatibleModel.id}`,
    };
  }

  if (requestedModel.mediaType !== 'video') {
    return {
      model: defaultCompatibleModel,
      alternates: alternatesFor(defaultCompatibleModel),
      fallbackUsed: true,
      fallbackReason: `not_video_model:${requestedModel.id}->default:${defaultCompatibleModel.id}`,
    };
  }

  return {
    model: defaultCompatibleModel,
    alternates: alternatesFor(defaultCompatibleModel),
    fallbackUsed: true,
    fallbackReason:
      `incompatible_with_image_input:${requestedModel.workflowType}` +
      `->default:${defaultCompatibleModel.id}`,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { shot_id, image_url, prompt, duration, resolution, fps, generate_audio, camera_motion, model_id } = body;
    if (!shot_id || !image_url) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing shot ID or image URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: shot, error: shotError } = await supabase
      .from("shots")
      .select("id, project_id, scene_id, image_asset_id, visual_prompt")
      .eq("id", shot_id)
      .single();

    if (shotError || !shot) {
      return new Response(
        JSON.stringify({ success: false, error: shotError?.message || "Shot not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(
      req.headers.get("Authorization")?.split("Bearer ")[1] || ""
    );

    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ success: false, error: "User not authenticated" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestedModelId = typeof model_id === 'string' && model_id.trim().length > 0
      ? model_id.trim()
      : DEFAULT_VIDEO_MODEL;
    const resolvedModel = await resolveShotVideoModel(requestedModelId);

    const resolvedPrompt = typeof prompt === 'string' && prompt.trim().length > 0
      ? prompt.trim()
      : typeof shot.visual_prompt === 'string' && shot.visual_prompt.trim().length > 0
        ? shot.visual_prompt.trim()
        : "Natural motion and camera movement, cinematic quality";

    let submission: GmiVideoQueueRequest;
    try {
      submission = buildGmiVideoQueueRequest(resolvedModel.model, {
        imageUrl: image_url,
        prompt: resolvedPrompt,
        duration,
        resolution,
        fps,
        generate_audio,
        camera_motion,
      });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : 'Invalid video request';
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(
      `[Shot ${shot_id}] Starting video generation via GMI Cloud model: ${submission.modelId} -> ${submission.endpointModelId}`,
    );
    console.log(`[Shot ${shot_id}] Normalized queue payload:`, JSON.stringify(submission.payload));

    await supabase
      .from('shots')
      .update({ video_status: 'generating', failure_reason: null })
      .eq('id', shot_id);

    let videoGenerationJobId: string | null = null;
    let creditReservation: { holdId: string | null; requestedAmount: number; skipped: boolean } | null = null;
    const creditCost = getCreditCostForModel(submission.modelId, 'video');
    try {
      videoGenerationJobId = await createGenerationJob(supabase, {
        userId: authData.user.id,
        projectId: shot.project_id,
        jobType: 'video',
        modelId: submission.modelId,
        status: 'running',
        inputAssets: shot.image_asset_id ? [shot.image_asset_id] : [],
        config: {
          shot_id,
          image_url,
          requested_model_id: requestedModelId,
          resolved_model_id: submission.modelId,
          endpoint_model_id: submission.endpointModelId,
          fallback_used: resolvedModel.fallbackUsed,
          fallback_reason: resolvedModel.fallbackReason,
          normalized_settings: submission.normalizedSettings,
          normalized_payload: submission.payload,
        },
      });

      creditReservation = await reserveCredits({
        supabase,
        userId: authData.user.id,
        resourceType: 'video',
        requestedAmount: creditCost,
        referenceType: 'shot_video_generation',
        referenceId: shot_id,
        idempotencyKey: buildCreditIdempotencyKey('generate-video-from-image', shot_id, submission.modelId),
        metadata: {
          endpoint: 'generate-video-from-image',
          project_id: shot.project_id,
          shot_id,
          model: submission.modelId,
          provider: 'gmi-cloud',
        },
      });

      // Submit to GMI Cloud queue (single translation inside)
      let queueResult = await executeGmiQueueModel(
        submission.endpointModelId,
        submission.payload,
        submission.payloadKeys,
      );

      let inactiveModelFallbackReason: string | null = null;
      if (
        (!queueResult.success || !queueResult.requestId) &&
        isInactiveModelError(queueResult.error)
      ) {
        const inactiveModelId = submission.modelId;
        console.warn(
          `[Shot ${shot_id}] Model ${inactiveModelId} is inactive on GMI Cloud; trying fallback models`,
        );

        for (const candidate of resolvedModel.alternates) {
          let candidateSubmission: GmiVideoQueueRequest;
          try {
            candidateSubmission = buildGmiVideoQueueRequest(candidate, {
              imageUrl: image_url,
              prompt: resolvedPrompt,
              duration,
              resolution,
              fps,
              generate_audio,
              camera_motion,
            });
          } catch (candidateError: unknown) {
            console.warn(
              `[Shot ${shot_id}] Skipping fallback model ${candidate.id}:`,
              candidateError instanceof Error ? candidateError.message : candidateError,
            );
            continue;
          }

          const candidateResult = await executeGmiQueueModel(
            candidateSubmission.endpointModelId,
            candidateSubmission.payload,
            candidateSubmission.payloadKeys,
          );

          if (candidateResult.success && candidateResult.requestId) {
            submission = candidateSubmission;
            queueResult = candidateResult;
            inactiveModelFallbackReason = `inactive_model:${inactiveModelId}->fallback:${candidate.id}`;
            console.warn(`[Shot ${shot_id}] ${inactiveModelFallbackReason}`);
            break;
          }

          console.warn(
            `[Shot ${shot_id}] Fallback model ${candidate.id} failed: ${candidateResult.error}`,
          );
        }

        if (!queueResult.success || !queueResult.requestId) {
          throw new Error(
            `Video model ${inactiveModelId} is currently inactive on GMI Cloud and no fallback model succeeded. Please try again later or select a different model.`,
          );
        }
      }

      if (!queueResult.success || !queueResult.requestId) {
        throw new Error(`GMI queue submission failed: ${queueResult.error}`);
      }

      if (inactiveModelFallbackReason) {
        await updateGenerationJob(supabase, videoGenerationJobId, {
          config: {
            shot_id,
            image_url,
            requested_model_id: requestedModelId,
            resolved_model_id: submission.modelId,
            endpoint_model_id: submission.endpointModelId,
            fallback_used: true,
            fallback_reason: inactiveModelFallbackReason,
            normalized_settings: submission.normalizedSettings,
            normalized_payload: submission.payload,
          },
        });
      }

      console.log(`[Shot ${shot_id}] GMI request submitted: ${queueResult.requestId}`);

      // Poll for completion
      const MAX_POLLS = 120;
      const POLL_INTERVAL = 5000;
      let videoUrl: string | undefined;

      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
        const status = await pollGmiQueueStatus(queueResult.requestId);

        if (!status.success || !status.data) {
          console.warn(`[Shot ${shot_id}] Poll error: ${status.error}`);
          continue;
        }

        const s = status.data.status;
        console.log(`[Shot ${shot_id}] Poll ${i + 1}: ${s}`);

        if (s === 'success') {
          videoUrl = status.data.outcome?.media_urls?.[0]?.url
            || status.data.outcome?.video_url;
          break;
        }

        if (s === 'failed' || s === 'cancelled') {
          throw new Error(`GMI video generation ${s}`);
        }
      }

      if (!videoUrl) {
        throw new Error('GMI video generation timed out');
      }

      console.log(`[Shot ${shot_id}] Video URL: ${videoUrl}`);

      // Store in Supabase storage
      const videoResponse = await fetch(videoUrl);
      if (!videoResponse.ok) {
        throw new Error(`Failed to fetch video: ${videoResponse.status}`);
      }

      const videoBuffer = await videoResponse.arrayBuffer();
      const fileName = `shot-${shot_id}-video-${Date.now()}.mp4`;

      const { error: uploadError } = await supabase.storage
        .from('workflow-media')
        .upload(fileName, videoBuffer, { contentType: 'video/mp4' });

      if (uploadError) {
        throw new Error(`Failed to upload video: ${uploadError.message}`);
      }

      const { data: { publicUrl } } = supabase.storage
        .from('workflow-media')
        .getPublicUrl(fileName);

      const promptVersionId = await createPromptVersion(supabase, {
        projectId: shot.project_id,
        stage: 'shot_video',
        authorType: 'system',
        text: resolvedPrompt,
        sourceEntityType: 'shot',
        sourceEntityId: shot_id,
        metadata: {
          source_image_url: image_url,
          requested_model_id: requestedModelId,
          model_id: submission.modelId,
          endpoint_model_id: submission.endpointModelId,
          fallback_used: resolvedModel.fallbackUsed || inactiveModelFallbackReason !== null,
          fallback_reason: inactiveModelFallbackReason ?? resolvedModel.fallbackReason,
          normalized_settings: submission.normalizedSettings,
          normalized_payload: submission.payload,
          storage_path: fileName,
        },
      });

      const videoAssetId = await createProjectAsset(supabase, {
        projectId: shot.project_id,
        userId: authData.user.id,
        name: fileName,
        type: 'video',
        url: publicUrl,
        size: videoBuffer.byteLength,
        storageBucket: 'workflow-media',
        storagePath: fileName,
        metadata: {
          shot_id,
          storage_bucket: 'workflow-media',
          storage_path: fileName,
        },
      });

      await supabase
        .from('shots')
        .update({
          video_url: publicUrl,
          video_asset_id: videoAssetId,
          video_status: 'completed'
        })
        .eq('id', shot_id);

      await createAssetLineage(supabase, {
        projectId: shot.project_id,
        promptVersionId,
        generationJobId: videoGenerationJobId,
        sourceAssetId: shot.image_asset_id ?? null,
        outputAssetId: videoAssetId,
        sceneId: shot.scene_id ?? null,
        shotId: shot_id,
        relationType: 'output',
        metadata: { kind: 'shot_video' },
      });

      await updateGenerationJob(supabase, videoGenerationJobId, {
        status: 'completed',
        progress: 100,
        result_url: publicUrl,
        result_payload: { shot_id, asset_id: videoAssetId },
        completed_at: new Date().toISOString(),
      });

      await commitCredits({
        supabase,
        holdId: creditReservation.holdId,
        skipped: creditReservation.skipped,
        amount: creditCost,
        userId: authData.user.id,
        metadata: {
          endpoint: 'generate-video-from-image',
          shot_id,
          video_url: publicUrl,
        },
      });

      await enqueueStoryboardEvaluation(supabase, {
        userId: authData.user.id,
        projectId: shot.project_id,
        targetType: 'shot',
        targetId: shot_id,
        sourceGenerationJobId: videoGenerationJobId,
      });

      console.log(`[Shot ${shot_id}] Video generation completed successfully`);

      return new Response(
        JSON.stringify({
          success: true,
          video_url: publicUrl,
          requested_model_id: requestedModelId,
          resolved_model_id: submission.modelId,
          fallback_used: resolvedModel.fallbackUsed || inactiveModelFallbackReason !== null,
          fallback_reason: inactiveModelFallbackReason ?? resolvedModel.fallbackReason,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error: unknown) {
      if (error instanceof InsufficientCreditsError) {
        await updateGenerationJob(supabase, videoGenerationJobId, {
          status: 'failed',
          error_message: 'Insufficient credits',
          completed_at: new Date().toISOString(),
        });
        await supabase
          .from('shots')
          .update({ video_status: 'failed', failure_reason: 'Insufficient credits' })
          .eq('id', shot_id);
        return insufficientCreditsResponse(error, corsHeaders);
      }

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Shot ${shot_id}] Error: ${errorMsg}`);

      if (creditReservation) {
        await releaseCredits({
          supabase,
          holdId: creditReservation.holdId,
          skipped: creditReservation.skipped,
          reason: 'generation_failed',
          userId: authData.user.id,
          metadata: {
            endpoint: 'generate-video-from-image',
            shot_id,
            error: errorMsg,
          },
        });
      }

      await supabase
        .from('shots')
        .update({ video_status: 'failed', failure_reason: errorMsg })
        .eq('id', shot_id);

      await updateGenerationJob(supabase, videoGenerationJobId, {
        status: 'failed',
        error_message: errorMsg,
        completed_at: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Unexpected error: ${errorMsg}`);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
