/**
 * Minimal Claude bridge types for the vendored QCut editor.
 *
 * WZRD-EDIT: In QCUT_SRC this file lives in the Electron package. We only
 * need a small subset in Phase 1 so the vendored `claude-bridge/*` modules
 * and their unit tests compile.
 */

// ---------------------------------------------------------------------------
// Snapshot versioning / safety
// ---------------------------------------------------------------------------

export const EDITOR_STATE_SNAPSHOT_VERSION = 1 as const;

// When thumbnails are huge base64 strings we strip them before transport.
export const STRIPPED_THUMBNAIL_SENTINEL = "__WZRD_STRIPPED_THUMBNAIL__" as const;

// ---------------------------------------------------------------------------
// Editor Events
// ---------------------------------------------------------------------------

export const CLAUDE_EDITOR_EVENT_CATEGORY = {
	editorPlayheadMoved: "editor.playheadMoved",
	editorSelectionChanged: "editor.selectionChanged",
	timelineElementAdded: "timeline.elementAdded",
	timelineElementUpdated: "timeline.elementUpdated",
	timelineElementRemoved: "timeline.elementRemoved",
	mediaImported: "media.imported",
	mediaDeleted: "media.deleted",
	projectSettingsChanged: "project.settingsChanged",
} as const;

export const CLAUDE_EDITOR_EVENT_ACTION = {
	playheadMoved: "playheadMoved",
	selectionChanged: "selectionChanged",
	elementAdded: "elementAdded",
	elementUpdated: "elementUpdated",
	elementRemoved: "elementRemoved",
	imported: "imported",
	deleted: "deleted",
	settingsChanged: "settingsChanged",
} as const;

export type EventCategory =
	(typeof CLAUDE_EDITOR_EVENT_CATEGORY)[keyof typeof CLAUDE_EDITOR_EVENT_CATEGORY];

export type EditorEvent = {
	eventId: string;
	timestamp: number;
	category: EventCategory;
	action: string;
	label?: string;
	value?: string | number | boolean | null;
	metadata?: Record<string, unknown>;
	source?: string;
	correlationId?: string;
};

// ---------------------------------------------------------------------------
// Editor state snapshots
// ---------------------------------------------------------------------------

export enum StateSection {
	TIMELINE = "timeline",
	SELECTION = "selection",
	PLAYHEAD = "playhead",
	MEDIA = "media",
	EDITOR = "editor",
	UI = "ui",
	PROJECT = "project",
}

export type EditorStateRequest = {
	include?: Array<StateSection>;
	media?: {
		includeThumbnails?: boolean;
		[key: string]: unknown;
	};
	[key: string]: unknown;
};

export type ProjectMetadataSnapshot = {
	projectId?: string | null;
	id?: string;
	name: string | null;
	[key: string]: unknown;
};

export type TimelineSnapshotTrack = {
	id: string;
	name?: string;
	type: string;
	index: number;
	elements: unknown[];
};

export type MediaStateSnapshotItem = {
	id?: string;
	name?: string;
	type?: string;
	url?: string;
	localPath?: string;
	[key: string]: unknown;
};

export type ModalSnapshotItem = {
	id?: string;
	type?: string;
	open?: boolean;
	[key: string]: unknown;
};

export type BlockerSnapshotItem = {
	id?: string;
	reason?: string;
	kind?: string;
	[key: string]: unknown;
};

export type EditorStateSnapshotState = {
	timeline?: {
		tracks?: TimelineSnapshotTrack[];
		selection?: unknown;
		playhead?: unknown;
		autoSave?: unknown;
		history?: unknown;
		[key: string]: unknown;
	};
	media?: {
		items?: MediaStateSnapshotItem[];
		counts?: Record<string, number>;
		isLoading?: boolean;
		hasInitialized?: boolean;
		[key: string]: unknown;
	};
	editor?: Record<string, unknown>;
	project?: Record<string, unknown>;
	[key: string]: unknown;
};

