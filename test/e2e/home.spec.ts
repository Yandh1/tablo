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

test("keeps React Flow fixed while Guided Draft grows and only enlarges it on expansion", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const diagram = page.getByTestId("schema-diagram");
  const guidedScroll = page.getByTestId("guided-scroll-region");
  const initialDiagramBox = await diagram.boundingBox();
  if (!initialDiagramBox) throw new Error("Diagram viewport was not measurable");

  for (let index = 0; index < 10; index += 1) {
    await page.getByRole("button", { name: "Add table from footer" }).click();
  }

  await expect(diagram.locator('[data-node-source="guided-draft"]')).toHaveCount(11);
  const grownDraftDiagramBox = await diagram.boundingBox();
  expect(grownDraftDiagramBox?.width).toBeCloseTo(initialDiagramBox.width, 0);
  expect(grownDraftDiagramBox?.height).toBeCloseTo(initialDiagramBox.height, 0);

  const scrollMetrics = await guidedScroll.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(800);

  await page.getByRole("button", { name: "Expand diagram pane" }).click();
  const expandedDiagramBox = await diagram.boundingBox();
  expect(expandedDiagramBox?.width).toBeGreaterThan(initialDiagramBox.width + 500);
  expect(expandedDiagramBox?.height).toBeCloseTo(initialDiagramBox.height, 0);
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

  const diagram = page.getByTestId("schema-diagram");
  const provisionalNode = diagram.locator('[data-node-source="guided-draft"]');
  await expect(diagram.getByText("Draft", { exact: true })).toBeVisible();
  await expect(provisionalNode).toContainText("Untitled table");

  await page.getByRole("textbox", { name: "Table 1 name" }).fill("users");
  await expect(provisionalNode).toContainText("users");
  await page.getByRole("button", { name: "Add column" }).click();
  await page.getByRole("textbox", { name: "Column 1 name" }).fill("id");
  await expect(provisionalNode).toContainText("id");
  await page.getByRole("combobox", { name: "Column 1 type" }).fill("uuid");
  await page.getByRole("option", { name: /^uuid/ }).click();
  await page.getByLabel("Primary key").check();

  await expect(page.getByText("Valid", { exact: true })).toBeVisible();
  await expect(diagram.getByText("users", { exact: true })).toBeVisible();
  await expect(diagram.locator('[data-node-source="parsed-schema"]')).toBeVisible();
  await expect(diagram.locator('[data-node-source="guided-draft"]')).toHaveCount(0);
  await expect(diagram.getByText("Draft", { exact: true })).toBeHidden();
});

test("keeps a dragged table position while Guided text changes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const node = page.getByTestId("schema-diagram").locator(
    '[data-node-source="guided-draft"]',
  );
  const before = await node.boundingBox();
  if (!before) throw new Error("Guided table node was not measurable");

  await page.mouse.move(before.x + before.width / 2, before.y + 18);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 90, before.y + 78, {
    steps: 6,
  });
  await page.mouse.up();

  const dragged = await node.boundingBox();
  if (!dragged) throw new Error("Dragged table node was not measurable");
  expect(dragged.x).toBeGreaterThan(before.x + 50);
  expect(dragged.y).toBeGreaterThan(before.y + 30);

  await page.getByRole("textbox", { name: "Table 1 name" }).fill("users");
  await expect(node).toContainText("users");
  const updated = await node.boundingBox();
  expect(updated?.x).toBeCloseTo(dragged.x, 0);
  expect(updated?.y).toBeCloseTo(dragged.y, 0);
});

test("refocuses the diagram after deleting an added table", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await page.getByRole("button", { name: /Add table/ }).last().click();
  await page.getByRole("button", { name: /Add table/ }).last().click();

  const diagram = page.getByTestId("schema-diagram");
  const tableNodes = diagram.locator('[data-node-source="guided-draft"]');
  const viewport = diagram.locator(".react-flow__viewport");
  await expect(tableNodes).toHaveCount(3);
  await page.waitForTimeout(500);

  await diagram.hover();
  await page.mouse.wheel(0, -1200);
  await page.waitForTimeout(300);
  const zoomedTransform = await viewport.getAttribute("style");

  await page.getByRole("button", { name: "Delete table" }).last().click();
  await expect(tableNodes).toHaveCount(2);
  await expect.poll(() => viewport.getAttribute("style"))
    .not.toBe(zoomedTransform);
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
