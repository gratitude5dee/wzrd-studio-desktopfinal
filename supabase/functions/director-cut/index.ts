import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  ExportAsset,
  ExportSettings,
  ExportProcessingError,
  processAssetsRemote,
} from '../_shared/export-helpers.ts';
import { safeLog } from '../_shared/safe-logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const EXPORT_BUCKET = 'final-exports';
const DEFAULT_IMAGE_DURATION_MS = 5000;
const DEFAULT_VIDEO_DURATION_MS = 6000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TimelineAssetRow {
  id: string;
  position_order: number;
  asset_type: 'image' | 'video' | 'audio';
  source_url: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
}

interface DirectorCutFinalAssetRow {
  id: string;
  file_url: string | null;
  file_size?: number | null;
  duration_ms?: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at?: string | null;
}

interface DirectorCutExportJobRow {
  id: string;
  status: string;
  progress: number | null;
  output_url: string | null;
  error_message: string | null;
  provider: string | null;
  provider_status: string | null;
  provider_job_id: string | null;
  fallback_used: boolean | null;
  provider_payload: Record<string, unknown> | null;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

interface DirectorCutHistoryItemResponse {
  id: string;
  jobId: string | null;
  status: string;
  progress: number;
  outputUrl: string | null;
  error: string | null;
  provider: string | null;
  providerStatus: string | null;
  providerJobId: string | null;
  fallbackUsed: boolean;
  providerPayload: Record<string, unknown> | null;
  finalAssetId: string | null;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface SupabaseQueryError {
  message: string;
}

interface SupabaseQueryResult<T = unknown> {
  data: T | null;
  error: SupabaseQueryError | null;
}

interface SupabaseQueryBuilder<T = unknown> extends PromiseLike<SupabaseQueryResult<T>> {
  select(columns?: string): SupabaseQueryBuilder<T>;
  eq(column: string, value: unknown): SupabaseQueryBuilder<T>;
  order(column: string, options?: Record<string, unknown>): SupabaseQueryBuilder<T>;
  limit(count: number): SupabaseQueryBuilder<T>;
  insert(values: unknown): SupabaseQueryBuilder<T>;
  single(): Promise<SupabaseQueryResult<unknown>>;
}

interface SupabaseAdminLike {
  from(table: string): SupabaseQueryBuilder;
}

interface RequestBody {
  action: 'sync' | 'create' | 'retry' | 'status' | 'history' | 'send_to_editor';
  projectId?: string;
  jobId?: string;
  settings?: ExportSettings;
}

interface MissingShotDetail {
  shotId: string;
  sceneId: string | null;
  sceneNumber: number | null;
  shotNumber: number | null;
  reason: string;
  imageStatus?: string | null;
  videoStatus?: string | null;
}

interface DirectorCutSummary {
  totalShots: number;
  syncedAssets: number;
  visualAssets: number;
  readyShots: number;
  readyVideos: number;
  fallbackImages: number;
  missingShots: number;
  missingShotDetails: MissingShotDetail[];
  audioAssets: number;
  canExport: boolean;
  blockingReason: string | null;
}

type TimelineAssetRole = 'shot_visual' | 'voiceover' | 'sfx' | 'music';

const mapRoleToSubtype = (role: TimelineAssetRole) => {
  if (role === 'voiceover' || role === 'sfx' || role === 'music') {
    return role;
  }
  return 'visual';
};

const mapTimelineAssetsToExportAssets = (assets: TimelineAssetRow[]): ExportAsset[] =>
  assets
    .filter((asset) => !!asset.source_url)
    .map((asset) => {
      const meta = (asset.metadata ?? {}) as Record<string, unknown>;
      const role = (meta.asset_role as TimelineAssetRole) ?? 'shot_visual';
      return {
        id: asset.id,
        type: asset.asset_type,
        subtype: mapRoleToSubtype(role),
        url: asset.source_url!,
        duration_ms: asset.duration_ms ?? undefined,
        order_index: asset.position_order,
        metadata: meta,
      };
    });

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

const asString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null;

const assertProjectAccess = async (supabaseAdmin: any, userId: string, projectId: string) => {
  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single();

  if (projectError || !project || project.user_id !== userId) {
    throw new Error('Project not found or access denied');
  }

  return project;
};

const buildBlockingReason = (input: {
  totalShots: number;
  visualAssets: number;
  missingShots: number;
}) => {
  if (input.totalShots === 0) {
    return "No ordered shots are available for Director's Cut.";
  }
  if (input.missingShots > 0) {
    const label = input.missingShots === 1 ? 'shot is' : 'shots are';
    return `${input.missingShots} ordered ${label} missing an image or video. Generate all visuals before starting Director's Cut.`;
  }
  if (input.visualAssets === 0) {
    return "No shot image or video assets are available for Director's Cut.";
  }
  return null;
};

const buildSummary = (input: {
  totalShots: number;
  syncedAssets: number;
  readyVideos: number;
  fallbackImages: number;
  missingShotDetails: MissingShotDetail[];
  audioAssets: number;
}): DirectorCutSummary => {
  const visualAssets = input.readyVideos + input.fallbackImages;
  const missingShots = input.missingShotDetails.length;
  const blockingReason = buildBlockingReason({
    totalShots: input.totalShots,
    visualAssets,
    missingShots,
  });
  return {
    totalShots: input.totalShots,
    syncedAssets: input.syncedAssets,
    visualAssets,
    readyShots: visualAssets,
    readyVideos: input.readyVideos,
    fallbackImages: input.fallbackImages,
    missingShots,
    missingShotDetails: input.missingShotDetails,
    audioAssets: input.audioAssets,
    canExport: blockingReason === null,
    blockingReason,
  };
};

const loadOrderedScenesAndShots = async (supabaseAdmin: any, projectId: string) => {
  const { data: scenes, error: scenesError } = await supabaseAdmin
    .from('scenes')
    .select('id, scene_number')
    .eq('project_id', projectId)
    .order('scene_number', { ascending: true });

  if (scenesError) {
    throw new Error(`Failed to fetch scenes: ${scenesError.message}`);
  }

  const { data: shots, error: shotsError } = await supabaseAdmin
    .from('shots')
    .select(
      'id, scene_id, shot_number, image_url, video_url, audio_url, audio_status, image_status, video_status, prompt_idea, visual_prompt, dialogue, sound_effects'
    )
    .eq('project_id', projectId);

  if (shotsError) {
    throw new Error(`Failed to fetch shots: ${shotsError.message}`);
  }

  return {
    scenes: scenes || [],
    shots: shots || [],
  };
};

const summarizeShotReadiness = (
  scenes: any[],
  shots: any[],
  syncedAssets = 0,
  audioAssets = 0
): DirectorCutSummary => {
  let readyVideos = 0;
  let fallbackImages = 0;
  let orderedShotCount = 0;
  const missingShotDetails: MissingShotDetail[] = [];

  for (const scene of scenes) {
    const sceneShots = shots
      .filter((shot: any) => shot.scene_id === scene.id)
      .sort((a: any, b: any) => (a.shot_number ?? 0) - (b.shot_number ?? 0));
    orderedShotCount += sceneShots.length;

    for (const shot of sceneShots) {
      const hasVideo = !!shot.video_url;
      const hasImage = !!shot.image_url;

      if (hasVideo) {
        readyVideos += 1;
        continue;
      }
      if (hasImage) {
        fallbackImages += 1;
        continue;
      }

      missingShotDetails.push({
        shotId: shot.id,
        sceneId: shot.scene_id ?? null,
        sceneNumber: typeof scene.scene_number === 'number' ? scene.scene_number : null,
        shotNumber: typeof shot.shot_number === 'number' ? shot.shot_number : null,
        reason: 'Missing shot image or video',
        imageStatus: typeof shot.image_status === 'string' ? shot.image_status : null,
        videoStatus: typeof shot.video_status === 'string' ? shot.video_status : null,
      });
    }
  }

  return buildSummary({
    totalShots: orderedShotCount,
    syncedAssets,
    readyVideos,
    fallbackImages,
    missingShotDetails,
    audioAssets,
  });
};

const getDirectorCutReadiness = async (
  supabaseAdmin: any,
  userId: string,
  projectId: string,
  syncedAssets = 0,
  audioAssets = 0
) => {
  await assertProjectAccess(supabaseAdmin, userId, projectId);
  const { scenes, shots } = await loadOrderedScenesAndShots(supabaseAdmin, projectId);
  return summarizeShotReadiness(scenes, shots, syncedAssets, audioAssets);
};

const preflightFailureResponse = (summary: DirectorCutSummary) =>
  new Response(
    JSON.stringify({
      success: false,
      error: 'DIRECTOR_CUT_PREFLIGHT_FAILED',
      message: summary.blockingReason ?? "Director's Cut preflight failed.",
      summary,
    }),
    {
      status: 409,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );

const normalizeHistoryJob = (
  job: DirectorCutExportJobRow,
  assetByJobId: Map<string, DirectorCutFinalAssetRow>
): DirectorCutHistoryItemResponse => {
  const payload = asRecord(job.provider_payload);
  const asset = assetByJobId.get(job.id);
  return {
    id: job.id,
    jobId: job.id,
    status: job.status,
    progress: job.progress ?? 0,
    outputUrl: job.output_url ?? asset?.file_url ?? null,
    error: job.error_message ?? null,
    provider: job.provider ?? null,
    providerStatus: job.provider_status ?? null,
    providerJobId: job.provider_job_id ?? null,
    fallbackUsed: job.fallback_used ?? false,
    providerPayload: job.provider_payload ?? null,
    finalAssetId: asset?.id ?? null,
    createdAt: job.created_at ?? null,
    startedAt: job.started_at ?? null,
    completedAt: job.completed_at ?? asset?.created_at ?? null,
  };
};

const loadDirectorCutHistory = async (supabaseAdmin: SupabaseAdminLike, userId: string, projectId: string) => {
  await assertProjectAccess(supabaseAdmin, userId, projectId);

  const { data: finalAssets, error: finalAssetsError } = await supabaseAdmin
    .from('final_project_assets')
    .select('id, file_url, file_size, duration_ms, metadata, created_at, updated_at')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('asset_type', 'video')
    .order('created_at', { ascending: false })
    .limit(30);

  if (finalAssetsError) {
    throw new Error(`Failed to load Director's Cut assets: ${finalAssetsError.message}`);
  }

  const directorAssets = ((finalAssets || []) as DirectorCutFinalAssetRow[]).filter((asset) => {
    const metadata = asRecord(asset.metadata);
    return metadata.source === 'director_cut' && typeof asset.file_url === 'string' && asset.file_url.length > 0;
  });
  const assetByJobId = new Map<string, DirectorCutFinalAssetRow>();
  for (const asset of directorAssets) {
    const exportJobId = asString(asRecord(asset.metadata).export_job_id);
    if (exportJobId) assetByJobId.set(exportJobId, asset);
  }

  const { data: jobs, error: jobsError } = await supabaseAdmin
    .from('export_jobs')
    .select('*')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (jobsError) {
    throw new Error(`Failed to load Director's Cut history: ${jobsError.message}`);
  }

  const seenAssetIds = new Set<string>();
  const items: DirectorCutHistoryItemResponse[] = ((jobs || []) as DirectorCutExportJobRow[])
    .filter((job) => asRecord(job.provider_payload).source === 'director_cut' || assetByJobId.has(job.id))
    .map((job) => {
      const asset = assetByJobId.get(job.id);
      if (asset?.id) seenAssetIds.add(asset.id);
      return normalizeHistoryJob(job, assetByJobId);
    });

  for (const asset of directorAssets) {
    if (seenAssetIds.has(asset.id)) continue;
    const metadata = asRecord(asset.metadata);
    items.push({
      id: `asset:${asset.id}`,
      jobId: asString(metadata.export_job_id),
      status: 'completed',
      progress: 100,
      outputUrl: asset.file_url,
      error: null,
      provider: asString(metadata.provider) ?? 'director_cut',
      providerStatus: 'completed',
      providerJobId: null,
      fallbackUsed: Boolean(metadata.fallback_used),
      providerPayload: {
        source: 'director_cut',
        stage: 'completed',
        partialSuccess: Boolean(metadata.partial_success),
      },
      finalAssetId: asset.id,
      createdAt: asset.created_at ?? null,
      startedAt: null,
      completedAt: asset.created_at ?? null,
    });
  }

  items.sort((a, b) => {
    const left = Date.parse(a.completedAt ?? a.startedAt ?? a.createdAt ?? '') || 0;
    const right = Date.parse(b.completedAt ?? b.startedAt ?? b.createdAt ?? '') || 0;
    return right - left;
  });

  return items.slice(0, 12);
};

const ensureDirectorCutFinalAsset = async (
  supabaseAdmin: SupabaseAdminLike,
  userId: string,
  projectId: string,
  jobId: string
) => {
  await assertProjectAccess(supabaseAdmin, userId, projectId);

  const { data: job, error: jobError } = await supabaseAdmin
    .from('export_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single();

  if (jobError || !job) {
    throw new Error('Director\'s Cut render not found');
  }

  const exportJob = job as DirectorCutExportJobRow;

  if (exportJob.status !== 'completed' || !exportJob.output_url) {
    throw new Error('Director\'s Cut render is not ready to send to the editor');
  }

  const { data: existingAssets, error: existingError } = await supabaseAdmin
    .from('final_project_assets')
    .select('id, file_url, metadata, created_at')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('asset_type', 'video');

  if (existingError) {
    throw new Error(`Failed to check editor assets: ${existingError.message}`);
  }

  const existing = ((existingAssets || []) as DirectorCutFinalAssetRow[]).find((asset) => {
    const metadata = asRecord(asset.metadata);
    return metadata.source === 'director_cut' && (metadata.export_job_id === jobId || asset.file_url === exportJob.output_url);
  });

  if (existing) {
    return existing;
  }

  const payload = asRecord(exportJob.provider_payload);
  const { data: asset, error: insertError } = await supabaseAdmin
    .from('final_project_assets')
    .insert({
      project_id: projectId,
      user_id: userId,
      asset_type: 'video',
      file_url: exportJob.output_url,
      storage_bucket: EXPORT_BUCKET,
      metadata: {
        export_job_id: jobId,
        source: 'director_cut',
        name: 'Director\'s Cut',
        provider: exportJob.provider,
        provider_status: exportJob.provider_status,
        fallback_used: exportJob.fallback_used ?? false,
        partial_success: Boolean(payload.partialSuccess),
      },
    })
    .select('id, file_url, metadata, created_at')
    .single();

  if (insertError || !asset) {
    throw new Error(`Failed to send Director's Cut to editor: ${insertError?.message}`);
  }

  return asset;
};

const syncTimelineAssets = async (supabaseAdmin: any, userId: string, projectId: string) => {
  await assertProjectAccess(supabaseAdmin, userId, projectId);

  const { scenes, shots } = await loadOrderedScenesAndShots(supabaseAdmin, projectId);

  const { data: finalAudioAssets, error: finalAudioError } = await supabaseAdmin
    .from('final_project_assets')
    .select('id, asset_type, file_url, duration_ms, metadata')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('asset_type', 'audio');

  if (finalAudioError) {
    throw new Error(`Failed to fetch final audio assets: ${finalAudioError.message}`);
  }

  await supabaseAdmin.from('timeline_assets').delete().eq('project_id', projectId);

  let sequenceIndex = 0;
  let timelineMs = 0;
  let readyVideos = 0;
  let fallbackImages = 0;
  let audioAssets = 0;
  let orderedShotCount = 0;
  const missingShotDetails: MissingShotDetail[] = [];
  const rowsToInsert: Record<string, unknown>[] = [];

  for (const scene of scenes) {
    const sceneShots = shots
      .filter((shot: any) => shot.scene_id === scene.id)
      .sort((a: any, b: any) => (a.shot_number ?? 0) - (b.shot_number ?? 0));
    orderedShotCount += sceneShots.length;

    for (const shot of sceneShots) {
      const hasVideo = !!shot.video_url;
      const hasImage = !!shot.image_url;
      const segmentDurationMs = hasVideo ? DEFAULT_VIDEO_DURATION_MS : DEFAULT_IMAGE_DURATION_MS;

      if (!hasVideo && !hasImage) {
        missingShotDetails.push({
          shotId: shot.id,
          sceneId: shot.scene_id ?? null,
          sceneNumber: typeof scene.scene_number === 'number' ? scene.scene_number : null,
          shotNumber: typeof shot.shot_number === 'number' ? shot.shot_number : null,
          reason: 'Missing shot image or video',
          imageStatus: typeof shot.image_status === 'string' ? shot.image_status : null,
          videoStatus: typeof shot.video_status === 'string' ? shot.video_status : null,
        });
        continue;
      }

      if (hasVideo) {
        readyVideos += 1;
      } else {
        fallbackImages += 1;
      }

      rowsToInsert.push({
        project_id: projectId,
        scene_id: shot.scene_id,
        shot_id: shot.id,
        position_order: sequenceIndex,
        asset_type: hasVideo ? 'video' : 'image',
        source_url: hasVideo ? shot.video_url : shot.image_url,
        duration_ms: segmentDurationMs,
        metadata: {
          asset_role: 'shot_visual',
          start_ms: timelineMs,
          duration_ms: segmentDurationMs,
          track: 'visual',
          thumbnail_url: shot.image_url,
          scene_number: scene.scene_number,
          shot_number: shot.shot_number,
          prompt_idea: shot.prompt_idea,
          visual_prompt: shot.visual_prompt,
          fallback_image_segment: !hasVideo,
        },
        user_id: userId,
      });

      if (shot.audio_url) {
        rowsToInsert.push({
          project_id: projectId,
          scene_id: shot.scene_id,
          shot_id: shot.id,
          position_order: sequenceIndex,
          asset_type: 'audio',
          source_url: shot.audio_url,
          duration_ms: null,
          metadata: {
            asset_role: 'voiceover',
            start_ms: timelineMs,
            track: 'voiceover',
            scene_number: scene.scene_number,
            shot_number: shot.shot_number,
            dialogue: shot.dialogue,
            sound_effects: shot.sound_effects,
          },
          user_id: userId,
        });
        audioAssets += 1;
      }
      sequenceIndex += 1;
      timelineMs += segmentDurationMs;
    }
  }

  for (const asset of finalAudioAssets || []) {
    if (!asset.file_url) continue;
    rowsToInsert.push({
      project_id: projectId,
      scene_id: null,
      shot_id: null,
      position_order: 0,
      asset_type: 'audio',
      source_url: asset.file_url,
      duration_ms: asset.duration_ms,
      metadata: {
        ...((asset.metadata ?? {}) as Record<string, unknown>),
        asset_role: 'music',
        start_ms: 0,
        track: 'music',
        final_project_asset_id: asset.id,
      },
      user_id: userId,
    });
    audioAssets += 1;
  }

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabaseAdmin
      .from('timeline_assets')
      .insert(rowsToInsert);

    if (insertError) {
      throw new Error(`Failed to write timeline assets: ${insertError.message}`);
    }
  }

  return buildSummary({
    totalShots: orderedShotCount,
    syncedAssets: rowsToInsert.length,
    readyVideos,
    fallbackImages,
    missingShotDetails,
    audioAssets,
  });
};

const runDirectorCutJob = async (
  supabaseAdmin: any,
  userId: string,
  projectId: string,
  jobId: string,
  assets: ExportAsset[],
  settings?: ExportSettings
) => {
  try {
    await supabaseAdmin
      .from('export_jobs')
      .update({
        provider: 'fal_remote',
        provider_status: 'processing',
        progress: 10,
        provider_payload: { stage: 'submitting_to_provider', source: 'director_cut' },
      })
      .eq('id', jobId);

    const result = await processAssetsRemote(
      supabaseAdmin,
      projectId,
      assets,
      jobId,
      EXPORT_BUCKET,
      settings,
      userId
    );
    const { publicUrl, shotFailures } = result;

    const completedPayload: Record<string, unknown> = {
      ...(result.providerPayload ?? {}),
      stage: 'completed',
      source: 'director_cut',
    };
    if (shotFailures.length > 0) {
      completedPayload.shotFailures = shotFailures;
      completedPayload.partialSuccess = true;
      completedPayload.failedShotCount = shotFailures.length;
    }

    await supabaseAdmin
      .from('export_jobs')
      .update({
        status: 'completed',
        progress: 100,
        output_url: publicUrl,
        provider: result.provider,
        provider_status: 'completed',
        fallback_used: result.fallbackUsed,
        completed_at: new Date().toISOString(),
        provider_payload: completedPayload,
      })
      .eq('id', jobId);

    const { error: finalAssetError } = await supabaseAdmin
      .from('final_project_assets')
      .insert({
        project_id: projectId,
        user_id: userId,
        asset_type: 'video',
        file_url: publicUrl,
        storage_bucket: EXPORT_BUCKET,
        metadata: {
          export_job_id: jobId,
          source: 'director_cut',
          partial_success: shotFailures.length > 0,
        },
      });

    if (finalAssetError) {
      safeLog('warn', 'director-cut.final_asset.record_failed', { error: finalAssetError, jobId, projectId });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Processing failed';
    const providerPayload = error instanceof ExportProcessingError
      ? {
          ...error.providerPayload,
          stage: 'failed',
          source: 'director_cut',
          shotFailures: error.shotFailures,
          failedShotCount: error.shotFailures.length,
        }
      : { stage: 'failed', source: 'director_cut', error: message };
    safeLog('error', 'director-cut.processing.failed', { error, jobId, projectId, providerPayload });
    await supabaseAdmin
      .from('export_jobs')
      .update({
        status: 'failed',
        error_message: message,
        provider_status: 'failed',
        completed_at: new Date().toISOString(),
        provider_payload: providerPayload,
      })
      .eq('id', jobId);
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let requestBody: RequestBody | null = null;
  try {
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    requestBody = (await req.json()) as RequestBody;
    const { action, projectId, jobId, settings } = requestBody;

    if (!action) {
      return new Response(JSON.stringify({ error: 'action is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'status') {
      if (!jobId) {
        return new Response(JSON.stringify({ error: 'jobId is required for status' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: job, error } = await supabaseAdmin
        .from('export_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('user_id', user.id)
        .single();

      if (error || !job) {
        return new Response(JSON.stringify({ error: 'Job not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          status: job.status,
          progress: job.progress,
          outputUrl: job.output_url,
          error: job.error_message,
          provider: job.provider,
          providerStatus: job.provider_status,
          providerJobId: job.provider_job_id,
          fallbackUsed: job.fallback_used,
          providerPayload: job.provider_payload,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!projectId) {
      return new Response(JSON.stringify({ error: 'projectId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'history') {
      const history = await loadDirectorCutHistory(supabaseAdmin, user.id, projectId);
      return new Response(JSON.stringify({ success: true, history }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'send_to_editor') {
      if (!jobId) {
        return new Response(JSON.stringify({ error: 'jobId is required for send_to_editor' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const asset = await ensureDirectorCutFinalAsset(supabaseAdmin, user.id, projectId, jobId);
      return new Response(JSON.stringify({ success: true, asset }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'sync') {
      const summary = await syncTimelineAssets(supabaseAdmin, user.id, projectId);
      return new Response(JSON.stringify({ success: true, summary }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create' || action === 'retry') {
      let readinessSummary: DirectorCutSummary;
      if (action === 'create') {
        readinessSummary = await syncTimelineAssets(supabaseAdmin, user.id, projectId);
      } else {
        readinessSummary = await getDirectorCutReadiness(supabaseAdmin, user.id, projectId);
      }

      if (!readinessSummary.canExport) {
        return preflightFailureResponse(readinessSummary);
      }

      const { data: timelineAssets, error: timelineError } = await supabaseAdmin
        .from('timeline_assets')
        .select('id, position_order, asset_type, source_url, duration_ms, metadata')
        .eq('project_id', projectId)
        .eq('user_id', user.id)
        .order('position_order', { ascending: true });

      if (timelineError) {
        throw new Error(`Failed to load timeline assets: ${timelineError.message}`);
      }

      const exportAssets = mapTimelineAssetsToExportAssets(
        (timelineAssets || []) as TimelineAssetRow[]
      );
      const visualExportAssets = exportAssets.filter((asset) => asset.type === 'image' || asset.type === 'video');
      if (visualExportAssets.length === 0 || visualExportAssets.length < readinessSummary.readyShots) {
        return preflightFailureResponse({
          ...readinessSummary,
          syncedAssets: timelineAssets?.length ?? 0,
          canExport: false,
          blockingReason:
            "Synced timeline assets are stale. Sync timeline assets before retrying Director's Cut.",
        });
      }

      const { data: job, error: jobError } = await supabaseAdmin
        .from('export_jobs')
        .insert({
          project_id: projectId,
          user_id: user.id,
          status: 'processing',
          progress: 5,
          settings: settings ?? {},
          started_at: new Date().toISOString(),
          provider: 'fal_remote',
          provider_status: 'queued',
          fallback_used: false,
          provider_payload: { stage: 'syncing_assets', source: 'director_cut' },
        })
        .select()
        .single();

      if (jobError || !job) {
        throw new Error(`Failed to create export job: ${jobError?.message}`);
      }

      // runDirectorCutJob handles its own error recording
      const runPromise = runDirectorCutJob(
        supabaseAdmin,
        user.id,
        projectId,
        job.id,
        exportAssets,
        settings
      );

      // Edge Runtime background execution
      // deno-lint-ignore no-explicit-any
      const maybeEdgeRuntime = (globalThis as any).EdgeRuntime;
      if (maybeEdgeRuntime?.waitUntil) {
        maybeEdgeRuntime.waitUntil(runPromise);
      } else {
        runPromise.catch(() => undefined);
      }

      return new Response(
        JSON.stringify({
          success: true,
          status: 'processing',
          jobId: job.id,
          progress: 5,
          provider: 'fal_remote',
          providerStatus: 'queued',
          fallbackUsed: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: `Unsupported action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    safeLog('error', 'director-cut.error', { error, projectId: requestBody?.projectId, jobId: requestBody?.jobId });
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
