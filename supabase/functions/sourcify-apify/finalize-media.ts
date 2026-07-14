export const MAX_SOURCIFY_REDIRECTS = 3;
export const MAX_SOURCIFY_MEDIA_BYTES = 2 * 1024 * 1024 * 1024;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const PRIVATE_HOSTS = new Set(["localhost", "local", "internal", "home.arpa"]);
const PRIVATE_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

export type DnsResolver = (hostname: string) => Promise<readonly string[]>;

export type SourcifyMediaErrorCode =
  | "invalid_url"
  | "https_required"
  | "url_credentials_forbidden"
  | "url_port_forbidden"
  | "untrusted_media_host"
  | "private_destination"
  | "dns_resolution_failed"
  | "redirect_location_missing"
  | "too_many_redirects"
  | "media_fetch_failed"
  | "media_fetch_status"
  | "media_content_type_invalid"
  | "media_content_length_invalid"
  | "media_too_large"
  | "media_body_missing"
  | "media_stream_failed"
  | "media_stream_length_mismatch";

export class SourcifyMediaError extends Error {
  readonly code: SourcifyMediaErrorCode;

  constructor(code: SourcifyMediaErrorCode, message: string) {
    super(message);
    this.name = "SourcifyMediaError";
    this.code = code;
  }
}

function parseIpv4(value: string): [number, number, number, number] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    return Number(part);
  });
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return octets as [number, number, number, number];
}

function parseIpv6(value: string): number[] | null {
  let normalized = value.toLowerCase();
  if (normalized.startsWith("[") && normalized.endsWith("]")) {
    normalized = normalized.slice(1, -1);
  }
  if (!normalized || normalized.includes("%")) return null;

  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    if (separator < 0) return null;
    const ipv4 = parseIpv4(normalized.slice(separator + 1));
    if (!ipv4) return null;
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    normalized = `${normalized.slice(0, separator)}:${high}:${low}`;
  }

  if ((normalized.match(/::/g) ?? []).length > 1) return null;
  const hasCompression = normalized.includes("::");
  const [leftPart, rightPart = ""] = normalized.split("::");
  const left = leftPart ? leftPart.split(":") : [];
  const right = rightPart ? rightPart.split(":") : [];
  const groups = [...left, ...right];

  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  if ((!hasCompression && groups.length !== 8) || (hasCompression && groups.length >= 8)) return null;

  const fill = hasCompression ? Array(8 - groups.length).fill("0") : [];
  return [...left, ...fill, ...right].map((group) => Number.parseInt(group, 16));
}

function isPublicIpv4(octets: [number, number, number, number]): boolean {
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
  if (a === 192 && b === 31 && c === 196) return false;
  if (a === 192 && b === 52 && c === 193) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 192 && b === 175 && c === 48) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function isPublicIpv6(groups: number[]): boolean {
  if (groups.length !== 8) return false;

  const isMappedIpv4 = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
  const isCompatibleIpv4 = groups.slice(0, 6).every((group) => group === 0);
  if (isMappedIpv4 || isCompatibleIpv4) {
    return isPublicIpv4([
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ]);
  }

  const first = groups[0];
  const second = groups[1];
  if ((first & 0xe000) !== 0x2000) return false;
  if (first === 0x2001 && second <= 0x01ff) return false; // IETF protocol assignments (2001::/23).
  if (first === 0x2001 && second === 0x0db8) return false; // Documentation.
  if (first === 0x2002) return false; // 6to4 can embed a private IPv4 destination.
  if (first === 0x3fff && (second & 0xf000) === 0) return false; // Documentation.
  return true;
}

export function isPublicIpAddress(value: string): boolean {
  const ipv4 = parseIpv4(value);
  if (ipv4) return isPublicIpv4(ipv4);
  const ipv6 = parseIpv6(value);
  return ipv6 ? isPublicIpv6(ipv6) : false;
}

