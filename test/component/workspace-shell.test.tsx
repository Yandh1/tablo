import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  readStoredEditorRatio,
  WorkspaceShell,
} from "../../components/workspace/workspace-shell";

function installViewport(matches: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches,
    media: "(min-width: 1024px)",
    onchange: null,
    addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: () => void) => listeners.delete(listener)),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => query));
  return query;
}

describe("workspace shell", () => {
  beforeEach(() => {
    window.localStorage.clear();
    installViewport(true);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      bottom: 700,
      height: 700,
      left: 0,
      right: 1000,
      top: 0,
      width: 1000,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
  });

  it("starts balanced and exposes expansion controls for both panes", () => {
    render(<WorkspaceShell projectName="Commerce schema" />);

    expect(screen.getByText("Split 50 / 50")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand editor pane" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Expand diagram pane" })).toBeVisible();
  });

  it("exposes the accessible keyboard splitter", () => {
    render(<WorkspaceShell projectName="Commerce schema" />);
    const separator = screen.getByRole("separator", {
      name: "Resize editor and diagram panes",
    });

    expect(separator).toHaveAttribute("tabindex", "0");
    expect(separator).toHaveAttribute("aria-valuemin");
    expect(separator).toHaveAttribute("aria-valuemax");
    expect(separator).toHaveAttribute("aria-valuenow");
  });

  it("restores the previous ratio and focus when Escape exits full workspace", async () => {
    const user = userEvent.setup();
    render(<WorkspaceShell projectName="Commerce schema" />);

    const fullButton = screen.getByRole("button", {
      name: "Expand editor pane",
    });
    await user.click(fullButton);

    expect(screen.getByRole("button", { name: /Restore split/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await vi.waitFor(() => expect(fullButton).toHaveFocus());
    expect(screen.getByText("Split 50 / 50")).toBeInTheDocument();
  });

  it("switches between Guided and Manual authoring while keeping Problems reachable", async () => {
    const user = userEvent.setup();
    render(<WorkspaceShell projectName="Commerce schema" />);

    expect(screen.getByRole("radio", { name: "Guided blocks" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "Manual SQL" }));
    expect(screen.getByRole("radio", { name: "Manual SQL" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("region", { name: "Problems" })).toBeVisible();
    expect(screen.getByLabelText("Manual SQL editor")).toBeVisible();
  });

  it("shows persistent Editor and Diagram tabs below desktop width", async () => {
    installViewport(false);
    const user = userEvent.setup();
    render(<WorkspaceShell projectName="Commerce schema" />);

    const editorTab = screen.getByRole("tab", { name: "Editor" });
    const diagramTab = screen.getByRole("tab", { name: "Diagram" });
    expect(editorTab).toHaveAttribute("aria-selected", "true");

    await user.click(diagramTab);
    expect(diagramTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Diagram");
  });
});

describe("stored workspace ratio", () => {
  it("accepts only ratios inside the 25 to 75 range", () => {
    expect(readStoredEditorRatio({ getItem: () => "67" })).toBe(67);
    expect(readStoredEditorRatio({ getItem: () => "100" })).toBe(50);
    expect(readStoredEditorRatio({ getItem: () => "not-a-number" })).toBe(50);
  });
});
