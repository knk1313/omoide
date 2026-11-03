import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { Button } from "./Button";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
    it("h1と説明・メタ情報を描画する", () => {
        render(<PageHeader title="申請一覧" description="受け付けた申請を管理します" meta="最終更新：2026-11-03 10:00" />);
        expect(screen.getByRole("heading", { level: 1, name: "申請一覧" })).toHaveClass("text-std-24B-150", "md:text-std-28B-150");
        expect(screen.getByText("受け付けた申請を管理します")).toBeInTheDocument();
        expect(screen.getByText("最終更新：2026-11-03 10:00")).toBeInTheDocument();
    });

    it("パンくずと操作を描画する", () => {
        render(
            <MemoryRouter>
                <PageHeader
                    title="申請No.123"
                    breadcrumbs={[
                        { label: "ホーム", href: "/" },
                        { label: "申請一覧", href: "/items" },
                        { label: "申請No.123" },
                    ]}
                    actions={<Button>編集</Button>}
                />
            </MemoryRouter>,
        );
        const nav = screen.getByRole("navigation", { name: "パンくずリスト" });
        expect(nav).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "申請一覧" })).toHaveAttribute("href", "/items");
        expect(screen.getByRole("button", { name: "編集" })).toBeInTheDocument();
    });

    it("パンくずが空のときはnavを描画しない", () => {
        render(<PageHeader title="A" breadcrumbs={[]} />);
        expect(screen.queryByRole("navigation")).toBeNull();
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = render(
            <MemoryRouter>
                <main>
                    <PageHeader
                        title="申請一覧"
                        description="説明"
                        breadcrumbs={[{ label: "ホーム", href: "/" }, { label: "申請一覧" }]}
                        actions={<Button>新規作成</Button>}
                        meta="100件"
                    />
                </main>
            </MemoryRouter>,
        );
        await expectNoA11yViolations(container);
    });
});
