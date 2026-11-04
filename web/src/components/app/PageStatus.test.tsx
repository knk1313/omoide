import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { AVATAR_DELAY_MS, LoadFailure, Loading, WaitingProgress } from "./PageStatus";

describe("PageStatus", () => {
    it("読み込み中は、スピナーの読み上げと同じ文言を出す", () => {
        render(<Loading label="確認しています" />);
        expect(screen.getByRole("status")).toHaveTextContent("確認しています");
        expect(screen.getByText("確認しています…")).toHaveAttribute("aria-hidden", "true");
    });

    it("avatar を付けると、少し待ってから、スピナーの代わりにアバターを飾りとして出す", async () => {
        vi.useFakeTimers();
        try {
            const { container } = render(<Loading avatar />);
            // すぐ終わる読み込みではちらつかないよう、初めは何も見せず、読み上げだけに状態を伝える
            expect(screen.getByRole("status")).toHaveTextContent("読み込んでいます…");
            expect(screen.getByRole("status")).toHaveClass("sr-only");
            expect(container.querySelector(".size-avatar")).not.toBeInTheDocument();
            expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();

            act(() => vi.advanceTimersByTime(AVATAR_DELAY_MS));
            expect(container.querySelector('.size-avatar[aria-hidden="true"]')).toBeInTheDocument();
            expect(screen.getByRole("status")).not.toHaveClass("sr-only");
        } finally {
            vi.useRealTimers();
        }
    });

    it("アバターを出した状態で、アクセシビリティ違反がない", async () => {
        const { container } = render(<Loading avatar />);
        await waitFor(() => expect(container.querySelector(".size-avatar")).toBeInTheDocument());
        await expectNoA11yViolations(container);
    });

    it("画面の全体を置き換えるときは、読み上げだけの見出しを置く", () => {
        render(<Loading label="確認しています" title="omoide" />);
        expect(screen.getByRole("heading", { level: 1, name: "omoide" })).toHaveClass("sr-only");
        expect(screen.getByRole("status")).toHaveTextContent("確認しています");
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
