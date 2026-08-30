import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GuidedEditor } from "../../components/workspace/guided-editor";
import {
  serializeGuidedDraftToPostgresSql,
  type GuidedDraftV1,
} from "../../domain/guided-draft";

describe("guided editor", () => {
  it("starts with one protected structural table shell", () => {
    const { container } = render(<GuidedEditor />);

    expect(screen.getByText("CREATE TABLE public.")).toBeInTheDocument();
    expect(screen.getByText("Protected first table")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete table" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add column/ })).toBeVisible();
    expect(screen.getByRole("button", { name: /Add table/ })).toBeVisible();
    expect(container.querySelectorAll("[data-guided-draft-id^='guided-draft:v1:table']")).toHaveLength(1);
  });

  it("adds and deletes only additional tables without reusing stable IDs", async () => {
    const user = userEvent.setup();
    const { container } = render(<GuidedEditor />);

    const initialTable = container.querySelector<HTMLElement>("[data-guided-draft-id^='guided-draft:v1:table']")!;
    const initialId = initialTable.dataset.guidedDraftId;
    await user.click(screen.getByRole("button", { name: /Add table/ }));

    const tableIdsAfterAdd = Array.from(
      container.querySelectorAll<HTMLElement>("[data-guided-draft-id^='guided-draft:v1:table']"),
      (element) => element.dataset.guidedDraftId,
    );
    expect(tableIdsAfterAdd[0]).toBe(initialId);
    expect(new Set(tableIdsAfterAdd).size).toBe(2);

    await user.click(screen.getByRole("button", { name: "Delete table" }));
    await user.click(screen.getByRole("button", { name: /Add table/ }));
    const replacementId = Array.from(
      container.querySelectorAll<HTMLElement>("[data-guided-draft-id^='guided-draft:v1:table']"),
    )[1]!.dataset.guidedDraftId;
    expect(replacementId).not.toBe(tableIdsAfterAdd[1]);
  });

  it("exposes only the MVP column fields and actions", async () => {
    const user = userEvent.setup();
    render(<GuidedEditor />);
    await user.click(screen.getByRole("button", { name: /Add column/ }));

    expect(screen.getByRole("textbox", { name: "Column 1 name" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Column 1 type" })).toBeVisible();
    expect(screen.getByLabelText("Primary key")).toBeVisible();
    expect(screen.getByLabelText("Not null")).toBeVisible();
    expect(screen.getByLabelText("Unique")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Column 1 reference target" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Move column/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete column/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /default expression/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /on delete|on update/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Generated SQL")).not.toBeInTheDocument();
  });

  it("serializes the MVP fields and a single-column reference", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn<(draft: GuidedDraftV1) => void>();
    const { container } = render(<GuidedEditor onDraftChange={onDraftChange} />);

    await user.type(screen.getByRole("textbox", { name: "Table 1 name" }), "users");
    await user.click(screen.getByRole("button", { name: /Add column/ }));
    await user.type(screen.getByRole("textbox", { name: "Column 1 name" }), "id");
    await user.type(screen.getByRole("textbox", { name: "Column 1 type" }), "uuid");
    await user.click(screen.getByLabelText("Primary key"));

    await user.click(screen.getByRole("button", { name: /Add table/ }));
    await user.type(screen.getByRole("textbox", { name: "Table 2 name" }), "posts");
    await user.click(screen.getAllByRole("button", { name: /Add column/ })[1]!);

    const tables = container.querySelectorAll<HTMLElement>(
      "[data-guided-draft-id^='guided-draft:v1:table']",
    );
    const posts = within(tables[1]!);
    await user.type(posts.getByRole("textbox", { name: "Column 1 name" }), "user_id");
    await user.type(posts.getByRole("textbox", { name: "Column 1 type" }), "uuid");
    await user.click(posts.getByLabelText("Not null"));
    await user.click(posts.getByLabelText("Unique"));
    await user.selectOptions(
      posts.getByRole("combobox", { name: "Column 1 reference target" }),
      posts.getByRole("option", { name: "users.id" }),
    );

    const draft = onDraftChange.mock.calls.at(-1)![0];
    const result = serializeGuidedDraftToPostgresSql(draft);
    expect(result.status).toBe("generated");
    if (result.status !== "generated") throw new Error("Expected generated SQL");
    expect(result.output.source).toBe(
      "CREATE TABLE public.users (\n  id uuid PRIMARY KEY\n);\n\n" +
      "CREATE TABLE public.posts (\n  user_id uuid NOT NULL UNIQUE REFERENCES public.users (id)\n);\n",
    );
  });

  it("preserves the Guided draft across the accessible Manual placeholder", async () => {
    const user = userEvent.setup();
    render(<GuidedEditor />);
    const tableName = screen.getByRole("textbox", { name: "Table 1 name" });
    await user.type(tableName, "accounts");

    await user.click(screen.getByRole("radio", { name: "Manual SQL" }));
    expect(screen.getByRole("heading", { name: "Manual SQL" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Return to Guided blocks" }));

    expect(screen.getByRole("textbox", { name: "Table 1 name" })).toHaveValue("accounts");
  });
});
