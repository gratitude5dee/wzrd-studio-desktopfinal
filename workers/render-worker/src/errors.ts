export type WorkerErrorCode =
	| "invalid_job"
	| "invalid_manifest"
	| "unsupported_manifest_version"
	| "asset_not_owned"
	| "asset_not_found"
	| "asset_too_large"
	| "asset_download_failed"
	| "asset_probe_failed"
	| "unsupported_media"
	| "render_failed"
	| "render_timeout"
	| "output_invalid"
	| "output_upload_failed"
	| "apify_failed"
	| "apify_timeout"
	| "apify_item_missing"
	| "unsafe_media_url"
	| "destination_conflict"
	| "worker_shutdown";

export class WorkerError extends Error {
	constructor(
		readonly code: WorkerErrorCode,
		message: string,
		readonly retryable: boolean,
		options: ErrorOptions = {}
	) {
		super(message, options);
		this.name = "WorkerError";
	}
}

export class LeaseLostError extends Error {
	constructor(message = "The render job lease or generation fence was lost.") {
		super(message);
		this.name = "LeaseLostError";
	}
}

export class JobCancelledError extends Error {
	constructor() {
		super("The render job was cancelled.");
		this.name = "JobCancelledError";
	}
}

export function abortReason(signal: AbortSignal): unknown {
	return signal.reason ?? new Error("Operation aborted");
}

export function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw abortReason(signal);
}

export function messageFromUnknown(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
