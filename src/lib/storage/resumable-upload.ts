import { Upload, type PreviousUpload } from "tus-js-client";

import { supabase } from "@/integrations/supabase/client";
import {
	SUPABASE_ANON_KEY,
	SUPABASE_URL,
} from "@/integrations/supabase/config";

export const RESUMABLE_UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024;
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = RESUMABLE_UPLOAD_CHUNK_BYTES;

export interface ProjectAssetUploadOptions {
	path: string;
	accessToken: string;
	signal?: AbortSignal;
	onProgress?: (progress: {
		bytesUploaded: number;
		bytesTotal: number;
		percentage: number;
	}) => void;
}

export interface ProjectAssetUploadResult {
	bucket: "project-assets";
	path: string;
	resumable: boolean;
}

interface TusUploadLike {
	start(): void;
	abort(shouldTerminate?: boolean): Promise<void>;
	findPreviousUploads(): Promise<PreviousUpload[]>;
	resumeFromPreviousUpload(previousUpload: PreviousUpload): void;
}

export type TusUploadFactory = (
	file: File,
	options: ConstructorParameters<typeof Upload>[1]
) => TusUploadLike;

export interface ResumableUploadDependencies {
	createUpload?: TusUploadFactory;
	standardUpload?: (
		path: string,
		file: File
	) => Promise<{ error: { message?: string } | null }>;
}

function reportProgress(
	callback: ProjectAssetUploadOptions["onProgress"],
	bytesUploaded: number,
	bytesTotal: number
): void {
	callback?.({
		bytesUploaded,
		bytesTotal,
		percentage:
			bytesTotal > 0 ? Math.min(100, (bytesUploaded / bytesTotal) * 100) : 0,
	});
}

export async function uploadProjectAsset(
	file: File,
	options: ProjectAssetUploadOptions,
	dependencies: ResumableUploadDependencies = {}
): Promise<ProjectAssetUploadResult> {
	if (!options.path || options.path.startsWith("/") || options.path.includes("..")) {
		throw new Error("Project asset uploads require a safe relative object path.");
	}
	if (!options.accessToken) {
		throw new Error("Project asset uploads require an authenticated session.");
	}
	if (options.signal?.aborted) {
		throw options.signal.reason ?? new DOMException("Upload aborted", "AbortError");
	}

	if (file.size <= RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
		const standardUpload =
			dependencies.standardUpload ??
			((path: string, value: File) =>
				supabase.storage.from("project-assets").upload(path, value, {
					upsert: false,
					contentType: value.type || "application/octet-stream",
				}));
		const result = await standardUpload(options.path, file);
		if (result.error) {
			throw new Error(result.error.message || "Unable to upload project asset.");
		}
		reportProgress(options.onProgress, file.size, file.size);
		return { bucket: "project-assets", path: options.path, resumable: false };
	}

	const createUpload: TusUploadFactory =
		dependencies.createUpload ?? ((value, uploadOptions) => new Upload(value, uploadOptions));

	return new Promise<ProjectAssetUploadResult>((resolve, reject) => {
		let settled = false;
		let upload: TusUploadLike;
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			options.signal?.removeEventListener("abort", abortUpload);
			callback();
		};
		const abortUpload = () => {
			void upload
				.abort(false)
				.catch(() => undefined)
				.finally(() => {
					finish(() =>
						reject(
							options.signal?.reason ??
								new DOMException("Upload aborted", "AbortError")
						)
					);
				});
		};

		upload = createUpload(file, {
			endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
			headers: {
				authorization: `Bearer ${options.accessToken}`,
				apikey: SUPABASE_ANON_KEY,
				"x-upsert": "false",
			},
			metadata: {
				bucketName: "project-assets",
				objectName: options.path,
				contentType: file.type || "application/octet-stream",
				cacheControl: "3600",
			},
			chunkSize: RESUMABLE_UPLOAD_CHUNK_BYTES,
			retryDelays: [0, 1_000, 3_000, 5_000, 10_000],
			removeFingerprintOnSuccess: true,
			storeFingerprintForResuming: true,
			onProgress: (uploaded, total) =>
				reportProgress(options.onProgress, uploaded, total),
			onError: (error) =>
				finish(() => reject(error)),
			onSuccess: () =>
				finish(() =>
					resolve({
						bucket: "project-assets",
						path: options.path,
						resumable: true,
					})
				),
		});

		options.signal?.addEventListener("abort", abortUpload, { once: true });
		void upload
			.findPreviousUploads()
			.then((previousUploads) => {
				if (previousUploads[0]) {
					upload.resumeFromPreviousUpload(previousUploads[0]);
				}
				if (!settled) upload.start();
			})
			.catch((error) => finish(() => reject(error)));
	});
}
