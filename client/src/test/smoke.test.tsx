import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { cn } from "@/lib/utils";

describe("test infrastructure", () => {
    test("resolves the @ alias from vite.config", () => {
        expect(cn("p-2", "p-4")).toBe("p-4");
    });

    test("renders React 19 components", () => {
        render(<p>hello</p>);
        expect(screen.getByText("hello")).toBeInTheDocument();
    });

    test("provides Web Crypto for the E2EE helpers", () => {
        expect(globalThis.crypto?.subtle).toBeDefined();
    });
});
