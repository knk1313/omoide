import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { StepNavigation } from "./StepNavigation";

const steps = [{ label: "入力" }, { label: "確認", description: "内容を確認します" }, { label: "完了" }];

describe("StepNavigation", () => {
    it("nav + ol で描画し、現在のステップに aria-current=step を付ける", () => {
        render(<StepNavigation steps={steps} current={1} />);
        expect(screen.getByRole("navigation", { name: "手続きの流れ" })).toBeInTheDocument();
        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(3);
        expect(items[1]).toHaveAttribute("aria-current", "step");
        expect(items[0]).not.toHaveAttribute("aria-current");
        expect(screen.getByText("内容を確認します")).toBeInTheDocument();
    });

    it("スクリーンリーダー向けに「ステップ n / N」と状態を読み上げる", () => {
        render(<StepNavigation steps={steps} current={1} />);
        const items = screen.getAllByRole("listitem");
        expect(items[0]).toHaveTextContent("ステップ 1 / 3、完了");
        expect(items[1]).toHaveTextContent("ステップ 2 / 3、現在のステップ");
        expect(items[2]).toHaveTextContent("ステップ 3 / 3");
    });

    it("完了ステップはチェックアイコン、未到達は番号を表示する", () => {
        render(<StepNavigation steps={steps} current={1} />);
        const items = screen.getAllByRole("listitem");
        expect(items[0].querySelector("svg")).toBeInTheDocument();
        expect(items[2].querySelector('[aria-hidden="true"]')).toHaveTextContent("3");
    });

    it("current が範囲外ならすべて完了", () => {
        render(<StepNavigation steps={steps} current={3} />);
        screen.getAllByRole("listitem").forEach((li) => expect(li).toHaveTextContent("完了"));
        expect(screen.queryByRole("listitem", { current: "step" })).toBeNull();
    });

    it("orientation を切り替えられる", () => {
        const { rerender } = render(<StepNavigation steps={steps} current={0} />);
        expect(screen.getByRole("list")).toHaveClass("flex-row");
        rerender(<StepNavigation steps={steps} current={0} orientation="vertical" />);
        expect(screen.getByRole("list")).toHaveClass("flex-col");
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = render(<StepNavigation steps={steps} current={1} orientation="vertical" />);
        await expectNoA11yViolations(container);
    });
});
