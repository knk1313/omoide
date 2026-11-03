import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
    it("見出し・説明・アクションを中央に描画し、アイコンは装飾になる", () => {
        const { container } = render(
            <EmptyState icon={Inbox} title="書類がありません" description="「新規作成」から最初の書類を登録してください。" action={<Button>新規作成</Button>} />,
        );
        expect(screen.getByRole("heading", { level: 2, name: "書類がありません" })).toBeInTheDocument();
        expect(screen.getByText("「新規作成」から最初の書類を登録してください。")).toHaveClass("text-text-muted");
        expect(screen.getByRole("button", { name: "新規作成" })).toBeInTheDocument();
        expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
        expect(container.firstElementChild).toHaveClass("items-center", "text-center", "py-16");
    });

    it("as で見出しレベルを変えられ、任意の要素は省略できる", () => {
        render(<EmptyState title="該当する結果がありません" as="h3" />);
        expect(screen.getByRole("heading", { level: 3, name: "該当する結果がありません" })).toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });

    it("className で拡張できる", () => {
        const { container } = render(<EmptyState title="A" className="min-h-80" />);
        expect(container.firstElementChild).toHaveClass("min-h-80", "py-16");
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = render(
            <section aria-label="一覧">
                <h2>書類</h2>
                <EmptyState as="h3" icon={Inbox} title="書類がありません" description="説明" action={<Button>新規作成</Button>} />
            </section>,
        );
        await expectNoA11yViolations(container);
    });
});
