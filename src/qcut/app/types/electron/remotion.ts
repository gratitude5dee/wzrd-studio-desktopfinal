/**
 * Remotion folder import types.
 *
 * These describe the Electron IPC payloads consumed by the editor. The web
 * build cannot import Electron preload declarations, so the shared surface is
 * kept local and intentionally structural.
 */

export interface RemotionCompositionInfo {
	id: string;
	name: string;
	durationInFrames: number;
	fps: number;
	width: number;
	height: number;
	componentPath: string;
	importPath: string;
	line: number;
}

export interface RemotionFolderSelectResult {
	success: boolean;
	cancelled?: boolean;
	folderPath?: string;
	error?: string;
}

export interface RemotionFolderScanResult {
	success: boolean;
	folderPath?: string;
	compositions?: RemotionCompositionInfo[];
	error?: string;
}

export interface RemotionBundleResult {
	compositionId: string;
	success: boolean;
	code?: string;
	sourceMap?: string;
	error?: string;
}

export interface RemotionFolderBundleResult {
	success: boolean;
	folderPath?: string;
	results?: RemotionBundleResult[];
	error?: string;
}

export interface RemotionFolderImportResult {
	success: boolean;
	folderPath?: string;
	scan?: RemotionFolderScanResult;
	bundle?: RemotionFolderBundleResult;
	importTime?: number;
	error?: string;
}
