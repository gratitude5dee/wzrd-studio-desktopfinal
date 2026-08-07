import { supabase } from '@/integrations/supabase/client';
import type { AudioTrack, Clip, ClipEffect, CompositionSettings, EditorMediaStatus, Keyframe, LibraryMediaItem, TextClipStyle } from '@/store/videoEditorStore';
import type { Database, Json } from '@/integrations/supabase/types';

// The generated Supabase types are out of date and don't include timeline_clips,
// timeline_keyframes, or compositions tables. Use untyped client for those tables.
const db = supabase as any;

type Tables = Database['public']['Tables'];
type TimelineClipRow = Tables extends { timeline_clips: { Row: infer R } } ? R : Record<string, any>;
type AudioTrackRow = (Tables extends { audio_tracks: { Row: infer R } } ? R : Record<string, any>) & {
  media_item_id?: string | null;
  source_id?: string | null;
  track_index?: number | null;
  fade_in_ms?: number | null;
  fade_out_ms?: number | null;
};
type KeyframeRow = Tables extends { timeline_keyframes: { Row: infer R } } ? R : Record<string, any>;
type CompositionRow = Tables extends { compositions: { Row: infer R } } ? R : Record<string, any>;
type MediaItemRow = Tables['media_items']['Row'];

const ensureCompositionDefaults = (partial: Partial<CompositionSettings> = {}): CompositionSettings => ({
  width: partial.width ?? 1920,
  height: partial.height ?? 1080,
  fps: partial.fps ?? 30,
  aspectRatio: partial.aspectRatio ?? '16:9',
  duration: partial.duration ?? 30000,
  backgroundColor: partial.backgroundColor ?? '#000000',
});

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const asArray = <T = unknown>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);

const numberFromMetadata = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const stringFromMetadata = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const mediaStatusFromMetadata = (value: unknown): EditorMediaStatus | undefined =>
  value === 'idle' || value === 'preparing' || value === 'ready' || value === 'warning' || value === 'failed'
    ? value
    : undefined;

const getCurrentUserId = async (): Promise<string> => {
  const { data } = await supabase.auth.getUser();
  if (!data.user?.id) throw new Error('Not authenticated');
  return data.user.id;
};

const clipTypeFromRecord = (record: Record<string, any>): Clip['type'] => {
  const value = record.clip_type ?? record.media_type;
  if (value === 'image' || value === 'video' || value === 'text' || value === 'element') {
    return value;
  }
  return 'video';
};

const mapTimelineClipRecord = (record: TimelineClipRow): Clip => {
  const metadata = asRecord(record.metadata);
  const transformsMetadata = asRecord(metadata.transforms);
  const position = asRecord(transformsMetadata.position);
  const scale = asRecord(transformsMetadata.scale);
  const type = clipTypeFromRecord(record);
  const startTime = record.start_time_ms ?? 0;
  const duration = record.duration_ms ?? 0;

  return {
    id: record.id,
    mediaItemId: record.media_item_id ?? (typeof metadata.mediaItemId === 'string' ? metadata.mediaItemId : undefined),
    type,
    name: record.name ?? (typeof metadata.name === 'string' ? metadata.name : undefined) ?? (type === 'text' ? 'Text' : 'Clip'),
    url: record.source_url ?? (typeof metadata.url === 'string' ? metadata.url : ''),
    sourcePath: stringFromMetadata(metadata.sourcePath),
    playbackUrl: stringFromMetadata(metadata.playbackUrl),
    proxyUrl: stringFromMetadata(metadata.proxyUrl),
    proxyPath: stringFromMetadata(metadata.proxyPath),
    mediaStatus: mediaStatusFromMetadata(metadata.mediaStatus),
    mediaError: stringFromMetadata(metadata.mediaError),
    sourceId: record.source_id ?? (typeof metadata.sourceId === 'string' ? metadata.sourceId : null),
    text: record.text_content ?? (typeof metadata.text === 'string' ? metadata.text : undefined),
    style: asRecord(record.style ?? metadata.style) as TextClipStyle,
    effects: asArray<ClipEffect>(record.effects ?? metadata.effects),
    masks: asArray(record.masks ?? metadata.masks) as Clip['masks'],
    playbackRate: typeof metadata.playbackRate === 'number' ? metadata.playbackRate : 1,
    startTime,
    duration,
    endTime: record.end_time_ms ?? startTime + duration,
    trackIndex: record.track_index ?? record.layer_index ?? 0,
    layer: record.layer_index ?? record.track_index ?? 0,
    trimStart: record.trim_start_ms ?? undefined,
    trimEnd: record.trim_end_ms ?? undefined,
    transition: record.transition ? asRecord(record.transition) as unknown as Clip['transition'] : undefined,
    transforms: {
      position: {
        x: Number(record.position_x ?? position.x ?? 0),
        y: Number(record.position_y ?? position.y ?? 0),
      },
      scale: {
        x: Number(record.scale_x ?? scale.x ?? 1),
        y: Number(record.scale_y ?? scale.y ?? 1),
      },
      rotation: Number(record.rotation ?? transformsMetadata.rotation ?? 0),
      opacity: Number(record.opacity ?? transformsMetadata.opacity ?? 1),
    },
  };
};

