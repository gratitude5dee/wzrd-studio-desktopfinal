import { stat, writeFile } from "node:fs/promises";
import { extname } from "node:path";

import type { WorkerConfig } from "./config.js";
import { WorkerError } from "./errors.js";
import type {
	ClipperVerticalManifestV1,
	QCutTimelineManifestV1,
	RenderAssetRef,
	RenderManifestV1,
} from "./manifest.js";
import { CommandExecutionError, runCommand } from "./process.js";
import { sha256File } from "./storage.js";
import type { LocalAsset, MediaProbe, OutputMetadata } from "./types.js";

type QCutTrack = QCutTimelineManifestV1["tracks"][number];
type QCutClip = QCutTrack["clips"][number];
type VisualClip = Extract<QCutClip, { type: "video" | "image" | "sticker" }>;
type SoundClip = Extract<QCutClip, { type: "video" | "audio" }>;

interface CompiledRender {
	args: string[];
	ass: string | null;
}

interface AssetResolver {
	resolve(source: RenderAssetRef): LocalAsset;
}

export interface OutputExpectation {
	width?: number;
	height?: number;
	durationSeconds?: number;
	fps?: number;
	requireAudio: boolean;
	videoCodec: "h264";
	audioCodec?: "aac";
}

interface AssEvent {
	layer: number;
	start: number;
	end: number;
	style: string;
	text: string;
}

function number(value: number): string {
	if (!Number.isFinite(value)) throw new Error("Compiler received a non-finite number.");
	return Number(value.toFixed(6)).toString();
}

function ffColor(value: string): string {
	const hex = value.slice(1);
	const rgb = hex.slice(0, 6);
	const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1;
	return `0x${rgb}@${number(alpha)}`;
}

function assColor(value: string, opacity = 1): string {
	const hex = value.slice(1);
	const red = hex.slice(0, 2);
	const green = hex.slice(2, 4);
	const blue = hex.slice(4, 6);
	const sourceAlpha = hex.length === 8 ? Number.parseInt(hex.slice(6), 16) / 255 : 1;
	const alpha = Math.round(255 * (1 - Math.max(0, Math.min(1, sourceAlpha * opacity))));
	return `&H${alpha.toString(16).padStart(2, "0")}${blue}${green}${red}`.toUpperCase();
}

