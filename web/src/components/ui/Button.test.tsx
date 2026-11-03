import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Plus } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { Button, ButtonLink } from "./Button";

describe("Button", () => {
    it("ラベルを描画し、クリックで onClick を呼ぶ", async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<Button onClick={onClick}>保存</Button>);
        const button = screen.getByRole("button", { name: "保存" });
        expect(button).toHaveAttribute("type", "button");
        await user.click(button);
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("Enter と Space で押せる", async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<Button onClick={onClick}>保存</Button>);
        await user.tab();
        expect(screen.getByRole("button", { name: "保存" })).toHaveFocus();
        await user.keyboard("{Enter}");
        await user.keyboard(" ");
        expect(onClick).toHaveBeenCalledTimes(2);
    });

    it("variant / size / tone に応じたクラスを付ける", () => {
        const { rerender } = render(<Button>A</Button>);
        expect(screen.getByRole("button")).toHaveClass("bg-primary", "min-h-12");
        rerender(
            <Button variant="outline" size="lg">
                A
            </Button>,
        );
        expect(screen.getByRole("button")).toHaveClass("border", "min-h-14", "min-w-34");
        rerender(
            <Button variant="text" size="sm" tone="error">
                A
            </Button>,
        );
        expect(screen.getByRole("button")).toHaveClass("underline", "text-error", "tap-area");
        rerender(<Button size="xs">A</Button>);
        expect(screen.getByRole("button")).toHaveClass("text-14", "min-h-7");
    });

    it("disabled のとき押せない", async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(
            <Button disabled onClick={onClick}>
                保存
            </Button>,
        );
        const button = screen.getByRole("button", { name: "保存" });
        expect(button).toBeDisabled();
        await user.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });

    it("loading のとき aria-busy になり、スピナーを出し、クリックしても onClick を呼ばない", async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(
            <Button loading onClick={onClick}>
                保存
            </Button>,
        );
        const button = screen.getByRole("button", { name: /保存/ });
        expect(button).toHaveAttribute("aria-busy", "true");
        expect(screen.getByRole("status")).toHaveTextContent("処理中");
        await user.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });

    it("アイコンは装飾として aria-hidden になる", () => {
        render(<Button leadIcon={Plus}>追加</Button>);
        const svg = screen.getByRole("button").querySelector("svg");
        expect(svg).toHaveAttribute("aria-hidden", "true");
        expect(screen.getByRole("button")).toHaveAccessibleName("追加");
    });

    it("className で拡張できる", () => {
        render(<Button className="mt-4">A</Button>);
        expect(screen.getByRole("button")).toHaveClass("mt-4", "bg-primary");
    });

    it("ButtonLink はリンクとして描画される", () => {
        render(
            <MemoryRouter>
                <ButtonLink to="/items" variant="outline">
                    一覧へ
                </ButtonLink>
            </MemoryRouter>,
        );
        const link = screen.getByRole("link", { name: "一覧へ" });
        expect(link).toHaveAttribute("href", "/items");
        expect(link).toHaveClass("border");
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = render(
            <div>
                <Button>塗り</Button>
                <Button variant="outline">アウトライン</Button>
                <Button variant="text">テキスト</Button>
                <Button loading>処理中</Button>
                <Button disabled>無効</Button>
            </div>,
        );
        await expectNoA11yViolations(container);
    });
});
