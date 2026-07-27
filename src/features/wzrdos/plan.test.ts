import { describe, expect, it } from "vitest";

import { approveWzrdOsPlan, buildWzrdOsPlan, createWzrdOsRunPreview } from "./plan";

describe("WZRDOS planner", () => {
  it("turns the demo command into a generate -> scrape -> schedule plan", () => {
    const plan = buildWzrdOsPlan(
      "generate 10 pieces of content, scrape 10 pieces based on Sourcify, and schedule them for posting on Postz.",
      { connectedChannelCount: 3, timezone: "America/Los_Angeles" },
    );

    expect(plan.steps.map((step) => step.toolName)).toEqual([
      "generate_content",
      "scrape_sources",
      "schedule_posts",
    ]);
    expect(plan.totals.generatedItems).toBe(10);
    expect(plan.totals.scrapedItems).toBe(10);
    expect(plan.totals.scheduledPosts).toBe(20);
    expect(plan.steps[0].skillRefs).toContain("run-studio-graph");
    expect(plan.steps[1].target).toBe("sourcify-apify");
    expect(plan.steps[2].target).toBe("postz-posts");
    expect(plan.steps[2].status).toBe("needs_approval");
    expect(plan.safety.publishConfirmationRequired).toBe(true);
  });

  it("caps large requests before building risky steps", () => {
    const plan = buildWzrdOsPlan("generate 99 clips, scrape 80 references, and schedule 200 posts");

    expect(plan.totals.generatedItems).toBe(20);
    expect(plan.totals.scrapedItems).toBe(20);
    expect(plan.totals.scheduledPosts).toBe(40);
    expect(plan.warnings).toContain("Generated content capped at 20 for this run.");
    expect(plan.warnings).toContain("Sourcify scrape capped at 20 for this run.");
    expect(plan.warnings).toContain("Scheduled posts capped at 40 for this run.");
  });

  it("marks approval-gated steps and produces a dry-run event stream", () => {
    const plan = approveWzrdOsPlan(buildWzrdOsPlan("generate 2 clips and schedule them on Postz"));
    const run = createWzrdOsRunPreview(plan);

    expect(plan.steps.filter((step) => step.requiresApproval).every((step) => step.status === "approved")).toBe(true);
    expect(run.mode).toBe("dry_run");
    expect(run.events.some((event) => event.type === "step.started")).toBe(true);
    expect(run.events.some((event) => event.type === "run.completed")).toBe(true);
  });
});
