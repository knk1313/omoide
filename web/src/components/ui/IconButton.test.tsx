import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { X } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { IconButton } from "./IconButton";

describe("IconButton", () => {
    it("label を aria-label にし、アイコンは装飾になる", () => {
        render(<IconButton icon={X} label="閉じる" />);
        const button = screen.getByRole("button", { name: "閉じる" });
        expect(button).toHaveAttribute("type", "button");
        expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    });

    it("クリックとキーボードで onClick を呼ぶ", async () => {
        const user = userEvent.setup();
        const onClick = vi.fn();
        render(<IconButton icon={X} label="閉じる" onClick={onClick} />);
        await user.click(screen.getByRole("button"));
        await user.keyboard("{Enter}");
        expect(onClick).toHaveBeenCalledTimes(2);
    });

    it("size / variant / tone に応じたクラスを付ける", () => {
        const { rerender } = render(<IconButton icon={X} label="A" />);
        expect(screen.getByRole("button")).toHaveClass("size-target", "rounded-8", "hover:bg-surface-muted");
        rerender(<IconButton icon={X} label="A" size="sm" variant="outline" tone="error" />);
        expect(screen.getByRole("button")).toHaveClass("tap-area", "size-9", "border", "text-error");
    });

    it("ref と className を受け取る", () => {
        const ref = { current: null as HTMLButtonElement | null };
        render(<IconButton icon={X} label="A" ref={ref} className="ml-auto" />);
        expect(ref.current).toBeInstanceOf(HTMLButtonElement);
        expect(ref.current).toHaveClass("ml-auto");
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = render(
            <div>
                <IconButton icon={X} label="閉じる" />
                <IconButton icon={X} label="削除" tone="error" variant="outline" size="sm" />
            </div>,
        );
        await expectNoA11yViolations(container);
    });
});