function assTime(seconds: number): string {
	const centiseconds = Math.max(0, Math.round(seconds * 100));
	const hours = Math.floor(centiseconds / 360_000);
	const minutes = Math.floor((centiseconds % 360_000) / 6_000);
	const secs = Math.floor((centiseconds % 6_000) / 100);
	const fraction = centiseconds % 100;
	return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
		.toString()
		.padStart(2, "0")}.${fraction.toString().padStart(2, "0")}`;
}

function assText(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll("{", "\\{")
		.replaceAll("}", "\\}")
		.replaceAll("\r\n", "\\N")
		.replaceAll("\n", "\\N")
		.replaceAll("\r", "\\N");
}

function filterPath(value: string): string {
	return value
		.replaceAll("\\", "\\\\")
		.replaceAll(":", "\\:")
		.replaceAll("'", "\\'")
		.replaceAll(",", "\\,")
		.replaceAll("[", "\\[")
		.replaceAll("]", "\\]");
}

function assetKey(source: RenderAssetRef): string {
	return `${source.bucket}/${source.path}`;
}

export function createAssetResolver(assets: LocalAsset[]): AssetResolver {
	const byPath = new Map(assets.map((asset) => [assetKey(asset), asset]));
	return {
		resolve(source) {
			const asset = byPath.get(assetKey(source));
			if (!asset) throw new WorkerError("asset_not_found", `Missing local asset ${source.path}.`, false);
			return asset;
		},
	};
}

export function validateSourceRanges(
	manifest: RenderManifestV1,
	assets: LocalAsset[]
): void {
	if (manifest.kind === "media_ingest") return;
	const resolver = createAssetResolver(assets);
	const assertRange = (
		source: RenderAssetRef,
		startSeconds: number,
		durationSeconds: number,
		requiredStream: "audio" | "video"
	) => {
		const asset = resolver.resolve(source);
		if (
			(requiredStream === "video" && !asset.probe.hasVideo) ||
			(requiredStream === "audio" && !asset.probe.hasAudio)
		) {
			throw new WorkerError(
				"unsupported_media",
				`${source.path} does not contain the required ${requiredStream} stream.`,
				false
			);
		}
		const sourceEnd = startSeconds + durationSeconds;
		if (
			asset.probe.durationSeconds <= 0 ||
			sourceEnd > asset.probe.durationSeconds + 0.05
		) {
			throw new WorkerError(
				"unsupported_media",
				`Source trim for ${source.path} exceeds the probed media duration.`,
				false
			);
		}
	};

	if (manifest.kind === "clipper_vertical") {
		assertRange(
			manifest.source,
			manifest.trim.startSeconds,
			manifest.trim.durationSeconds,
			"video"
		);
		return;
	}
	for (const track of manifest.tracks) {
		if (track.type !== "video" && track.type !== "audio") continue;
		for (const clip of track.clips) {
			assertRange(
				clip.source,
				clip.sourceStartSeconds,
				clip.sourceDurationSeconds,
				clip.type
			);
		}
	}
}

const DETERMINISTIC_FFMPEG_ERROR =
	/(invalid (?:argument|data)|no such (?:file|filter)|matches no streams|error (?:initializing|reinitializing) filters|failed to configure output pad|could not find codec parameters|dimensions not set|width not divisible|height not divisible|concat.*parameters|unsupported codec|conversion failed)/i;

export function isDeterministicFfmpegFailure(error: unknown): boolean {
	return (
		error instanceof CommandExecutionError &&
		DETERMINISTIC_FFMPEG_ERROR.test(error.stderr)
	);
}

export function createFfmpegWorkerError(
	message: string,
	error: unknown
): WorkerError {
	return new WorkerError(
		"render_failed",
		message,
		!isDeterministicFfmpegFailure(error),
		{ cause: error }
	);
}

export function validateOutputExpectation(
	probe: MediaProbe,
	expectation: OutputExpectation
): void {
	const durationTolerance = expectation.fps
		? Math.max(0.05, 2 / expectation.fps)
		: 0.1;
	if (
		(expectation.width !== undefined && probe.width !== expectation.width) ||
		(expectation.height !== undefined && probe.height !== expectation.height) ||
		(expectation.durationSeconds !== undefined &&
			Math.abs(probe.durationSeconds - expectation.durationSeconds) >
				durationTolerance) ||
		probe.videoCodec !== expectation.videoCodec ||
		(expectation.requireAudio && !probe.hasAudio) ||
		(expectation.audioCodec !== undefined &&
			expectation.requireAudio &&
			probe.audioCodec !== expectation.audioCodec)
	) {
		throw new WorkerError(
			"output_invalid",
			"Rendered output does not match the manifest dimensions, duration, codecs, or required streams.",
			false
		);
	}
}

class FilterGraph {
	readonly filters: string[] = [];
	readonly inputArgs: string[] = [];
	private inputIndex = 1;
	private labelIndex = 0;

	label(prefix: string): string {
		return `${prefix}${this.labelIndex++}`;
	}

	addMediaInput(asset: LocalAsset, image: boolean, fps: number): number {
		const index = this.inputIndex++;
		if (image) {
			if (extname(asset.filePath).toLowerCase() === ".gif") {
				this.inputArgs.push("-stream_loop", "-1");
			} else {
				this.inputArgs.push("-loop", "1", "-framerate", number(fps));
			}
		}
		this.inputArgs.push("-i", asset.filePath);
		return index;
	}

	chain(source: string, filters: string[], prefix: string): string {
		const output = this.label(prefix);
		this.filters.push(`${source}${filters.join(",")}[${output}]`);
		return `[${output}]`;
	}
}

function effectsFor(
	clip: QCutClip,
	transitionFades: Map<string, { in: number[]; out: number[] }>
): { in: number[]; out: number[] } {
	const fades = transitionFades.get(clip.id) ?? { in: [], out: [] };
	if ("effects" in clip && clip.effects) {
		for (const effect of clip.effects) {
			(effect.type === "fade_in" ? fades.in : fades.out).push(effect.durationSeconds);
		}
	}
	return fades;
}

function transitionFades(
	manifest: QCutTimelineManifestV1,
	type: "crossfade" | "audio_crossfade"
): Map<string, { in: number[]; out: number[] }> {
	const result = new Map<string, { in: number[]; out: number[] }>();
	const entry = (id: string) => {
		let value = result.get(id);
		if (!value) {
			value = { in: [], out: [] };
			result.set(id, value);
		}
		return value;
	};
	for (const transition of manifest.transitions) {
		if (transition.type !== type) continue;
		entry(transition.fromClipId).out.push(transition.durationSeconds);
		entry(transition.toClipId).in.push(transition.durationSeconds);
	}
	return result;
}

function trimVideo(
	graph: FilterGraph,
	input: number,
	clip: Extract<QCutClip, { type: "video" }>
): string {
	if (!clip.wordCuts) {
		return graph.chain(
			`[${input}:v]`,
			[
				`trim=start=${number(clip.sourceStartSeconds)}:duration=${number(clip.sourceDurationSeconds)}`,
				"setpts=PTS-STARTPTS",
			],
			"vtrim"
		);
	}
	const splitLabels = clip.wordCuts.ranges.map(() => graph.label("vsplit"));
	graph.filters.push(
		`[${input}:v]split=${splitLabels.length}${splitLabels.map((label) => `[${label}]`).join("")}`
	);
	const segmentLabels = clip.wordCuts.ranges.map((range, index) => {
		const label = graph.label("vseg");
		graph.filters.push(
			`[${splitLabels[index]}]trim=start=${number(clip.sourceStartSeconds + range.startSeconds)}:end=${number(
				clip.sourceStartSeconds + range.endSeconds
			)},setpts=PTS-STARTPTS[${label}]`
		);
		return label;
	});
	const output = graph.label("vconcat");
	graph.filters.push(
		`${segmentLabels.map((label) => `[${label}]`).join("")}concat=n=${segmentLabels.length}:v=1:a=0[${output}]`
	);
	return `[${output}]`;
}

function trimAudio(
	graph: FilterGraph,
	input: number,
	clip: SoundClip
): string {
	if (!clip.wordCuts) {
		return graph.chain(
			`[${input}:a]`,
			[
				`atrim=start=${number(clip.sourceStartSeconds)}:duration=${number(clip.sourceDurationSeconds)}`,
				"asetpts=PTS-STARTPTS",
			],
			"atrim"
		);
	}
	const splitLabels = clip.wordCuts.ranges.map(() => graph.label("asplit"));
	graph.filters.push(
		`[${input}:a]asplit=${splitLabels.length}${splitLabels.map((label) => `[${label}]`).join("")}`
	);
	const segmentLabels = clip.wordCuts.ranges.map((range, index) => {
		const label = graph.label("aseg");
		graph.filters.push(
			`[${splitLabels[index]}]atrim=start=${number(clip.sourceStartSeconds + range.startSeconds)}:end=${number(
				clip.sourceStartSeconds + range.endSeconds
			)},asetpts=PTS-STARTPTS[${label}]`
		);
		return label;
	});
	const output = graph.label("aconcat");
	graph.filters.push(
		`${segmentLabels.map((label) => `[${label}]`).join("")}concat=n=${segmentLabels.length}:v=0:a=1[${output}]`
	);
	return `[${output}]`;
}

function transformVisual(
	graph: FilterGraph,
	source: string,
	clip: VisualClip,
	fps: number,
	fades: { in: number[]; out: number[] }
): string {
	const { transform } = clip;
	const filters = [
		`fps=${number(fps)}`,
		`scale='max(2,trunc(iw*${number(transform.scale.x)}/2)*2)':'max(2,trunc(ih*${number(
			transform.scale.y
		)}/2)*2)'`,
		"format=rgba",
	];
	if (transform.rotation !== 0) {
		filters.push(
			`rotate=${number((transform.rotation * Math.PI) / 180)}:ow=rotw(iw):oh=roth(ih):c=none`
		);
	}
	if (transform.opacity < 1) filters.push(`colorchannelmixer=aa=${number(transform.opacity)}`);
	for (const duration of fades.in) {
		filters.push(`fade=t=in:st=0:d=${number(duration)}:alpha=1`);
	}
	for (const duration of fades.out) {
		filters.push(
			`fade=t=out:st=${number(Math.max(0, clip.durationSeconds - duration))}:d=${number(duration)}:alpha=1`
		);
	}
	filters.push(`setpts=PTS+${number(clip.startSeconds)}/TB`);
	return graph.chain(source, filters, "visual");
}

