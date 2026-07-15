import { statfs } from "node:fs/promises";

export async function getDiskFreeBytes(path: string): Promise<number> {
	const stats = await statfs(path, { bigint: true });
	const bytes = stats.bavail * stats.bsize;
	return bytes > BigInt(Number.MAX_SAFE_INTEGER)
		? Number.MAX_SAFE_INTEGER
		: Number(bytes);
}

export function hasDiskAdmission(
	diskFreeBytes: number,
	minimumFreeBytes: number
): boolean {
	return (
		Number.isSafeInteger(diskFreeBytes) &&
		diskFreeBytes >= 0 &&
		diskFreeBytes >= minimumFreeBytes
	);
}
