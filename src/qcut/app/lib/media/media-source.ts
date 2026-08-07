// WZRD-EDIT (Phase 3):
// - Treat empty placeholder Files (size === 0) as "no local file".
// - Allow playback of WZRD desktop protocol media URLs (wzrd://media/...).
// - Allow Supabase CDN URLs (host derived from VITE_SUPABASE_URL).

import { SUPABASE_URL } from "@/integrations/supabase/config";

const CSP_ALLOWED_HOSTS = new Set(["fal.media", "v3.fal.media", "v3b.fal.media"]);

function getSupabaseHostAllowlist(): Set<string> {
	const allow = new Set<string>();
	try {
		if (SUPABASE_URL.length > 0) {
			allow.add(new URL(SUPABASE_URL).hostname);
		}
	} catch {
		// ignore
	}

	// Common Supabase host patterns (best-effort)
	allow.add("supabase.co");
	allow.add("supabase.in");
	return allow;
}

const SUPABASE_HOST_ALLOWLIST = getSupabaseHostAllowlist();

function isAllowedRemoteUrl(url: URL): boolean {
	if (url.protocol === "wzrd:") {
		// Custom scheme for desktop media cache.
		return true;
	}

	const hostname = url.hostname;
	if (CSP_ALLOWED_HOSTS.has(hostname)) return true;

	// Allow explicit Supabase host + broad supabase.* suffixes.
	if (SUPABASE_HOST_ALLOWLIST.has(hostname)) return true;
	if (hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.in")) return true;

	// Allow same-origin assets.
	try {
		if (typeof window !== "undefined" && hostname === window.location.hostname) {
			return true;
		}
	} catch {
		// ignore
	}

	return false;
}

export type VideoSource =
	| { file: File; type: "file" }
	| { src: string; type: "remote" }
	| null;

export function getVideoSource(mediaItem: { file?: File; url?: string }): VideoSource {
	if (mediaItem.file && mediaItem.file.size > 0) {
		return { file: mediaItem.file, type: "file" };
	}

	if (mediaItem.url) {
		try {
			const url = new URL(mediaItem.url);
			if (isAllowedRemoteUrl(url)) {
				return { src: mediaItem.url, type: "remote" };
			}
			console.warn("[media-source] Remote URL blocked by CSP whitelist", {
				protocol: url.protocol,
				hostname: url.hostname,
				url: mediaItem.url,
			});
		} catch {
			console.warn("[media-source] Invalid mediaItem.url", { url: mediaItem.url });
		}
	}

	return null;
}