function isIpAddress(value: string): boolean {
  return Boolean(parseIpv4(value) || parseIpv6(value));
}

function normalizedHostname(url: URL): string {
  const hostname = url.hostname.toLowerCase();
  const unwrapped = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return unwrapped.replace(/\.+$/, "");
}

const TRUSTED_MEDIA_HOST_SUFFIXES = [
  ".googlevideo.com",
  ".ytimg.com",
  ".youtube.com",
  ".tiktokcdn.com",
  ".tiktokcdn-us.com",
  ".cdninstagram.com",
  ".fbcdn.net",
  ".twitch.tv",
  ".ttvnw.net",
  ".apifyusercontent.com",
  ".apify.com",
  // Reserved, non-routable suffix used by deterministic unit tests.
  ".example",
];

function isTrustedMediaHostname(hostname: string): boolean {
  return TRUSTED_MEDIA_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix),
  );
}

export async function validatePublicHttpsUrl(rawUrl: string, resolveDns: DnsResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SourcifyMediaError("invalid_url", "The source media URL is invalid. Re-run Sourcify and try again.");
  }

  if (url.protocol !== "https:") {
    throw new SourcifyMediaError("https_required", "Only HTTPS source media URLs can be saved.");
  }
  if (url.username || url.password) {
    throw new SourcifyMediaError("url_credentials_forbidden", "Source media URLs cannot contain credentials.");
  }
  if (url.port && url.port !== "443") {
    throw new SourcifyMediaError("url_port_forbidden", "Source media URLs must use the standard HTTPS port.");
  }

  const hostname = normalizedHostname(url);
  if (!hostname) {
    throw new SourcifyMediaError("invalid_url", "The source media URL is invalid. Re-run Sourcify and try again.");
  }
  if (
    PRIVATE_HOSTS.has(hostname) ||
    PRIVATE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new SourcifyMediaError("private_destination", "The source media URL points to a private destination.");
  }
  if (isIpAddress(hostname)) {
    if (!isPublicIpAddress(hostname)) {
      throw new SourcifyMediaError("private_destination", "The source media URL points to a private destination.");
    }
  } else {
    let addresses: readonly string[];
    try {
      addresses = await resolveDns(hostname);
    } catch {
      throw new SourcifyMediaError("dns_resolution_failed", "The source media hostname could not be resolved safely.");
    }
    if (addresses.length === 0) {
      throw new SourcifyMediaError("dns_resolution_failed", "The source media hostname could not be resolved safely.");
    }
    if (addresses.some((address) => !isIpAddress(address) || !isPublicIpAddress(address))) {
      throw new SourcifyMediaError("private_destination", "The source media hostname resolves to a private destination.");
    }
  }
  if (!isTrustedMediaHostname(hostname)) {
    throw new SourcifyMediaError(
      "untrusted_media_host",
      "The source media host is not an approved Sourcify delivery network. Re-run Sourcify to refresh the source.",
    );
  }

  url.hash = "";
  return url;
}

export type ValidatedMediaResponse = {
  response: Response;
  finalUrl: URL;
  contentType: string;
  contentLength: number;
  redirectCount: number;
};

