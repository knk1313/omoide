import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { Button } from "./Button";
import { ErrorPage } from "./ErrorPage";

describe("ErrorPage", () => {
    it("section が h1 に関連付き、ステータス番号と既定の「ホームへ戻る」リンクを描画する", () => {
        render(
            <MemoryRouter>
                <ErrorPage status={404} title="ページが見つかりません" description="URL が正しいか確認してください。" />
            </MemoryRouter>,
        );
        const section = screen.getByRole("region", { name: "ページが見つかりません" });
        expect(section.tagName).toBe("SECTION");
        expect(screen.getByRole("heading", { level: 1 })).toHaveClass("text-std-28B-150");
        expect(screen.getByText("404")).toHaveClass("text-dsp-48B-140", "text-text-subtle");
        expect(screen.getByText("URL が正しいか確認してください。")).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "ホームへ戻る" })).toHaveAttribute("href", "/");
    });

    it("actions を差し替えられ、status は省略できる", () => {
        render(
            <ErrorPage
                title="エラーが発生しました"
                actions={
                    <>
                        <Button variant="outline">前のページへ</Button>
                        <Button>再読み込み</Button>
                    </>
                }
            />,
        );
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "再読み込み" })).toBeInTheDocument();
        expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = render(
            <MemoryRouter>
                <main>
                    <ErrorPage status={500} title="サーバーでエラーが発生しました" description="時間をおいて再度お試しください。" />
                </main>
            </MemoryRouter>,
        );
        await expectNoA11yViolations(container);
    });
});
