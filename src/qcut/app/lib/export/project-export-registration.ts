import { supabase as typedSupabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

const supabase = typedSupabase as any;

const FINAL_EXPORTS_BUCKET = "final-exports";

export interface RegisterProjectExportInput {
	projectId: string;
	qcutProjectId?: string;
	blob: Blob;
	filename: string;
	format?: string;
	engineType?: string;
	durationSeconds?: number;
	settings?: Record<string, unknown>;
}

export interface ProjectExportRegistration {
	assetId: string;
	exportJobId: string;
	publicUrl: string;
	storageBucket: string;
	storagePath: string;
}

function createUuid(): string {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}

	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;
	const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
	return [
		hex.slice(0, 4).join(""),
		hex.slice(4, 6).join(""),
		hex.slice(6, 8).join(""),
		hex.slice(8, 10).join(""),
		hex.slice(10, 16).join(""),
	].join("-");
}

function sanitizeFilename(filename: string): string {
	const base = filename.split("/").pop()?.split("\\").pop() ?? "export.mp4";
	const cleaned = base.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
	const extension = cleaned.match(/(\.[a-z0-9]+)$/i)?.[1] ?? "";
	const stem = extension ? cleaned.slice(0, -extension.length) : cleaned;
	const normalizedStem = stem.replace(/^_+|_+$/g, "") || "export";
	return `${normalizedStem}${extension || ".mp4"}`;
}

function extensionForExport(filename: string, contentType: string, format?: string): string {
	const extension = filename.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
	if (extension) return extension;
	if (format === "webm" || contentType.includes("webm")) return "webm";
	if (format === "gif" || contentType.includes("gif")) return "gif";
	return "mp4";
}

function contentTypeForExport(blob: Blob, format?: string): string {
	if (blob.type) return blob.type;
	if (format === "webm") return "video/webm";
	if (format === "gif") return "image/gif";
	return "video/mp4";
}

function completedJobPayload({
	projectId,
	userId,
	exportJobId,
	publicUrl,
	engineType,
	settings,
	filename,
	contentType,
	blob,
	durationSeconds,
	qcutProjectId,
}: {
	projectId: string;
	userId: string;
	exportJobId: string;
	publicUrl: string;
	engineType?: string;
	settings?: Record<string, unknown>;
	filename: string;
	contentType: string;
	blob: Blob;
	durationSeconds?: number;
	qcutProjectId?: string;
}) {
	const now = new Date().toISOString();
	return {
		id: exportJobId,
		project_id: projectId,
		user_id: userId,
		status: "completed",
		progress: 100,
		output_url: publicUrl,
		provider: `browser_${engineType || "auto"}`,
		provider_status: "completed",
		fallback_used: engineType === "ffmpeg" || engineType === "standard",
		started_at: now,
		completed_at: now,
		settings: {
			...(settings ?? {}),
			filename,
			engineType,
			contentType,
			fileSize: blob.size,
			durationSeconds,
			qcutProjectId,
		} as Json,
		provider_payload: {
			source: "qcut_editor_export",
			engineType,
			filename,
			contentType,
			fileSize: blob.size,
			durationSeconds,
			qcutProjectId,
		} as Json,
	};
}

export async function registerProjectExport(
	input: RegisterProjectExportInput
): Promise<ProjectExportRegistration> {
	const { data: authData, error: authError } = await typedSupabase.auth.getUser();
	const userId = authData.user?.id;
	if (authError || !userId) {
		throw new Error(authError?.message || "Not authenticated");
	}

	const filename = sanitizeFilename(input.filename);
	const contentType = contentTypeForExport(input.blob, input.format);
	const extension = extensionForExport(filename, contentType, input.format);
	const exportJobId = createUuid();
	const storagePath = `${userId}/${input.projectId}/${exportJobId}/${Date.now()}-${filename.replace(/\.[^.]+$/, "")}.${extension}`;

	const { error: uploadError } = await typedSupabase.storage
		.from(FINAL_EXPORTS_BUCKET)
		.upload(storagePath, input.blob, {
			cacheControl: "3600",
			upsert: false,
			contentType,
		});

	if (uploadError) {
		throw uploadError;
	}

	const {
		data: { publicUrl },
	} = typedSupabase.storage.from(FINAL_EXPORTS_BUCKET).getPublicUrl(storagePath);

	const { error: jobError } = await supabase
		.from("export_jobs")
		.insert(
			completedJobPayload({
				projectId: input.projectId,
				userId,
				exportJobId,
				publicUrl,
				engineType: input.engineType,
				settings: input.settings,
				filename,
				contentType,
				blob: input.blob,
				durationSeconds: input.durationSeconds,
				qcutProjectId: input.qcutProjectId,
			})
		)
		.select("id")
		.single();

	if (jobError) {
		await typedSupabase.storage.from(FINAL_EXPORTS_BUCKET).remove([storagePath]);
		throw jobError;
	}

	const { data: asset, error: assetError } = await supabase
		.from("final_project_assets")
		.insert({
			project_id: input.projectId,
			user_id: userId,
			asset_type: "video",
			file_url: publicUrl,
			storage_bucket: FINAL_EXPORTS_BUCKET,
			storage_path: storagePath,
			file_size: input.blob.size,
			duration_ms:
				typeof input.durationSeconds === "number"
					? Math.round(input.durationSeconds * 1000)
					: null,
			metadata: {
				source: "qcut_editor_export",
				name: filename,
				asset_subtype: "final_export",
				export_job_id: exportJobId,
				qcut_project_id: input.qcutProjectId,
				filename,
				content_type: contentType,
				engine_type: input.engineType,
				url: publicUrl,
				storage_bucket: FINAL_EXPORTS_BUCKET,
				storage_path: storagePath,
			} as Json,
		})
		.select("id")
		.single();

	if (assetError) {
		throw assetError;
	}

	return {
		assetId: asset?.id ?? exportJobId,
		exportJobId,
		publicUrl,
		storageBucket: FINAL_EXPORTS_BUCKET,
		storagePath,
	};
}
