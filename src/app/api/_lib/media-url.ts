import { isIP } from "node:net";

export type PublicUrlResult =
	| { ok: true; url: URL }
	| { ok: false; status: number; error: string; message: string };

function isPrivateIpv4(hostname: string): boolean {
	const parts = hostname.split(".").map((part) => Number(part));
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
		return true;
	}

	const [a, b] = parts;
	return (
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		(a === 198 && (b === 18 || b === 19)) ||
		a >= 224
	);
}

function isPrivateIpv6(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return (
		normalized === "::1" ||
		normalized === "::" ||
		normalized.startsWith("fe80:") ||
		normalized.startsWith("fc") ||
		normalized.startsWith("fd")
	);
}

function isBlockedHostname(hostname: string): boolean {
	const normalized = hostname.toLowerCase().replace(/\.$/, "");
	if (!normalized) return true;
	if (normalized === "localhost" || normalized.endsWith(".localhost")) {
		return true;
	}

	const ipVersion = isIP(normalized);
	if (ipVersion === 4) return isPrivateIpv4(normalized);
	if (ipVersion === 6) return isPrivateIpv6(normalized);

	return false;
}

export function parsePublicHttpUrl(value: string | null): PublicUrlResult {
	if (!value) {
		return {
			ok: false,
			status: 400,
			error: "missing_url",
			message: "Missing url parameter.",
		};
	}

	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return {
			ok: false,
			status: 400,
			error: "invalid_url",
			message: "URL is not valid.",
		};
	}

	if (url.username || url.password) {
		return {
			ok: false,
			status: 400,
			error: "url_credentials_not_allowed",
			message: "URL credentials are not allowed.",
		};
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		return {
			ok: false,
			status: 400,
			error: "unsupported_protocol",
			message: "Only http and https URLs are supported.",
		};
	}

	if (isBlockedHostname(url.hostname)) {
		return {
			ok: false,
			status: 400,
			error: "blocked_host",
			message: "Private or local hosts cannot be proxied.",
		};
	}

	return { ok: true, url };
}

export async function fetchPublicHttpUrl(
	url: URL,
	init: RequestInit = {},
	redirectsRemaining = 3
): Promise<Response> {
	const response = await fetch(url, {
		...init,
		redirect: "manual",
	});

	if (
		response.status >= 300 &&
		response.status < 400 &&
		redirectsRemaining > 0
	) {
		const location = response.headers.get("location");
		if (!location) return response;

		const next = parsePublicHttpUrl(new URL(location, url).toString());
		if ("error" in next) return response;

		return fetchPublicHttpUrl(next.url, init, redirectsRemaining - 1);
	}

	return response;
}
