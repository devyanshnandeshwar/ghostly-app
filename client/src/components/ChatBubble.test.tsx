import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatBubble } from "./ChatBubble";

test("messages identify both senders without relying on alignment", () => {
  render(<><ChatBubble from="me" text="hello" /><ChatBubble from="them" text="hi" senderName="Robin" /></>);
  expect(screen.getByText("You:")).toBeInTheDocument();
  expect(screen.getByText("Robin:")).toBeInTheDocument();
});
