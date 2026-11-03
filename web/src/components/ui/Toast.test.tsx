import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { ToastProvider, useToast, type ToastOptions } from "./Toast";

function Trigger({ options }: { options: ToastOptions[] }) {
    const { toast } = useToast();
    return (
        <div>
            {options.map((o, i) => (
                <button key={i} type="button" onClick={() => toast(o)}>
                    通知{i + 1}
                </button>
            ))}
        </div>
    );
}

function setup(options: ToastOptions[]) {
    // user-event は内部で遅延のタイマーを使い fake timers と組み合わせると止まるため、同期の fireEvent で操作する。
    const user = {
        click: async (el: Element) => fireEvent.click(el),
        hover: async (el: Element) => fireEvent.mouseEnter(el.closest("[data-type]") ?? el),
        unhover: async (el: Element) => fireEvent.mouseLeave(el.closest("[data-type]") ?? el),
        keyboard: async (key: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key: key.replace(/[{}]/g, "") }),
    };
    const result = render(
        <ToastProvider>
            <Trigger options={options} />
        </ToastProvider>,
    );
    return { user, ...result };
}

describe("Toast", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it("toast() で role=status のリージョンに通知が出る", async () => {
        const { user } = setup([{ title: "保存しました", description: "一覧に反映されます", type: "success" }]);
        const region = screen.getByRole("status");
        expect(region).toHaveAttribute("aria-live", "polite");
        expect(region).toBeEmptyDOMElement();
        await user.click(screen.getByRole("button", { name: "通知1" }));
        expect(within(region).getByText("保存しました")).toBeInTheDocument();
        expect(within(region).getByText("一覧に反映されます")).toBeInTheDocument();
        const item = within(region).getByText("保存しました").closest("[data-type]");
        expect(item).toHaveClass("border-success", "rounded-8", "shadow-3");
        expect(item?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    });

    it("8 秒後に自動で消える", async () => {
        const { user } = setup([{ title: "A" }]);
        await user.click(screen.getByRole("button", { name: "通知1" }));
        expect(screen.getByText("A")).toBeInTheDocument();
        act(() => {
            vi.advanceTimersByTime(7999);
        });
        expect(screen.getByText("A")).toBeInTheDocument();
        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(screen.queryByText("A")).not.toBeInTheDocument();
    });

    it("ホバー中は自動消去が止まり、離れると残り時間から再開する", async () => {
        const { user } = setup([{ title: "A" }]);
        await user.click(screen.getByRole("button", { name: "通知1" }));
        act(() => {
            vi.advanceTimersByTime(5000);
        });
        await user.hover(screen.getByText("A"));
        act(() => {
            vi.advanceTimersByTime(10000);
        });
        expect(screen.getByText("A")).toBeInTheDocument();
        await user.unhover(screen.getByText("A"));
        act(() => {
            vi.advanceTimersByTime(2999);
        });
        expect(screen.getByText("A")).toBeInTheDocument();
        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(screen.queryByText("A")).not.toBeInTheDocument();
    });

    it("duration が 0 なら自動で消えない", async () => {
        const { user } = setup([{ title: "A", duration: 0 }]);
        await user.click(screen.getByRole("button", { name: "通知1" }));
        act(() => {
            vi.advanceTimersByTime(60000);
        });
        expect(screen.getByText("A")).toBeInTheDocument();
    });

    it("閉じるボタンで消え、フォーカス中は Esc でも消える", async () => {
        const { user } = setup([{ title: "A" }, { title: "B" }]);
        await user.click(screen.getByRole("button", { name: "通知1" }));
        await user.click(screen.getByRole("button", { name: "通知2" }));
        const closes = screen.getAllByRole("button", { name: "通知を閉じる" });
        expect(closes).toHaveLength(2);
        await user.click(closes[0]);
        expect(screen.queryByText("A")).not.toBeInTheDocument();
        expect(screen.getByText("B")).toBeInTheDocument();

        screen.getByRole("button", { name: "通知を閉じる" }).focus();
        await user.keyboard("{Escape}");
        expect(screen.queryByText("B")).not.toBeInTheDocument();
    });

    it("同時に表示するのは 3 件までで、古いものから消える", async () => {
        const { user } = setup([{ title: "A" }, { title: "B" }, { title: "C" }, { title: "D" }]);
        for (const name of ["通知1", "通知2", "通知3", "通知4"]) await user.click(screen.getByRole("button", { name }));
        expect(screen.queryByText("A")).not.toBeInTheDocument();
        expect(screen.getByText("B")).toBeInTheDocument();
        expect(screen.getByText("D")).toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: "通知を閉じる" })).toHaveLength(3);
    });

    it("Provider の外で useToast を使うとエラーになる", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => {});
        expect(() => render(<Trigger options={[]} />)).toThrow(/ToastProvider/);
        spy.mockRestore();
    });

    it("アクセシビリティ違反がない", async () => {
        const { user, container } = setup([
            { title: "成功", type: "success" },
            { title: "失敗", description: "もう一度お試しください", type: "error" },
            { title: "情報", type: "info" },
        ]);
        for (const name of ["通知1", "通知2", "通知3"]) await user.click(screen.getByRole("button", { name }));
        // axe-core は内部でタイマーを使うため、検査の前に実時間へ戻す。
        vi.useRealTimers();
        await expectNoA11yViolations(container);
    });
});
