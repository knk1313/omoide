import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { DescriptionItem, DescriptionList } from "./DescriptionList";

const items = [
    { term: "申請番号", description: "A-2026-00123" },
    { term: "申請者", description: "山田 太郎" },
    { term: "提出日", description: "2026年10月1日" },
];

describe("DescriptionList", () => {
    it("items から dl / dt / dd を描画し、dt は太字、dd はモバイルで左 32px", () => {
        render(<DescriptionList items={items} />);
        const term = screen.getByText("申請番号");
        expect(term.tagName).toBe("DT");
        expect(term.closest("dl")).toBeInTheDocument();
        expect(screen.getAllByRole("term")).toHaveLength(3);
        expect(screen.getAllByRole("definition")).toHaveLength(3);
        expect(screen.getByText("申請者")).toHaveClass("font-bold");
        expect(screen.getAllByRole("definition")[0]).toHaveClass("ml-8", "md:ml-0", "md:col-span-2");
    });

    it("children（DescriptionItem）でも書ける", () => {
        render(
            <DescriptionList>
                <DescriptionItem term="氏名">山田 太郎</DescriptionItem>
                <DescriptionItem term="所属">総務部</DescriptionItem>
            </DescriptionList>,
        );
        expect(screen.getByText("所属").tagName).toBe("DT");
        expect(screen.getByText("総務部").tagName).toBe("DD");
    });

    it("columns=2 で md 以上 2 列、divided で項目間に罫線", () => {
        const { rerender } = render(<DescriptionList items={items} columns={2} />);
        expect(screen.getByText("申請番号").closest("dl")).toHaveClass("md:grid-cols-2");
        rerender(<DescriptionList items={items} divided />);
        expect(screen.getByText("申請番号").parentElement).toHaveClass("border-b", "border-border", "py-4");
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = render(
            <div>
                <DescriptionList items={items} divided />
                <DescriptionList columns={2}>
                    <DescriptionItem term="A">1</DescriptionItem>
                    <DescriptionItem term="B">2</DescriptionItem>
                </DescriptionList>
            </div>,
        );
        await expectNoA11yViolations(container);
    });
});
