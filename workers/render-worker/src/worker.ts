import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

import {
	downloadApifyMedia,
	getApifyMediaUrl,
	waitForApifyRun,
} from "./apify.js";
import type { WorkerConfig } from "./config.js";
import {
	JobCancelledError,
	LeaseLostError,
	WorkerError,
	messageFromUnknown,
} from "./errors.js";
import {
	compileClipperManifest,
	compileQCutManifest,
	createAssetResolver,
	inspectOutput,
	normalizeIngestMedia,
	probeMedia,
	renderWithFfmpeg,
} from "./ffmpeg.js";
import type { WorkerHealthState } from "./health.js";
import {
	RENDER_MANIFEST_VERSION,
	type RenderAssetRef,
	type RenderManifestV1,
	validateRenderManifest,
} from "./manifest.js";
import { abortableDelay } from "./process.js";
import { runRetentionSweep } from "./retention.js";
import {
	acknowledgeCancellation,
	claimJobs,
	completeJob,
	failJob,
	heartbeatJob,
	logRpcFailure,
	type WorkerSupabaseClient,
} from "./supabase.js";
import {
	downloadAsset,
	uploadImmutableObject,
	verifyAsset,
} from "./storage.js";
import type {
	ClaimedRenderJob,
	JobProgress,
	LocalAsset,
	RenderedOutput,
	RenderJobRecord,
} from "./types.js";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_RENDER_REQUEST_BYTES = 64 * 1024;

interface HeartbeatHandle {
	signal: AbortSignal;
	stop(): Promise<void>;
}

export function outputStoragePath(job: RenderJobRecord): string {
	return `${job.user_id}/${job.project_id}/${job.idempotency_hash}/attempts/${job.attempts}-${job.generation}.mp4`;
}

export function validateClaimedJob(job: RenderJobRecord): ClaimedRenderJob {
	let serializedRequest: string | undefined;
	try {
		serializedRequest = JSON.stringify(job.request);
	} catch {
		throw new WorkerError("invalid_manifest", "Render manifest is not serializable JSON.", false);
	}
	if (
		!UUID_PATTERN.test(job.id) ||
		!UUID_PATTERN.test(job.user_id) ||
		!UUID_PATTERN.test(job.project_id) ||
		!SHA256_PATTERN.test(job.idempotency_hash) ||
		job.status !== "running" ||
		job.attempts < 1 ||
		job.attempts > 3 ||
		job.max_attempts !== 3 ||
		job.generation < 0 ||
		job.manifest_schema_version !== RENDER_MANIFEST_VERSION
	) {
		throw new WorkerError("invalid_job", "Claimed render job violates the queue contract.", false);
	}
	if (
		serializedRequest === undefined ||
		Buffer.byteLength(serializedRequest, "utf8") > MAX_RENDER_REQUEST_BYTES
	) {
		throw new WorkerError(
			"invalid_manifest",
			"Render manifests must be serializable JSON no larger than 64 KB.",
			false
		);
	}
	const validation = validateRenderManifest(job.request, { allowMediaIngest: true });
	if (!validation.ok) {
		throw new WorkerError("invalid_manifest", validation.message, false);
	}
	if (
		validation.manifest.kind !== job.kind ||
		validation.manifest.projectId !== job.project_id ||
		validation.manifest.manifestVersion !== job.manifest_schema_version
	) {
		throw new WorkerError(
			"invalid_manifest",
			"Render job columns do not match the revalidated manifest.",
			false
		);
	}
	if (
		validation.manifest.kind === "media_ingest" &&
		validation.manifest.destination.path.split("/")[0] !== job.user_id
	) {
		throw new WorkerError(
			"asset_not_owned",
			"Media ingest destination is outside the job owner's folder.",
			false
		);
	}
	return { ...job, manifest: validation.manifest };
}

