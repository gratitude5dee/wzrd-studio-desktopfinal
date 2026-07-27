import { describe, expect, it } from "vitest";

import {
  buildCinemaRequest,
  buildCinemaPrompt,
  buildImageRequest,
  buildLipSyncRequest,
  buildVideoRequest,
  createDefaultCinemaSettings,
  KANVAS_STUDIO_META,
  KANVAS_STUDIO_NAV_ITEMS,
  KANVAS_STUDIO_ORDER,
  normalizeKanvasJobRow,
  normalizeKanvasJobMedia,
  normalizeKanvasAssetMedia,
  normalizeStudioParam,
} from "@/features/kanvas/helpers";
import type { Database } from "@/integrations/supabase/types";

type GenerationJobRow = any;
type GenerationJobJson = Database["public"]["Tables"]["generation_jobs"]["Row"]["config"];

function asGenerationJobJson(value: unknown): GenerationJobJson {
  return value as GenerationJobJson;
}

describe("kanvas helpers", () => {
  it("normalizes unsupported studio params to image", () => {
    expect(normalizeStudioParam("video")).toBe("video");
    expect(normalizeStudioParam("unknown")).toBe("image");
    expect(normalizeStudioParam(null)).toBe("image");
  });

  it("normalizes worldview studio param", () => {
    expect(normalizeStudioParam("worldview")).toBe("worldview");
  });

  it("exposes decision-complete studio nav metadata for every studio", () => {
    expect(KANVAS_STUDIO_NAV_ITEMS).toHaveLength(KANVAS_STUDIO_ORDER.length);
    expect(KANVAS_STUDIO_META.video).toMatchObject({
      key: "video",
      queryValue: "video",
      mediaKinds: ["image", "video"],
      supportsGeneration: true,
    });
    expect(KANVAS_STUDIO_META.worldview.supportsGeneration).toBe(false);
  });

  it("builds the cinema prompt with camera metadata", () => {
    const prompt = buildCinemaPrompt("A rainy neon alley", {
      camera: "Full-Frame Cine Digital",
      lens: "Vintage Prime",
      focalLength: 50,
      aperture: "f/1.4",
    });

    expect(prompt).toContain("A rainy neon alley");
    expect(prompt).toContain("shot on a full-frame digital cinema camera");
    expect(prompt).toContain("using a vintage prime lens at 50mm");
    expect(prompt).toContain("aperture f/1.4");
  });

  it("builds cinema requests with compatible mention references", () => {
    expect(
      buildCinemaRequest({
        modelId: "fal-ai/nano-banana-pro/edit",
        prompt: "A hero shot of @nova-pilot",
        cinema: createDefaultCinemaSettings(),
        imageIds: ["asset-image-1"],
      })
    ).toMatchObject({
      studio: "cinema",
      mode: "cinematic-image",
      assetSelections: { imageIds: ["asset-image-1"] },
    });
  });

  it("builds image studio requests based on whether references are selected", () => {
    expect(
      buildImageRequest({
        modelId: "fal-ai/nano-banana-pro",
        prompt: "Portrait",
        imageIds: [],
      })
    ).toMatchObject({
      studio: "image",
      mode: "text-to-image",
    });

    expect(
      buildImageRequest({
        modelId: "fal-ai/nano-banana-pro/edit",
        prompt: "Make it warmer",
        imageIds: ["asset-image-1"],
      })
    ).toMatchObject({
      studio: "image",
      mode: "image-to-image",
      assetSelections: { imageIds: ["asset-image-1"] },
    });
  });

  it("preserves registry reference payloads alongside asset selections", () => {
    const request = buildImageRequest({
      modelId: "fal-ai/nano-banana-pro/edit",
      prompt: "Use @nova-pilot",
      imageIds: ["asset-image-1"],
      referenceAssets: [{
        assetId: "asset-image-1",
        url: "https://cdn.example.com/nova.png",
        type: "image",
        role: "primary",
      }],
      referenceBlueprintIds: ["blueprint-1"],
      generationRole: "character_sheet",
    });

    expect(request).toMatchObject({
      referenceAssets: [{
        assetId: "asset-image-1",
        url: "https://cdn.example.com/nova.png",
        type: "image",
        role: "primary",
      }],
      referenceBlueprintIds: ["blueprint-1"],
      generationRole: "character_sheet",
    });
  });

  it("builds video and lipsync request payloads for the correct modes", () => {
    expect(
      buildVideoRequest({
        modelId: "fal-ai/sora-2/text-to-video",
        prompt: "City flythrough",
      })
    ).toMatchObject({
      studio: "video",
      mode: "text-to-video",
    });

    expect(
      buildVideoRequest({
        modelId: "fal-ai/kling-video/o3/standard/image-to-video",
        prompt: "Subtle motion",
        imageId: "asset-image-1",
      })
    ).toMatchObject({
      studio: "video",
      mode: "image-to-video",
      assetSelections: { imageId: "asset-image-1" },
    });

    expect(
      buildVideoRequest({
        modelId: "gmi/wan2.7-r2v",
        mode: "reference-to-video",
        prompt: "Use the reference identity and animate it",
        referenceAssetId: "asset-video-1",
      })
    ).toMatchObject({
      studio: "video",
      mode: "reference-to-video",
      assetSelections: { assetId: "asset-video-1" },
    });

    expect(
      buildLipSyncRequest({
        mode: "talking-head",
        modelId: "fal-ai/ltx-2.3/audio-to-video",
        prompt: "Energetic presentation",
        audioId: "asset-audio-1",
      })
    ).toMatchObject({
      studio: "lipsync",
      mode: "talking-head",
      assetSelections: { audioId: "asset-audio-1" },
    });

    expect(
      buildLipSyncRequest({
        mode: "lip-sync",
        modelId: "fal-ai/sync-lipsync/v2",
        prompt: "",
        videoId: "asset-video-1",
        audioId: "asset-audio-1",
      })
    ).toMatchObject({
      studio: "lipsync",
      mode: "lip-sync",
      assetSelections: {
        videoId: "asset-video-1",
        audioId: "asset-audio-1",
      },
    });
  });

  it("normalizes job rows into UI history records", () => {
    const cinema = createDefaultCinemaSettings();
    const row: GenerationJobRow = {
      id: "job-1",
      user_id: "user-1",
      project_id: null,
      studio: "cinema",
      model_id: "fal-ai/nano-banana-pro",
      external_request_id: "fal-1",
      job_type: "image",
      status: "completed",
      progress: 100,
      result_url: "https://cdn.example.com/frame.png",
      error_message: null,
      config: asGenerationJobJson({
        request: {
          studio: "cinema",
          mode: "cinematic-image",
          modelId: "fal-ai/nano-banana-pro",
          prompt: "A rainy neon alley",
          cinema,
        },
      }),
      input_assets: [],
      result_payload: {
        mediaType: "image",
        primaryUrl: "https://cdn.example.com/frame.png",
        previewUrl: "https://cdn.example.com/frame.png",
        outputs: [{ url: "https://cdn.example.com/frame.png" }],
        raw: { images: [{ url: "https://cdn.example.com/frame.png" }] },
      } as GenerationJobRow["result_payload"],
      created_at: "2026-03-12T10:30:00.000Z",
      started_at: "2026-03-12T10:30:01.000Z",
      completed_at: "2026-03-12T10:30:05.000Z",
      updated_at: "2026-03-12T10:30:05.000Z",
      priority: null,
      worker_id: null,
    };

    const job = normalizeKanvasJobRow(row);
    expect(job.studio).toBe("cinema");
    expect(job.resultPayload?.primaryUrl).toBe("https://cdn.example.com/frame.png");
    expect(job.inputAssets).toEqual([]);
  });

  it("normalizes media URLs from jobs and assets with thumbnail fallback", () => {
    const asset = {
      id: "asset-1",
      asset_type: "video",
      cdn_url: "https://cdn.example.com/video.mp4",
      preview_url: null,
      thumbnail_url: "https://cdn.example.com/poster.jpg",
      file_name: "video.mp4",
      original_file_name: "take-one.mp4",
    } as any;

    expect(normalizeKanvasAssetMedia(asset)).toMatchObject({
      kind: "video",
      primaryUrl: "https://cdn.example.com/video.mp4",
      previewUrl: "https://cdn.example.com/poster.jpg",
      posterUrl: "https://cdn.example.com/poster.jpg",
      alt: "take-one.mp4",
      sourceType: "asset",
      status: "ready",
    });

    const job = normalizeKanvasJobRow({
      id: "job-video-1",
      user_id: "user-1",
      project_id: null,
      studio: "video",
      model_id: "fal-ai/sora-2",
      external_request_id: null,
      job_type: "video",
      status: "completed",
      progress: 100,
      result_url: null,
      error_message: null,
      config: {},
      input_assets: [],
      result_payload: {
        mediaType: "video",
        primaryUrl: "https://cdn.example.com/out.mp4",
        thumbnailUrl: "https://cdn.example.com/out.jpg",
        outputs: [],
      },
      created_at: "2026-03-12T10:30:00.000Z",
      started_at: null,
      completed_at: null,
      updated_at: "2026-03-12T10:30:00.000Z",
    });

    expect(normalizeKanvasJobMedia(job)).toMatchObject({
      kind: "video",
      primaryUrl: "https://cdn.example.com/out.mp4",
      previewUrl: "https://cdn.example.com/out.mp4",
      posterUrl: "https://cdn.example.com/out.jpg",
      sourceType: "job",
      status: "ready",
    });
  });
});