function overlayVisual(
	graph: FilterGraph,
	base: string,
	overlay: string,
	clip: VisualClip,
	width: number,
	height: number
): string {
	const x = `(W-w)/2${clip.transform.position.x >= 0 ? "+" : ""}${number(
		clip.transform.position.x
	)}`;
	const y = `(H-h)/2${clip.transform.position.y >= 0 ? "+" : ""}${number(
		clip.transform.position.y
	)}`;
	return graph.chain(
		`${base}${overlay}`,
		[
			`overlay=x='${x}':y='${y}':eof_action=pass:shortest=0:format=auto:enable='between(t,${number(
				clip.startSeconds
			)},${number(clip.startSeconds + clip.durationSeconds)})'`,
			`crop=${width}:${height}:0:0`,
		],
		"overlay"
	);
}

function compileAudio(
	graph: FilterGraph,
	input: number,
	clip: SoundClip,
	muted: boolean,
	fades: { in: number[]; out: number[] }
): string {
	let source = trimAudio(graph, input, clip);
	const filters = ["aresample=48000", `volume=${muted || clip.audio.muted ? "0" : number(clip.audio.volume)}`];
	const fadeIns = [...fades.in];
	const fadeOuts = [...fades.out];
	if (clip.audio.fadeInSeconds > 0) fadeIns.push(clip.audio.fadeInSeconds);
	if (clip.audio.fadeOutSeconds > 0) fadeOuts.push(clip.audio.fadeOutSeconds);
	for (const duration of fadeIns) filters.push(`afade=t=in:st=0:d=${number(duration)}`);
	for (const duration of fadeOuts) {
		filters.push(
			`afade=t=out:st=${number(Math.max(0, clip.durationSeconds - duration))}:d=${number(duration)}`
		);
	}
	filters.push(`adelay=${Math.round(clip.startSeconds * 1_000)}:all=1`);
	source = graph.chain(source, filters, "audio");
	return source;
}