export type EditorStateSnapshot = {
	version: number;
	timestamp?: number;
	state: EditorStateSnapshotState;
	project?: ProjectMetadataSnapshot;
	timeline?: {
		tracks: TimelineSnapshotTrack[];
		selection?: unknown;
		playhead?: unknown;
	};
	media?: {
		items: MediaStateSnapshotItem[];
	};
	ui?: {
		modals?: ModalSnapshotItem[];
		blockers?: BlockerSnapshotItem[];
	};
	meta?: Record<string, unknown>;
	[key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Timeline import/export types referenced by the bridge
// ---------------------------------------------------------------------------

export interface ClaudeTimeline {
	name: string;
	duration: number;
	width: number;
	height: number;
	fps: number;
	tracks: ClaudeTrack[];
}

export interface ClaudeTrack {
	id?: string;
	index: number;
	name: string;
	type: string;
	elements: ClaudeElement[];
}

export interface ClaudeElement {
	id: string;
	trackIndex: number;
	startTime: number;
	endTime: number;
	duration: number;
	type: string;
	sourceId?: string;
	sourceName?: string;
	mediaId?: string;
	trackId?: string;
	name?: string;
	content?: string;
	text?: string;
	language?: string;
	markdownContent?: string;
	style?: Record<string, unknown>;
	props?: Record<string, unknown>;
	effects?: string[];
	trimStart?: number;
	trimEnd?: number;
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	rotation?: number;
	opacity?: number;
	backgroundColor?: string;
	textColor?: string;
	stickerId?: string;
	componentId?: string;
	componentPath?: string;
	folderPath?: string;
	[key: string]: unknown;
}

export type ClaudeTrackElement = ClaudeElement;
export type ClaudeMediaElement = ClaudeElement;
export type ClaudeTextElement = ClaudeElement;
export type ClaudeCaptionElement = ClaudeElement;
export type ClaudeMarkdownElement = ClaudeElement;
export type ClaudeRemotionElement = ClaudeElement;
export type ClaudeStickerElement = ClaudeElement;

export type ClaudeBatchAddElementRequest = Partial<ClaudeElement> & {
	trackId: string;
	type: string;
	startTime: number;
	duration: number;
	[key: string]: unknown;
};

export type ClaudeBatchResultItem = {
	index: number;
	success: boolean;
	elementId?: string;
	error?: string;
	[key: string]: unknown;
};

export type ClaudeBatchAddResponse = {
	added: ClaudeBatchResultItem[];
	failedCount: number;
	[key: string]: unknown;
};

export type ClaudeBatchUpdateItemRequest = {
	elementId: string;
	[key: string]: unknown;
};

export type ClaudeBatchUpdateResponse = {
	updatedCount: number;
	failedCount: number;
	results: ClaudeBatchResultItem[];
	[key: string]: unknown;
};

export type ClaudeBatchDeleteItemRequest = {
	trackId: string;
	elementId: string;
	[key: string]: unknown;
};

export type ClaudeBatchDeleteResponse = {
	deletedCount: number;
	failedCount: number;
	results: ClaudeBatchResultItem[];
	[key: string]: unknown;
};

export type ClaudeArrangeRequest = {
	trackId: string;
	mode?: "manual" | "spaced" | string;
	order?: string[];
	startOffset?: number;
	gap?: number;
	[key: string]: unknown;
};

export type ClaudeArrangeResponse = {
	arranged: Array<{ elementId: string; newStartTime: number }>;
	[key: string]: unknown;
};

export type ClaudeMoveRequest = {
	elementId: string;
	targetTrackId?: string;
	startTime?: number;
	[key: string]: unknown;
};

export type ClaudeSelectionItem = {
	trackId?: string;
	elementId: string;
	[key: string]: unknown;
};

export type ClaudeRangeDeleteRequest = {
	trackId?: string;
	startTime: number;
	endTime: number;
	[key: string]: unknown;
};

export type ClaudeRangeDeleteResponse = {
	deletedCount: number;
	[key: string]: unknown;
};

export type ClaudeSplitResponse = {
	success: boolean;
	[key: string]: unknown;
};

export type BatchCutResponse = {
	success: boolean;
	[key: string]: unknown;
};

export type MediaFile = {
	id: string;
	name: string;
	type?: string;
	path?: string;
	url?: string;
	size?: number;
	[key: string]: unknown;
};

export type ProjectSettings = Record<string, unknown>;
export type ProjectStats = Record<string, unknown>;
export type ExportPreset = Record<string, unknown>;
export type ExportRecommendation = Record<string, unknown>;
export type ErrorReport = Record<string, unknown>;
export type DiagnosticResult = Record<string, unknown>;
