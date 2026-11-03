import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { Button } from "./Button";
import { ModalDialog, actionsLayoutClass, type ModalDialogProps } from "./ModalDialog";

type HarnessProps = Partial<Omit<ModalDialogProps, "open" | "onClose">> & { withActions?: boolean };

function Harness({ withActions = false, children, ...props }: HarnessProps) {
    const [open, setOpen] = useState(false);
    return (
        <div>
            <button type="button" onClick={() => setOpen(true)}>
                開く
            </button>
            <input aria-label="背景の入力" />
            <ModalDialog
                open={open}
                onClose={() => setOpen(false)}
                title="確認"
                actions={
                    withActions ? (
                        <>
                            <Button variant="outline" onClick={() => setOpen(false)}>
                                キャンセル
                            </Button>
                            <Button onClick={() => setOpen(false)}>削除する</Button>
                        </>
                    ) : undefined
                }
                {...props}
            >
                {children ?? (
                    <div>
                        <p>本文</p>
                        <input aria-label="名前" />
                    </div>
                )}
            </ModalDialog>
        </div>
    );
}

async function openDialog(props: HarnessProps = {}) {
    const user = userEvent.setup();
    const result = render(<Harness {...props} />);
    await user.click(screen.getByRole("button", { name: "開く" }));
    return { user, ...result };
}

describe("ModalDialog", () => {
    it("開くと role=dialog（aria-modal）で見出しに関連付き、見出しにフォーカスする", async () => {
        await openDialog();
        const dialog = screen.getByRole("dialog", { name: "確認" });
        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(dialog).toHaveClass("rounded-8", "border-border-emphasis", "bg-surface", "shadow-3", "md:min-w-dialog");
        const heading = screen.getByRole("heading", { level: 2, name: "確認" });
        expect(heading).toHaveFocus();
        expect(heading).toHaveAttribute("tabindex", "-1");
        expect(dialog).toHaveAccessibleDescription(/本文/);
    });

    it("閉じていれば何も描画しない", () => {
        render(<Harness />);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("Tab はダイアログの中で巡回する", async () => {
        const { user } = await openDialog();
        await user.tab();
        expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
        await user.tab();
        expect(screen.getByLabelText("名前")).toHaveFocus();
        await user.tab();
        expect(screen.getByRole("button", { name: "閉じる" })).toHaveFocus();
        await user.tab({ shift: true });
        expect(screen.getByLabelText("名前")).toHaveFocus();
    });

    it("Esc で閉じ、開く前の要素へフォーカスを戻す", async () => {
        const { user } = await openDialog();
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "開く" })).toHaveFocus();
    });

    it("閉じるボタンで閉じる（closeLabel で文言を変えられる）", async () => {
        const { user } = await openDialog({ closeLabel: "やめる" });
        await user.click(screen.getByRole("button", { name: "やめる" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("暗幕のクリックは既定では閉じない", async () => {
        const { user } = await openDialog();
        const overlay = screen.getByRole("dialog").parentElement!;
        expect(overlay).toHaveClass("bg-scrim");
        await user.click(overlay);
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        // パネル内のクリックでも閉じない。
        await user.click(screen.getByLabelText("名前"));
        expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("dismissOnBackdrop のときは暗幕のクリックで閉じる", async () => {
        const { user } = await openDialog({ dismissOnBackdrop: true });
        await user.click(screen.getByRole("dialog").parentElement!);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("アクションボタンがあるときは閉じるボタンを出さず、2 つなら左右に分ける", async () => {
        const { user } = await openDialog({ withActions: true });
        expect(screen.queryByRole("button", { name: "閉じる" })).not.toBeInTheDocument();
        const cancel = screen.getByRole("button", { name: "キャンセル" });
        expect(cancel.parentElement).toHaveClass("justify-between", "flex-wrap");
        await user.click(screen.getByRole("button", { name: "削除する" }));
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("アクションの並びは 1 つで中央、2 つで左右、3 つ以上で右寄せ", () => {
        expect(actionsLayoutClass(1)).toBe("justify-center");
        expect(actionsLayoutClass(2)).toBe("justify-between");
        expect(actionsLayoutClass(3)).toBe("justify-end");
    });

    it("開いている間は背景に inert が付き、スクロールが止まり、閉じると戻る", async () => {
        const { user, container } = await openDialog();
        expect(container).toHaveAttribute("inert");
        expect(document.body.style.overflow).toBe("hidden");
        await user.keyboard("{Escape}");
        expect(container).not.toHaveAttribute("inert");
        expect(document.body.style.overflow).toBe("");
    });

    it("size=lg で広い幅になる", async () => {
        await openDialog({ size: "lg" });
        expect(screen.getByRole("dialog")).toHaveClass("md:max-w-4xl");
    });

    it("アクセシビリティ違反がない", async () => {
        await openDialog({ withActions: true });
        await expectNoA11yViolations(screen.getByRole("dialog"));
    });
});