function effectTag(clip: Extract<QCutClip, { type: "text" }>): string {
	let fadeIn = 0;
	let fadeOut = 0;
	for (const effect of clip.effects ?? []) {
		if (effect.type === "fade_in") fadeIn = Math.max(fadeIn, effect.durationSeconds);
		if (effect.type === "fade_out") fadeOut = Math.max(fadeOut, effect.durationSeconds);
	}
	return fadeIn || fadeOut
		? `\\fad(${Math.round(fadeIn * 1_000)},${Math.round(fadeOut * 1_000)})`
		: "";
}

function compileAss(manifest: QCutTimelineManifestV1): string | null {
	const styles: string[] = [];
	const events: AssEvent[] = [];
	let styleIndex = 0;
	for (let trackIndex = 0; trackIndex < manifest.tracks.length; trackIndex += 1) {
		const track = manifest.tracks[trackIndex];
		if (!track || (track.type !== "text" && track.type !== "captions")) continue;
		for (const clip of track.clips) {
			const styleName = `Wzrd${styleIndex++}`;
			if (clip.type === "text") {
				const alignment = clip.style.textAlign === "left" ? 4 : clip.style.textAlign === "right" ? 6 : 5;
				const backgroundVisible = !clip.style.backgroundColor.endsWith("00");
				styles.push(
					[
						`Style: ${styleName}`,
						"DejaVu Sans",
						number(clip.style.fontSize),
						assColor(clip.style.color, clip.transform.opacity),
						assColor(clip.style.color, clip.transform.opacity),
						"&H00000000",
						assColor(clip.style.backgroundColor),
						clip.style.fontWeight === "bold" ? "-1" : "0",
						clip.style.fontStyle === "italic" ? "-1" : "0",
						clip.style.textDecoration === "underline" ? "-1" : "0",
						clip.style.textDecoration === "line-through" ? "-1" : "0",
						number(clip.transform.scale.x * 100),
						number(clip.transform.scale.y * 100),
						"0",
						number(clip.transform.rotation),
						backgroundVisible ? "3" : "1",
						backgroundVisible ? "6" : "0",
						"0",
						String(alignment),
						"0",
						"0",
						"0",
						"1",
					].join(",")
				);
				const x = manifest.output.width / 2 + clip.transform.position.x;
				const y = manifest.output.height / 2 + clip.transform.position.y;
				events.push({
					layer: trackIndex,
					start: clip.startSeconds,
					end: clip.startSeconds + clip.durationSeconds,
					style: styleName,
					text: `{\\pos(${number(x)},${number(y)})${effectTag(clip)}}${assText(clip.content)}`,
				});
				continue;
			}

			const alignment = clip.style.position.align === "top" ? 8 : clip.style.position.align === "center" ? 5 : 2;
			styles.push(
				[
					`Style: ${styleName}`,
					"DejaVu Sans",
					number(clip.style.fontSize),
					assColor(clip.style.fontColor, clip.style.fontOpacity),
					assColor(clip.style.fontColor, clip.style.fontOpacity),
					assColor(clip.style.outlineColor),
					assColor(clip.style.backgroundColor, clip.style.backgroundOpacity),
					clip.style.bold ? "-1" : "0",
					clip.style.italic ? "-1" : "0",
					clip.style.underline ? "-1" : "0",
					"0",
					"100",
					"100",
					"0",
					"0",
					clip.style.backgroundOpacity > 0 ? "3" : "1",
					number(clip.style.outlineWidth),
					number(Math.max(Math.abs(clip.style.shadowOffset.x), Math.abs(clip.style.shadowOffset.y))),
					String(alignment),
					"0",
					"0",
					"0",
					"1",
				].join(",")
			);
			const defaultY =
				clip.style.position.align === "top"
					? clip.style.fontSize
					: clip.style.position.align === "center"
						? manifest.output.height / 2
						: manifest.output.height - clip.style.fontSize;
			for (const segment of clip.segments) {
				events.push({
					layer: trackIndex,
					start: clip.startSeconds + segment.startSeconds,
					end: clip.startSeconds + segment.endSeconds,
					style: styleName,
					text: `{\\pos(${number(manifest.output.width / 2 + clip.style.position.x)},${number(
						defaultY + clip.style.position.y
					)})\\fsp${number((clip.style.lineSpacing - 1) * 2)}}${assText(segment.text)}`,
				});
			}
		}
	}
	if (events.length === 0) return null;
	return [
		"[Script Info]",
		"ScriptType: v4.00+",
		`PlayResX: ${manifest.output.width}`,
		`PlayResY: ${manifest.output.height}`,
		"ScaledBorderAndShadow: yes",
		"WrapStyle: 0",
		"",
		"[V4+ Styles]",
		"Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
		...styles,
		"",
		"[Events]",
		"Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
		...events.map(
			(event) =>
				`Dialogue: ${event.layer},${assTime(event.start)},${assTime(event.end)},${event.style},,0,0,0,,${event.text}`
		),
		"",
	].join("\n");
}

