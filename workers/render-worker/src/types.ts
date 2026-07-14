import type { RenderManifestV1 } from "./manifest.js";

export interface RenderJobRecord {
	id: string;
	idempotency_hash: string;
	user_id: string;
	project_id: string;
	status: string;
	request: unknown;
	kind: string;
	manifest_schema_version: number;
	attempts: number;
	max_attempts: number;
	generation: number;
	cancel_requested: boolean;
	lease_expires_at: string | null;
}

export interface ClaimedRenderJob extends RenderJobRecord {
	manifest: RenderManifestV1;
}

export interface JobProgress {
	value: number;
	stage: string;
	message: string | null;
}

export interface OutputMetadata {
	bytes: number;
	durationSeconds: number;
	width: number;
	height: number;
	sha256: string;
}

export interface MediaProbe {
	durationSeconds: number;
	width: number | null;
	height: number | null;
	hasVideo: boolean;
	hasAudio: boolean;
	formatName: string;
}

export interface LocalAsset {
	bucket: "project-assets";
	path: string;
	filePath: string;
	bytes: number;
	probe: MediaProbe;
}

export interface RenderedOutput {
	filePath: string;
	metadata: OutputMetadata;
}
