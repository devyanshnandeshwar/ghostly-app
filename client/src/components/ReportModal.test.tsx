import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ReportModal from "./ReportModal";

// The regression this guards: Radix unmounts DialogContent's children, but
// ReportModal itself stays mounted (Chat renders it unconditionally), so its
// useState survived every close. Report someone for Harassment with a note, skip
// to the next stranger, open Report again -- and the form was pre-filled with
// what you wrote about the previous person, one click from being submitted
// about someone it does not describe.

function setup(onSubmit = vi.fn()) {
    const onClose = vi.fn();
    const view = render(<ReportModal isOpen={false} onClose={onClose} onSubmit={onSubmit} />);
    const open = () =>
        view.rerender(<ReportModal isOpen onClose={onClose} onSubmit={onSubmit} />);
    const close = () =>
        view.rerender(<ReportModal isOpen={false} onClose={onClose} onSubmit={onSubmit} />);
    return { onSubmit, onClose, open, close };
}

describe("state between reports", () => {
    test("the note written about one person does not carry to the next", async () => {
        const user = userEvent.setup();
        const { open, close } = setup();

        open();
        await user.type(screen.getByRole("textbox"), "he kept sending links");
        close();
        open();

        expect(screen.getByRole("textbox")).toHaveValue("");
    });

    test("the chosen reason resets too", async () => {
        const user = userEvent.setup();
        const { open, close } = setup();

        open();
        await user.click(screen.getByRole("radio", { name: /spam/i }));
        expect(screen.getByRole("radio", { name: /spam/i })).toBeChecked();

        close();
        open();

        expect(screen.getByRole("radio", { name: /harassment/i })).toBeChecked();
    });

    test("a note survives while the dialog stays open", async () => {
        const user = userEvent.setup();
        const { open } = setup();

        open();
        await user.type(screen.getByRole("textbox"), "still typing");

        expect(screen.getByRole("textbox")).toHaveValue("still typing");
    });
});

describe("submitting", () => {
    test("passes the reason and the note", async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        const { open } = setup(onSubmit);

        open();
        await user.click(screen.getByRole("radio", { name: /hate speech/i }));
        await user.type(screen.getByRole("textbox"), "slurs");
        await user.click(screen.getByRole("button", { name: /send report/i }));

        expect(onSubmit).toHaveBeenCalledWith("Hate Speech", "slurs");
    });

    test("defaults to the first reason when the user picks none", async () => {
        const user = userEvent.setup();
        const onSubmit = vi.fn();
        const { open } = setup(onSubmit);

        open();
        await user.click(screen.getByRole("button", { name: /send report/i }));

        expect(onSubmit).toHaveBeenCalledWith("Harassment", "");
    });
});