export function compileQCutManifest(
	manifest: QCutTimelineManifestV1,
	resolver: AssetResolver,
	outputPath: string,
	assPath: string
): CompiledRender {
	const graph = new FilterGraph();
	const visualFades = transitionFades(manifest, "crossfade");
	const audioTransitionFades = transitionFades(manifest, "audio_crossfade");
	const audioLabels: string[] = [];
	let currentVideo = "[0:v]";

	for (const track of manifest.tracks) {
		if (track.type === "video" || track.type === "image" || track.type === "sticker") {
			for (const clip of track.clips) {
				const asset = resolver.resolve(clip.source);
				if (!asset.probe.hasVideo) {
					throw new WorkerError("unsupported_media", `${clip.source.path} has no visual stream.`, false);
				}
				const input = graph.addMediaInput(asset, clip.type !== "video", manifest.output.fps);
				const source =
					clip.type === "video"
						? trimVideo(graph, input, clip)
						: graph.chain(
								`[${input}:v]`,
								[`trim=duration=${number(clip.durationSeconds)}`, "setpts=PTS-STARTPTS"],
								"still"
							);
				const transformed = transformVisual(
					graph,
					source,
					clip,
					manifest.output.fps,
					effectsFor(clip, visualFades)
				);
				currentVideo = overlayVisual(
					graph,
					currentVideo,
					transformed,
					clip,
					manifest.output.width,
					manifest.output.height
				);
				if (clip.type === "video" && asset.probe.hasAudio) {
					audioLabels.push(
						compileAudio(
							graph,
							input,
							clip,
							"muted" in track && track.muted,
							effectsFor(clip, audioTransitionFades)
						)
					);
				}
			}
			continue;
		}
		if (track.type === "audio") {
			for (const clip of track.clips) {
				const asset = resolver.resolve(clip.source);
				if (!asset.probe.hasAudio) {
					throw new WorkerError("unsupported_media", `${clip.source.path} has no audio stream.`, false);
				}
				const input = graph.addMediaInput(asset, false, manifest.output.fps);
				audioLabels.push(
					compileAudio(
						graph,
						input,
						clip,
						track.muted,
						effectsFor(clip, audioTransitionFades)
					)
				);
			}
		}
	}

	const ass = compileAss(manifest);
	if (ass) {
		currentVideo = graph.chain(
			currentVideo,
			[`subtitles=filename='${filterPath(assPath)}':fontsdir='/usr/share/fonts/truetype/dejavu'`],
			"subtitles"
		);
	}
	const videoOut = graph.chain(
		currentVideo,
		[`fps=${number(manifest.output.fps)}`, "format=yuv420p"],
		"vout"
	);
	let audioOut: string;
	if (audioLabels.length > 0) {
		audioOut = graph.chain(
			audioLabels.join(""),
			[
				`amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0:normalize=0`,
				`atrim=duration=${number(manifest.output.durationSeconds)}`,
				"asetpts=N/SR/TB",
			],
			"aout"
		);
	} else {
		const label = graph.label("aout");
		graph.filters.push(
			`anullsrc=r=48000:cl=stereo:d=${number(manifest.output.durationSeconds)}[${label}]`
		);
		audioOut = `[${label}]`;
	}

	return {
		ass,
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-nostdin",
			"-y",
			"-f",
			"lavfi",
			"-i",
			`color=c=${ffColor(manifest.output.backgroundColor)}:s=${manifest.output.width}x${manifest.output.height}:r=${number(
				manifest.output.fps
			)}:d=${number(manifest.output.durationSeconds)}`,
			...graph.inputArgs,
			"-filter_complex",
			graph.filters.join(";"),
			"-map",
			videoOut,
			"-map",
			audioOut,
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-b:a",
			"192k",
			"-movflags",
			"+faststart",
			"-t",
			number(manifest.output.durationSeconds),
			"-progress",
			"pipe:2",
			"-nostats",
			outputPath,
		],
	};
}

