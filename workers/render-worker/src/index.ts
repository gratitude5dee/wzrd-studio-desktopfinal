import { loadConfig } from "./config.js";
import {
	closeHealthServer,
	startHealthServer,
	type WorkerHealthState,
} from "./health.js";
import { createWorkerSupabase } from "./supabase.js";
import { RenderWorker } from "./worker.js";

async function main(): Promise<void> {
	const config = loadConfig();
	const shutdown = new AbortController();
	const state: WorkerHealthState = {
		workerId: config.workerId,
		capacity: config.concurrency,
		active: 0,
		startedAt: new Date().toISOString(),
		lastClaimAt: null,
		lastClaimError: null,
		shuttingDown: false,
	};
	const healthServer = await startHealthServer(config.port, state);
	const requestShutdown = (signal: string) => {
		if (shutdown.signal.aborted) return;
		state.shuttingDown = true;
		shutdown.abort(new Error(`Worker received ${signal}.`));
	};
	process.once("SIGTERM", () => requestShutdown("SIGTERM"));
	process.once("SIGINT", () => requestShutdown("SIGINT"));

	console.info(
		JSON.stringify({
			level: "info",
			action: "worker_started",
			workerId: config.workerId,
			port: config.port,
			concurrency: config.concurrency,
		})
	);

	try {
		const worker = new RenderWorker(
			createWorkerSupabase(config),
			config,
			state,
			shutdown.signal
		);
		await worker.run();
	} finally {
		state.shuttingDown = true;
		await closeHealthServer(healthServer);
	}
}

main().catch((error: unknown) => {
	console.error(
		JSON.stringify({
			level: "fatal",
			action: "worker_crashed",
			error: error instanceof Error ? error.message : String(error),
		})
	);
	process.exitCode = 1;
});
