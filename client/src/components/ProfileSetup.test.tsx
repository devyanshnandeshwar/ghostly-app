import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionProvider } from "../context/SessionContext";
import { ProfileSetup } from "./ProfileSetup";

vi.mock("../services/session", () => ({
  initSession: async () => ({ _id: "session", isVerified: false, filtersRemaining: 5, filtersTotal: 5 }),
}));

describe("profile accessibility", () => {
  test("arrow keys select a preference within one radio tab stop", async () => {
    const user = userEvent.setup();
    render(<SessionProvider><ProfileSetup onComplete={() => {}} /></SessionProvider>);
    await screen.findByText("5/5 filters left");
    await user.type(screen.getByRole("textbox", { name: "Nickname" }), "reader");
    const anyone = screen.getByRole("radio", { name: /Anyone/ });
    await user.click(anyone);
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(screen.getByRole("radio", { name: /Men/ })).toBeChecked());
    expect(screen.getByRole("radio", { name: /Men/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: /Continue/ })).toHaveFocus();
  });

  test("nickname instructions and bio limit are associated with their fields", () => {
    render(<SessionProvider><ProfileSetup onComplete={() => {}} /></SessionProvider>);
    expect(screen.getByRole("textbox", { name: "Nickname" })).toHaveAccessibleDescription(/3 to 20/);
    expect(screen.getByRole("textbox", { name: "Bio" })).toHaveAccessibleDescription(/120/);
  });
});