export function compileClipperManifest(
	manifest: ClipperVerticalManifestV1,
	resolver: AssetResolver,
	outputPath: string
): CompiledRender {
	const source = resolver.resolve(manifest.source);
	if (!source.probe.hasVideo) {
		throw new WorkerError("unsupported_media", "Clipper source has no video stream.", false);
	}
	const graph = new FilterGraph();
	const input = graph.addMediaInput(source, false, manifest.output.fps);
	let video = graph.chain(
		`[${input}:v]`,
		[
			`trim=start=${number(manifest.trim.startSeconds)}:duration=${number(manifest.trim.durationSeconds)}`,
			"setpts=PTS-STARTPTS",
			`scale=${manifest.output.width}:${manifest.output.height}:force_original_aspect_ratio=increase`,
			`crop=${manifest.output.width}:${manifest.output.height}`,
			`fps=${number(manifest.output.fps)}`,
			"format=yuv420p",
		],
		"clipper"
	);
	if (manifest.logo) {
		const logo = resolver.resolve(manifest.logo.source);
		if (!logo.probe.hasVideo) {
			throw new WorkerError("unsupported_media", "Clipper logo has no visual stream.", false);
		}
		const logoInput = graph.addMediaInput(logo, true, manifest.output.fps);
		const logoSource = graph.chain(
			`[${logoInput}:v]`,
			[`trim=duration=${number(manifest.output.durationSeconds)}`, "setpts=PTS-STARTPTS"],
			"logo"
		);
		const logoClip: VisualClip = {
			id: "clipper-logo",
			type: "sticker",
			source: manifest.logo.source,
			startSeconds: 0,
			durationSeconds: manifest.output.durationSeconds,
			transform: manifest.logo.transform,
		};
		const transformed = transformVisual(
			graph,
			logoSource,
			logoClip,
			manifest.output.fps,
			{ in: [], out: [] }
		);
		video = overlayVisual(
			graph,
			video,
			transformed,
			logoClip,
			manifest.output.width,
			manifest.output.height
		);
	}
	let audio: string;
	if (source.probe.hasAudio) {
		audio = graph.chain(
			`[${input}:a]`,
			[
				`atrim=start=${number(manifest.trim.startSeconds)}:duration=${number(manifest.trim.durationSeconds)}`,
				"asetpts=PTS-STARTPTS",
				"aresample=48000",
			],
			"clipaudio"
		);
	} else {
		const label = graph.label("clipaudio");
		graph.filters.push(
			`anullsrc=r=48000:cl=stereo:d=${number(manifest.output.durationSeconds)}[${label}]`
		);
		audio = `[${label}]`;
	}
	return {
		ass: null,
		args: [
			"-hide_banner",
			"-loglevel",
			"error",
			"-nostdin",
			"-y",
			"-f",
			"lavfi",
			"-i",
			`color=c=${ffColor(manifest.output.backgroundColor)}:s=${manifest.output.width}x${manifest.output.height}:r=${number(
				manifest.output.fps
			)}:d=${number(manifest.output.durationSeconds)}`,
			...graph.inputArgs,
			"-filter_complex",
			graph.filters.join(";"),
			"-map",
			video,
			"-map",
			audio,
			"-c:v",
			"libx264",
			"-preset",
			"medium",
			"-pix_fmt",
			"yuv420p",
			"-c:a",
			"aac",
			"-b:a",
			"192k",
			"-movflags",
			"+faststart",
			"-t",
			number(manifest.output.durationSeconds),
			"-progress",
			"pipe:2",
			"-nostats",
			outputPath,
		],
	};
}

