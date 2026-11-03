import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ErrorBoundary from "./ErrorBoundary";

function Broken(): never {
    throw new Error("render failed");
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("ErrorBoundary", () => {
    it("描画中の例外で真っ白にせず、読み込み直せる案内を出す", () => {
        // React が例外をコンソールに出すので、テストの出力を汚さないよう抑える
        vi.spyOn(console, "error").mockImplementation(() => {});
        render(
            <ErrorBoundary>
                <Broken />
            </ErrorBoundary>,
        );
        expect(screen.getByRole("heading", { name: "問題が起きました" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "読み込み直す" })).toBeInTheDocument();
    });
});
