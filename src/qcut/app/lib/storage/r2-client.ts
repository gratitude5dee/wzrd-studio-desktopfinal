// Cloudflare R2 operations must go through server API routes in the web build.
export class R2Client {
	constructor() {
		throw new Error(
			"R2Client should not be used client-side. Use server API routes instead."
		);
	}

	async uploadFile(
		_key: string,
		_file: ArrayBuffer | Uint8Array,
		_contentType?: string
	): Promise<void> {
		throw new Error("R2 uploads are only available through server API routes.");
	}

	async downloadFile(_key: string): Promise<ArrayBuffer> {
		throw new Error("R2 downloads are only available through server API routes.");
	}

	async deleteFile(_key: string): Promise<void> {
		throw new Error("R2 deletes are only available through server API routes.");
	}

	generateTranscriptionKey(originalFilename: string): string {
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 15);
		const lastDotIndex = originalFilename.lastIndexOf(".");
		const extension =
			lastDotIndex > 0 ? originalFilename.slice(lastDotIndex + 1) : "bin";
		return `transcription/${timestamp}-${random}.${extension}`;
	}

	static isConfigured(): boolean {
		return !!(
			process.env.CLOUDFLARE_ACCOUNT_ID &&
			process.env.R2_ACCESS_KEY_ID &&
			process.env.R2_SECRET_ACCESS_KEY &&
			process.env.R2_BUCKET_NAME
		);
	}
}
