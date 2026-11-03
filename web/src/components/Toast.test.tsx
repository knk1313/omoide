import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ToastProvider, useToast } from "./Toast";

function Trigger({ type }: { type: "success" | "error" }) {
    const { toast } = useToast();
    return <button onClick={() => toast(type === "error" ? "保存できませんでした" : "保存しました", type)}>出す</button>;
}

describe("Toast", () => {
    it("エラーは alert で知らせ、タップで消せる", async () => {
        const user = userEvent.setup();
        render(
            <ToastProvider>
                <Trigger type="error" />
            </ToastProvider>,
        );
        await user.click(screen.getByRole("button", { name: "出す" }));
        const alert = screen.getByRole("alert");
        expect(alert).toHaveTextContent("保存できませんでした");
        await user.click(alert);
        await act(() => new Promise((r) => setTimeout(r, 700)));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("成功は status で知らせる", async () => {
        const user = userEvent.setup();
        render(
            <ToastProvider>
                <Trigger type="success" />
            </ToastProvider>,
        );
        await user.click(screen.getByRole("button", { name: "出す" }));
        expect(screen.getByRole("status")).toHaveTextContent("保存しました");
    });
});
