import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { GuidedEditor } from "../../components/workspace/guided-editor";
import { projectGuidedDraftForDiagram } from "../../components/workspace/schema-diagram-leaf";
import {
  serializeGuidedDraftToPostgresSql,
  type GuidedDraftV1,
} from "../../domain/guided-draft";

async function chooseType(
  user: UserEvent,
  combobox: HTMLElement,
  query: string,
  optionName: string,
) {
  await user.click(combobox);
  await user.type(combobox, query);
  await user.click(screen.getByRole("option", { name: new RegExp(`^${optionName}`) }));
}

describe("guided editor", () => {
  it("starts with one protected compact table shell and a visible table-name label", () => {
    const { container } = render(<GuidedEditor />);

    expect(screen.getByText("Protected first table")).toBeInTheDocument();
    expect(screen.getByText("Table")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Table 1 name" })).toHaveAttribute("placeholder", "e.g. orders");
    expect(screen.queryByRole("button", { name: "Delete table" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add column/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add table from toolbar" })).toBeVisible();
    expect(container.querySelectorAll("[data-guided-draft-id^='guided-draft:v1:table']")).toHaveLength(1);
  });

  it("keeps one table expanded, focuses a new table, and never reuses stable IDs", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn<(draft: GuidedDraftV1) => void>();
    const { container } = render(<GuidedEditor onDraftChange={onDraftChange} />);
    const initialId = container.querySelector<HTMLElement>("[data-guided-draft-id^='guided-draft:v1:table']")!.dataset.guidedDraftId;

    await user.click(screen.getByRole("button", { name: "Add table from toolbar" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Table 2 name" })).toHaveFocus());
    expect(screen.queryByRole("textbox", { name: "Table 1 name" })).not.toBeInTheDocument();

    const tableIdsAfterAdd = Array.from(
      container.querySelectorAll<HTMLElement>("[data-guided-draft-id^='guided-draft:v1:table']"),
      (element) => element.dataset.guidedDraftId,
    );
    expect(tableIdsAfterAdd[0]).toBe(initialId);
    expect(new Set(tableIdsAfterAdd).size).toBe(2);
    expect(projectGuidedDraftForDiagram(onDraftChange.mock.calls.at(-1)![0]).nodes[1]!.data)
      .toMatchObject({ draft: true, label: "Untitled table", source: "guided-draft" });

    await user.click(screen.getByRole("button", { name: "Delete table" }));
    await user.click(screen.getByRole("button", { name: "Add table from toolbar" }));
    const replacementId = Array.from(
      container.querySelectorAll<HTMLElement>("[data-guided-draft-id^='guided-draft:v1:table']"),
    )[1]!.dataset.guidedDraftId;
    expect(replacementId).not.toBe(tableIdsAfterAdd[1]);
  });

  it("searches aliases, serializes canonical types, and gates type-specific controls", async () => {
    const user = userEvent.setup();
    render(<GuidedEditor />);
    await user.click(screen.getByRole("button", { name: /Add column/ }));

    const type = screen.getByRole("combobox", { name: "Column 1 type" });
    expect(screen.queryByLabelText("Column 1 default expression")).not.toBeInTheDocument();
    await chooseType(user, type, "varchar", "character varying");

    expect(type).toHaveValue("character varying");
    expect(screen.getByRole("spinbutton", { name: "Column 1 type length" })).toBeVisible();
    expect(screen.getByLabelText("Column 1 default expression")).toBeVisible();
    expect(screen.getByLabelText("Primary key")).toBeVisible();
    expect(screen.getByLabelText("Not null")).toBeVisible();
    expect(screen.getByLabelText("Unique")).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Column 1 reference target" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Edit properties/ })).not.toBeInTheDocument();
  });

  it("retains a default across type changes and diagnoses a known incompatible preset", async () => {
    const user = userEvent.setup();
    render(<GuidedEditor />);
    await user.click(screen.getByRole("button", { name: /Add column/ }));
    const type = screen.getByRole("combobox", { name: "Column 1 type" });
    await chooseType(user, type, "uuid", "uuid");
    const defaultInput = screen.getByLabelText("Column 1 default expression");
    await user.type(defaultInput, "gen_random_uuid()");

    await chooseType(user, type, "text", "text");
    expect(defaultInput).toHaveValue("gen_random_uuid()");
    expect(screen.getByRole("status")).toHaveTextContent("does not match the selected type");
  });

  it("serializes names, canonical types, defaults, constraints, and a single-column reference", async () => {
    const user = userEvent.setup();
    const onDraftChange = vi.fn<(draft: GuidedDraftV1) => void>();
    const { container } = render(<GuidedEditor onDraftChange={onDraftChange} />);

    await user.type(screen.getByRole("textbox", { name: "Table 1 name" }), "users");
    await user.click(screen.getByRole("button", { name: /Add column/ }));
    await user.type(screen.getByRole("textbox", { name: "Column 1 name" }), "id");
    await chooseType(user, screen.getByRole("combobox", { name: "Column 1 type" }), "uuid", "uuid");
    await user.type(screen.getByLabelText("Column 1 default expression"), "gen_random_uuid()");
    await user.click(screen.getByLabelText("Primary key"));

    await user.click(screen.getByRole("button", { name: "Add table from toolbar" }));
    await user.type(screen.getByRole("textbox", { name: "Table 2 name" }), "posts");
    await user.click(screen.getByRole("button", { name: /Add column/ }));

    const tables = container.querySelectorAll<HTMLElement>("[data-guided-draft-id^='guided-draft:v1:table']");
    const posts = within(tables[1]!);
    await user.type(posts.getByRole("textbox", { name: "Column 1 name" }), "user_id");
    await chooseType(user, posts.getByRole("combobox", { name: "Column 1 type" }), "uuid", "uuid");
    await user.click(posts.getByLabelText("Not null"));
    await user.click(posts.getByLabelText("Unique"));
    await user.selectOptions(
      posts.getByRole("combobox", { name: "Column 1 reference target" }),
      posts.getByRole("option", { name: "users.id" }),
    );

    const result = serializeGuidedDraftToPostgresSql(onDraftChange.mock.calls.at(-1)![0]);
    expect(result.status).toBe("generated");
    if (result.status !== "generated") throw new Error("Expected generated SQL");
    expect(result.output.source).toBe(
      "CREATE TABLE public.users (\n  id uuid DEFAULT gen_random_uuid() PRIMARY KEY\n);\n\n"
      + "CREATE TABLE public.posts (\n  user_id uuid NOT NULL UNIQUE REFERENCES public.users (id)\n);\n",
    );
  });

  it("preserves the Guided draft across the accessible Manual placeholder", async () => {
    const user = userEvent.setup();
    render(<GuidedEditor />);
    await user.type(screen.getByRole("textbox", { name: "Table 1 name" }), "accounts");
    await user.click(screen.getByRole("radio", { name: "Manual SQL" }));
    expect(screen.getByRole("heading", { name: "Manual SQL" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Return to Guided blocks" }));
    expect(screen.getByRole("textbox", { name: "Table 1 name" })).toHaveValue("accounts");
  });
});
