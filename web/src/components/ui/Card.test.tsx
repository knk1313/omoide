import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { Button } from "./Button";
import { Card, CardBody, CardFooter, CardHeader } from "./Card";

describe("Card", () => {
    it("枠線付きの白い面を描画し、影を付けない", () => {
        render(
            <Card data-testid="card">
                <CardBody>本文</CardBody>
            </Card>,
        );
        const card = screen.getByTestId("card");
        expect(card).toHaveClass("rounded-8", "border", "border-border-on-canvas", "bg-surface");
        expect(card.className).not.toMatch(/shadow/);
    });

    it("as=section のとき CardHeader の見出しと aria-labelledby で関連付く", () => {
        render(
            <Card as="section">
                <CardHeader title="最近の更新" description="直近 7 日間" actions={<Button size="sm" variant="outline">すべて見る</Button>} />
                <CardBody>本文</CardBody>
                <CardFooter>フッター</CardFooter>
            </Card>,
        );
        const section = screen.getByRole("region", { name: "最近の更新" });
        expect(section).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 2, name: "最近の更新" })).toBeInTheDocument();
        expect(screen.getByText("直近 7 日間")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "すべて見る" })).toBeInTheDocument();
    });

    it("見出しレベルと padding を切り替えられる", () => {
        render(
            <Card padding="sm" data-testid="card">
                <CardHeader as="h3" title="小さいカード" data-testid="header" />
                <CardBody data-testid="body">本文</CardBody>
            </Card>,
        );
        expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
        expect(screen.getByTestId("header")).toHaveClass("px-4", "pt-4");
        expect(screen.getByTestId("body")).toHaveClass("px-4", "py-3");
    });

    it("interactive ではタイトルのリンクがカード全体に広がる", () => {
        render(
            <MemoryRouter>
                <Card interactive data-testid="card">
                    <CardHeader title="申請 No.123" href="/items/123" />
                    <CardBody>本文</CardBody>
                </Card>
            </MemoryRouter>,
        );
        const link = screen.getByRole("link", { name: "申請 No.123" });
        expect(link).toHaveAttribute("href", "/items/123");
        expect(link).toHaveClass("after:absolute", "after:inset-0", "underline");
        expect(screen.getByTestId("card")).toHaveClass("relative", "hover:bg-surface-hover");
    });

    it("Card の外で CardBody を使うとエラーになる", () => {
        expect(() => render(<CardBody>本文</CardBody>)).toThrow();
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = render(
            <MemoryRouter>
                <div>
                    <Card as="section">
                        <CardHeader title="統計" description="説明" actions={<Button size="sm">操作</Button>} />
                        <CardBody>本文</CardBody>
                        <CardFooter>フッター</CardFooter>
                    </Card>
                    <Card interactive as="article">
                        <CardHeader title="リンクカード" href="/a" label="お知らせ" />
                        <CardBody>本文</CardBody>
                    </Card>
                </div>
            </MemoryRouter>,
        );
        await expectNoA11yViolations(container);
    });
});
