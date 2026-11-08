import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    const props = { onClose, onSubmit, reasons: ["Harassment", "Abusive Behavior", "Spam", "Underage", "Other"] };
    const view = render(<ReportModal isOpen={false} {...props} />);
    const open = () =>
        view.rerender(<ReportModal isOpen {...props} />);
    const close = () =>
        view.rerender(<ReportModal isOpen={false} {...props} />);
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

        expect(screen.getByRole("radio", { name: /harassment/i })).not.toBeChecked();
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
        await user.click(screen.getByRole("radio", { name: /abusive behavior/i }));
        await user.type(screen.getByRole("textbox"), "slurs");
        await user.click(screen.getByRole("button", { name: /send report/i }));

        expect(onSubmit).toHaveBeenCalledWith("Abusive Behavior", "slurs");
    });

    test("requires a deliberate reason selection", () => {
        const onSubmit = vi.fn();
        const { open } = setup(onSubmit);

        open();
        expect(screen.getByRole("button", { name: /send report/i })).toBeDisabled();
    });

    test("retains the note and permits retry when server submission fails", async () => {
        const user = userEvent.setup();
        const { open } = setup(vi.fn().mockRejectedValue(new Error("Could not submit. Try again.")));
        open();
        await user.click(screen.getByRole("radio", { name: "Harassment" }));
        await user.type(screen.getByRole("textbox"), "keep this note");
        await user.click(screen.getByRole("button", { name: /send report/i }));
        await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Try again/));
        expect(screen.getByRole("textbox")).toHaveValue("keep this note");
        expect(screen.getByRole("button", { name: /send report/i })).toBeEnabled();
    });

    test("prevents duplicate submission while waiting for acknowledgement", async () => {
        const user = userEvent.setup();
        const { open } = setup(vi.fn().mockReturnValue(new Promise(() => {})));
        open();
        await user.click(screen.getByRole("radio", { name: "Harassment" }));
        await user.click(screen.getByRole("button", { name: /send report/i }));
        expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
        expect(screen.getByRole("textbox")).toBeDisabled();
    });
});
