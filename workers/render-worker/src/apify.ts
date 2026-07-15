import { lookup } from "node:dns/promises";
import { createWriteStream } from "node:fs";
import { isIP } from "node:net";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { WorkerConfig } from "./config.js";
import { WorkerError, throwIfAborted } from "./errors.js";
import { MAX_RENDER_ASSET_BYTES, type MediaIngestManifestV1 } from "./manifest.js";
import { abortableDelay } from "./process.js";

const APIFY_TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"]);
const APIFY_ACTIVE = new Set(["READY", "RUNNING", "ABORTING", "TIMING-OUT"]);
const MAX_APIFY_JSON_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 5;

function apiHeaders(config: WorkerConfig): Record<string, string> {
	if (!config.apifyToken) {
		throw new WorkerError(
			"apify_failed",
			"APIFY_API_TOKEN is required for media ingest jobs.",
			false
		);
	}
	return { Authorization: `Bearer ${config.apifyToken}`, Accept: "application/json" };
}

async function readJson(response: Response, limit: number): Promise<unknown> {
	if (!response.body) throw new Error("Response had no body.");
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > limit) {
			await reader.cancel();
			throw new Error("JSON response exceeded the size limit.");
		}
		chunks.push(value);
	}
	const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
	return JSON.parse(bytes.toString("utf8")) as unknown;
}

async function apifyJson(
	config: WorkerConfig,
	url: URL,
	signal: AbortSignal
): Promise<unknown> {
	let response: Response;
	try {
		response = await fetch(url, {
			headers: apiHeaders(config),
			signal,
			redirect: "error",
		});
	} catch (error) {
		if (signal.aborted) throw signal.reason;
		throw new WorkerError("apify_failed", "Apify API request failed.", true, { cause: error });
	}
	if (!response.ok) {
		throw new WorkerError(
			"apify_failed",
			`Apify API returned HTTP ${response.status}.`,
			response.status === 408 || response.status === 429 || response.status >= 500
		);
	}
	try {
		return await readJson(response, MAX_APIFY_JSON_BYTES);
	} catch (error) {
		throw new WorkerError("apify_failed", "Apify API returned invalid JSON.", true, { cause: error });
	}
}

function asRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

export async function waitForApifyRun(
	config: WorkerConfig,
	manifest: MediaIngestManifestV1,
	signal: AbortSignal
): Promise<void> {
	const deadline = Date.now() + config.apifyTimeoutMs;
	const runUrl = new URL(
		`https://api.apify.com/v2/actor-runs/${encodeURIComponent(manifest.source.actorRunId)}`
	);

	while (true) {
		throwIfAborted(signal);
		const response = asRecord(await apifyJson(config, runUrl, signal));
		const data = asRecord(response?.data);
		const status = typeof data?.status === "string" ? data.status.toUpperCase() : "";
		if (!APIFY_TERMINAL.has(status) && !APIFY_ACTIVE.has(status)) {
			throw new WorkerError("apify_failed", "Apify returned an unknown actor run status.", true);
		}
		if (APIFY_TERMINAL.has(status)) {
			if (status !== "SUCCEEDED") {
				throw new WorkerError("apify_failed", `Apify actor run ended with ${status}.`, false);
			}
			if (data?.defaultDatasetId !== manifest.source.datasetId) {
				throw new WorkerError(
					"apify_failed",
					"Apify actor run dataset does not match the trusted ingest manifest.",
					false
				);
			}
			return;
		}
		if (Date.now() >= deadline) {
			throw new WorkerError("apify_timeout", "Timed out waiting for the Apify actor run.", true);
		}
		await abortableDelay(config.apifyPollMs, signal);
	}
}

function itemMatches(item: Record<string, unknown>, itemId: string): boolean {
	return [item.id, item._id, item.itemId, item.item_id].some(
		(value) => typeof value === "string" && value === itemId
	);
}

function mediaUrlFromItem(item: Record<string, unknown>): string | null {
	for (const field of ["downloadUrl", "download_url", "videoUrl", "video_url", "mediaUrl", "media_url", "url"]) {
		if (typeof item[field] === "string") return item[field] as string;
	}
	for (const containerName of ["video", "media", "file"]) {
		const container = asRecord(item[containerName]);
		if (!container) continue;
		for (const field of ["downloadUrl", "download_url", "url"]) {
			if (typeof container[field] === "string") return container[field] as string;
		}
	}
	return null;
}

export async function getApifyMediaUrl(
	config: WorkerConfig,
	manifest: MediaIngestManifestV1,
	signal: AbortSignal
): Promise<URL> {
	const itemsUrl = new URL(
		`https://api.apify.com/v2/datasets/${encodeURIComponent(manifest.source.datasetId)}/items`
	);
	itemsUrl.searchParams.set("clean", "true");
	itemsUrl.searchParams.set("format", "json");
	const numericIndex = /^\d+$/.test(manifest.source.itemId)
		? Number(manifest.source.itemId)
		: null;
	if (numericIndex !== null && Number.isSafeInteger(numericIndex)) {
		itemsUrl.searchParams.set("offset", String(numericIndex));
		itemsUrl.searchParams.set("limit", "1");
	} else {
		itemsUrl.searchParams.set("limit", "1000");
	}
	const response = await apifyJson(config, itemsUrl, signal);
	if (!Array.isArray(response)) {
		throw new WorkerError("apify_item_missing", "Apify dataset did not return an item list.", false);
	}
	const items = response
		.map(asRecord)
		.filter((item): item is Record<string, unknown> => item !== null);
	const item = numericIndex !== null ? items[0] : items.find((candidate) => itemMatches(candidate, manifest.source.itemId));
	if (!item) {
		throw new WorkerError("apify_item_missing", "The requested Apify dataset item was not found.", false);
	}
	const candidate = mediaUrlFromItem(item);
	if (!candidate) {
		throw new WorkerError("apify_item_missing", "The Apify dataset item has no supported media URL.", false);
	}
	let url: URL;
	try {
		url = new URL(candidate);
	} catch (error) {
		throw new WorkerError("unsafe_media_url", "Apify returned an invalid media URL.", false, {
			cause: error,
		});
	}
	await validateMediaUrl(config, url);
	return url;
}

