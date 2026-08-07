/**
 * FFmpeg WASM Resource URL Resolution
 *
 * Resolves FFmpeg WebAssembly resource URLs with multiple fallback strategies
 * for different environments (Electron app://, HTTP dev, relative paths).
 */

import {
	isFfmpegWasmAsset,
	resolveFfmpegWasmAssetUrl,
} from "@/lib/ffmpeg-web";
import { isElectron } from "./environment";

async function canFetchResource(
	url: string,
	init?: RequestInit
): Promise<boolean> {
	try {
		const response =
			init === undefined ? await fetch(url) : await fetch(url, init);
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Resolves FFmpeg WebAssembly resource URLs with fallback strategies
 * Tries app:// protocol first, then falls back to HTTP and relative paths
 */
export const getFFmpegResourceUrl = async (
	filename: string
): Promise<string> => {
	if (!isFfmpegWasmAsset(filename)) {
		throw new Error(`Unsupported FFmpeg resource: ${filename}`);
	}

	// Try app:// protocol only for the desktop runtime.
	if (isElectron()) {
		const appUrl = `app://ffmpeg/${filename}`;
		if (await canFetchResource(appUrl)) {
			console.log(`[FFmpeg Utils] ✅ App protocol succeeded for ${filename}`);
			return appUrl;
		}
		console.warn(
			`[FFmpeg Utils] ⚠️ App protocol unavailable for ${filename}, falling back`
		);
	}

	// Packaged desktop builds may load from file:// and need a relative path.
	if (typeof window !== "undefined" && window.location.protocol === "file:") {
		const relativeFileUrl = `./ffmpeg/${filename}`;
		if (await canFetchResource(relativeFileUrl)) {
			console.log(`[FFmpeg Utils] ✅ File fallback succeeded for ${filename}`);
			return relativeFileUrl;
		}
	}

	// Web/Next/Vercel path: same-origin public assets.
	const sameOriginUrl = resolveFfmpegWasmAssetUrl(filename);
	if (await canFetchResource(sameOriginUrl, { method: "HEAD" })) {
		console.log(
			`[FFmpeg Utils] ✅ Same-origin fallback succeeded for ${filename}`
		);
		return sameOriginUrl;
	}

	throw new Error(`Could not resolve FFmpeg resource: ${filename}`);
};
