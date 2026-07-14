import { createServer, type Server } from "node:http";

export interface WorkerHealthState {
	workerId: string;
	capacity: number;
	active: number;
	startedAt: string;
	lastClaimAt: string | null;
	lastClaimError: string | null;
	shuttingDown: boolean;
}

export function startHealthServer(
	port: number,
	state: WorkerHealthState
): Promise<Server> {
	const server = createServer((request, response) => {
		if (request.method !== "GET" || request.url !== "/healthz") {
			response.writeHead(404, { "content-type": "application/json" });
			response.end(JSON.stringify({ error: "not_found" }));
			return;
		}
		const lastClaimAge = state.lastClaimAt
			? Date.now() - Date.parse(state.lastClaimAt)
			: Number.POSITIVE_INFINITY;
		const healthy =
			!state.shuttingDown &&
			(!state.lastClaimError || lastClaimAge < 2 * 60 * 1_000);
		response.writeHead(healthy ? 200 : 503, {
			"content-type": "application/json",
			"cache-control": "no-store",
		});
		response.end(
			JSON.stringify({
				status: healthy ? "ok" : "shutting_down",
				workerId: state.workerId,
				capacity: state.capacity,
				active: state.active,
				startedAt: state.startedAt,
				lastClaimAt: state.lastClaimAt,
				lastClaimError: state.lastClaimError,
			})
		);
	});
	return new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, "0.0.0.0", () => {
			server.removeListener("error", reject);
			resolve(server);
		});
	});
}

export async function closeHealthServer(server: Server): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()));
	});
}
