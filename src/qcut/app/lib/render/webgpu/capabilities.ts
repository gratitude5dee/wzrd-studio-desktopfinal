export interface WebGpuSupportInfo {
  supported: boolean;
  adapterFound: boolean;
  deviceRequested: boolean;
  deviceAvailable: boolean;
  reason?: "navigator_gpu_unavailable" | "adapter_unavailable" | "device_unavailable";
}

interface WebGpuLike {
  requestAdapter?: (options?: { powerPreference?: "high-performance" | "low-power" }) => Promise<WebGpuAdapterLike | null>;
}

interface WebGpuAdapterLike {
  requestDevice?: () => Promise<unknown>;
}

export interface WebGpuDetectionOptions {
  navigatorLike?: { gpu?: WebGpuLike };
  requestDevice?: boolean;
}

let cachedWebGpuSupport: Promise<WebGpuSupportInfo> | null = null;

async function performWebGpuDetection(
  options: WebGpuDetectionOptions
): Promise<WebGpuSupportInfo> {
  const gpu = options.navigatorLike?.gpu ?? (globalThis.navigator as { gpu?: WebGpuLike } | undefined)?.gpu;
  const requestDevice = options.requestDevice ?? false;

  if (!gpu || typeof gpu.requestAdapter !== "function") {
    return {
      supported: false,
      adapterFound: false,
      deviceRequested: requestDevice,
      deviceAvailable: false,
      reason: "navigator_gpu_unavailable",
    };
  }

  const adapter = await gpu
    .requestAdapter({ powerPreference: "high-performance" })
    .catch(() => null);
  if (!adapter) {
    return {
      supported: false,
      adapterFound: false,
      deviceRequested: requestDevice,
      deviceAvailable: false,
      reason: "adapter_unavailable",
    };
  }

  if (!requestDevice) {
    return {
      supported: true,
      adapterFound: true,
      deviceRequested: false,
      deviceAvailable: false,
    };
  }

  try {
    if (typeof adapter.requestDevice !== "function") {
      throw new Error("requestDevice unavailable");
    }
    await adapter.requestDevice();
    return {
      supported: true,
      adapterFound: true,
      deviceRequested: true,
      deviceAvailable: true,
    };
  } catch {
    return {
      supported: false,
      adapterFound: true,
      deviceRequested: true,
      deviceAvailable: false,
      reason: "device_unavailable",
    };
  }
}

export async function detectWebGpuSupport(
  options: WebGpuDetectionOptions = {}
): Promise<WebGpuSupportInfo> {
  const shouldUseCache = !options.navigatorLike && options.requestDevice !== true;
  if (!shouldUseCache) {
    return performWebGpuDetection(options);
  }

  cachedWebGpuSupport ??= performWebGpuDetection(options);
  return cachedWebGpuSupport;
}

export function resetWebGpuSupportCacheForTests() {
  cachedWebGpuSupport = null;
}