export async function probeMedia(
	config: WorkerConfig,
	filePath: string,
	signal: AbortSignal
): Promise<MediaProbe> {
	let output: Awaited<ReturnType<typeof runCommand>>;
	try {
		output = await runCommand({
			command: config.ffprobePath,
			args: [
				"-v",
				"error",
				"-show_streams",
				"-show_format",
				"-print_format",
				"json",
				filePath,
			],
			signal,
		});
	} catch (error) {
		if (signal.aborted) throw signal.reason;
		throw new WorkerError("asset_probe_failed", "FFprobe could not inspect media.", false, {
			cause: error,
		});
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(output.stdout);
	} catch (error) {
		throw new WorkerError("asset_probe_failed", "FFprobe returned invalid metadata.", false, {
			cause: error,
		});
	}
	if (!parsed || typeof parsed !== "object") {
		throw new WorkerError("asset_probe_failed", "FFprobe returned no metadata.", false);
	}
	const record = parsed as { streams?: unknown; format?: unknown };
	const streams = Array.isArray(record.streams)
		? (record.streams.filter(
				(stream): stream is Record<string, unknown> => !!stream && typeof stream === "object"
			) as Record<string, unknown>[])
		: [];
	const video = streams.find((stream) => stream.codec_type === "video");
	const audio = streams.find((stream) => stream.codec_type === "audio");
	const format =
		record.format && typeof record.format === "object"
			? (record.format as Record<string, unknown>)
			: {};
	const durationCandidates = [format.duration, ...streams.map((stream) => stream.duration)]
		.map(Number)
		.filter((value) => Number.isFinite(value) && value >= 0);
	return {
		durationSeconds: durationCandidates.length > 0 ? Math.max(...durationCandidates) : 0,
		width: video ? Number(video.width) || null : null,
		height: video ? Number(video.height) || null : null,
		hasVideo: !!video,
		hasAudio: !!audio,
		videoCodec: video && typeof video.codec_name === "string" ? video.codec_name : null,
		audioCodec: audio && typeof audio.codec_name === "string" ? audio.codec_name : null,
		formatName: typeof format.format_name === "string" ? format.format_name : "unknown",
	};
}

