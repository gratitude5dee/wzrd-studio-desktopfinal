import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import type { WorkerConfig } from "./config.js";
import { WorkerError, throwIfAborted } from "./errors.js";
import {
	MAX_RENDER_ASSET_BYTES,
	type RenderAssetRef,
} from "./manifest.js";
import type { WorkerSupabaseClient } from "./supabase.js";

function encodedObjectPath(path: string): string {
	return path.split("/").map(encodeURIComponent).join("/");
}

function safeExtension(path: string): string {
	const extension = extname(basename(path)).toLowerCase();
	return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : ".bin";
}

function ownerMatches(path: string, userId: string): boolean {
	return path.split("/")[0] === userId;
}

export async function verifyAsset(
	client: WorkerSupabaseClient,
	asset: RenderAssetRef,
	userId: string
): Promise<number> {
	if (asset.bucket !== "project-assets" || !ownerMatches(asset.path, userId)) {
		throw new WorkerError(
			"asset_not_owned",
			"Every render asset must be in the job owner's project-assets folder.",
			false
		);
	}
	let result: Awaited<ReturnType<ReturnType<typeof client.storage.from>["info"]>>;
	try {
		result = await client.storage.from(asset.bucket).info(asset.path);
	} catch (error) {
		throw new WorkerError("asset_download_failed", "Unable to verify a render asset.", true, {
			cause: error,
		});
	}
	if (result.error || !result.data) {
		const notFound =
			Number(result.error?.status ?? result.error?.statusCode) === 404 ||
			/not found/i.test(result.error?.message ?? "");
		throw new WorkerError(
			notFound ? "asset_not_found" : "asset_download_failed",
			notFound ? `Render asset was not found: ${asset.path}.` : "Unable to verify a render asset.",
			!notFound
		);
	}
	const size = Number(result.data.size);
	if (!Number.isSafeInteger(size) || size < 0) {
		throw new WorkerError("asset_download_failed", "Render asset metadata has an invalid size.", true);
	}
	if (size > MAX_RENDER_ASSET_BYTES) {
		throw new WorkerError("asset_too_large", "Render assets cannot exceed 2 GB.", false);
	}
	return size;
}

export async function downloadAsset(
	config: WorkerConfig,
	asset: RenderAssetRef,
	expectedBytes: number,
	index: number,
	directory: string,
	signal: AbortSignal
): Promise<{ filePath: string; bytes: number }> {
	throwIfAborted(signal);
	const url = `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(asset.bucket)}/${encodedObjectPath(asset.path)}`;
	let response: Response;
	try {
		response = await fetch(url, {
			headers: {
				apikey: config.supabaseServiceRoleKey,
				Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
			},
			signal,
			redirect: "error",
		});
	} catch (error) {
		if (signal.aborted) throw signal.reason;
		throw new WorkerError("asset_download_failed", "Unable to download a render asset.", true, {
			cause: error,
		});
	}
	if (!response.ok || !response.body) {
		throw new WorkerError(
			response.status === 404 ? "asset_not_found" : "asset_download_failed",
			response.status === 404
				? `Render asset was not found: ${asset.path}.`
				: `Render asset download failed with HTTP ${response.status}.`,
			response.status !== 404
		);
	}
	const contentLength = Number(response.headers.get("content-length"));
	if (Number.isFinite(contentLength) && contentLength > MAX_RENDER_ASSET_BYTES) {
		await response.body.cancel();
		throw new WorkerError("asset_too_large", "Render assets cannot exceed 2 GB.", false);
	}

	const filePath = join(directory, `asset-${index}${safeExtension(asset.path)}`);
	let received = 0;
	const limiter = new Transform({
		transform(chunk: Buffer, _encoding, callback) {
			received += chunk.length;
			if (received > MAX_RENDER_ASSET_BYTES || received > expectedBytes) {
				callback(new Error("Render asset exceeded its verified size."));
				return;
			}
			callback(null, chunk);
		},
	});
	try {
		await pipeline(
			Readable.fromWeb(response.body),
			limiter,
			createWriteStream(filePath, { flags: "wx", mode: 0o600 }),
			{ signal }
		);
	} catch (error) {
		if (signal.aborted) throw signal.reason;
		throw new WorkerError("asset_download_failed", "Unable to save a render asset.", true, {
			cause: error,
		});
	}
	if (received !== expectedBytes) {
		throw new WorkerError(
			"asset_download_failed",
			"Render asset size changed after ownership verification.",
			true
		);
	}
	return { filePath, bytes: received };
}

