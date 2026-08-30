import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { GuidedEditor } from "../../components/workspace/guided-editor";

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

  it("keeps column IDs stable while keyboard reordering", async () => {
    const user = userEvent.setup();
    const { container } = render(<GuidedEditor />);
    const addColumn = screen.getByRole("button", { name: /Add column/ });
    await user.click(addColumn);
    await user.click(addColumn);

    const names = screen.getAllByRole("textbox", { name: /Column \d name/ });
    await user.type(names[0]!, "first");
    await user.type(names[1]!, "second");
    const rowsBefore = Array.from(
      container.querySelectorAll<HTMLElement>("[data-guided-draft-id^='guided-draft:v1:column']"),
    );
    const secondId = rowsBefore[1]!.dataset.guidedDraftId;

    names[1]!.focus();
    await user.keyboard("{Alt>}{ArrowUp}{/Alt}");

    const rowsAfter = Array.from(
      container.querySelectorAll<HTMLElement>("[data-guided-draft-id^='guided-draft:v1:column']"),
    );
    expect(rowsAfter[0]!.dataset.guidedDraftId).toBe(secondId);
    expect(within(rowsAfter[0]!).getByDisplayValue("second")).toBeInTheDocument();
  });

  it("does not reuse a column draft ID after deletion", async () => {
    const user = userEvent.setup();
    const { container } = render(<GuidedEditor />);
    const addColumn = screen.getByRole("button", { name: /Add column/ });

    await user.click(addColumn);
    const firstColumnId = container.querySelector<HTMLElement>(
      "[data-guided-draft-id^='guided-draft:v1:column']",
    )!.dataset.guidedDraftId;
    await user.click(screen.getByRole("button", { name: "Delete column 1" }));
    await user.click(addColumn);

    const replacementColumnId = container.querySelector<HTMLElement>(
      "[data-guided-draft-id^='guided-draft:v1:column']",
    )!.dataset.guidedDraftId;
    expect(replacementColumnId).not.toBe(firstColumnId);
  });

  it("generates a read-only non-exportable SQL preview for a complete draft", async () => {
    const user = userEvent.setup();
    render(<GuidedEditor />);

    await user.type(screen.getByRole("textbox", { name: "Table 1 name" }), "users");
    await user.click(screen.getByRole("button", { name: /Add column/ }));
    await user.type(screen.getByRole("textbox", { name: "Column 1 name" }), "id");
    await user.type(screen.getByRole("textbox", { name: "Column 1 type" }), "uuid");
    await user.click(screen.getByLabelText("PK"));

    const preview = screen.getByRole("textbox", {
      name: "Generated PostgreSQL SQL preview",
    });
    expect(preview).toHaveAttribute("readonly");
    expect(preview).toHaveValue(
      "CREATE TABLE public.users (\n  id uuid PRIMARY KEY\n);\n",
    );
    expect(screen.getByText("Read-only preview. Canonical validation is still required.")).toBeVisible();
  });

  it("edits nullability, defaults, uniqueness, references, and actions", async () => {
    const user = userEvent.setup();
    render(<GuidedEditor />);

    await user.type(screen.getByRole("textbox", { name: "Table 1 name" }), "users");
    const addColumn = screen.getByRole("button", { name: /Add column/ });
    await user.click(addColumn);
    await user.click(addColumn);

    const columnNames = screen.getAllByRole("textbox", { name: /Column \d name/ });
    const columnTypes = screen.getAllByRole("textbox", { name: /Column \d type/ });
    await user.type(columnNames[0]!, "id");
    await user.type(columnTypes[0]!, "uuid");
    await user.click(screen.getAllByLabelText("PK")[0]!);
    await user.type(columnNames[1]!, "parent_id");
    await user.type(columnTypes[1]!, "uuid");
    await user.click(screen.getAllByLabelText("Nullable")[1]!);
    await user.type(
      screen.getByRole("textbox", { name: "Column 2 default expression" }),
      "gen_random_uuid()",
    );
    await user.click(screen.getAllByLabelText("UQ")[1]!);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Column 2 reference target" }),
      screen.getByRole("option", { name: "users.id" }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Column 2 on delete" }),
      "cascade",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Column 2 on update" }),
      "restrict",
    );

    expect(screen.getByRole<HTMLTextAreaElement>("textbox", {
      name: "Generated PostgreSQL SQL preview",
    }).value).toContain(
      "parent_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE REFERENCES public.users (id) ON DELETE CASCADE ON UPDATE RESTRICT",
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
