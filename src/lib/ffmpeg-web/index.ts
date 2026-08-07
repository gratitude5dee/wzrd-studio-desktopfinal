const FFMPEG_WASM_ASSETS = ["ffmpeg-core.js", "ffmpeg-core.wasm"] as const;

export type FfmpegWasmAsset = (typeof FFMPEG_WASM_ASSETS)[number];

export interface FfmpegWasmFallbackState {
	available: boolean;
	coreUrl: string;
	wasmUrl: string;
	reason?: string;
}

export interface FfmpegWasmFallbackOptions {
	basePath?: string;
	requireCrossOriginIsolation?: boolean;
	fetchImpl?: typeof fetch;
}

const allowedAssets = new Set<string>(FFMPEG_WASM_ASSETS);

export function isFfmpegWasmAsset(filename: string): filename is FfmpegWasmAsset {
	return allowedAssets.has(filename);
}

export function resolveFfmpegWasmAssetUrl(
	filename: string,
	basePath = "/ffmpeg"
): string {
	if (!isFfmpegWasmAsset(filename)) {
		throw new Error(`Unsupported FFmpeg wasm asset: ${filename}`);
	}

	const normalizedBase = basePath.replace(/\/+$/, "") || "/ffmpeg";
	return `${normalizedBase}/${filename}`;
}

async function checkAsset(url: string, fetchImpl: typeof fetch): Promise<boolean> {
	try {
		const response = await fetchImpl(url, { method: "HEAD" });
		return response.ok;
	} catch {
		return false;
	}
}

export async function getFfmpegWasmFallbackState(
	options: FfmpegWasmFallbackOptions = {}
): Promise<FfmpegWasmFallbackState> {
	const {
		basePath = "/ffmpeg",
		requireCrossOriginIsolation = true,
		fetchImpl = globalThis.fetch,
	} = options;

	const coreUrl = resolveFfmpegWasmAssetUrl("ffmpeg-core.js", basePath);
	const wasmUrl = resolveFfmpegWasmAssetUrl("ffmpeg-core.wasm", basePath);

	if (typeof window === "undefined") {
		return { available: false, coreUrl, wasmUrl, reason: "browser_required" };
	}

	if (typeof fetchImpl !== "function") {
		return { available: false, coreUrl, wasmUrl, reason: "fetch_unavailable" };
	}

	if (typeof Worker === "undefined") {
		return { available: false, coreUrl, wasmUrl, reason: "worker_unavailable" };
	}

	if (requireCrossOriginIsolation && globalThis.crossOriginIsolated !== true) {
		return {
			available: false,
			coreUrl,
			wasmUrl,
			reason: "cross_origin_isolation_required",
		};
	}

	const [coreOk, wasmOk] = await Promise.all([
		checkAsset(coreUrl, fetchImpl),
		checkAsset(wasmUrl, fetchImpl),
	]);

	if (!coreOk || !wasmOk) {
		return {
			available: false,
			coreUrl,
			wasmUrl,
			reason: !coreOk ? "missing_core_asset" : "missing_wasm_asset",
		};
	}

	return { available: true, coreUrl, wasmUrl };
}

export async function isFfmpegWasmFallbackAvailable(
	options?: FfmpegWasmFallbackOptions
): Promise<boolean> {
	const state = await getFfmpegWasmFallbackState(options);
	return state.available;
}
