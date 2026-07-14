import { describe, expect, it, vi } from "vitest";

import { corsHeaders, handleCors } from "../_shared/response.ts";
import {
  createByteLimitedStream,
  fetchValidatedMedia,
  isPublicIpAddress,
  resolveTrustedFinalizeResults,
  SourcifyMediaError,
  validatePublicHttpsUrl,
} from "./finalize-media.ts";

const PUBLIC_IP = "93.184.216.34";
const publicResolver = vi.fn(async () => [PUBLIC_IP]);

function mediaResponse(body: BodyInit = "test", headers: Record<string, string> = {}) {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "video/mp4",
      "content-length": "4",
      ...headers,
    },
  });
}

describe("Sourcify finalize media validation", () => {
  it("rejects private and reserved IPv4/IPv6 destinations", async () => {
    for (const address of [
      "0.0.0.0",
      "10.0.0.1",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "198.51.100.4",
      "203.0.113.9",
      "::1",
      "::ffff:127.0.0.1",
      "fc00::1",
      "fe80::1",
      "2001:100::1",
      "2001:db8::1",
    ]) {
      expect(isPublicIpAddress(address), address).toBe(false);
    }
    expect(isPublicIpAddress("8.8.8.8")).toBe(true);
    expect(isPublicIpAddress("2606:4700:4700::1111")).toBe(true);

    await expect(validatePublicHttpsUrl("https://127.0.0.1/media.mp4", publicResolver)).rejects.toMatchObject({
      code: "private_destination",
    });
    await expect(validatePublicHttpsUrl("https://[::1]/media.mp4", publicResolver)).rejects.toMatchObject({
      code: "private_destination",
    });
    for (const url of [
      "https://2130706433/media.mp4",
      "https://0177.0.0.1/media.mp4",
      "https://0x7f000001/media.mp4",
      "https://127.1/media.mp4",
    ]) {
      await expect(validatePublicHttpsUrl(url, publicResolver), url).rejects.toMatchObject({
        code: "private_destination",
      });
    }

    const resolver = vi.fn(async () => [PUBLIC_IP]);
    await expect(validatePublicHttpsUrl("https://localhost./media.mp4", resolver)).rejects.toMatchObject({
      code: "private_destination",
    });
    expect(resolver).not.toHaveBeenCalled();
  });

  it("requires credential-free HTTPS on the standard port and public DNS", async () => {
    await expect(validatePublicHttpsUrl("http://media.example/video.mp4", publicResolver)).rejects.toMatchObject({
      code: "https_required",
    });
    await expect(validatePublicHttpsUrl("https://user:pass@media.example/video.mp4", publicResolver)).rejects.toMatchObject({
      code: "url_credentials_forbidden",
    });
    await expect(validatePublicHttpsUrl("https://media.example:444/video.mp4", publicResolver)).rejects.toMatchObject({
      code: "url_port_forbidden",
    });
    await expect(validatePublicHttpsUrl("https://media.example/video.mp4", async () => ["10.0.0.5"])).rejects.toMatchObject({
      code: "private_destination",
    });
  });

  it("re-resolves DNS on every redirect and blocks a private rebinding result", async () => {
    const resolver = vi.fn()
      .mockResolvedValueOnce([PUBLIC_IP])
      .mockResolvedValueOnce(["127.0.0.1"]);
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "/fresh.mp4" },
    }));

    await expect(fetchValidatedMedia({
      url: "https://media.example/video.mp4",
      resolveDns: resolver,
      fetchImpl,
    })).rejects.toMatchObject({ code: "private_destination" });
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("blocks redirects to private literals and caps redirects at three hops", async () => {
    await expect(fetchValidatedMedia({
      url: "https://media.example/video.mp4",
      resolveDns: publicResolver,
      fetchImpl: async () => new Response(null, {
        status: 302,
        headers: { location: "https://169.254.169.254/latest/meta-data" },
      }),
    })).rejects.toMatchObject({ code: "private_destination" });

    let redirect = 0;
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: `/redirect-${++redirect}` },
    }));
    await expect(fetchValidatedMedia({
      url: "https://media.example/video.mp4",
      resolveDns: async () => [PUBLIC_IP],
      fetchImpl,
    })).rejects.toMatchObject({ code: "too_many_redirects" });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("requires an allowlisted media content type and bounded Content-Length before streaming", async () => {
    await expect(fetchValidatedMedia({
      url: "https://media.example/video.mp4",
      resolveDns: publicResolver,
      fetchImpl: async () => mediaResponse("html", { "content-type": "text/html", "content-length": "4" }),
    })).rejects.toMatchObject({ code: "media_content_type_invalid" });

    await expect(fetchValidatedMedia({
      url: "https://media.example/image.svg",
      resolveDns: publicResolver,
      fetchImpl: async () => mediaResponse("svg!", { "content-type": "image/svg+xml", "content-length": "4" }),
    })).rejects.toMatchObject({ code: "media_content_type_invalid" });

    await expect(fetchValidatedMedia({
      url: "https://media.example/video.mp4",
      resolveDns: publicResolver,
      fetchImpl: async () => new Response("test", { headers: { "content-type": "video/mp4" } }),
    })).rejects.toMatchObject({ code: "media_content_length_invalid" });

    await expect(fetchValidatedMedia({
      url: "https://media.example/video.mp4",
      resolveDns: publicResolver,
      fetchImpl: async () => mediaResponse("test", { "content-length": "5" }),
      maxBytes: 4,
    })).rejects.toMatchObject({ code: "media_too_large" });
  });

  it("aborts a lying response stream as soon as it exceeds the hard byte cap", async () => {
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.enqueue(new Uint8Array([4, 5, 6]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const limited = createByteLimitedStream(source, { maxBytes: 4, expectedBytes: 4 });

    await expect(new Response(limited.stream).arrayBuffer()).rejects.toBeInstanceOf(SourcifyMediaError);
    expect(limited.getFailure()).toMatchObject({ code: "media_too_large" });
    expect(limited.getBytesRead()).toBe(3);
    expect(cancelled).toBe(true);
  });

  it("uses only trusted run dataset items and rejects provenance mismatches", async () => {
    const loadRun = vi.fn(async () => ({ defaultDatasetId: "dataset-1", actorId: "actor-1" }));
    const loadDataset = vi.fn(async () => [{ id: "result-1", mediaUrl: "https://trusted.example/video.mp4" }]);
    const resolved = await resolveTrustedFinalizeResults({
      references: [{
        id: "result-1",
        runId: "run-1",
        datasetId: "dataset-1",
        actorId: "actor-1",
        actorKey: "youtube-downloader",
      }],
      loadRun,
      loadDataset,
    });

    expect(resolved[0]?.item.mediaUrl).toBe("https://trusted.example/video.mp4");
    expect(loadRun).toHaveBeenCalledWith("run-1");
    expect(loadDataset).toHaveBeenCalledWith("dataset-1", "youtube-downloader");

    await expect(resolveTrustedFinalizeResults({
      references: [{ id: "result-1", runId: "run-1", datasetId: "other-dataset" }],
      loadRun,
      loadDataset,
    })).rejects.toMatchObject({ name: "SourcifyProvenanceError", status: 400 });

    await expect(resolveTrustedFinalizeResults({
      references: [{ id: "client-invented", runId: "run-1", datasetId: "dataset-1" }],
      loadRun,
      loadDataset,
    })).rejects.toMatchObject({ name: "SourcifyProvenanceError" });
  });

  it("retains the actual shared Edge CORS response for OPTIONS", () => {
    const response = handleCors();
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(corsHeaders["Access-Control-Allow-Headers"]);
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });
});
