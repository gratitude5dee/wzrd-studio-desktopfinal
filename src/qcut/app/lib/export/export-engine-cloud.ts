import { getWzrdProjectContext } from "../../../bridge/wzrd-project-context";
import type { EffectInstance } from "@qcut-app/types/effects";
import type { ExportSettingsWithAudio } from "@qcut-app/types/export";
import type { TimelineTrack } from "@qcut-app/types/timeline";
import type { MediaItem } from "@qcut-app/stores/media/media-store-types";

import { ExportEngine } from "./export-engine";
import {
	analyzeCloudRenderEligibility,
	buildRenderManifest,
	cancelRenderJob,
	type CloudRenderJob,
	CloudExportError,
	enqueueRenderJob,
	fetchRenderResult,
	getAuthenticatedCloudSession,
	pollRenderJob,
	prepareCloudMediaAssets,
	retryRenderJob,
	type CloudTimelineSerializationInput,
} from "./cloud-export";

type ProgressCallback = (progress: number, status: string) => void;

export interface CloudExportEngineDependencies {
	analyzeEligibility: typeof analyzeCloudRenderEligibility;
	buildManifest: typeof buildRenderManifest;
	cancelJob: typeof cancelRenderJob;
	enqueueJob: typeof enqueueRenderJob;
	fetchResult: typeof fetchRenderResult;
	getSession: typeof getAuthenticatedCloudSession;
	pollJob: typeof pollRenderJob;
	prepareAssets: typeof prepareCloudMediaAssets;
	retryJob: typeof retryRenderJob;
}

export interface CloudExportEngineOptions {
	projectId?: string;
	effectsByElementId?: ReadonlyMap<string, EffectInstance[]>;
	dependencies?: Partial<CloudExportEngineDependencies>;
}

const defaultDependencies: CloudExportEngineDependencies = {
	analyzeEligibility: analyzeCloudRenderEligibility,
	buildManifest: buildRenderManifest,
	cancelJob: cancelRenderJob,
	enqueueJob: enqueueRenderJob,
	fetchResult: fetchRenderResult,
	getSession: getAuthenticatedCloudSession,
	pollJob: pollRenderJob,
	prepareAssets: prepareCloudMediaAssets,
	retryJob: retryRenderJob,
};

function resolveProjectId(projectId?: string): string {
	if (projectId) return getWzrdProjectContext(projectId)?.wzrdProjectId ?? projectId;
	return "";
}

function jobProgress(job: CloudRenderJob): number {
	const progress = Number.isFinite(job.progress) ? job.progress : 0;
	return progress <= 1 ? progress * 100 : progress;
}

export class CloudExportEngine extends ExportEngine {
	private readonly cloudProjectId: string;
	private readonly effectsByElementId?: ReadonlyMap<string, EffectInstance[]>;
	private readonly dependencies: CloudExportEngineDependencies;
	private currentJob: CloudRenderJob | null = null;

	constructor(
		canvas: HTMLCanvasElement,
		settings: ExportSettingsWithAudio,
		tracks: TimelineTrack[],
		mediaItems: MediaItem[],
		totalDuration: number,
		options: CloudExportEngineOptions = {}
	) {
		super(canvas, settings, tracks, mediaItems, totalDuration, {
			useFFmpegExport: false,
		});
		this.cloudProjectId = resolveProjectId(options.projectId);
		this.effectsByElementId = options.effectsByElementId;
		this.dependencies = { ...defaultDependencies, ...options.dependencies };
	}

	getCurrentJob(): CloudRenderJob | null {
		return this.currentJob;
	}

	private serializationInput(): CloudTimelineSerializationInput {
		return {
			projectId: this.cloudProjectId,
			tracks: this.tracks,
			mediaItems: this.mediaItems,
			settings: this.settings as ExportSettingsWithAudio,
			totalDuration: this.totalDuration,
			fps: this.fps,
			effectsByElementId: this.effectsByElementId,
		};
	}

	override async export(progressCallback?: ProgressCallback): Promise<Blob> {
		if (this.isExporting) throw new Error("Export already in progress");

		this.isExporting = true;
		this.abortController = new AbortController();
		this.currentJob = null;

		try {
			const input = this.serializationInput();
			const eligibility = this.dependencies.analyzeEligibility(input);
			if (eligibility.eligible === false) {
				const reason = eligibility.reasons[0];
				throw new CloudExportError(
					reason?.code ?? "unsupported_feature",
					reason?.message ?? "Timeline is not eligible for cloud rendering.",
					400,
					true
				);
			}

			const session = await this.dependencies.getSession();
			progressCallback?.(0, "Preparing cloud render assets...");
			await this.dependencies.prepareAssets(input, {
				...session,
				signal: this.abortController.signal,
				onProgress: (progress, message) =>
					progressCallback?.(Math.min(10, progress / 10), message),
			});

			const manifest = this.dependencies.buildManifest(input);
			progressCallback?.(10, "Queued for cloud render...");
			const { job } = await this.dependencies.enqueueJob(manifest, {
				accessToken: session.accessToken,
			});
			this.currentJob = job;

			const terminalJob = await this.dependencies.pollJob(job.id, {
				accessToken: session.accessToken,
				signal: this.abortController.signal,
				onProgress: (nextJob) => {
					this.currentJob = nextJob;
					const status =
						nextJob.progressMessage ??
						nextJob.stage ??
						(nextJob.status === "queued"
							? "Queued for cloud render..."
							: "Rendering in cloud...");
					progressCallback?.(10 + Math.min(85, jobProgress(nextJob) * 0.85), status);
				},
			});
			this.currentJob = terminalJob;

			if (terminalJob.status !== "succeeded") {
				throw new CloudExportError(
					terminalJob.errorCode ?? `render_${terminalJob.status}`,
					terminalJob.errorMessage ??
						terminalJob.error ??
						`Cloud render ${terminalJob.status}.`,
					undefined,
					terminalJob.status === "failed"
				);
			}

			progressCallback?.(95, "Downloading cloud render...");
			const { blob, job: refreshedJob } = await this.dependencies.fetchResult(
				terminalJob.id,
				{
					accessToken: session.accessToken,
					signedUrl: terminalJob.signedUrl,
				}
			);
			this.currentJob = refreshedJob;
			progressCallback?.(100, "Export complete!");
			return blob;
		} finally {
			this.isExporting = false;
		}
	}

	override cancel(): void {
		const jobId = this.currentJob?.id;
		if (!jobId) {
			this.abortController?.abort();
			this.isExporting = false;
			return;
		}

		void this.dependencies
			.cancelJob(jobId)
			.then((job) => {
				this.currentJob = job;
			})
			.finally(() => {
				this.abortController?.abort();
				this.isExporting = false;
			});
	}

	async retry(): Promise<CloudRenderJob> {
		if (!this.currentJob) {
			throw new CloudExportError("render_job_missing", "No cloud render job to retry.");
		}
		this.currentJob = await this.dependencies.retryJob(this.currentJob.id);
		return this.currentJob;
	}
}