function hostAllowed(config: WorkerConfig, hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return config.apifyMediaHostAllowlist.some((entry) => {
		if (entry.startsWith(".")) {
			return normalized.endsWith(entry) && normalized.length > entry.length;
		}
		return normalized === entry;
	});
}

function privateAddress(address: string): boolean {
	if (address === "::1" || address === "0:0:0:0:0:0:0:1") return true;
	if (address.includes(":")) {
		const lower = address.toLowerCase();
		return lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb");
	}
	const parts = address.split(".").map(Number);
	const first = parts[0] ?? -1;
	const second = parts[1] ?? -1;
	return (
		first === 0 ||
		first === 10 ||
		first === 127 ||
		(first === 169 && second === 254) ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && second === 168) ||
		first >= 224
	);
}

async function validateMediaUrl(config: WorkerConfig, url: URL): Promise<void> {
	if (
		url.protocol !== "https:" ||
		url.username !== "" ||
		url.password !== "" ||
		(url.port !== "" && url.port !== "443") ||
		!hostAllowed(config, url.hostname)
	) {
		throw new WorkerError("unsafe_media_url", "Apify media URL host is not allowlisted.", false);
	}
	if (isIP(url.hostname) && privateAddress(url.hostname)) {
		throw new WorkerError("unsafe_media_url", "Apify media URL resolved to a private address.", false);
	}
	let addresses: Array<{ address: string; family: number }>;
	try {
		addresses = await lookup(url.hostname, { all: true, verbatim: true });
	} catch (error) {
		throw new WorkerError("apify_failed", "Unable to resolve the Apify media host.", true, {
			cause: error,
		});
	}
	if (addresses.length === 0 || addresses.some((entry) => privateAddress(entry.address))) {
		throw new WorkerError("unsafe_media_url", "Apify media URL resolved to a private address.", false);
	}
}

async function fetchMedia(
	config: WorkerConfig,
	initialUrl: URL,
	signal: AbortSignal
): Promise<Response> {
	let url = initialUrl;
	for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
		await validateMediaUrl(config, url);
		let response: Response;
		try {
			response = await fetch(url, { signal, redirect: "manual" });
		} catch (error) {
			if (signal.aborted) throw signal.reason;
			throw new WorkerError("apify_failed", "Unable to download Apify media.", true, {
				cause: error,
			});
		}
		if (response.status >= 300 && response.status < 400) {
			const location = response.headers.get("location");
			if (!location || redirect === MAX_REDIRECTS) {
				throw new WorkerError("unsafe_media_url", "Apify media had an invalid redirect chain.", false);
			}
			url = new URL(location, url);
			continue;
		}
		if (!response.ok || !response.body) {
			throw new WorkerError(
				"apify_failed",
				`Apify media download returned HTTP ${response.status}.`,
				response.status === 408 || response.status === 429 || response.status >= 500
			);
		}
		return response;
	}
	throw new WorkerError("unsafe_media_url", "Apify media exceeded the redirect limit.", false);
}

export async function downloadApifyMedia(
	config: WorkerConfig,
	url: URL,
	directory: string,
	signal: AbortSignal
): Promise<{ filePath: string; bytes: number }> {
	throwIfAborted(signal);
	const response = await fetchMedia(config, url, signal);
	const declaredBytes = Number(response.headers.get("content-length"));
	if (Number.isFinite(declaredBytes) && declaredBytes > MAX_RENDER_ASSET_BYTES) {
		await response.body?.cancel();
		throw new WorkerError("asset_too_large", "Ingest media cannot exceed 2 GB.", false);
	}
	const filePath = join(directory, "ingest.mp4");
	let received = 0;
	const limiter = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			received += chunk.length;
			if (received > MAX_RENDER_ASSET_BYTES) {
				callback(new Error("Ingest media exceeded 2 GB."));
				return;
			}
			callback(null, chunk);
		},
	});
	try {
		await pipeline(
			Readable.fromWeb(response.body!),
			limiter,
			createWriteStream(filePath, { flags: "wx", mode: 0o600 }),
			{ signal }
		);
	} catch (error) {
		if (signal.aborted) throw signal.reason;
		throw new WorkerError("apify_failed", "Unable to save Apify media.", true, { cause: error });
	}
	if (received < 1 || (Number.isFinite(declaredBytes) && received !== declaredBytes)) {
		throw new WorkerError("apify_failed", "Apify media transfer was incomplete.", true);
	}
	return { filePath, bytes: received };
}
