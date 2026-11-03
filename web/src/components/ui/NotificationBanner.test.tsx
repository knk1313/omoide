import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { Button } from "./Button";
import { NotificationBanner } from "./NotificationBanner";

describe("NotificationBanner", () => {
    it("タイトルを h2 で描画し、アイコンは装飾になる", () => {
        const { container } = render(<NotificationBanner type="success" title="保存しました" />);
        const heading = screen.getByRole("heading", { level: 2, name: "保存しました" });
        expect(heading).toHaveClass("font-bold", "text-17");
        const svg = container.querySelector("svg");
        expect(svg).toHaveAttribute("aria-hidden", "true");
        expect(svg).toHaveClass("text-success");
        expect(container.firstElementChild).toHaveClass("border-success", "border-3", "rounded-12", "bg-surface");
        expect(container.firstElementChild).not.toHaveAttribute("role");
    });

    it("as で見出しレベルを変えられる", () => {
        render(<NotificationBanner title="お知らせ" as="h3" />);
        expect(screen.getByRole("heading", { level: 3, name: "お知らせ" })).toBeInTheDocument();
    });

    it("type ごとに枠線とアイコンの色が変わり、color-chip では左の帯が付く", () => {
        const { container, rerender } = render(<NotificationBanner type="error" title="A" />);
        expect(container.firstElementChild).toHaveClass("border-error");
        rerender(<NotificationBanner type="warning" style="color-chip" title="A" />);
        expect(container.firstElementChild).toHaveClass("border-warning", "border-2", "border-l-8", "border-l-warning-chip");
        expect(container.firstElementChild).not.toHaveClass("rounded-12");
        rerender(<NotificationBanner type="info" title="A" />);
        expect(container.firstElementChild).toHaveClass("border-info");
        rerender(<NotificationBanner type="neutral" title="A" />);
        expect(container.firstElementChild).toHaveClass("border-neutral");
    });

    it("説明と年月日を描画し、年月日は <time> になる", () => {
        render(<NotificationBanner title="メンテナンスのお知らせ" description={<p>4 月 1 日 2:00〜5:00 は利用できません。</p>} date="2026年3月25日" dateTime="2026-03-25" />);
        expect(screen.getByText("4 月 1 日 2:00〜5:00 は利用できません。")).toBeInTheDocument();
        const time = screen.getByText("2026年3月25日");
        expect(time.tagName).toBe("TIME");
        expect(time).toHaveAttribute("datetime", "2026-03-25");
    });

    it("onClose を渡すと「閉じる」ボタンが出て、押すと呼ばれる", async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<NotificationBanner title="A" onClose={onClose} />);
        const close = screen.getByRole("button", { name: "閉じる" });
        await user.click(close);
        expect(onClose).toHaveBeenCalledTimes(1);
        close.blur();
        await user.tab();
        expect(close).toHaveFocus();
        await user.keyboard("{Enter}");
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it("アクションボタンを描画する", () => {
        render(
            <NotificationBanner
                title="新しいバージョンがあります"
                actions={
                    <>
                        <Button>更新する</Button>
                        <Button variant="outline">後で</Button>
                    </>
                }
            />,
        );
        expect(screen.getByRole("button", { name: "更新する" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "後で" })).toBeInTheDocument();
    });

    it("live のときだけ role=status が付く", () => {
        const { rerender } = render(<NotificationBanner title="A" live />);
        expect(screen.getByRole("status")).toBeInTheDocument();
        rerender(<NotificationBanner title="A" />);
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("className で拡張できる", () => {
        const { container } = render(<NotificationBanner title="A" className="mb-6" />);
        expect(container.firstElementChild).toHaveClass("mb-6", "border-info");
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = render(
            <div>
                <h1>ページ</h1>
                <NotificationBanner type="success" title="成功" description="説明" date="2026年4月1日" dateTime="2026-04-01" onClose={() => {}} />
                <NotificationBanner type="error" style="color-chip" title="エラー" actions={<Button>対応する</Button>} />
                <NotificationBanner type="warning" title="警告" as="h3" live />
            </div>,
        );
        await expectNoA11yViolations(container);
    });
});
