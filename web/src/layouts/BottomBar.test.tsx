import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/Button";
import { expectNoA11yViolations } from "@/test/axe";
import BottomBar, { PRIMARY_ACTION } from "./BottomBar";

describe("BottomBar", () => {
    it("主な操作を一番下の全幅に置き、戻る操作と要約をその上の行に置く", async () => {
        const back = vi.fn();
        render(
            <BottomBar back={{ label: "クリップ選択", onClick: back }} summary="2件を選択">
                <Button {...PRIMARY_ACTION}>次へ</Button>
            </BottomBar>,
        );
        const primary = screen.getByRole("button", { name: "次へ" });
        expect(primary).toHaveClass("w-full", "min-h-14");
        // 主な操作が最後の子（一番下）
        expect(primary.parentElement?.lastElementChild).toBe(primary);
        expect(screen.getByText("2件を選択")).toHaveAttribute("aria-live", "polite");
        await userEvent.click(screen.getByRole("button", { name: "クリップ選択" }));
        expect(back).toHaveBeenCalledOnce();
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = render(
            <BottomBar summary="要約">
                <Button {...PRIMARY_ACTION}>次へ</Button>
            </BottomBar>,
        );
        await expectNoA11yViolations(container);
    });
});
