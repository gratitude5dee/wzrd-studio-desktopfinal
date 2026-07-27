import { describe, expect, it } from "vitest";

import {
  buildComposioPublishRequest,
  getPostzComposioProviderConfig,
  mapComposioStatus,
} from "../../../supabase/functions/_shared/postz/composio-config";

describe("postz composio config", () => {
  it("maps toolkit connection state to channel status", () => {
    expect(mapComposioStatus({ id: null, status: null, isActive: false })).toBe("disconnected");
    expect(mapComposioStatus({ id: "ca_123", status: "ACTIVE", isActive: true })).toBe("connected");
    expect(mapComposioStatus({ id: "ca_123", status: "EXPIRED", isActive: false })).toBe("needs_reauth");
    expect(mapComposioStatus({ id: "ca_123", status: "REVOKED", isActive: false })).toBe("disabled");
  });

  it("selects the TikTok video publish tool and public media URL", () => {
    const request = buildComposioPublishRequest({
      provider: "tiktok",
      details: {
        id: "post-1",
        message: "Launch clip",
        settings: { title: "Launch day" },
        media: [{ id: "asset-1", type: "video", url: "https://cdn.example.com/video.mp4" }],
      },
    });

    expect(request.toolSlug).toBe("TIKTOK_PUBLISH_VIDEO");
    expect(request.arguments).toMatchObject({
      title: "Launch day",
      caption: "Launch clip",
      video_url: "https://cdn.example.com/video.mp4",
    });
  });

  it("keeps Meta Ads available for connection inventory but not publish dispatch", () => {
    expect(getPostzComposioProviderConfig("metaads")?.toolkit).toBe("metaads");
    expect(() =>
      buildComposioPublishRequest({
        provider: "metaads",
        details: { id: "post-1", message: "Budget update", media: [] },
      }),
    ).toThrow(/not configured/i);
  });
});
