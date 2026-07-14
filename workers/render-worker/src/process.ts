import { spawn } from "node:child_process";

import { abortReason, throwIfAborted } from "./errors.js";

export interface CommandResult {
	stdout: string;
	stderr: string;
}

interface RunCommandOptions {
	command: string;
	args: readonly string[];
	signal: AbortSignal;
	maxOutputBytes?: number;
	onStderrLine?: (line: string) => void;
}

export async function runCommand({
	command,
	args,
	signal,
	maxOutputBytes = 2 * 1024 * 1024,
	onStderrLine,
}: RunCommandOptions): Promise<CommandResult> {
	throwIfAborted(signal);

	return await new Promise<CommandResult>((resolve, reject) => {
		const child = spawn(command, [...args], {
			stdio: ["ignore", "pipe", "pipe"],
			shell: false,
			windowsHide: true,
		});
		let stdout = "";
		let stderr = "";
		let stderrRemainder = "";
		let outputBytes = 0;
		let outputLimitExceeded = false;
		let settled = false;
		let aborted = false;

		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			signal.removeEventListener("abort", onAbort);
			callback();
		};
		const onAbort = () => {
			aborted = true;
			// Lease loss and cancellation must stop native work immediately. Do not
			// wait for a graceful FFmpeg shutdown while a stale generation can race.
			child.kill("SIGKILL");
		};
		signal.addEventListener("abort", onAbort, { once: true });
		if (signal.aborted) onAbort();
		const countOutput = (bytes: number) => {
			outputBytes += bytes;
			if (outputBytes > maxOutputBytes && !outputLimitExceeded) {
				outputLimitExceeded = true;
				child.kill("SIGKILL");
			}
		};

		child.once("error", (error) => finish(() => reject(error)));
		child.stdout.on("data", (chunk: Buffer) => {
			countOutput(chunk.length);
			if (outputBytes <= maxOutputBytes) stdout += chunk.toString("utf8");
		});
		child.stderr.on("data", (chunk: Buffer) => {
			countOutput(chunk.length);
			const text = chunk.toString("utf8");
			if (outputBytes <= maxOutputBytes) stderr += text;
			if (onStderrLine) {
				stderrRemainder += text;
				const lines = stderrRemainder.split(/\r?\n/);
				stderrRemainder = lines.pop() ?? "";
				for (const line of lines) onStderrLine(line);
			}
		});
		child.once("close", (code, processSignal) => {
			finish(() => {
				if (aborted || signal.aborted) {
					reject(abortReason(signal));
					return;
				}
				if (outputLimitExceeded) {
					reject(new Error(`${command} exceeded the output limit.`));
					return;
				}
				if (code !== 0) {
					reject(
						new Error(
							`${command} exited with ${code ?? processSignal ?? "unknown"}: ${stderr.slice(-4_000)}`
						)
					);
					return;
				}
				resolve({ stdout, stderr });
			});
		});
	});
}

export async function abortableDelay(
	milliseconds: number,
	signal: AbortSignal
): Promise<void> {
	throwIfAborted(signal);
	await new Promise<void>((resolve, reject) => {
		const timeout = setTimeout(() => {
			signal.removeEventListener("abort", onAbort);
			resolve();
		}, milliseconds);
		const onAbort = () => {
			clearTimeout(timeout);
			reject(abortReason(signal));
		};
		signal.addEventListener("abort", onAbort, { once: true });
	});
}
