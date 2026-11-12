import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
    it("割合をバーと数字で示し、読み上げにも渡す", () => {
        render(<ProgressBar label="アップロードしています" value={0.426} />);
        const bar = screen.getByRole("progressbar", { name: "アップロードしています" });
        expect(bar).toHaveAttribute("aria-valuenow", "43");
        expect(screen.getByText("43%")).toBeInTheDocument();
        expect(bar.firstElementChild).toHaveStyle({ width: "43%" });
    });

    it("value が null なら不確定で、割合を出さない", () => {
        render(<ProgressBar label="動画を読み取っています" value={null} />);
        expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
        expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
    });

    it("範囲外の値は 0〜100% に収める", () => {
        render(<ProgressBar label="A" value={1.5} />);
        expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    });

    it("画面のラベルが変わっても、読み上げの名前は accessibleLabel のまま", () => {
        render(<ProgressBar label="順番を待っています" accessibleLabel="プレビューを作っています" value={0} description="ほかの画面に移れます" />);
        expect(screen.getByRole("progressbar", { name: "プレビューを作っています" })).toBeInTheDocument();
        expect(screen.getByText("順番を待っています")).toBeInTheDocument();
        expect(screen.getByText("ほかの画面に移れます")).toBeInTheDocument();
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = render(<ProgressBar label="A" value={0.5} />);
        await expectNoA11yViolations(container);
    });
});