function manifestAssets(manifest: RenderManifestV1): RenderAssetRef[] {
	if (manifest.kind === "clipper_vertical") {
		return manifest.logo ? [manifest.source, manifest.logo.source] : [manifest.source];
	}
	if (manifest.kind === "media_ingest") return [];
	const assets: RenderAssetRef[] = [];
	for (const track of manifest.tracks) {
		if (
			track.type === "video" ||
			track.type === "audio" ||
			track.type === "image" ||
			track.type === "sticker"
		) {
			for (const clip of track.clips) assets.push(clip.source);
		}
	}
	return assets;
}

function setProgress(
	progress: JobProgress,
	value: number,
	stage: string,
	message: string | null = null
): void {
	progress.value = Math.max(progress.value, Math.min(99, value));
	progress.stage = stage;
	progress.message = message;
}

async function startHeartbeat(
	client: WorkerSupabaseClient,
	config: WorkerConfig,
	job: RenderJobRecord,
	progress: JobProgress
): Promise<HeartbeatHandle> {
	const controller = new AbortController();
	let timer: NodeJS.Timeout | null = null;
	let stopped = false;
	let pending: Promise<void> | null = null;

	const beat = async () => {
		try {
			let timeout: NodeJS.Timeout | null = null;
			const result = await Promise.race([
				heartbeatJob(client, config, job, progress),
				new Promise<never>((_resolve, reject) => {
					timeout = setTimeout(
						() => reject(new LeaseLostError("Render job heartbeat timed out.")),
						Math.min(config.heartbeatMs, Math.floor(config.leaseSeconds * 500))
					);
				}),
			]).finally(() => {
				if (timeout) clearTimeout(timeout);
			});
			if (result.generation !== job.generation || result.attempt !== job.attempts) {
				controller.abort(new LeaseLostError());
				return;
			}
			if (result.cancelRequested) {
				controller.abort(new JobCancelledError());
				return;
			}
		} catch (error) {
			controller.abort(error instanceof LeaseLostError ? error : new LeaseLostError());
		}
	};
	const schedule = () => {
		if (stopped || controller.signal.aborted) return;
		timer = setTimeout(() => {
			pending = beat().finally(() => {
				pending = null;
				schedule();
			});
		}, config.heartbeatMs);
	};

	await beat();
	if (controller.signal.aborted) throw controller.signal.reason;
	schedule();
	return {
		signal: controller.signal,
		async stop() {
			stopped = true;
			if (timer) clearTimeout(timer);
			await pending;
		},
	};
}

async function prepareAssets(
	client: WorkerSupabaseClient,
	config: WorkerConfig,
	job: ClaimedRenderJob,
	directory: string,
	signal: AbortSignal,
	progress: JobProgress
): Promise<LocalAsset[]> {
	const unique = new Map<string, RenderAssetRef>();
	for (const asset of manifestAssets(job.manifest)) {
		unique.set(`${asset.bucket}/${asset.path}`, asset);
	}
	const assets: LocalAsset[] = [];
	let index = 0;
	for (const asset of unique.values()) {
		setProgress(progress, 8 + (index / Math.max(1, unique.size)) * 18, "downloading", asset.path);
		const size = await verifyAsset(client, asset, job.user_id);
		const downloaded = await downloadAsset(config, asset, size, index, directory, signal);
		const probe = await probeMedia(config, downloaded.filePath, signal);
		assets.push({ ...asset, filePath: downloaded.filePath, bytes: downloaded.bytes, probe });
		index += 1;
	}
	return assets;
}