const mapAudioTrackRecord = (record: AudioTrackRow): AudioTrack => {
  const metadata = asRecord(record.metadata);
  const startTime = record.start_time_ms ?? 0;
  const duration = record.duration_ms ?? 0;

  return {
    id: record.id,
    mediaItemId: record.media_item_id ?? (typeof metadata.mediaItemId === 'string' ? metadata.mediaItemId : undefined),
    type: 'audio',
    name: record.name ?? (typeof metadata.name === 'string' ? metadata.name : undefined) ?? 'Audio Track',
    url: record.storage_path ?? (typeof metadata.url === 'string' ? metadata.url : ''),
    sourcePath: stringFromMetadata(metadata.sourcePath),
    playbackUrl: stringFromMetadata(metadata.playbackUrl),
    proxyUrl: stringFromMetadata(metadata.proxyUrl),
    proxyPath: stringFromMetadata(metadata.proxyPath),
    mediaStatus: mediaStatusFromMetadata(metadata.mediaStatus),
    mediaError: stringFromMetadata(metadata.mediaError),
    sourceId: record.source_id ?? (typeof metadata.sourceId === 'string' ? metadata.sourceId : null),
    startTime,
    duration,
    endTime: record.end_time_ms ?? startTime + duration,
    trackIndex: record.track_index ?? 0,
    volume: record.volume ?? (typeof metadata.volume === 'number' ? metadata.volume : 1),
    isMuted: record.is_muted ?? (typeof metadata.isMuted === 'boolean' ? metadata.isMuted : false),
    fadeInDuration: record.fade_in_ms ?? (typeof metadata.fadeInDuration === 'number' ? metadata.fadeInDuration : 0),
    fadeOutDuration: record.fade_out_ms ?? (typeof metadata.fadeOutDuration === 'number' ? metadata.fadeOutDuration : 0),
    playbackRate: typeof metadata.playbackRate === 'number' ? metadata.playbackRate : 1,
    trimStart: numberFromMetadata(metadata.trimStart),
    trimEnd: numberFromMetadata(metadata.trimEnd),
  };
};

const mapKeyframeRecord = (record: KeyframeRow): Keyframe => ({
  id: record.id,
  targetId: record.target_id,
  targetType: record.target_type ?? 'clip',
  time: record.time_ms ?? 0,
  propertyPath: record.property_path ?? undefined,
  properties: asRecord(record.value),
  easing: record.easing ?? 'linear',
});

