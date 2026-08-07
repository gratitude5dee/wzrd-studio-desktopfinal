import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import KanvasPage from "@/legacy-pages/KanvasPage";
import type { KanvasModel } from "@/features/kanvas/types";
import { useUserTier } from "@/hooks/useUserTier";

const baseModels: Record<string, KanvasModel[]> = {
  image: [
    {
      id: "gmi/seedream-5.0-lite",
      name: "Seedream 5 Lite",
      description: "GMI image model",
      studio: "image",
      mode: "text-to-image",
      mediaType: "image",
      workflowType: "text-to-image",
      uiGroup: "generation",
      credits: 2,
      requiresAssets: [],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "fal-ai/nano-banana-pro",
      name: "Nano Banana Pro",
      description: "Image model",
      studio: "image",
      mode: "text-to-image",
      mediaType: "image",
      workflowType: "text-to-image",
      uiGroup: "generation",
      credits: 7,
      requiresAssets: [],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "fal-ai/nano-banana-pro/edit",
      name: "Nano Banana Edit",
      description: "Edit model",
      studio: "image",
      mode: "image-to-image",
      mediaType: "image",
      workflowType: "image-edit",
      uiGroup: "advanced",
      credits: 8,
      requiresAssets: ["image"],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
  ],
  edit: [
    {
      id: "gmi/gpt-image-2",
      name: "GPT Image 2 Edit",
      description: "Non-Fal edit model",
      studio: "edit",
      mode: "image-to-image",
      mediaType: "image",
      workflowType: "image-edit",
      uiGroup: "advanced",
      credits: 5,
      requiresAssets: ["image"],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "fal-ai/nano-banana-pro/edit",
      name: "Nano Banana Edit",
      description: "Fal edit model",
      provider: "fal-ai",
      providerLabel: "Fal",
      endpointId: "fal-ai/nano-banana-pro/edit",
      studio: "edit",
      mode: "image-to-image",
      mediaType: "image",
      workflowType: "image-edit",
      uiGroup: "advanced",
      credits: 8,
      requiresAssets: ["image"],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
  ],
  video: [
    {
      id: "gmi/kling-v3-omni",
      name: "Kling V3 Omni",
      description: "GMI video model",
      studio: "video",
      mode: "text-to-video",
      mediaType: "video",
      workflowType: "text-to-video",
      uiGroup: "generation",
      credits: 28,
      requiresAssets: [],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "fal-ai/sora-2/text-to-video",
      name: "Sora 2",
      description: "Video model",
      studio: "video",
      mode: "text-to-video",
      mediaType: "video",
      workflowType: "text-to-video",
      uiGroup: "generation",
      credits: 35,
      requiresAssets: [],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "gmi/ltx-fast-i2v",
      name: "LTX Fast I2V",
      description: "GMI image to video model",
      studio: "video",
      mode: "image-to-video",
      mediaType: "video",
      workflowType: "image-to-video",
      uiGroup: "generation",
      credits: 5,
      requiresAssets: ["image"],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "fal-ai/kling-video/o3/standard/image-to-video",
      name: "Kling I2V",
      description: "Image to video model",
      studio: "video",
      mode: "image-to-video",
      mediaType: "video",
      workflowType: "image-to-video",
      uiGroup: "generation",
      credits: 24,
      requiresAssets: ["image"],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
  ],
  cinema: [
    {
      id: "gmi/seedream-5.0-lite",
      name: "Seedream 5 Lite Cinema",
      description: "GMI cinema model",
      studio: "cinema",
      mode: "cinematic-image",
      mediaType: "image",
      workflowType: "text-to-image",
      uiGroup: "generation",
      credits: 2,
      requiresAssets: [],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "fal-ai/nano-banana-pro",
      name: "Nano Banana Cinema",
      description: "Cinema model",
      studio: "cinema",
      mode: "cinematic-image",
      mediaType: "image",
      workflowType: "text-to-image",
      uiGroup: "generation",
      credits: 7,
      requiresAssets: [],
      supportsPrompt: true,
      controls: [],
      defaults: {},
      aliases: [],
    },
  ],
  lipsync: [
    {
      id: "gmi/ltx-pro-a2v",
      name: "LTX Pro Audio to Video",
      description: "GMI talking head",
      studio: "lipsync",
      mode: "talking-head",
      mediaType: "video",
      workflowType: "image-to-video",
      uiGroup: "advanced",
      credits: 12,
      requiresAssets: ["image", "audio"],
      supportsPrompt: false,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "veed/fabric-1.0",
      name: "VEED Fabric 1.0",
      description: "Talking head",
      provider: "fal-ai",
      providerLabel: "Fal",
      endpointId: "veed/fabric-1.0",
      studio: "lipsync",
      mode: "talking-head",
      mediaType: "video",
      workflowType: "image-to-video",
      uiGroup: "advanced",
      credits: 20,
      requiresAssets: ["image", "audio"],
      supportsPrompt: false,
      controls: [],
      defaults: {},
      aliases: [],
    },
    {
      id: "fal-ai/sync-lipsync/v2",
      name: "Sync Lipsync 2.0",
      description: "Video lip sync",
      studio: "lipsync",
      mode: "lip-sync",
      mediaType: "video",
      workflowType: "video-to-video",
      uiGroup: "advanced",
      credits: 20,
      requiresAssets: ["video", "audio"],
      supportsPrompt: false,
      controls: [],
      defaults: {},
      aliases: [],
    },
  ],
};

vi.mock("@/features/kanvas/service", () => ({
  fetchKanvasModels: vi.fn(async (studio: keyof typeof baseModels) => baseModels[studio] ?? []),
  listKanvasAssets: vi.fn(async () => []),
  listKanvasJobs: vi.fn(async () => []),
  refreshKanvasJobStatus: vi.fn(async () => {
    throw new Error("not used");
  }),
  submitKanvasJob: vi.fn(async () => {
    throw new Error("not used");
  }),
  uploadKanvasAsset: vi.fn(async () => {
    throw new Error("not used");
  }),
}));

vi.mock("@/components/kanvas/EditStudioSection", () => ({
  default: ({ models }: { models: KanvasModel[] }) => (
    <section>
      <h1>TRANSFORM YOUR IMAGES</h1>
      {models.map((model) => (
        <p key={model.id}>{model.name}</p>
      ))}
    </section>
  ),
}));

vi.mock("@/components/kanvas/VideoStudioSection", () => ({
  VideoStudioSection: ({
    currentModel,
    models,
  }: {
    currentModel: KanvasModel | null;
    models: KanvasModel[];
  }) => (
    <section>
      <button type="button">Create Video</button>
      <p>{currentModel?.name ?? "No model"}</p>
      {models.map((model) => (
        <span key={model.id}>{model.name}</span>
      ))}
    </section>
  ),
}));

vi.mock("@/components/kanvas/LipsyncStudioSection", () => ({
  default: ({
    currentModel,
    models,
  }: {
    currentModel: KanvasModel | null;
    models: KanvasModel[];
  }) => (
    <section>
      <button type="button">Talking Head</button>
      <p>{currentModel?.name ?? "No model"}</p>
      {models.map((model) => (
        <span key={model.id}>{model.name}</span>
      ))}
    </section>
  ),
}));

vi.mock("@/hooks/useUserTier", () => ({
  useUserTier: vi.fn(() => ({
    tier: "free",
    isFree: true,
    isPaid: false,
    defaultProvider: "gmi-cloud",
    isLoading: false,
  })),
  sortModelsForTier: (models: KanvasModel[], tier: "free" | "pro" | "enterprise") =>
    tier === "free"
      ? [...models].sort((left, right) => Number(!left.id.startsWith("gmi/")) - Number(!right.id.startsWith("gmi/")))
      : models,
}));

const mockedUseUserTier = vi.mocked(useUserTier);

function renderPage(initialEntry = "/kanvas") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/kanvas" element={<KanvasPage />} />
        <Route path="/home" element={<div>Home Destination</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("KanvasPage", () => {
  beforeEach(() => {
    mockedUseUserTier.mockReturnValue({
      tier: "free",
      isFree: true,
      isPaid: false,
      defaultProvider: "gmi-cloud",
      isLoading: false,
    });
  });

  it("renders the multi-studio shell and defaults to image", async () => {
    renderPage("/kanvas");

    expect(screen.getAllByRole("button", { name: "Home" })[0]).toBeInTheDocument();
    expect(
      await screen.findByText(/TURN IDEAS/i)
    ).toBeInTheDocument();
  });

  it("defaults free users to the Fal image model", async () => {
    renderPage("/kanvas");

    await waitFor(() => {
      expect(screen.getAllByText("Nano Banana Pro")[0]).toBeInTheDocument();
    });
  });

  it("keeps paid users on the Fal image default unless they switch", async () => {
    mockedUseUserTier.mockReturnValue({
      tier: "pro",
      isFree: false,
      isPaid: true,
      defaultProvider: "fal-ai",
      isLoading: false,
    });

    renderPage("/kanvas");

    await waitFor(() => {
      expect(screen.getAllByText("Nano Banana Pro")[0]).toBeInTheDocument();
    });
  });

  it("defaults free users to the Fal video model on the video studio route", async () => {
    renderPage("/kanvas?studio=video");

    expect(
      await screen.findByRole("button", { name: /create video/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("Sora 2")[0]).toBeInTheDocument();
    });
  });

  it("loads edit models into the edit bucket and filters it to Fal-compatible options", async () => {
    renderPage("/kanvas?studio=edit");

    expect(await screen.findByText(/TRANSFORM YOUR/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("Nano Banana Edit")[0]).toBeInTheDocument();
    });
    expect(screen.queryByText("GPT Image 2 Edit")).not.toBeInTheDocument();
  });

  it("respects the studio query param and switches studios from the shell nav", async () => {
    renderPage("/kanvas?studio=video");

    expect(
      await screen.findByRole("button", { name: /create video/i })
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getAllByRole("button", { name: /lip sync/i })[0]);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /talking head/i })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getAllByText("VEED Fabric 1.0")[0]).toBeInTheDocument();
    });
  });
});
