import { describe, expect, it } from "vitest";

import { OPENAI_REALTIME_CALLS_URL } from "./webrtcTransport";

describe("WebRTCTransport", () => {
  it("uses the GA Realtime calls endpoint for browser WebRTC fallback", () => {
    expect(OPENAI_REALTIME_CALLS_URL).toBe("https://api.openai.com/v1/realtime/calls");
    expect(OPENAI_REALTIME_CALLS_URL).not.toContain("/v1/realtime?model=");
  });
});