interface UploadMetadata {
	renderJobId: string;
	idempotencyHash: string;
}

function metadataHeader(metadata: UploadMetadata): string {
	return Buffer.from(JSON.stringify(metadata), "utf8").toString("base64");
}

function matchingMetadata(value: unknown, expected: UploadMetadata): boolean {
	if (!value || typeof value !== "object") return false;
	const record = value as Record<string, unknown>;
	return (
		record.renderJobId === expected.renderJobId &&
		record.idempotencyHash === expected.idempotencyHash
	);
}

export async function uploadImmutableObject(
	client: WorkerSupabaseClient,
	config: WorkerConfig,
	bucket: "render-outputs" | "project-assets",
	path: string,
	filePath: string,
	metadata: UploadMetadata,
	signal: AbortSignal,
	expectedOwnerId: string | null = null,
	acceptMatchingExisting = false
): Promise<void> {
	throwIfAborted(signal);
	if (
		bucket === "project-assets" &&
		(!expectedOwnerId || !ownerMatches(path, expectedOwnerId))
	) {
		throw new WorkerError(
			"asset_not_owned",
			"Media ingest destination is outside the job owner's folder.",
			false
		);
	}
	if (acceptMatchingExisting) {
		const existing = await client.storage.from(bucket).info(path);
		if (!existing.error && existing.data) {
			if (matchingMetadata(existing.data.metadata, metadata)) return;
			throw new WorkerError(
				"destination_conflict",
				"The media ingest destination already exists and was not created by this job.",
				false
			);
		}
	}

	const file = await stat(filePath);
	const url = `${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedObjectPath(path)}`;
	let response: Response;
	try {
		response = await fetch(url, {
			method: "POST",
			headers: {
				apikey: config.supabaseServiceRoleKey,
				Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
				"Content-Type": "video/mp4",
				"Content-Length": String(file.size),
				"x-upsert": "false",
				"x-metadata": metadataHeader(metadata),
			},
			body: createReadStream(filePath),
			duplex: "half",
			signal,
			redirect: "error",
		} as RequestInit & { duplex: "half" });
	} catch (error) {
		if (signal.aborted) throw signal.reason;
		throw new WorkerError("output_upload_failed", "Unable to upload the render output.", true, {
			cause: error,
		});
	}
	if (!response.ok) {
		const details = (await response.text()).slice(0, 1_000);
		if (response.status === 409 && acceptMatchingExisting) {
			const existing = await client.storage.from(bucket).info(path);
			if (!existing.error && matchingMetadata(existing.data?.metadata, metadata)) return;
		}
		throw new WorkerError(
			response.status === 409 ? "destination_conflict" : "output_upload_failed",
			`Immutable upload failed with HTTP ${response.status}: ${details}`,
			response.status !== 409
		);
	}
}

export async function sha256File(
	filePath: string,
	signal?: AbortSignal
): Promise<string> {
	const hash = createHash("sha256");
	const stream = createReadStream(filePath);
	const onAbort = () => stream.destroy(signal?.reason as Error | undefined);
	signal?.addEventListener("abort", onAbort, { once: true });
	try {
		for await (const chunk of stream) {
			throwIfAborted(signal ?? new AbortController().signal);
			hash.update(chunk as Buffer);
		}
	} finally {
		signal?.removeEventListener("abort", onAbort);
	}
	return hash.digest("hex");
}
