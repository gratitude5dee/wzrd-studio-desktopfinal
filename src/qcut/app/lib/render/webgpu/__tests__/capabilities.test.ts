import { describe, expect, it, vi } from "vitest";
import { detectWebGpuSupport } from "../capabilities";

describe("detectWebGpuSupport", () => {
  it("reports unavailable when navigator.gpu is missing", async () => {
    await expect(
      detectWebGpuSupport({ navigatorLike: {} })
    ).resolves.toMatchObject({
      supported: false,
      adapterFound: false,
      reason: "navigator_gpu_unavailable",
    });
  });

  it("detects an adapter without requesting a device by default", async () => {
    const requestAdapter = vi.fn().mockResolvedValue({
      requestDevice: vi.fn(),
    });

    await expect(
      detectWebGpuSupport({ navigatorLike: { gpu: { requestAdapter } } })
    ).resolves.toMatchObject({
      supported: true,
      adapterFound: true,
      deviceRequested: false,
      deviceAvailable: false,
    });

    expect(requestAdapter).toHaveBeenCalledWith({
      powerPreference: "high-performance",
    });
  });

  it("reports unavailable when adapter lookup rejects", async () => {
    const requestAdapter = vi.fn().mockRejectedValue(new Error("blocked"));

    await expect(
      detectWebGpuSupport({ navigatorLike: { gpu: { requestAdapter } } })
    ).resolves.toMatchObject({
      supported: false,
      adapterFound: false,
      reason: "adapter_unavailable",
    });
  });

  it("can request a device when the caller needs one", async () => {
    const requestDevice = vi.fn().mockResolvedValue({});
    const requestAdapter = vi.fn().mockResolvedValue({ requestDevice });

    await expect(
      detectWebGpuSupport({
        navigatorLike: { gpu: { requestAdapter } },
        requestDevice: true,
      })
    ).resolves.toMatchObject({
      supported: true,
      adapterFound: true,
      deviceRequested: true,
      deviceAvailable: true,
    });

    expect(requestDevice).toHaveBeenCalledTimes(1);
  });

  it("reports device errors without throwing", async () => {
    const requestAdapter = vi.fn().mockResolvedValue({
      requestDevice: vi.fn().mockRejectedValue(new Error("adapter lost")),
    });

    await expect(
      detectWebGpuSupport({
        navigatorLike: { gpu: { requestAdapter } },
        requestDevice: true,
      })
    ).resolves.toMatchObject({
      supported: false,
      adapterFound: true,
      deviceRequested: true,
      deviceAvailable: false,
      reason: "device_unavailable",
    });
  });
});
