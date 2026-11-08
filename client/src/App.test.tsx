import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { SessionProvider } from "./context/SessionContext";
import { SocketProvider } from "./context/SocketContext";
import { MatchProvider } from "./context/MatchContext";
import { ToastProvider } from "./components/Toaster";

vi.mock("./services/session", () => ({ initSession: () => new Promise(() => {}) }));

test("landing remains readable while session startup is pending", async () => {
  render(<ToastProvider><SessionProvider><SocketProvider><MatchProvider><App /></MatchProvider></SocketProvider></SessionProvider></ToastProvider>);
  expect(screen.getByRole("heading", { name: /Talk to someone new/ })).toBeVisible();
  await userEvent.setup().click(screen.getAllByRole("button", { name: "Start messaging" })[0]);
  expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveFocus();
});
