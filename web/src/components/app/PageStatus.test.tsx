import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { LoadFailure, Loading } from "./PageStatus";

describe("PageStatus", () => {
    it("読み込み中は、スピナーの読み上げと同じ文言を出す", () => {
        render(<Loading label="確認しています" />);
        expect(screen.getByRole("status")).toHaveTextContent("確認しています");
        expect(screen.getByText("確認しています…")).toHaveAttribute("aria-hidden", "true");
    });

    it("読み込めなければ、理由をすぐ読み上げ、もう一度読み込める", async () => {
        const retry = vi.fn();
        const { container } = render(<LoadFailure message="読み込めませんでした" onRetry={retry} />);
        expect(screen.getByRole("alert")).toHaveTextContent("読み込めませんでした");
        await userEvent.click(screen.getByRole("button", { name: "もう一度読み込む" }));
        expect(retry).toHaveBeenCalledOnce();
        await expectNoA11yViolations(container);
    });
});