async function renderManifest(
	client: WorkerSupabaseClient,
	config: WorkerConfig,
	job: ClaimedRenderJob,
	directory: string,
	signal: AbortSignal,
	progress: JobProgress
): Promise<RenderedOutput> {
	const outputPath = join(directory, "output.mp4");
	const assPath = join(directory, "overlays.ass");
	if (job.manifest.kind === "media_ingest") {
		setProgress(progress, 10, "waiting_for_source", "Waiting for Apify actor run");
		await waitForApifyRun(config, job.manifest, signal);
		setProgress(progress, 25, "transferring", "Fetching completed Apify media");
		const mediaUrl = await getApifyMediaUrl(config, job.manifest, signal);
		const downloaded = await downloadApifyMedia(config, mediaUrl, directory, signal);
		const sourceProbe = await probeMedia(config, downloaded.filePath, signal);
		if (!sourceProbe.hasVideo || sourceProbe.durationSeconds <= 0 || sourceProbe.durationSeconds > 1_800) {
			throw new WorkerError(
				"unsupported_media",
				"Completed Apify media must contain video no longer than 30 minutes.",
				false
			);
		}
		const normalizedPath = join(directory, "ingest-normalized.mp4");
		setProgress(progress, 55, "normalizing", null);
		await normalizeIngestMedia(
			config,
			downloaded.filePath,
			normalizedPath,
			sourceProbe.durationSeconds,
			signal,
			(fraction) => setProgress(progress, 55 + fraction * 20, "normalizing", null)
		);
		setProgress(progress, 75, "probing", null);
		const metadata = await inspectOutput(config, normalizedPath, signal);
		const objectMetadata = {
			renderJobId: job.id,
			idempotencyHash: job.idempotency_hash,
		};
		setProgress(progress, 85, "transferring", "Writing owner-scoped project asset");
		await uploadImmutableObject(
			client,
			config,
			"project-assets",
			job.manifest.destination.path,
			normalizedPath,
			objectMetadata,
			signal,
			job.user_id,
			true
		);
		return { filePath: normalizedPath, metadata };
	}

	const assets = await prepareAssets(client, config, job, directory, signal, progress);
	const resolver = createAssetResolver(assets);
	setProgress(progress, 30, "compiling", null);
	const compiled =
		job.manifest.kind === "qcut_timeline"
			? compileQCutManifest(job.manifest, resolver, outputPath, assPath)
			: compileClipperManifest(job.manifest, resolver, outputPath);
	setProgress(progress, 35, "rendering", null);
	await renderWithFfmpeg(
		config,
		compiled,
		assPath,
		job.manifest.output.durationSeconds,
		signal,
		(fraction) => setProgress(progress, 35 + fraction * 50, "rendering", null)
	);
	setProgress(progress, 88, "probing", null);
	const metadata = await inspectOutput(config, outputPath, signal);
	return { filePath: outputPath, metadata };
}

