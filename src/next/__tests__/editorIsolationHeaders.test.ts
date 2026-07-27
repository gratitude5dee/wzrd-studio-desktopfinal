import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";
import {
  EDITOR_ISOLATION_HEADERS,
  EDITOR_ISOLATION_ROUTE_SOURCES,
  isEditorIsolationPath,
} from "../editorIsolationHeaders";

describe("editor isolation headers", () => {
  it("matches current editor route aliases", () => {
    expect(isEditorIsolationPath("/projects/project-1/editor")).toBe(true);
    expect(isEditorIsolationPath("/projects/project-1/editor/export")).toBe(true);
    expect(isEditorIsolationPath("/editor/project-1")).toBe(true);
    expect(isEditorIsolationPath("/video-editor/project-1")).toBe(true);
    expect(isEditorIsolationPath("/projects/project-1/studio")).toBe(false);
  });

  it("configures Next headers for every editor route source", async () => {
    expect(nextConfig.headers).toBeTypeOf("function");

    const headers = await nextConfig.headers!();
    const isolated = headers.filter((entry) =>
      EDITOR_ISOLATION_ROUTE_SOURCES.includes(
        entry.source as (typeof EDITOR_ISOLATION_ROUTE_SOURCES)[number]
      )
    );

    expect(isolated).toHaveLength(EDITOR_ISOLATION_ROUTE_SOURCES.length);
    isolated.forEach((entry) => {
      expect(entry.headers).toEqual([...EDITOR_ISOLATION_HEADERS]);
    });
  });
});
