import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { AuthForm } from "../../components/auth/auth-form";

describe("auth form", () => {
  it("renders only the requested login credentials and links to sign up", () => {
    render(<AuthForm mode="login" />);

    expect(screen.getByRole("textbox", { name: "Email" })).toBeRequired();
    expect(screen.getByLabelText("Password")).toBeRequired();
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup");
  });

  it("keeps signup credentials in the browser-only preview", async () => {
    const user = userEvent.setup();
    render(<AuthForm mode="signup" />);

    await user.type(screen.getByRole("textbox", { name: "Email" }), "dev@example.com");
    await user.type(screen.getByLabelText("Password"), "strong-pass");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByRole("status")).toHaveTextContent("Your credentials were not submitted");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
  });
});