export async function fetchValidatedMedia(input: {
  url: string;
  resolveDns: DnsResolver;
  fetchImpl?: typeof fetch;
  maxBytes?: number;
  maxRedirects?: number;
}): Promise<ValidatedMediaResponse> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const maxBytes = input.maxBytes ?? MAX_SOURCIFY_MEDIA_BYTES;
  const maxRedirects = Math.min(input.maxRedirects ?? MAX_SOURCIFY_REDIRECTS, MAX_SOURCIFY_REDIRECTS);
  let currentUrl = await validatePublicHttpsUrl(input.url, input.resolveDns);
  let redirectCount = 0;

  while (true) {
    let response: Response;
    try {
      response = await fetchImpl(currentUrl, {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: "video/*, audio/*, image/*",
        },
      });
    } catch {
      throw new SourcifyMediaError("media_fetch_failed", "The source media could not be downloaded. Re-run Sourcify and try again.");
    }

    if (REDIRECT_STATUSES.has(response.status)) {
      await response.body?.cancel().catch(() => undefined);
      if (redirectCount >= maxRedirects) {
        throw new SourcifyMediaError("too_many_redirects", "The source media URL redirected too many times.");
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new SourcifyMediaError("redirect_location_missing", "The source media redirect was invalid.");
      }

      let redirectedUrl: URL;
      try {
        redirectedUrl = new URL(location, currentUrl);
      } catch {
        throw new SourcifyMediaError("redirect_location_missing", "The source media redirect was invalid.");
      }
      currentUrl = await validatePublicHttpsUrl(redirectedUrl.toString(), input.resolveDns);
      redirectCount += 1;
      continue;
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw new SourcifyMediaError(
        "media_fetch_status",
        `The source media download failed with HTTP ${response.status}. Re-run Sourcify to refresh the source.`,
      );
    }

    const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
    if (!/^(video|audio|image)\/[a-z0-9.+-]+$/i.test(contentType) || contentType === "image/svg+xml") {
      await response.body?.cancel().catch(() => undefined);
      throw new SourcifyMediaError(
        "media_content_type_invalid",
        "The source did not return a supported video, audio, or image content type.",
      );
    }

    const rawContentLength = response.headers.get("content-length")?.trim() ?? "";
    if (!/^\d+$/.test(rawContentLength)) {
      await response.body?.cancel().catch(() => undefined);
      throw new SourcifyMediaError(
        "media_content_length_invalid",
        "The source did not provide a valid Content-Length, so it cannot be saved safely.",
      );
    }
    const contentLength = Number(rawContentLength);
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
      await response.body?.cancel().catch(() => undefined);
      throw new SourcifyMediaError(
        "media_content_length_invalid",
        "The source did not provide a valid Content-Length, so it cannot be saved safely.",
      );
    }
    if (contentLength > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      throw new SourcifyMediaError("media_too_large", `The source media exceeds the ${formatByteLimit(maxBytes)} save limit.`);
    }
    if (!response.body) {
      throw new SourcifyMediaError("media_body_missing", "The source returned no media body. Re-run Sourcify and try again.");
    }

    return { response, finalUrl: currentUrl, contentType, contentLength, redirectCount };
  }
}

function formatByteLimit(bytes: number): string {
  if (bytes % (1024 * 1024 * 1024) === 0) return `${bytes / (1024 * 1024 * 1024)}GB`;
  return `${Math.ceil(bytes / (1024 * 1024))}MB`;
}

export function createByteLimitedStream(
  source: ReadableStream<Uint8Array>,
  options: { maxBytes: number; expectedBytes: number },
) {
  const reader = source.getReader();
  let bytesRead = 0;
  let failure: SourcifyMediaError | null = null;

  const fail = async (error: SourcifyMediaError, controller: ReadableStreamDefaultController<Uint8Array>) => {
    failure = error;
    await reader.cancel(error).catch(() => undefined);
    controller.error(error);
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          if (bytesRead !== options.expectedBytes) {
            await fail(
              new SourcifyMediaError(
                "media_stream_length_mismatch",
                "The source media ended before its declared Content-Length. Re-run Sourcify and try again.",
              ),
              controller,
            );
            return;
          }
          controller.close();
          return;
        }

        const nextByteCount = bytesRead + value.byteLength;
        if (nextByteCount > options.maxBytes) {
          await fail(
            new SourcifyMediaError("media_too_large", `The source media exceeds the ${formatByteLimit(options.maxBytes)} save limit.`),
            controller,
          );
          return;
        }
        if (nextByteCount > options.expectedBytes) {
          await fail(
            new SourcifyMediaError(
              "media_stream_length_mismatch",
              "The source media exceeded its declared Content-Length and was stopped.",
            ),
            controller,
          );
          return;
        }

        bytesRead = nextByteCount;
        controller.enqueue(value);
      } catch (error) {
        const safeError = error instanceof SourcifyMediaError
          ? error
          : new SourcifyMediaError("media_stream_failed", "The source media stream failed before upload completed.");
        failure = safeError;
        controller.error(safeError);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason).catch(() => undefined);
    },
  });

  return {
    stream,
    getBytesRead: () => bytesRead,
    getFailure: () => failure,
  };
}

