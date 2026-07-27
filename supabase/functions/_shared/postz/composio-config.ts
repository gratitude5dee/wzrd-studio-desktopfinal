export type ComposioConnectionStatus = "connected" | "needs_reauth" | "disabled" | "error";

export type ComposioToolkitConnection = {
  id: string | null;
  status: string | null;
  isActive: boolean;
};

export type PostzComposioProviderConfig = {
  provider: string;
  toolkit: string;
  label: string;
  logo: string;
  publishTools: {
    text?: string;
    image?: string;
    video?: string;
  };
};

export type PostzComposioProviderSummary = {
  identifier: string;
  name: string;
  toolkit: string;
  logo: string;
  configured: boolean;
  implemented: boolean;
  connectable: boolean;
  connected: boolean;
  status: ComposioConnectionStatus | "disconnected";
  connected_account_id: string | null;
  channel_id: string | null;
  source: "composio";
};

export type ComposioPostDetails = {
  id: string;
  message: string;
  settings?: Record<string, unknown> | null;
  media?: Array<{
    id?: string;
    url: string;
    type: "image" | "video";
    meta?: Record<string, unknown>;
  }>;
  poll?: unknown;
};

export type ComposioPublishRequest = {
  toolSlug: string;
  arguments: Record<string, unknown>;
};

export const DEFAULT_POSTZ_COMPOSIO_PROVIDERS: PostzComposioProviderConfig[] = [
  {
    provider: "tiktok",
    toolkit: "tiktok",
    label: "TikTok",
    logo: "https://logos.composio.dev/api/tiktok",
    publishTools: {
      image: "TIKTOK_POST_PHOTO",
      video: "TIKTOK_PUBLISH_VIDEO",
    },
  },
  {
    provider: "instagram",
    toolkit: "instagram",
    label: "Instagram",
    logo: "https://logos.composio.dev/api/instagram",
    publishTools: {
      image: "INSTAGRAM_CREATE_POST",
      video: "INSTAGRAM_CREATE_POST",
    },
  },
  {
    provider: "facebook",
    toolkit: "facebook",
    label: "Facebook Pages",
    logo: "https://logos.composio.dev/api/facebook",
    publishTools: {
      text: "FACEBOOK_CREATE_POST",
      image: "FACEBOOK_CREATE_PHOTO_POST",
      video: "FACEBOOK_CREATE_VIDEO_POST",
    },
  },
  {
    provider: "metaads",
    toolkit: "metaads",
    label: "Meta Ads",
    logo: "https://logos.composio.dev/api/metaads",
    publishTools: {},
  },
];

const DEFAULT_PROVIDER_BY_ID = new Map(
  DEFAULT_POSTZ_COMPOSIO_PROVIDERS.map((provider) => [provider.provider, provider]),
);

const DEFAULT_PROVIDER_BY_TOOLKIT = new Map(
  DEFAULT_POSTZ_COMPOSIO_PROVIDERS.map((provider) => [provider.toolkit, provider]),
);

export function listPostzComposioProviderConfigs(): PostzComposioProviderConfig[] {
  return DEFAULT_POSTZ_COMPOSIO_PROVIDERS;
}

export function getPostzComposioProviderConfig(identifier: string): PostzComposioProviderConfig | null {
  return DEFAULT_PROVIDER_BY_ID.get(identifier) ?? DEFAULT_PROVIDER_BY_TOOLKIT.get(identifier) ?? null;
}

export function mapComposioStatus(input: ComposioToolkitConnection | null | undefined): ComposioConnectionStatus | "disconnected" {
  if (!input?.id) return "disconnected";
  const raw = String(input.status ?? "").toUpperCase();
  if (input.isActive || raw === "ACTIVE") return "connected";
  if (raw === "INITIATED" || raw === "EXPIRED" || raw === "FAILED") return "needs_reauth";
  if (raw === "DISABLED" || raw === "REVOKED" || raw === "DELETED") return "disabled";
  return "error";
}

function firstVideo(details: ComposioPostDetails) {
  return details.media?.find((item) => item.type === "video" && item.url);
}

function imageUrls(details: ComposioPostDetails): string[] {
  return (details.media ?? [])
    .filter((item) => item.type === "image" && item.url)
    .map((item) => item.url);
}

function titleFrom(details: ComposioPostDetails): string {
  const settingsTitle = details.settings?.title;
  if (typeof settingsTitle === "string" && settingsTitle.trim()) return settingsTitle.trim();
  return (details.message || "WZRD post").slice(0, 140);
}

export function buildComposioPublishRequest(input: {
  provider: string;
  details: ComposioPostDetails;
  toolSlugOverride?: string | null;
}): ComposioPublishRequest {
  const config = getPostzComposioProviderConfig(input.provider);
  if (!config) {
    throw new Error(`Unsupported Composio provider: ${input.provider}`);
  }

  const video = firstVideo(input.details);
  const images = imageUrls(input.details);
  const content = input.details.message ?? "";
  const title = titleFrom(input.details);
  const selectedTool =
    input.toolSlugOverride ??
    (video ? config.publishTools.video : images.length > 0 ? config.publishTools.image : config.publishTools.text);

  if (!selectedTool) {
    throw new Error(`Composio publishing is not configured for ${config.label}.`);
  }

  if (config.provider === "tiktok") {
    if (video) {
      return {
        toolSlug: selectedTool,
        arguments: {
          title,
          caption: content,
          video_url: video.url,
          privacy_level: input.details.settings?.privacy_level ?? "SELF_ONLY",
        },
      };
    }

    if (images.length > 0) {
      return {
        toolSlug: selectedTool,
        arguments: {
          title,
          caption: content,
          image_urls: images,
        },
      };
    }
  }

  if (config.provider === "facebook") {
    if (video) {
      return {
        toolSlug: selectedTool,
        arguments: {
          message: content,
          description: content,
          video_url: video.url,
        },
      };
    }

    if (images.length > 0) {
      return {
        toolSlug: selectedTool,
        arguments: {
          caption: content,
          image_url: images[0],
          image_urls: images,
        },
      };
    }

    return {
      toolSlug: selectedTool,
      arguments: {
        message: content,
      },
    };
  }

  if (config.provider === "instagram") {
    const media = video?.url ?? images[0] ?? null;
    if (!media) {
      throw new Error("Instagram publishing requires media.");
    }

    return {
      toolSlug: selectedTool,
      arguments: {
        caption: content,
        image_url: video ? undefined : media,
        video_url: video ? media : undefined,
        media_url: media,
      },
    };
  }

  return {
    toolSlug: selectedTool,
    arguments: {
      title,
      text: content,
      media: input.details.media ?? [],
    },
  };
}