export async function renderWithFfmpeg(
	config: WorkerConfig,
	compiled: CompiledRender,
	assPath: string,
	durationSeconds: number,
	signal: AbortSignal,
	onProgress: (percent: number) => void
): Promise<void> {
	if (compiled.ass) await writeFile(assPath, compiled.ass, { encoding: "utf8", mode: 0o600, flag: "wx" });
	let lastTime = 0;
	try {
		await runCommand({
			command: config.ffmpegPath,
			args: compiled.args,
			signal,
			maxOutputBytes: 8 * 1024 * 1024,
			onStderrLine(line) {
				const match = /^(?:out_time_us|out_time_ms)=(\d+)$/.exec(line);
				if (!match) return;
				const microseconds = Number(match[1]);
				if (!Number.isFinite(microseconds) || microseconds < lastTime) return;
				lastTime = microseconds;
				onProgress(Math.min(1, microseconds / 1_000_000 / durationSeconds));
			},
		});
	} catch (error) {
		if (signal.aborted) throw signal.reason;
		throw createFfmpegWorkerError(
			"FFmpeg failed to render the validated manifest.",
			error
		);
	}
}

export async function normalizeIngestMedia(
	config: WorkerConfig,
	inputPath: string,
	outputPath: string,
	durationSeconds: number,
	signal: AbortSignal,
	onProgress: (percent: number) => void
): Promise<void> {
	let lastTime = 0;
	try {
		await runCommand({
			command: config.ffmpegPath,
			args: [
				"-hide_banner",
				"-loglevel",
				"error",
				"-nostdin",
				"-y",
				"-i",
				inputPath,
				"-map",
				"0:v:0",
				"-map",
				"0:a?",
				"-vf",
				"scale=w='min(3840,iw)':h='min(2160,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
				"-c:v",
				"libx264",
				"-preset",
				"medium",
				"-c:a",
				"aac",
				"-b:a",
				"192k",
				"-movflags",
				"+faststart",
				"-t",
				number(durationSeconds),
				"-progress",
				"pipe:2",
				"-nostats",
				outputPath,
			],
			signal,
			maxOutputBytes: 8 * 1024 * 1024,
			onStderrLine(line) {
				const match = /^(?:out_time_us|out_time_ms)=(\d+)$/.exec(line);
				if (!match) return;
				const microseconds = Number(match[1]);
				if (!Number.isFinite(microseconds) || microseconds < lastTime) return;
				lastTime = microseconds;
				onProgress(Math.min(1, microseconds / 1_000_000 / durationSeconds));
			},
		});
	} catch (error) {
		if (signal.aborted) throw signal.reason;
		throw createFfmpegWorkerError(
			"FFmpeg failed to normalize completed Apify media.",
			error
		);
	}
}

export async function inspectOutput(
	config: WorkerConfig,
	filePath: string,
	signal: AbortSignal,
	expectation?: OutputExpectation
): Promise<OutputMetadata> {
	const [file, probe, sha256] = await Promise.all([
		stat(filePath),
		probeMedia(config, filePath, signal),
		sha256File(filePath, signal),
	]);
	if (
		!probe.hasVideo ||
		!probe.width ||
		!probe.height ||
		file.size < 1 ||
		file.size > 2 * 1024 * 1024 * 1024 ||
		probe.durationSeconds <= 0 ||
		probe.durationSeconds > 1_800 ||
		probe.width > 3_840 ||
		probe.height > 2_160
	) {
		throw new WorkerError("output_invalid", "Rendered output metadata is outside contract bounds.", false);
	}
	if (expectation) {
		validateOutputExpectation(probe, expectation);
	}
	return {
		bytes: file.size,
		durationSeconds: Number(probe.durationSeconds.toFixed(6)),
		width: probe.width,
		height: probe.height,
		sha256,
	};
}
