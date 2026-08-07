import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const createThirdwebClient = vi.hoisted(() =>
  vi.fn((options: { clientId: string }) => ({ clientId: options.clientId }))
);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke,
    },
  },
}));

vi.mock("thirdweb", () => ({
  createThirdwebClient,
}));

describe("thirdweb client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    invoke.mockReset();
    createThirdwebClient.mockClear();
  });

  it("uses NEXT_PUBLIC_THIRDWEB_CLIENT_ID before the Supabase config function", async () => {
    vi.stubEnv("NEXT_PUBLIC_THIRDWEB_CLIENT_ID", "public-client-id");

    const { getThirdwebClient } = await import("../client");

    await expect(getThirdwebClient()).resolves.toEqual({
      clientId: "public-client-id",
    });
    expect(createThirdwebClient).toHaveBeenCalledWith({
      clientId: "public-client-id",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("falls back to the Supabase config function", async () => {
    invoke.mockResolvedValue({
      data: { clientId: "edge-client-id" },
      error: null,
    });

    const { getThirdwebClient } = await import("../client");

    await expect(getThirdwebClient()).resolves.toEqual({
      clientId: "edge-client-id",
    });
    expect(invoke).toHaveBeenCalledWith("get-thirdweb-config");
    expect(createThirdwebClient).toHaveBeenCalledWith({
      clientId: "edge-client-id",
    });
  });
});
