import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  KanvasBadge,
  KanvasButton,
  KanvasChip,
  KanvasDisplayHeading,
  KanvasEmptyState,
  KanvasFieldRow,
  KanvasIconButton,
  KanvasMediaTile,
  KanvasPanel,
  KanvasProgress,
  KanvasPromptBar,
  KanvasRail,
  KanvasRailRow,
  KanvasSectionHeader,
  KanvasStepper,
  KanvasTabs,
  KanvasUploadTile,
} from "..";

describe("KanvasPanel", () => {
  it("forwards ref and className onto the panel element", () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <KanvasPanel ref={ref} className="custom-class" data-testid="panel">
        body
      </KanvasPanel>,
    );
    const panel = screen.getByTestId("panel");
    expect(ref.current).toBe(panel);
    expect(panel).toHaveClass("custom-class");
    expect(panel.className).toContain("rounded-kanvas-lg");
  });
});

describe("KanvasButton", () => {
  it("is a real button with a 44px minimum target", () => {
    render(<KanvasButton>Generate</KanvasButton>);
    const button = screen.getByRole("button", { name: "Generate" });
    expect(button).toHaveAttribute("type", "button");
    expect(button.className).toContain("min-h-[44px]");
  });

  it("disables itself and exposes aria-busy while busy", async () => {
    const onClick = vi.fn();
    render(
      <KanvasButton busy onClick={onClick}>
        Generate
      </KanvasButton>,
    );
    const button = screen.getByRole("button", { name: /generate/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("KanvasIconButton", () => {
  it("names the control from label and forwards clicks", async () => {
    const onClick = vi.fn();
    render(<KanvasIconButton label="Upload image" icon={<svg />} onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: "Upload image" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("KanvasChip", () => {
  it("reflects toggle state through aria-pressed", async () => {
    const onClick = vi.fn();
    render(
      <KanvasChip active onClick={onClick}>
        16:9
      </KanvasChip>,
    );
    const chip = screen.getByRole("button", { name: "16:9", pressed: true });
    expect(chip.className).toContain("min-h-[44px]");
    await userEvent.click(chip);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("KanvasRailRow", () => {
  it("renders a button only when interactive", async () => {
    const onClick = vi.fn();
    const { rerender } = render(<KanvasRailRow label="Model" trailing="Flux" />);
    expect(screen.queryByRole("button")).toBeNull();

    rerender(<KanvasRailRow label="Model" trailing="Flux" onClick={onClick} />);
    await userEvent.click(screen.getByRole("button", { name: /model/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("KanvasMediaTile", () => {
  it("locks the aspect ratio and covers with the image", () => {
    render(<KanvasMediaTile ratio="portrait" src="/a.png" alt="Preset" />);
    const image = screen.getByAltText("Preset");
    expect(image).toHaveClass("object-cover");
    expect(image.parentElement?.className).toContain("aspect-[9/16]");
  });

  it("becomes a pressable button when selectable", async () => {
    const onClick = vi.fn();
    render(<KanvasMediaTile src="/a.png" alt="Preset" selected onClick={onClick} />);
    const tile = screen.getByRole("button", { name: "Preset", pressed: true });
    await userEvent.click(tile);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("KanvasStepper", () => {
  it("clamps at the bounds and emits the next value", async () => {
    const onChange = vi.fn();
    render(<KanvasStepper label="Images" value={1} min={1} max={4} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Decrease Images" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Increase Images" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });
});

describe("KanvasTabs", () => {
  it("exposes a tablist with the active tab selected", async () => {
    const onChange = vi.fn();
    render(
      <KanvasTabs
        label="Gallery"
        value="explore"
        onChange={onChange}
        items={[
          { value: "explore", label: "Explore" },
          { value: "history", label: "History" },
        ]}
      />,
    );
    expect(screen.getByRole("tab", { name: "Explore", selected: true })).toHaveAttribute(
      "tabindex",
      "0",
    );
    await userEvent.click(screen.getByRole("tab", { name: "History" }));
    expect(onChange).toHaveBeenCalledWith("history");
  });
});

describe("KanvasPromptBar", () => {
  it("labels the textarea and forwards typing", async () => {
    const onChange = vi.fn();
    render(<KanvasPromptBar label="Prompt" placeholder="Describe" onChange={onChange} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Prompt" }), "hi");
    expect(onChange).toHaveBeenCalled();
  });
});

describe("KanvasUploadTile", () => {
  it("uses a real file input and reports selected files", async () => {
    const onFiles = vi.fn();
    render(<KanvasUploadTile label="Add image" onFiles={onFiles} />);
    const input = screen.getByLabelText("Add image") as HTMLInputElement;
    expect(input).toHaveAttribute("type", "file");
    await userEvent.upload(input, new File(["x"], "x.png", { type: "image/png" }));
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0][0].name).toBe("x.png");
  });
});

describe("KanvasProgress", () => {
  it("reports determinate and indeterminate state", () => {
    const { rerender } = render(<KanvasProgress label="Job" value={140} />);
    expect(screen.getByRole("progressbar", { name: "Job" })).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
    rerender(<KanvasProgress label="Job" />);
    expect(screen.getByRole("progressbar", { name: "Job" })).not.toHaveAttribute(
      "aria-valuenow",
    );
  });

  it("opts out of animation under reduced motion", () => {
    render(<KanvasProgress label="Job" data-testid="bar" />);
    expect(screen.getByTestId("bar").firstElementChild?.className).toContain(
      "motion-reduce:animate-none",
    );
  });
});

describe("KanvasFieldRow", () => {
  it("hands the label id to the control", () => {
    render(
      <KanvasFieldRow label="Aspect ratio">
        {({ labelId }) => (
          <div role="group" aria-labelledby={labelId}>
            <KanvasChip>1:1</KanvasChip>
          </div>
        )}
      </KanvasFieldRow>,
    );
    expect(screen.getByRole("group", { name: "Aspect ratio" })).toBeInTheDocument();
  });
});

describe("headings, badges, rails and empty states", () => {
  it("renders the heading at the requested level with an accent fragment", () => {
    render(
      <KanvasDisplayHeading level={1} accent="studio">
        image{" "}
      </KanvasDisplayHeading>,
    );
    expect(screen.getByRole("heading", { level: 1, name: /image studio/i })).toBeInTheDocument();
  });

  it("renders a section header with eyebrow, description and action", () => {
    render(
      <KanvasSectionHeader
        eyebrow="Recent"
        title="Generations"
        description="Your latest results"
        action={<KanvasButton>View all</KanvasButton>}
      />,
    );
    expect(screen.getByRole("heading", { name: "Generations" })).toBeInTheDocument();
    expect(screen.getByText("Your latest results")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View all" })).toBeInTheDocument();
  });

  it("renders a non-interactive badge", () => {
    render(<KanvasBadge tone="accent">New</KanvasBadge>);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("New").className).toContain("text-kanvas-accent");
  });

  it("names the rail region and applies the rail width", () => {
    render(<KanvasRail label="Image controls" data-testid="rail" />);
    const rail = screen.getByRole("complementary", { name: "Image controls" });
    expect(rail.style.getPropertyValue("--kanvas-rail")).toBe("336px");
  });

  it("uses the compact rail width when asked", () => {
    render(<KanvasRail label="Controls" compact />);
    expect(
      screen.getByRole("complementary").style.getPropertyValue("--kanvas-rail"),
    ).toBe("300px");
  });

  it("renders an empty state with its action", () => {
    render(
      <KanvasEmptyState
        title="No characters yet"
        description="Create one to get started"
        action={<KanvasButton>Create</KanvasButton>}
      />,
    );
    expect(screen.getByText("No characters yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });
});

describe("presentational boundary", () => {
  it("keeps primitives free of feature-layer imports", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.resolve(__dirname, "..");
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));
    for (const file of files) {
      const source = await fs.readFile(path.join(dir, file), "utf8");
      expect(source, file).not.toMatch(/@\/features\/kanvas/);
      expect(source, file).not.toMatch(/@\/integrations/);
    }
  });
});