async function processJob(
	client: WorkerSupabaseClient,
	config: WorkerConfig,
	claimed: RenderJobRecord,
	shutdownSignal: AbortSignal
): Promise<void> {
	const progress: JobProgress = { value: 0, stage: "claimed", message: null };
	let heartbeat: HeartbeatHandle | null = null;
	let directory: string | null = null;
	try {
		heartbeat = await startHeartbeat(client, config, claimed, progress);
		const signal = AbortSignal.any([heartbeat.signal, shutdownSignal]);
		setProgress(progress, 3, "validating", null);
		const job = validateClaimedJob(claimed);
		directory = await mkdtemp(
			join(config.workRoot, `${job.id}-${job.attempts}-${job.generation}-`)
		);
		const rendered = await renderManifest(client, config, job, directory, signal, progress);
		setProgress(progress, 93, "uploading", null);
		const storagePath = outputStoragePath(job);
		await uploadImmutableObject(
			client,
			config,
			"render-outputs",
			storagePath,
			rendered.filePath,
			{ renderJobId: job.id, idempotencyHash: job.idempotency_hash },
			signal,
			null
		);
		setProgress(progress, 99, "finalizing", null);
		await completeJob(client, config, job, storagePath, rendered.metadata);
		await heartbeat.stop();
		heartbeat = null;
		console.info(
			JSON.stringify({
				level: "info",
				action: "render_completed",
				jobId: job.id,
				attempt: job.attempts,
				generation: job.generation,
				bytes: rendered.metadata.bytes,
			})
		);
	} catch (error) {
		if (heartbeat) await heartbeat.stop();
		const reason =
			error instanceof Error
				? error
				: shutdownSignal.aborted && shutdownSignal.reason instanceof Error
					? shutdownSignal.reason
					: new Error(String(error));
		if (reason instanceof LeaseLostError) {
			console.warn(
				JSON.stringify({ level: "warn", action: "lease_lost", jobId: claimed.id })
			);
			return;
		}
		if (reason instanceof JobCancelledError) {
			try {
				await acknowledgeCancellation(client, config, claimed);
			} catch (rpcFailure) {
				logRpcFailure("acknowledge_cancel", rpcFailure);
			}
			return;
		}
		const workerError =
			reason instanceof WorkerError
				? reason
				: new WorkerError("render_failed", "Unexpected render worker failure.", true, {
						cause: reason,
					});
		try {
			await failJob(
				client,
				config,
				claimed,
				workerError.code,
				workerError.message,
				workerError.retryable
			);
		} catch (rpcFailure) {
			logRpcFailure("fail_render", rpcFailure);
		}
		console.error(
			JSON.stringify({
				level: "error",
				action: "render_failed",
				jobId: claimed.id,
				code: workerError.code,
				retryable: workerError.retryable,
				error: messageFromUnknown(workerError.cause ?? workerError),
			})
		);
	} finally {
		if (directory) {
			try {
				await rm(directory, { recursive: true, force: true });
			} catch (error) {
				console.error(
					JSON.stringify({
						level: "error",
						action: "temp_cleanup",
						jobId: claimed.id,
						error: messageFromUnknown(error),
					})
				);
			}
		}
	}
}

export class RenderWorker {
	private readonly active = new Set<Promise<void>>();
	private lastRetentionAt = 0;
	private retentionPending = false;

	constructor(
		private readonly client: WorkerSupabaseClient,
		private readonly config: WorkerConfig,
		private readonly health: WorkerHealthState,
		private readonly shutdownSignal: AbortSignal
	) {}

	async run(): Promise<void> {
		await mkdir(this.config.workRoot, { recursive: true, mode: 0o700 });
		while (!this.shutdownSignal.aborted) {
			if (
				!this.retentionPending &&
				Date.now() - this.lastRetentionAt >= this.config.retentionSweepMs
			) {
				this.lastRetentionAt = Date.now();
				this.retentionPending = true;
				void runRetentionSweep(this.client, this.config)
					.catch((error: unknown) => {
						console.error(
							JSON.stringify({
								level: "error",
								action: "retention_sweep",
								error: messageFromUnknown(error),
							})
						);
					})
					.finally(() => {
						this.retentionPending = false;
					});
			}

			const available = this.config.concurrency - this.active.size;
			if (available <= 0) {
				await Promise.race(this.active);
				continue;
			}

			let jobs: RenderJobRecord[] = [];
			try {
				// claim_web_render_jobs also sweeps exhausted/cancelled stale leases in
				// the same transaction, including abandoned final attempts.
				jobs = await claimJobs(this.client, this.config, available);
				this.health.lastClaimAt = new Date().toISOString();
				this.health.lastClaimError = null;
			} catch (error) {
				this.health.lastClaimError = messageFromUnknown(error);
				console.error(
					JSON.stringify({
						level: "error",
						action: "claim_jobs",
						error: this.health.lastClaimError,
					})
				);
			}

			for (const job of jobs) {
				const task = processJob(this.client, this.config, job, this.shutdownSignal).finally(
					() => {
						this.active.delete(task);
						this.health.active = this.active.size;
					}
				);
				this.active.add(task);
				this.health.active = this.active.size;
			}

			if (jobs.length === 0) {
				try {
					await abortableDelay(this.config.pollMs, this.shutdownSignal);
				} catch {
					break;
				}
			}
		}
		await Promise.allSettled(this.active);
	}
}
