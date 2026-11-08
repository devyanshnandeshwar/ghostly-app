import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "./theme-provider";
import { ModeToggle } from "./mode-toggle";

test("the first toggle switches a system-dark theme to light", async () => {
  localStorage.clear();
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches: query.includes("dark"), media: query, onchange: null,
    addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }));
  render(<ThemeProvider attribute="class" defaultTheme="system" enableSystem><ModeToggle /></ThemeProvider>);
  expect(document.documentElement).toHaveClass("dark");
  await userEvent.setup().click(screen.getByRole("button", { name: /theme/i }));
  expect(document.documentElement).toHaveClass("light");
  vi.restoreAllMocks();
  localStorage.clear();
});