export const videoEditorService = {
  /**
   * Load all project media from multiple Supabase sources:
   * - media_items: uploaded/editor media
   * - project_assets: saved generation outputs from Studio
   * - generation_outputs: raw generation results
   * - final_project_assets: project-setup timeline assets (shot images/videos)
   */
  async getMediaLibrary(projectId: string): Promise<LibraryMediaItem[]> {
    // Fetch from all asset sources in parallel
    const [mediaItemsResult, projectAssetsResult, generationOutputsResult, finalAssetsResult] =
      await Promise.all([
        supabase
          .from('media_items')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('project_assets')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('generation_outputs')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
        supabase
          .from('final_project_assets')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);

    const items: LibraryMediaItem[] = [];
    const seenUrls = new Set<string>();

    // Helper to deduplicate by URL
    const addItem = (item: LibraryMediaItem) => {
      if (item.url && !seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        items.push(item);
      } else if (!item.url) {
        // Still include items without URLs (processing state)
        items.push(item);
      }
    };

    // 1. media_items (uploaded & editor media)
    if (!mediaItemsResult.error) {
      for (const record of mediaItemsResult.data ?? []) {
        if (!record) continue;
         addItem({
           id: record.id,
           projectId: record.project_id,
           mediaType: (record as any).media_type ?? 'video',
           name: record.name ?? (record as any).file_name ?? 'Untitled',
           url: (record as any).url ?? (record as any).file_url ?? null,
           sourcePath: stringFromMetadata((record as any).metadata?.sourcePath),
           playbackUrl: stringFromMetadata((record as any).metadata?.playbackUrl),
           proxyUrl: stringFromMetadata((record as any).metadata?.proxyUrl),
           proxyPath: stringFromMetadata((record as any).metadata?.proxyPath),
           mediaStatus: mediaStatusFromMetadata((record as any).metadata?.mediaStatus),
           mediaError: stringFromMetadata((record as any).metadata?.mediaError),
           durationSeconds: typeof record.duration_seconds === 'number' ? record.duration_seconds : undefined,
           sourceType: (record as any).source_type ?? 'uploaded',
           status: (record as any).status ?? 'completed',
          thumbnailUrl: record.thumbnail_url ?? undefined,
        });
      }
    } else {
      console.error('Failed to load media_items', mediaItemsResult.error);
    }

    // 2. project_assets (Studio-saved assets)
    if (!projectAssetsResult.error) {
      for (const record of projectAssetsResult.data ?? []) {
        if (!record || !record.url) continue;
        const assetType = record.type as string;
        const mediaType: 'video' | 'image' | 'audio' =
          assetType === 'video' ? 'video' :
          assetType === 'audio' ? 'audio' : 'image';
        addItem({
          id: record.id,
          projectId: record.project_id ?? projectId,
          mediaType,
          name: record.name ?? 'Project Asset',
          url: record.url,
          sourceType: 'ai-generated',
          status: 'completed',
          thumbnailUrl: record.thumbnail_url ?? (mediaType === 'image' ? record.url : undefined),
        });
      }
    } else {
      console.error('Failed to load project_assets', projectAssetsResult.error);
    }

    // 3. generation_outputs (raw AI generation results)
    if (!generationOutputsResult.error) {
      for (const record of generationOutputsResult.data ?? []) {
        if (!record || !record.output_url) continue;
        const outputType = record.output_type as string;
        const mediaType: 'video' | 'image' | 'audio' =
          outputType === 'video' ? 'video' :
          outputType === 'audio' ? 'audio' : 'image';
        addItem({
          id: record.id,
          projectId: record.project_id ?? projectId,
          mediaType,
          name: record.prompt?.slice(0, 40)
            ? `${record.prompt.slice(0, 37)}...`
            : `Generated ${mediaType}`,
          url: record.output_url,
          sourceType: 'ai-generated',
          status: 'completed',
          thumbnailUrl: record.thumbnail_url ?? (mediaType === 'image' ? record.output_url : undefined),
        });
      }
    } else {
      console.error('Failed to load generation_outputs', generationOutputsResult.error);
    }

    // 4. final_project_assets (project-setup shot images/videos)
    if (!finalAssetsResult.error) {
      for (const record of finalAssetsResult.data ?? []) {
        if (!record || !record.file_url) continue;
        const row = asRecord(record);
        const metadata = asRecord(record.metadata);
        const assetType = record.asset_type as string;
        const mediaType: 'video' | 'image' | 'audio' =
          assetType === 'video' ? 'video' :
          assetType === 'audio' ? 'audio' : 'image';
        addItem({
          id: record.id,
          projectId: record.project_id ?? projectId,
          mediaType,
          name: typeof metadata.name === 'string'
            ? metadata.name
            : typeof row.name === 'string'
              ? row.name
              : `Shot ${mediaType}`,
          url: record.file_url,
          durationSeconds: typeof record.duration_ms === 'number' ? record.duration_ms / 1000 : undefined,
          sourceType: 'ai-generated',
          status: 'completed',
          thumbnailUrl: mediaType === 'image' ? record.file_url : undefined,
        });
      }
    } else {
      console.error('Failed to load final_project_assets', finalAssetsResult.error);
    }

    return items;
  },

  async getTimelineClips(projectId: string): Promise<Clip[]> {
    const { data, error } = await db
      .from('timeline_clips')
      .select('*')
      .eq('project_id', projectId)
      .order('start_time_ms', { ascending: true })
      .order('layer_index', { ascending: true });

    if (error) {
      console.error('Failed to load timeline clips', error);
      return [];
    }

    return (data ?? []).map(mapTimelineClipRecord);
  },

  async saveTimelineClip(projectId: string, clip: Clip): Promise<void> {
    const userId = await getCurrentUserId();
    const startTime = clip.startTime ?? 0;
    const duration = clip.duration ?? 0;
    const { error } = await db.from('timeline_clips').upsert({
      id: clip.id,
      project_id: projectId,
      user_id: userId,
      media_item_id: clip.mediaItemId,
      clip_type: clip.type,
      name: clip.name,
      source_url: clip.url,
      source_id: clip.sourceId ?? null,
      text_content: clip.text ?? null,
      start_time_ms: startTime,
      duration_ms: duration,
      end_time_ms: clip.endTime ?? startTime + duration,
      track_index: clip.trackIndex ?? clip.layer ?? 0,
      layer_index: clip.layer ?? clip.trackIndex ?? 0,
      trim_start_ms: clip.trimStart,
      trim_end_ms: clip.trimEnd,
      position_x: clip.transforms.position.x,
      position_y: clip.transforms.position.y,
      scale_x: clip.transforms.scale.x,
      scale_y: clip.transforms.scale.y,
      rotation: clip.transforms.rotation,
      opacity: clip.transforms.opacity,
      transition: (clip.transition ?? null) as unknown as Json,
      effects: (clip.effects ?? []) as unknown as Json,
      style: (clip.style ?? {}) as Json,
      metadata: {
        mediaItemId: clip.mediaItemId ?? null,
        sourceId: clip.sourceId ?? null,
        url: clip.url,
        sourcePath: clip.sourcePath ?? null,
        playbackUrl: clip.playbackUrl ?? null,
        proxyUrl: clip.proxyUrl ?? null,
        proxyPath: clip.proxyPath ?? null,
        mediaStatus: clip.mediaStatus ?? null,
        mediaError: clip.mediaError ?? null,
        text: clip.text ?? null,
        masks: clip.masks ?? [],
        playbackRate: clip.playbackRate ?? 1,
      } as unknown as Json,
    });

    if (error) {
      console.error('Failed to save timeline clip', error);
      throw error;
    }
  },

  async deleteTimelineClip(clipId: string): Promise<void> {
    const { error } = await db.from('timeline_clips').delete().eq('id', clipId);
    if (error) {
      console.error('Failed to delete timeline clip', error);
      throw error;
    }
  },

  async getAudioTracks(projectId: string): Promise<AudioTrack[]> {
    const { data, error } = await db
      .from('audio_tracks')
      .select('*')
      .eq('project_id', projectId)
      .order('start_time_ms', { ascending: true })
      .order('track_index', { ascending: true });

    if (error) {
      console.error('Failed to load audio tracks', error);
      return [];
    }

    return (data ?? []).map(mapAudioTrackRecord);
  },

  async saveAudioTrack(projectId: string, track: AudioTrack): Promise<void> {
    const userId = await getCurrentUserId();
    const startTime = track.startTime ?? 0;
    const duration = track.duration ?? 0;
    const { error } = await db.from('audio_tracks').upsert({
      id: track.id,
      project_id: projectId,
      name: track.name,
      storage_path: track.url,
      start_time_ms: startTime,
      duration_ms: duration,
      end_time_ms: track.endTime ?? startTime + duration,
      volume: track.volume,
      is_muted: track.isMuted,
      track_index: track.trackIndex ?? 0,
      fade_in_ms: track.fadeInDuration ?? 0,
      fade_out_ms: track.fadeOutDuration ?? 0,
      storage_bucket: 'project-media',
      user_id: userId,
      metadata: {
        mediaItemId: track.mediaItemId ?? null,
        sourceId: track.sourceId ?? null,
        url: track.url,
        sourcePath: track.sourcePath ?? null,
        playbackUrl: track.playbackUrl ?? null,
        proxyUrl: track.proxyUrl ?? null,
        proxyPath: track.proxyPath ?? null,
        mediaStatus: track.mediaStatus ?? null,
        mediaError: track.mediaError ?? null,
        playbackRate: track.playbackRate ?? 1,
        trimStart: track.trimStart ?? null,
        trimEnd: track.trimEnd ?? null,
      } as Json,
    });

    if (error) {
      console.error('Failed to save audio track', error);
      throw error;
    }
  },

  async deleteAudioTrack(trackId: string): Promise<void> {
    const { error } = await db.from('audio_tracks').delete().eq('id', trackId);
    if (error) {
      console.error('Failed to delete audio track', error);
    }
  },

  async getComposition(projectId: string): Promise<CompositionSettings> {
    const { data, error } = await db
      .from('compositions')
      .select('*')
      .eq('project_id', projectId)
      .maybeSingle();

    if (error || !data) {
      return ensureCompositionDefaults();
    }

    const record = data as CompositionRow;
    return ensureCompositionDefaults({
      width: record.width,
      height: record.height,
      fps: record.fps,
      aspectRatio: record.aspect_ratio as CompositionSettings['aspectRatio'],
      duration: record.duration_ms,
      backgroundColor: record.background_color,
    });
  },

  async updateComposition(projectId: string, composition: Partial<CompositionSettings>): Promise<void> {
    const userId = await getCurrentUserId();
    const { error } = await db.from('compositions').upsert({
      project_id: projectId,
      user_id: userId,
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      aspect_ratio: composition.aspectRatio,
      duration_ms: composition.duration,
      background_color: composition.backgroundColor,
      metadata: {} as Json,
    });

    if (error) {
      console.error('Failed to update composition', error);
      throw error;
    }
  },

  async getTimelineClip(projectId: string, clipId: string): Promise<Clip | null> {
    const { data, error } = await db
      .from('timeline_clips')
      .select('*')
      .eq('id', clipId)
      .eq('project_id', projectId)
      .single();

    if (error || !data) {
      return null;
    }

    return mapTimelineClipRecord(data);
  },

  async getKeyframes(projectId: string): Promise<Keyframe[]> {
    const { data, error } = await db
      .from('timeline_keyframes')
      .select('*')
      .eq('project_id', projectId)
      .order('time_ms', { ascending: true });

    if (error) {
      console.error('Failed to load timeline keyframes', error);
      return [];
    }

    return (data ?? []).map(mapKeyframeRecord);
  },

  async saveKeyframe(projectId: string, keyframe: Keyframe): Promise<void> {
    const userId = await getCurrentUserId();
    const { error } = await db.from('timeline_keyframes').upsert({
      id: keyframe.id,
      project_id: projectId,
      user_id: userId,
      target_id: keyframe.targetId,
      target_type: keyframe.targetType ?? 'clip',
      time_ms: keyframe.time,
      property_path: keyframe.propertyPath ?? null,
      value: (keyframe.properties ?? {}) as Json,
      easing: keyframe.easing ?? 'linear',
      metadata: {} as Json,
    });

    if (error) {
      console.error('Failed to save keyframe', error);
      throw error;
    }
  },

  async deleteKeyframe(keyframeId: string): Promise<void> {
    const { error } = await db.from('timeline_keyframes').delete().eq('id', keyframeId);
    if (error) {
      console.error('Failed to delete keyframe', error);
      throw error;
    }
  },

  async saveAllClipsAndTracks(
    projectId: string,
    clips: Clip[],
    audioTracks: AudioTrack[]
  ): Promise<void> {
    await Promise.all([
      ...clips.map(clip => this.saveTimelineClip(projectId, clip)),
      ...audioTracks.map(track => this.saveAudioTrack(projectId, track)),
    ]);
  },

  // Additional stub methods
  mapMediaItemRecord(record: MediaItemRow): LibraryMediaItem | null {
    if (!record) return null;
    return {
      id: record.id,
      projectId: record.project_id,
      mediaType: (record as any).media_type ?? 'video',
      name: record.name ?? 'Untitled',
      url: (record as any).url ?? null,
      sourcePath: stringFromMetadata((record as any).metadata?.sourcePath),
      playbackUrl: stringFromMetadata((record as any).metadata?.playbackUrl),
      proxyUrl: stringFromMetadata((record as any).metadata?.proxyUrl),
      proxyPath: stringFromMetadata((record as any).metadata?.proxyPath),
      mediaStatus: mediaStatusFromMetadata((record as any).metadata?.mediaStatus),
      mediaError: stringFromMetadata((record as any).metadata?.mediaError),
      durationSeconds: typeof record.duration_seconds === 'number' ? record.duration_seconds : undefined,
      sourceType: (record as any).source_type ?? undefined,
      status: (record as any).status ?? undefined,
      thumbnailUrl: record.thumbnail_url ?? undefined,
    };
  },

  async getAudioTrack(projectId: string, trackId: string): Promise<AudioTrack | null> {
    const { data, error } = await db
      .from('audio_tracks')
      .select('*')
      .eq('id', trackId)
      .eq('project_id', projectId)
      .single();

    if (error || !data) {
      return null;
    }

    return mapAudioTrackRecord(data);
  },

  async getMediaItems(projectId: string): Promise<LibraryMediaItem[]> {
    return this.getMediaLibrary(projectId);
  },
};
