import { createWebAdapter } from "@qcut/platform-web";
import type { PlatformAPI } from "@qcut/platform-core";

type CacheRemoteMediaOptions = Parameters<
	NonNullable<PlatformAPI["mediaImport"]["cacheRemoteMedia"]>
>[0];

type CacheRemoteMediaResult = NonNullable<
	Awaited<ReturnType<NonNullable<PlatformAPI["mediaImport"]["cacheRemoteMedia"]>>>
>;

const FFMPEG_RESOURCE_FILENAMES = new Set([
	"ffmpeg-core.js",
	"ffmpeg-core.wasm",
]);

function resolveName(options: CacheRemoteMediaOptions): string {
	if (options.name) return options.name;
	try {
		const pathname = new URL(options.url).pathname;
		const lastSegment = pathname.split("/").filter(Boolean).pop();
		if (lastSegment) return decodeURIComponent(lastSegment);
	} catch {
		// Fall through to operation id.
	}
	return options.operationId;
}

async function getAccessToken(): Promise<string | null> {
	if (typeof window === "undefined") return null;

	try {
		const { supabase } = await import("@/integrations/supabase/client");
		const {
			data: { session },
		} = await supabase.auth.getSession();
		return session?.access_token ?? null;
	} catch {
		return null;
	}
}

async function cacheRemoteMediaViaProxy(
	options: CacheRemoteMediaOptions
): Promise<CacheRemoteMediaResult | null> {
	if (typeof fetch !== "function" || typeof URL === "undefined") {
		return null;
	}

	try {
		const token = await getAccessToken();
		const params = new URLSearchParams({
			url: options.url,
			operationId: options.operationId,
		});
		const response = await fetch(`/api/media/proxy?${params.toString()}`, {
			headers: token ? { Authorization: `Bearer ${token}` } : undefined,
		});

		if (!response.ok) return null;

		const blob = await response.blob();
		const mediaUrl = URL.createObjectURL(blob);

		return {
			name: resolveName(options),
			path: mediaUrl,
			size: blob.size,
			mimeType:
				blob.type || response.headers.get("content-type") || undefined,
			mediaUrl,
		};
	} catch {
		return null;
	}
}

function safeFfmpegResourceUrl(filename: string): string {
	if (!FFMPEG_RESOURCE_FILENAMES.has(filename)) {
		throw new Error(`Unsupported FFmpeg resource: ${filename}`);
	}
	return `/ffmpeg/${filename}`;
}

async function checkSameOriginResource(url: string): Promise<boolean> {
	try {
		const response = await fetch(url, { method: "HEAD" });
		return response.ok;
	} catch {
		return false;
	}
}

export function createVercelAdapter(): PlatformAPI {
	const base = createWebAdapter();

	return {
		...base,
		platform: "web",
		isElectron: false,
		mediaImport: {
			...base.mediaImport,
			async cacheRemoteMedia(options) {
				const proxied = await cacheRemoteMediaViaProxy(options);
				if (proxied) return proxied;
				return base.mediaImport.cacheRemoteMedia?.(options) ?? null;
			},
		},
		ffmpeg: {
			...base.ffmpeg,
			async getFFmpegResourcePath(filename: string) {
				return safeFfmpegResourceUrl(filename);
			},
			async checkFFmpegResource(filename: string) {
				return checkSameOriginResource(safeFfmpegResourceUrl(filename));
			},
			async getPath() {
				return safeFfmpegResourceUrl("ffmpeg-core.js");
			},
			async exportVideoCLI() {
				return {
					success: false,
					code: "use_cloud_engine" as const,
					error:
						"Native CLI export is unavailable on web. Use CloudExportEngine instead.",
				};
			},
			async checkHealth() {
				const [coreOk, wasmOk] = await Promise.all([
					checkSameOriginResource(safeFfmpegResourceUrl("ffmpeg-core.js")),
					checkSameOriginResource(safeFfmpegResourceUrl("ffmpeg-core.wasm")),
				]);
				const errors = [
					...(coreOk ? [] : ["Missing /ffmpeg/ffmpeg-core.js"]),
					...(wasmOk ? [] : ["Missing /ffmpeg/ffmpeg-core.wasm"]),
				];
				return {
					ffmpegOk: coreOk && wasmOk,
					ffprobeOk: false,
					ffmpegVersion: "wasm",
					ffprobeVersion: "unavailable",
					ffmpegPath: safeFfmpegResourceUrl("ffmpeg-core.js"),
					ffprobePath: "",
					errors,
				};
			},
		},
	};
}
