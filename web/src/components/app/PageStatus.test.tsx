import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { LoadFailure, Loading, WaitingProgress } from "./PageStatus";

describe("PageStatus", () => {
    it("読み込み中は、アバターを飾りとして出し、文言を読み上げる", async () => {
        const { container } = render(<Loading label="確認しています" />);
        expect(screen.getByRole("status")).toHaveTextContent("確認しています…");
        expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
        await expectNoA11yViolations(container);
    });

    it("進み具合には、アバターを添えて、バーで割合を伝える", async () => {
        const { container } = render(<WaitingProgress label="プレビューを作っています" value={0.5} />);
        expect(screen.getByRole("progressbar", { name: "プレビューを作っています" })).toHaveAttribute("aria-valuenow", "50");
        expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
        await expectNoA11yViolations(container);
    });

    it("読み込めなければ、理由をすぐ読み上げ、もう一度読み込める", async () => {
        const retry = vi.fn();
        const { container } = render(<LoadFailure message="読み込めませんでした" onRetry={retry} />);
        expect(screen.getByRole("alert")).toHaveTextContent("読み込めませんでした");
        await userEvent.click(screen.getByRole("button", { name: "もう一度読み込む" }));
        expect(retry).toHaveBeenCalledOnce();
        await expectNoA11yViolations(container);
    });
});
