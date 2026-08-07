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

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

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

function resolveProjectId(options: Record<string, unknown>): string | null {
	const value = options.projectId ?? options.project_id;
	return typeof value === "string" && value.trim() ? value.trim() : null;
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

async function queueRenderOffload(options: Record<string, unknown>) {
	const token = await getAccessToken();
	if (!token) {
		return {
			success: false,
			error: "Browser render offload requires an authenticated Supabase session.",
		};
	}

	const projectId = resolveProjectId(options);
	if (!projectId) {
		return {
			success: false,
			error: "Browser render offload requires projectId in export options.",
		};
	}

	try {
		const response = await fetch("/api/render", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				projectId,
				request: options,
				idempotencyKey:
					typeof options.sessionId === "string"
						? `ffmpeg-cli:${options.sessionId}`
						: undefined,
			}),
		});
		const body = await response.json().catch(() => null);

		if (!response.ok) {
			return {
				success: false,
				error:
					(isRecord(body) && typeof body.message === "string"
						? body.message
						: null) ?? "Unable to queue browser render offload job.",
			};
		}

		const job = isRecord(body) && isRecord(body.job) ? body.job : null;
		const jobId = typeof job?.id === "string" ? job.id : "unknown";
		const status = typeof job?.status === "string" ? job.status : "queued";
		return {
			success: false,
			error: `Browser render job ${jobId} is ${status}; async result polling is not wired into the CLI export path yet.`,
		};
	} catch (error) {
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Unable to queue browser render offload job.",
		};
	}
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
			async exportVideoCLI(options: Record<string, unknown>) {
				return queueRenderOffload(options);
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
