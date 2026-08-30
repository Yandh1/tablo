import { expect, test } from "@playwright/test";

test("serves the home page from a production build", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("resizes, bounds, and resets the desktop workspace splitter", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const editor = page.getByTestId("editor");
  const diagram = page.getByTestId("diagram");
  const splitter = page.getByRole("separator", {
    name: "Resize editor and diagram panes",
  });

  const initialEditor = await editor.boundingBox();
  const initialDiagram = await diagram.boundingBox();
  expect(initialEditor?.width).toBeCloseTo(initialDiagram?.width ?? 0, -1);

  const splitterBox = await splitter.boundingBox();
  if (!splitterBox) throw new Error("Workspace splitter was not measurable");
  await page.mouse.move(splitterBox.x + splitterBox.width / 2, splitterBox.y + 80);
  await page.mouse.down();
  await page.mouse.move(1100, splitterBox.y + 80, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByText("Split 75 / 25")).toBeVisible();

  await splitter.dblclick();
  await expect(page.getByText("Split 50 / 50")).toBeVisible();

  await splitter.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("Split 55 / 45")).toBeVisible();
});

test("uses Editor and Diagram tabs below desktop width", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto("/");

  const diagramTab = page.getByRole("tab", { name: "Diagram" });
  await diagramTab.click();
  await expect(diagramTab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "Diagram" })).toBeVisible();
});

test("fills the desktop workspace and restores focus after full-workspace mode", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const fullWorkspace = page.getByRole("button", {
    name: "Expand editor pane",
  });
  await fullWorkspace.click();

  const editor = page.getByTestId("editor");
  const editorBox = await editor.boundingBox();
  expect(editorBox?.width).toBeGreaterThan(1200);
  await expect(page.getByTestId("diagram")).toBeHidden();

  await page.keyboard.press("Escape");
  await expect(fullWorkspace).toBeFocused();
  const restoredEditorBox = await editor.boundingBox();
  expect(restoredEditorBox?.width).toBeLessThan(700);
});

test("loads Monaco and renders parsed table nodes with a fit control", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await page.getByRole("radio", { name: "Manual SQL" }).click();
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await expect(page.getByText("Valid", { exact: true })).toBeVisible();
  const diagram = page.getByTestId("schema-diagram");
  await expect(diagram.getByText("users", { exact: true })).toBeVisible();
  await expect(diagram.getByText("orders", { exact: true })).toBeVisible();
  await expect(diagram.getByLabel("Primary key").first()).toBeVisible();
  await expect(diagram.getByLabel("Foreign key")).toBeVisible();
  await expect(diagram.getByLabel("Unique")).toBeVisible();
  await page.getByRole("button", { name: "Fit diagram" }).click();
});

test("parses GuidedDraft SQL through the workspace parser", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await expect(page.getByTestId("schema-diagram").getByText("Draft", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Table 1 name" }).fill("users");
  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByRole("textbox", { name: "Column 1 name" }).fill("id");
  await page.getByRole("textbox", { name: "Column 1 type" }).fill("uuid");
  await page.getByLabel("Primary key").check();

  await expect(page.getByText("Valid", { exact: true })).toBeVisible();
  await expect(page.getByTestId("schema-diagram").getByText("users", { exact: true })).toBeVisible();
  await expect(page.getByTestId("schema-diagram").getByText("Draft", { exact: true })).toBeHidden();
});

test("keeps the last valid diagram visible when Manual SQL becomes invalid", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await page.getByRole("radio", { name: "Manual SQL" }).click();
  await expect(page.getByText("Valid", { exact: true })).toBeVisible();
  await page.locator(".monaco-editor").click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("CREATE TABLE users (id uuid,,);");

  await expect(page.getByRole("status").filter({ hasText: "Invalid" })).toBeVisible();
  await expect(page.getByText("Showing last valid diagram", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Problems" })).toContainText("PGSD1001");
  await expect(page.getByTestId("schema-diagram").getByText("orders", { exact: true })).toBeVisible();
});