export type SourcifyFinalizeReference = {
  id?: unknown;
  runId?: unknown;
  datasetId?: unknown;
  actorKey?: unknown;
  actorId?: unknown;
  topic?: unknown;
};

export type TrustedSourcifyRun = {
  defaultDatasetId?: string;
  actorId?: string;
};

export class SourcifyProvenanceError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "SourcifyProvenanceError";
  }
}

function requiredReferenceString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function resolveTrustedFinalizeResults<T extends { id: string }>(input: {
  references: readonly SourcifyFinalizeReference[];
  loadRun: (runId: string) => Promise<TrustedSourcifyRun>;
  loadDataset: (datasetId: string, actorKey?: string) => Promise<readonly T[]>;
}) {
  const runCache = new Map<string, Promise<TrustedSourcifyRun>>();
  const datasetCache = new Map<string, Promise<readonly T[]>>();
  const seen = new Set<string>();
  const resolved: Array<{
    reference: {
      id: string;
      runId: string;
      datasetId: string;
      actorKey?: string;
      actorId?: string;
      topic?: string;
    };
    run: TrustedSourcifyRun;
    item: T;
  }> = [];

  for (const rawReference of input.references) {
    const id = requiredReferenceString(rawReference?.id);
    const runId = requiredReferenceString(rawReference?.runId);
    const datasetId = requiredReferenceString(rawReference?.datasetId);
    if (!id || !runId || !datasetId) {
      throw new SourcifyProvenanceError(
        "A selected result is missing run/dataset provenance. Re-run Sourcify and select a fresh result.",
      );
    }

    const actorKey = requiredReferenceString(rawReference.actorKey) ?? undefined;
    const actorId = requiredReferenceString(rawReference.actorId) ?? undefined;
    const topic = requiredReferenceString(rawReference.topic) ?? undefined;
    const selectionKey = `${runId}\u0000${datasetId}\u0000${id}`;
    if (seen.has(selectionKey)) {
      throw new SourcifyProvenanceError("The same Sourcify result cannot be finalized more than once per request.");
    }
    seen.add(selectionKey);

    let runPromise = runCache.get(runId);
    if (!runPromise) {
      runPromise = input.loadRun(runId);
      runCache.set(runId, runPromise);
    }
    const run = await runPromise;
    if (!run.defaultDatasetId || run.defaultDatasetId !== datasetId) {
      throw new SourcifyProvenanceError(
        "A selected result does not belong to the supplied Sourcify run dataset. Re-run Sourcify and try again.",
      );
    }
    if (actorId && run.actorId && actorId !== run.actorId) {
      throw new SourcifyProvenanceError(
        "A selected result does not belong to the supplied Sourcify actor run. Re-run Sourcify and try again.",
      );
    }

    const datasetKey = `${datasetId}\u0000${actorKey ?? ""}`;
    let datasetPromise = datasetCache.get(datasetKey);
    if (!datasetPromise) {
      datasetPromise = input.loadDataset(datasetId, actorKey);
      datasetCache.set(datasetKey, datasetPromise);
    }
    const items = await datasetPromise;
    const item = items.find((candidate) => candidate.id === id);
    if (!item) {
      throw new SourcifyProvenanceError(
        "A selected result was not found in the supplied Sourcify run dataset. Re-run Sourcify and try again.",
      );
    }

    resolved.push({
      reference: { id, runId, datasetId, actorKey, actorId, topic },
      run,
      item,
    });
  }

  return resolved;
}
