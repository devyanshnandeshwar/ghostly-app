import { expect, test, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ToastProvider } from "./Toaster";
import { useToast } from "../lib/toast";

function Probe() {
  const { notify } = useToast();
  return <button onClick={() => notify("Reconnect before continuing", "warning")}>Notify</button>;
}

test("recovery warnings persist until dismissed", () => {
  vi.useFakeTimers();
  render(<ToastProvider><Probe /></ToastProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Notify" }));
  act(() => vi.advanceTimersByTime(10000));
  expect(screen.getByText("Reconnect before continuing")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
  expect(screen.queryByText("Reconnect before continuing")).not.toBeInTheDocument();
});
