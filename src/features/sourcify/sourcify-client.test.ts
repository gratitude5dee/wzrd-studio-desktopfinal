import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SourcifyResult } from "./sourcify-model";

const supabaseMocks = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: { access_token: "session-token" } } })),
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: supabaseMocks.getSession },
    functions: { invoke: supabaseMocks.invoke },
  },
}));

import {
  downloadSourcifyResults,
  finalizeSourcifyResults,
  MAX_SOURCIFY_DOWNLOADS,
  runSourcifyActor,
  validateSourcifyDownloadUrl,
} from "./sourcify-client";

function result(overrides: Partial<SourcifyResult> = {}): SourcifyResult {
  return {
    id: "result-1",
    platform: "youtube",
    actorKey: "youtube-downloader",
    category: "video",
    title: "Source video",
    metrics: {},
    downloadable: true,
    runId: "run-1",
    datasetId: "dataset-1",
    actorId: "actor-1",
    topic: "source topic",
    raw: {},
    ...overrides,
  };
}

describe("Sourcify client hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens only HTTP(S) result URLs", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const outcome = downloadSourcifyResults([
      result({ id: "https", mediaUrl: "https://cdn.example/video.mp4" }),
      result({ id: "http", mediaUrl: "http://cdn.example/video.mp4" }),
      result({ id: "javascript", mediaUrl: "javascript:alert(1)" }),
      result({ id: "data", mediaUrl: "data:video/mp4;base64,AAAA" }),
      result({ id: "missing", mediaUrl: undefined, sourceUrl: undefined }),
    ]);

    expect(outcome.opened).toBe(2);
    expect(click).toHaveBeenCalledTimes(2);
    expect(outcome.issues.map((issue) => [issue.resultId, issue.code])).toEqual([
      ["javascript", "invalid_url"],
      ["data", "invalid_url"],
      ["missing", "missing_url"],
    ]);
    expect(document.body.children).toHaveLength(0);
  });

  it("surfaces expired googlevideo videoplayback URLs as a rerun prompt", () => {
    const now = 2_000_000_000_000;
    const expired = validateSourcifyDownloadUrl(
      "https://rr1---sn.example.googlevideo.com/videoplayback?expire=1999999999&id=abc",
      now,
    );
    const fresh = validateSourcifyDownloadUrl(
      "https://rr1---sn.example.googlevideo.com/videoplayback?expire=2000000001&id=abc",
      now,
    );

    expect(expired).toMatchObject({
      ok: false,
      code: "expired_url",
      message: expect.stringMatching(/Re-run the Sourcify downloader/i),
    });
    expect(fresh).toMatchObject({ ok: true });
  });

  it("keeps browser batch downloads bounded", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const selection = Array.from({ length: MAX_SOURCIFY_DOWNLOADS + 2 }, (_, index) => result({
      id: `result-${index}`,
      mediaUrl: `https://cdn.example/video-${index}.mp4`,
    }));

    const outcome = downloadSourcifyResults(selection);

    expect(outcome.opened).toBe(MAX_SOURCIFY_DOWNLOADS);
    expect(click).toHaveBeenCalledTimes(MAX_SOURCIFY_DOWNLOADS);
    expect(outcome.issues).toHaveLength(2);
    expect(outcome.issues.every((issue) => issue.code === "download_limit")).toBe(true);
  });

  it("carries top-level run/dataset provenance onto normalized run results", async () => {
    supabaseMocks.invoke.mockResolvedValueOnce({
      data: {
        runId: "run-9",
        datasetId: "dataset-9",
        status: "SUCCEEDED",
        items: [{ id: "video-9", title: "Trusted item", videoUrl: "https://cdn.example/video-9.mp4" }],
      },
      error: null,
    });

    const response = await runSourcifyActor({
      topic: "topic",
      actorKey: "youtube-downloader",
      actorInput: { startUrls: ["https://youtube.com/watch?v=video-9"] },
      settings: {},
    });

    expect(response.results[0]).toMatchObject({
      actorKey: "youtube-downloader",
      runId: "run-9",
      datasetId: "dataset-9",
    });
  });

  it("finalizes only minimal run/dataset references and never sends client media URLs", async () => {
    supabaseMocks.invoke.mockResolvedValueOnce({
      data: { success: true, assets: [], skipped: [] },
      error: null,
    });
    const selected = result({
      mediaUrl: "https://client-controlled.example/video.mp4",
      sourceUrl: "https://client-controlled.example/page",
      raw: { secretClientField: true },
    });

    await finalizeSourcifyResults({ assetCategory: "finalized", results: [selected] });

    expect(supabaseMocks.invoke).toHaveBeenCalledWith(
      "sourcify-apify",
      expect.objectContaining({
        body: {
          action: "finalize",
          projectId: undefined,
          assetCategory: "finalized",
          results: [{
            id: "result-1",
            runId: "run-1",
            datasetId: "dataset-1",
            actorKey: "youtube-downloader",
            actorId: "actor-1",
            topic: "source topic",
          }],
        },
      }),
    );
    const invokeOptions = supabaseMocks.invoke.mock.calls[0]?.[1];
    expect(JSON.stringify(invokeOptions?.body)).not.toContain("client-controlled.example");
    expect(JSON.stringify(invokeOptions?.body)).not.toContain("secretClientField");
  });

  it("rejects stale results without provenance before invoking the Edge Function", async () => {
    await expect(finalizeSourcifyResults({
      assetCategory: "upload",
      results: [result({ runId: undefined })],
    })).rejects.toThrow(/missing run\/dataset provenance/i);
    expect(supabaseMocks.invoke).not.toHaveBeenCalled();
  });
});
