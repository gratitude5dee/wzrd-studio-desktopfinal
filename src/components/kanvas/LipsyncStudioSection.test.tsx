import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import LipsyncStudioSection from "./LipsyncStudioSection";
import type { KanvasModel } from "@/features/kanvas/types";

vi.mock("@/hooks/useUserTier", () => ({
  useUserTier: () => ({
    tier: "free",
    isFree: true,
    isPaid: false,
    defaultProvider: "gmi-cloud",
    isLoading: false,
  }),
  sortModelsForTier: (models: KanvasModel[]) => models,
}));

const model: KanvasModel = {
  id: "gmi/ltx-pro-a2v",
  name: "LTX Pro Audio to Video",
  description: "Talking head",
  studio: "lipsync",
  mode: "talking-head",
  mediaType: "video",
  workflowType: "image-to-video",
  uiGroup: "advanced",
  credits: 12,
  requiresAssets: ["image", "audio"],
  supportsPrompt: true,
  controls: [],
  defaults: {},
  aliases: [],
};

function renderSection() {
  return render(
    <LipsyncStudioSection
      prompt=""
      onPromptChange={vi.fn()}
      lipsyncMode="talking-head"
      onLipsyncModeChange={vi.fn()}
      imageId={null}
      videoId={null}
      audioId={null}
      onImageChange={vi.fn()}
      onVideoChange={vi.fn()}
      onAudioChange={vi.fn()}
      currentModel={model}
      models={[model]}
      onModelChange={vi.fn()}
      settings={{}}
      onSettingsChange={vi.fn()}
      submitting={false}
      onGenerate={vi.fn()}
      jobs={[]}
      selectedJob={null}
      assets={[]}
      uploadingImage={false}
      uploadingVideo={false}
      uploadingAudio={false}
      onUpload={vi.fn(async () => undefined)}
    />,
  );
}

describe("LipsyncStudioSection", () => {
  it("uses the Kanvas floating-stage layout instead of the old full-height wizard sidebar", async () => {
    const { container } = renderSection();

    expect(screen.queryByText(/UGC FACTORY/i)).not.toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveClass("fixed");

    const stepper = screen.getByTestId("lipsync-workflow-stepper");
    expect(within(stepper).getByRole("button", { name: /script/i })).toHaveAttribute("aria-current", "step");

    await userEvent.click(within(stepper).getByRole("button", { name: /voice/i }));

    expect(await screen.findByRole("heading", { name: /audio settings/i })).toBeInTheDocument();
    expect(within(stepper).getByRole("button", { name: /voice/i })).toHaveAttribute("aria-current", "step");
  });
});
