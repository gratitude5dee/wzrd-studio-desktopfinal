import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { HTMLAttributes } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SourcifyPlan } from "@/features/sourcify/sourcify-model";
import Sourcify from "./Sourcify";

const sourcifyClientMocks = vi.hoisted(() => ({
  planSourcifyTopic: vi.fn(),
  runSourcifyActor: vi.fn(),
  finalizeSourcifyResults: vi.fn(),
  downloadSourcifyResults: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    main: ({
      children,
      animate: _animate,
      initial: _initial,
      transition: _transition,
      ...props
    }: HTMLAttributes<HTMLElement> & { animate?: unknown; initial?: unknown; transition?: unknown }) => (
      <main {...props}>{children}</main>
    ),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("@/components/home/Sidebar", () => ({
  Sidebar: () => <aside data-testid="sidebar" />,
}));

vi.mock("@/components/home/MobileBottomNav", () => ({
  MobileBottomNav: () => <nav data-testid="mobile-bottom-nav" />,
}));

vi.mock("@/contexts/SidebarContext", () => ({
  useSidebar: () => ({ isCollapsed: false }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/features/sourcify/sourcify-client", () => sourcifyClientMocks);

const duplicateActorPlan: SourcifyPlan = {
  id: "plan-1",
  topic: "find creator references for two brands",
  planner: "codex",
  assistantMessage: "I split this into two source targets.",
  metaprompt: "test",
  settings: {
    maxItems: 10,
    maxTotalChargeUsd: 2,
    waitForFinishSecs: 10,
    includeDownloadableOnly: false,
  },
  createdAt: "2026-06-03T00:00:00.000Z",
  actors: [
    {
      id: "target-a:youtube-fast",
      targetId: "target-a",
      key: "youtube-fast",
      label: "YouTube Fast",
      platform: "youtube",
      actorId: "actor-youtube",
      confidence: 0.9,
      query: "brand A creator clips",
      input: { startUrls: ["https://www.youtube.com/results?search_query=brand%20A"] },
      configured: true,
      reason: "Find YouTube creator clips for brand A.",
    },
    {
      id: "target-b:youtube-fast",
      targetId: "target-b",
      key: "youtube-fast",
      label: "YouTube Fast",
      platform: "youtube",
      actorId: "actor-youtube",
      confidence: 0.9,
      query: "brand B creator clips",
      input: { startUrls: ["https://www.youtube.com/results?search_query=brand%20B"] },
      configured: true,
      reason: "Find YouTube creator clips for brand B.",
    },
  ],
  targets: [
    {
      id: "target-a",
      label: "Brand A",
      query: "brand A creator clips",
      rationale: "First Codex target.",
      actors: [],
    },
    {
      id: "target-b",
      label: "Brand B",
      query: "brand B creator clips",
      rationale: "Second Codex target.",
      actors: [],
    },
  ],
};

duplicateActorPlan.targets = [
  { ...duplicateActorPlan.targets![0], actors: [duplicateActorPlan.actors[0]] },
  { ...duplicateActorPlan.targets![1], actors: [duplicateActorPlan.actors[1]] },
];

describe("Sourcify page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sourcifyClientMocks.planSourcifyTopic.mockResolvedValue(duplicateActorPlan);
    sourcifyClientMocks.runSourcifyActor.mockResolvedValue({ results: [] });
  });

  it("selects duplicate actor keys independently across Codex targets", async () => {
    render(
      <MemoryRouter>
        <Sourcify />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Plan sources/i }));

    expect(await screen.findByText("Brand A")).toBeInTheDocument();
    expect(screen.getByText("Brand B")).toBeInTheDocument();
    expect(screen.getByText("2/2 selected")).toBeInTheDocument();

    const youtubeButtons = screen.getAllByRole("button", { name: /YouTube Fast/i });
    fireEvent.click(youtubeButtons[0]);

    expect(screen.getByText("1/2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Run selected scrapes/i }));

    await waitFor(() => expect(sourcifyClientMocks.runSourcifyActor).toHaveBeenCalledTimes(1));
    expect(sourcifyClientMocks.runSourcifyActor).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "brand B creator clips",
        actorKey: "youtube-fast",
      }),
    );
  });

  it("renders download states for fetchable, downloadable, and metadata-only results", async () => {
    sourcifyClientMocks.runSourcifyActor.mockResolvedValue({
      results: [
        {
          id: "result-embed",
          platform: "youtube",
          category: "video",
          title: "Embed video without media",
          sourceUrl: "https://www.youtube.com/embed/abc123",
          metrics: {},
          downloadable: false,
        },
        {
          id: "result-media",
          platform: "instagram",
          category: "reel",
          title: "Reel with indirect media url",
          sourceUrl: "https://www.instagram.com/reel/xyz/",
          mediaUrl: "https://media.example.com/download?id=xyz",
          metrics: {},
          downloadable: true,
        },
        {
          id: "result-metadata",
          platform: "twitch",
          category: "metadata",
          title: "Profile metadata only",
          sourceUrl: "https://www.twitch.tv/somechannel",
          metrics: {},
          downloadable: false,
        },
      ],
    });

    render(
      <MemoryRouter>
        <Sourcify />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Plan sources/i }));
    expect(await screen.findByText("Brand A")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Run selected scrapes/i }));

    expect(await screen.findByText("Embed video without media")).toBeInTheDocument();

    // The embed result has no media, and the reel's media link is not a direct file,
    // so both keep a Fetch MP4 option; the reel also gets Download MP4 for its media link.
    expect(screen.getAllByRole("button", { name: /^Fetch MP4$/i })).toHaveLength(2);
    expect(screen.getByRole("button", { name: /^Download MP4$/i })).toBeInTheDocument();
    expect(screen.getByText(/Metadata only — no downloadable video/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Download MP4$/i }));
    expect(sourcifyClientMocks.downloadSourcifyResults).toHaveBeenCalledWith([
      expect.objectContaining({ id: "result-media" }),
    ]);
  });
});
