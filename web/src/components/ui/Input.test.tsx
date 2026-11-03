import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { FormField } from "./FormField";
import { Input } from "./Input";

describe("Input + FormField", () => {
    it("ラベルと for/id で関連付き、入力できる", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(
            <FormField label="氏名">
                <Input onChange={onChange} />
            </FormField>,
        );
        const input = screen.getByRole("textbox", { name: "氏名" });
        await user.type(input, "山田");
        expect(onChange).toHaveBeenCalled();
        expect(input).toHaveValue("山田");
    });

    it("要否ラベル・サポートテキスト・エラーテキストを表示し、aria-describedby と aria-invalid を付ける", () => {
        render(
            <FormField label="メールアドレス" requirement="required" supportText="半角で入力してください" errorText="メールアドレスを入力してください">
                <Input type="email" />
            </FormField>,
        );
        const input = screen.getByRole("textbox", { name: /メールアドレス/ });
        expect(screen.getByText("※必須")).toBeInTheDocument();
        expect(input).toHaveAccessibleDescription("半角で入力してください ＊メールアドレスを入力してください");
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(input).toHaveAttribute("aria-required", "true");
        expect(input).toHaveClass("aria-invalid:border-error");
    });

    it("エラーテキストに aria-live や role=alert を付けない", () => {
        render(
            <FormField label="氏名" errorText="＊氏名を入力してください">
                <Input />
            </FormField>,
        );
        const error = screen.getByText("＊氏名を入力してください");
        expect(error).not.toHaveAttribute("aria-live");
        expect(error).not.toHaveAttribute("role");
    });

    it("size に応じた高さクラスになる", () => {
        const { rerender } = render(
            <FormField label="A" size="sm">
                <Input />
            </FormField>,
        );
        expect(screen.getByRole("textbox")).toHaveClass("h-control-sm");
        rerender(
            <FormField label="A" size="lg">
                <Input />
            </FormField>,
        );
        expect(screen.getByRole("textbox")).toHaveClass("h-control-lg");
        rerender(<Input size="md" aria-label="単体" />);
        expect(screen.getByRole("textbox")).toHaveClass("h-control-md", "w-full");
    });

    it("fieldset として描画すると legend がグループ名になる", () => {
        render(
            <FormField label="連絡方法" as="fieldset" supportText="いずれかを選んでください">
                <label>
                    <input type="checkbox" /> メール
                </label>
            </FormField>,
        );
        expect(screen.getByRole("group", { name: /連絡方法/ })).toHaveAccessibleDescription("いずれかを選んでください");
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = render(
            <div>
                <FormField label="氏名" requirement="required" supportText="全角で入力" errorText="氏名を入力してください">
                    <Input />
                </FormField>
                <FormField label="任意項目" requirement="optional" direction="horizontal">
                    <Input />
                </FormField>
            </div>,
        );
        await expectNoA11yViolations(container);
    });
});
