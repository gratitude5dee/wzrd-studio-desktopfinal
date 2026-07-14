import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const HOST = "127.0.0.1";
const NEXT_BIN = resolve("node_modules/next/dist/bin/next");
const STARTUP_TIMEOUT_MS = 60_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;

const errorShellPatterns = [
	/data-nextjs-error-page/i,
	/data-nextjs-dialog-overlay/i,
	/id=["']__next_error__["']/i,
	/<title>\s*(?:Build Error|Internal Server Error|500)\s*<\/title>/i,
	/Application error:\s*a (?:client-side|server-side) exception has occurred/i,
];

export function assertHealthyRootResponse(response, html) {
	if (response.status !== 200) {
		throw new Error(`GET / returned HTTP ${response.status}.`);
	}

	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.toLowerCase().includes("text/html")) {
		throw new Error(`GET / returned non-HTML content type: ${contentType || "missing"}.`);
	}

	if (!/<html(?:\s|>)/i.test(html) || !/<\/html>/i.test(html)) {
		throw new Error("GET / did not return a complete HTML document.");
	}

	if (!/<script(?:\s|>)/i.test(html) || !html.includes("/_next/static/")) {
		throw new Error("GET / did not include the Next.js client bootstrap.");
	}

	if (errorShellPatterns.some((pattern) => pattern.test(html))) {
		throw new Error("GET / returned a Next.js error shell.");
	}
}

async function getFreePort() {
	const server = createServer();
	server.unref();
	server.listen(0, HOST);
	await once(server, "listening");

	const address = server.address();
	if (!address || typeof address === "string") {
		server.close();
		throw new Error("Could not allocate a free port for the web smoke server.");
	}

	const { port } = address;
	server.close();
	await once(server, "close");
	return port;
}

async function runCommand(args) {
	const child = spawn(process.execPath, args, {
		cwd: process.cwd(),
		env: process.env,
		stdio: "inherit",
	});

	const [code, signal] = await once(child, "exit");
	if (code !== 0) {
		const detail = signal ? `signal ${signal}` : `exit code ${code}`;
		throw new Error(`bun ${args.join(" ")} failed with ${detail}.`);
	}
}

function terminateProcessGroup(child, signal) {
	if (!child || child.exitCode !== null || child.signalCode !== null) return;

	try {
		if (process.platform === "win32") {
			child.kill(signal);
		} else {
			process.kill(-child.pid, signal);
		}
	} catch (error) {
		if (error?.code !== "ESRCH") throw error;
	}
}

function waitForExit(child, timeoutMs) {
	return new Promise((resolveExit) => {
		if (child.exitCode !== null || child.signalCode !== null) {
			resolveExit(true);
			return;
		}

		const handleExit = () => {
			clearTimeout(timeout);
			resolveExit(true);
		};
		const timeout = setTimeout(() => {
			child.off("exit", handleExit);
			resolveExit(false);
		}, timeoutMs);
		child.once("exit", handleExit);
	});
}

async function stopServer(child) {
	if (!child || child.exitCode !== null || child.signalCode !== null) return;

	const gracefulExit = waitForExit(child, SHUTDOWN_TIMEOUT_MS);
	terminateProcessGroup(child, "SIGTERM");
	if (!(await gracefulExit)) {
		const forcedExit = waitForExit(child, SHUTDOWN_TIMEOUT_MS);
		terminateProcessGroup(child, "SIGKILL");
		if (!(await forcedExit)) {
			throw new Error("The production web server did not stop after SIGKILL.");
		}
	}
}

async function waitForHealthyRoot(child, url) {
	const deadline = Date.now() + STARTUP_TIMEOUT_MS;
	let lastConnectionError;

	while (Date.now() < deadline) {
		if (child.exitCode !== null || child.signalCode !== null) {
			throw new Error("The production web server exited before GET / completed.");
		}

		let response;
		try {
			response = await fetch(url, {
				redirect: "follow",
				signal: AbortSignal.timeout(5_000),
			});
		} catch (error) {
			lastConnectionError = error;
			await new Promise((resolve) => setTimeout(resolve, 250));
			continue;
		}

		const html = await response.text();
		assertHealthyRootResponse(response, html);
		return;
	}

	const detail = lastConnectionError?.message
		? ` Last connection error: ${lastConnectionError.message}`
		: "";
	throw new Error(`Timed out waiting for ${url}.${detail}`);
}

async function main() {
	console.log("Building the production web app...");
	await runCommand(["run", "web:build"]);

	const port = await getFreePort();
	const url = `http://${HOST}:${port}/`;
	const child = spawn(
		process.execPath,
		[NEXT_BIN, "start", "--hostname", HOST, "--port", String(port)],
		{
			cwd: process.cwd(),
			detached: process.platform !== "win32",
			env: { ...process.env, NODE_ENV: "production" },
			stdio: ["ignore", "inherit", "inherit"],
		}
	);

	const handleSignal = (signal) => {
		void stopServer(child).finally(() => {
			process.exit(signal === "SIGINT" ? 130 : 143);
		});
	};
	process.once("SIGINT", handleSignal);
	process.once("SIGTERM", handleSignal);

	try {
		await waitForHealthyRoot(child, url);
		console.log(`Web smoke passed: ${url} returned hydrated Next.js HTML.`);
	} finally {
		process.off("SIGINT", handleSignal);
		process.off("SIGTERM", handleSignal);
		await stopServer(child);
	}
}

const entrypoint = process.argv[1]
	? pathToFileURL(process.argv[1]).href
	: undefined;

if (import.meta.url === entrypoint) {
	main().catch((error) => {
		console.error(`Web smoke failed: ${error.message}`);
		process.exitCode = 1;
	});
}
