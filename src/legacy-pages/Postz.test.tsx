import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HTMLAttributes, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PostzChannel, PostzPost } from "@/types/postz";

import Postz from "./Postz";

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

vi.mock("@/components/home/Sidebar", () => ({
  Sidebar: () => <aside data-testid="sidebar" />,
}));

vi.mock("@/components/home/MobileBottomNav", () => ({
  MobileBottomNav: () => <nav data-testid="mobile-bottom-nav" />,
}));

vi.mock("@/components/layout/AppShell", () => ({
  default: ({ activeView, children }: { activeView: string; children: ReactNode }) => (
    <div data-testid="app-shell" data-active-view={activeView}>
      {children}
    </div>
  ),
}));

vi.mock("@/contexts/SidebarContext", () => ({
  APP_SIDEBAR_EXPANDED_WIDTH: 256,
  APP_SIDEBAR_COLLAPSED_WIDTH: 64,
  useSidebar: () => ({ isCollapsed: false }),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/hooks/useAssets", () => ({
  useAssets: () => ({
    isLoading: false,
    data: [],
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const postzMocks = vi.hoisted(() => {
  const state = {
    channels: [] as PostzChannel[],
    posts: [] as PostzPost[],
  };

  const mockListChannels = vi.fn(async () => state.channels);

  const mockSeedChannels = vi.fn(async () => {
    state.channels = [
      {
        id: "ch-youtube",
        owner_id: "user-1",
        workspace_id: null,
        provider: "youtube",
        provider_account_id: "acc-youtube",
        name: "YouTube (demo)",
        username: "@demo",
        picture: null,
        profile: null,
        token_expires_at: null,
        status: "connected",
        disabled: false,
        posting_times: [{ time: 120 }],
        additional_settings: [],
        custom_instance_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      {
        id: "ch-tiktok",
        owner_id: "user-1",
        workspace_id: null,
        provider: "tiktok",
        provider_account_id: "acc-tiktok",
        name: "TikTok (demo)",
        username: "@demo",
        picture: null,
        profile: null,
        token_expires_at: null,
        status: "connected",
        disabled: false,
        posting_times: [{ time: 120 }],
        additional_settings: [],
        custom_instance_url: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
    ];
    return state.channels;
  });

  const mockListPostsWindow = vi.fn(async () => state.posts);
  const mockListOauthProviders = vi.fn(async () => [
    { identifier: "tiktok", name: "TikTok", configured: true, implemented: true, connectable: true },
    { identifier: "youtube", name: "YouTube", configured: false, implemented: true, connectable: false },
    { identifier: "threads", name: "Threads", configured: false, implemented: false, connectable: false },
  ]);

  const mockCreateGroup = vi.fn(async ({ group }: any) => {
    const groupId = `group-${state.posts.length + 1}`;
    const nowIso = group.publish_date;
    const created: PostzPost[] = group.channels.map((channel: any, idx: number) => ({
      id: `${groupId}-post-${idx}`,
      owner_id: "user-1",
      channel_id: channel.channel_id,
      group_id: groupId,
      state: group.state,
      publish_date: nowIso,
      content: channel.content,
      title: channel.title ?? null,
      description: channel.description ?? null,
      settings: channel.settings ?? null,
      media: channel.media ?? [],
      poll: null,
      parent_post_id: null,
      first_comment: null,
      release_url: null,
      release_provider_id: null,
      error: null,
      attempts: 0,
      interval_in_days: null,
      creation_method: "ui",
      created_at: nowIso,
      updated_at: nowIso,
      deleted_at: null,
    }));

    state.posts = [...state.posts, ...created];
    return { group_id: groupId, posts: created };
  });

  const mockValidateGroup = vi.fn(async ({ group }: any) => ({
    per_channel: group.channels.map((ch: any) => ({ channel_id: ch.channel_id, issues: [] })),
  }));

  const mockUpdateGroup = vi.fn(async ({ group_id }: any) => ({ group_id, posts: [] }));
  const mockUpdateGroupDate = vi.fn(async () => ({ success: true }));
  const mockDeleteGroup = vi.fn(async () => ({ success: true }));
  const mockPostNow = vi.fn(async ({ group_id }: any) => {
    state.posts = state.posts.map((post) =>
      post.group_id === group_id
        ? { ...post, state: "PUBLISHED", release_url: "https://example.com/live" }
        : post,
    );
    return { success: true, results: [] };
  });
  const mockGetGroup = vi.fn(async ({ group_id }: any) => ({
    group_id,
    posts: state.posts.filter((p) => p.group_id === group_id),
  }));
  const mockFindSlot = vi.fn(async () => ({ publish_date: new Date().toISOString() }));

  return {
    state,
    mockListChannels,
    mockSeedChannels,
    mockListOauthProviders,
    mockListPostsWindow,
    mockCreateGroup,
    mockValidateGroup,
    mockUpdateGroup,
    mockUpdateGroupDate,
    mockDeleteGroup,
    mockPostNow,
    mockGetGroup,
    mockFindSlot,
  };
});

vi.mock("@/services/postzService", async () => {
  const actual = await vi.importActual<any>("@/services/postzService");
  return {
    ...actual,
    postzService: {
      listChannels: postzMocks.mockListChannels,
      seedChannels: postzMocks.mockSeedChannels,
      listOauthProviders: postzMocks.mockListOauthProviders,
      listPostsWindow: postzMocks.mockListPostsWindow,
      createGroup: postzMocks.mockCreateGroup,
      updateGroup: postzMocks.mockUpdateGroup,
      updateGroupDate: postzMocks.mockUpdateGroupDate,
      deleteGroup: postzMocks.mockDeleteGroup,
      postNow: postzMocks.mockPostNow,
      validateGroup: postzMocks.mockValidateGroup,
      getGroup: postzMocks.mockGetGroup,
      findSlot: postzMocks.mockFindSlot,
    },
  };
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Postz />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  postzMocks.state.channels = [];
  postzMocks.state.posts = [];
  vi.clearAllMocks();
});

describe("Postz page", () => {
  it("renders empty state and can seed demo channels", async () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Postz" })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("No channels yet.")).toBeInTheDocument();
    });

    const seedBtn = screen.getByRole("button", { name: "Create demo channels" });
    await userEvent.click(seedBtn);

    await waitFor(() => {
      expect(postzMocks.mockSeedChannels).toHaveBeenCalled();
      expect(screen.getByText("YouTube (demo)")).toBeInTheDocument();
    });
  });

  it("can create a multi-channel draft and render it on the calendar", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No channels yet.")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Create demo channels" }));

    await waitFor(() => {
      expect(screen.getByText("YouTube (demo)")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "New post" }));

    const message = await screen.findByPlaceholderText("Write once, tailor per channel…");
    await userEvent.type(message, "Hello from Postz");

    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(postzMocks.mockCreateGroup).toHaveBeenCalled();
      expect(screen.getAllByText("Hello from Postz").length).toBeGreaterThan(0);
    });
  });

  it("shows provider availability honestly in the add-channel flow", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No channels yet.")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Add channel" }));

    await waitFor(() => {
      expect(postzMocks.mockListOauthProviders).toHaveBeenCalled();
      expect(screen.getByText("Ready")).toBeInTheDocument();
      expect(screen.getByText("Admin setup required")).toBeInTheDocument();
      expect(screen.getByText("Coming soon")).toBeInTheDocument();
    });
  });

  it("can publish a saved group immediately", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("No channels yet.")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "Create demo channels" }));
    await waitFor(() => {
      expect(screen.getByText("YouTube (demo)")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("button", { name: "New post" }));
    const message = await screen.findByPlaceholderText("Write once, tailor per channel…");
    await userEvent.type(message, "Publish this now");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(screen.getAllByText("Publish this now").length).toBeGreaterThan(0);
    });

    await userEvent.click(screen.getAllByText("Publish this now")[0]);
    await userEvent.click(await screen.findByRole("button", { name: "Post now" }));

    await waitFor(() => {
      expect(postzMocks.mockPostNow).toHaveBeenCalledWith({ group_id: "group-1" });
    });
  });
});
