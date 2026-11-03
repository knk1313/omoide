import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { ConfirmProvider, useConfirm } from "./ConfirmDialog";

type Confirm = ReturnType<typeof useConfirm>["confirm"];

function Capture({ onReady }: { onReady: (confirm: Confirm) => void }) {
    const { confirm } = useConfirm();
    useEffect(() => onReady(confirm), [confirm, onReady]);
    return (
        <button type="button">
            削除
        </button>
    );
}

function setup() {
    const user = userEvent.setup();
    let confirm!: Confirm;
    const result = render(
        <ConfirmProvider>
            <Capture onReady={(c) => (confirm = c)} />
        </ConfirmProvider>,
    );
    return { user, confirm: (...args: Parameters<Confirm>) => confirm(...args), ...result };
}

describe("ConfirmDialog", () => {
    it("OKでtrue、キャンセルでfalseを返す", async () => {
        const { user, confirm } = setup();
        let result!: Promise<boolean>;
        act(() => {
            result = confirm({ title: "削除しますか", message: "この操作は取り消せません" });
        });
        const dialog = screen.getByRole("dialog", { name: "削除しますか" });
        expect(dialog).toHaveAttribute("aria-modal", "true");
        expect(dialog).toHaveAccessibleDescription("この操作は取り消せません");
        expect(screen.getByRole("heading", { level: 2, name: "削除しますか" })).toHaveFocus();
        await user.click(screen.getByRole("button", { name: "OK" }));
        await expect(result).resolves.toBe(true);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

        act(() => {
            result = confirm({ title: "二度目" });
        });
        await user.click(screen.getByRole("button", { name: "キャンセル" }));
        await expect(result).resolves.toBe(false);
    });

    it("Escで閉じるとfalseを返し、開く前の要素へフォーカスを戻す", async () => {
        const { user, confirm } = setup();
        screen.getByRole("button", { name: "削除" }).focus();
        let result!: Promise<boolean>;
        act(() => {
            result = confirm({ title: "削除しますか" });
        });
        await user.keyboard("{Escape}");
        await expect(result).resolves.toBe(false);
        expect(screen.getByRole("button", { name: "削除" })).toHaveFocus();
    });

    it("ラベルとtoneを変えられ、閉じるボタンは出さない", () => {
        const { confirm } = setup();
        act(() => {
            void confirm({ title: "下書きを破棄", confirmLabel: "破棄する", cancelLabel: "戻る", tone: "error" });
        });
        expect(screen.getByRole("button", { name: "破棄する" })).toHaveClass("bg-error");
        expect(screen.getByRole("button", { name: "戻る" })).toHaveClass("border");
        expect(screen.queryByRole("button", { name: "閉じる" })).not.toBeInTheDocument();
    });

    it("連続して呼ばれた確認を順に表示し、それぞれの結果を返す", async () => {
        const { user, confirm } = setup();
        let first!: Promise<boolean>;
        let second!: Promise<boolean>;
        act(() => {
            first = confirm({ title: "一つ目" });
            second = confirm({ title: "二つ目" });
        });

        expect(screen.getByRole("dialog", { name: "一つ目" })).toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "二つ目" })).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "OK" }));
        await expect(first).resolves.toBe(true);

        expect(await screen.findByRole("dialog", { name: "二つ目" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "キャンセル" }));
        await expect(second).resolves.toBe(false);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("Tabはダイアログの中で巡回する", async () => {
        const { user, confirm } = setup();
        act(() => {
            void confirm({ title: "確認" });
        });
        await user.tab();
        expect(screen.getByRole("button", { name: "キャンセル" })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole("button", { name: "OK" })).toHaveFocus();
        await user.tab();
        expect(screen.getByRole("button", { name: "キャンセル" })).toHaveFocus();
    });

    it("アクセシビリティ違反がない", async () => {
        const { confirm } = setup();
        act(() => {
            void confirm({ title: "削除しますか", message: "この操作は取り消せません", tone: "error" });
        });
        await expectNoA11yViolations(screen.getByRole("dialog"));
    });
});
