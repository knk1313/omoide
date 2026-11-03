import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { Breadcrumb } from "./Breadcrumb";

const items = [
    { label: "ホーム", href: "/" },
    { label: "申請一覧", href: "/items" },
    { label: "2026年度", href: "/items/2026" },
    { label: "申請No.123" },
];

function renderCrumb(ui: React.ReactElement) {
    return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("Breadcrumb", () => {
    it("nav + olで描画し、最後の項目はaria-current=pageのテキストになる", () => {
        renderCrumb(<Breadcrumb items={items} />);
        const nav = screen.getByRole("navigation", { name: "パンくずリスト" });
        expect(nav.querySelector("ol")).toBeInTheDocument();
        expect(screen.getAllByRole("listitem")).toHaveLength(4);
        expect(screen.getAllByRole("link")).toHaveLength(3);
        expect(screen.getByRole("link", { name: "申請一覧" })).toHaveAttribute("href", "/items");
        const current = screen.getByText("申請No.123");
        expect(current).toHaveAttribute("aria-current", "page");
        expect(current.tagName).toBe("SPAN");
    });

    it("区切りのシェブロンは装飾で、先頭には付かない", () => {
        renderCrumb(<Breadcrumb items={items} />);
        const svgs = screen.getByRole("navigation").querySelectorAll("svg");
        expect(svgs).toHaveLength(3);
        svgs.forEach((svg) => expect(svg).toHaveAttribute("aria-hidden", "true"));
    });

    it("collapseOnMobileでは中間項目を隠し、省略ボタンで展開できる", async () => {
        const user = userEvent.setup();
        renderCrumb(<Breadcrumb items={items} collapseOnMobile />);
        const middle = screen.getByRole("link", { name: "申請一覧" }).closest("li")!;
        expect(middle).toHaveClass("hidden", "md:inline");
        const more = screen.getByRole("button", { name: "省略した階層を表示" });
        await user.click(more);
        expect(screen.queryByRole("button", { name: "省略した階層を表示" })).toBeNull();
        expect(middle).not.toHaveClass("hidden");
    });

    it("項目が2つ以下なら省略しない", () => {
        renderCrumb(<Breadcrumb items={items.slice(0, 2)} collapseOnMobile />);
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("labelでnavの名前を変えられる", () => {
        renderCrumb(<Breadcrumb items={items} label="現在地" />);
        expect(screen.getByRole("navigation", { name: "現在地" })).toBeInTheDocument();
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = renderCrumb(
            <div>
                <Breadcrumb items={items} />
                <Breadcrumb items={items} collapseOnMobile label="省略あり" />
            </div>,
        );
        await expectNoA11yViolations(container);
    });
});
