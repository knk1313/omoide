import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import ShareProblem from "./ShareProblem";

describe("ShareProblem", () => {
    it("つながらないときは、考えられる原因を箇条書きにし、もう一度試せる", async () => {
        const { container } = render(<ShareProblem status="offline" />);
        expect(screen.getByRole("heading", { level: 1, name: "Macにつながりません" })).toBeInTheDocument();
        expect(screen.getAllByRole("listitem")).toHaveLength(3);
        expect(screen.getByRole("button", { name: "もう一度試す" })).toBeInTheDocument();
        await expectNoA11yViolations(container);
    });

    it("期限切れでは、もう一度試すボタンを出さない（Macでの操作が要る）", () => {
        render(<ShareProblem status="expired" />);
        expect(screen.getByRole("heading", { name: "共有の期限が切れました" })).toBeInTheDocument();
        expect(screen.queryByRole("button")).not.toBeInTheDocument();
    });
});
