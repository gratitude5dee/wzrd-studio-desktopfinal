import { describe, expect, it } from "vitest";
import { buildExecutionSelection } from "./compute-action-helpers.ts";

describe("buildExecutionSelection", () => {
  it("does not reintroduce excluded upstream dependencies", () => {
    const edges = [
      { source_node_id: "desktop-only", target_node_id: "remote" },
      { source_node_id: "safe-input", target_node_id: "remote" },
    ];
    expect([...buildExecutionSelection(["remote"], edges, ["desktop-only"])]).toEqual(
      expect.arrayContaining(["remote", "safe-input"]),
    );
    expect(buildExecutionSelection(["remote"], edges, ["desktop-only"]).has("desktop-only")).toBe(false);
  });
});
