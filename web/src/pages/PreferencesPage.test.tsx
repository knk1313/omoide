import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { THEME_STORAGE_KEY } from "@/context/ThemePreference";
import { expectNoA11yViolations } from "@/test/axe";
import { fakeServer, loggedIn, notLoggedIn } from "@/test/fakeServer";
import { renderApp } from "@/test/renderApp";

async function openPreferences() {
    fakeServer(loggedIn);
    const app = renderApp("/preferences");
    await screen.findByRole("heading", { name: "設定" });
    return app;
}

describe("設定画面", () => {
    it("ヘッダーの「設定」から開ける", async () => {
        fakeServer(loggedIn);
        const { user } = renderApp("/");
        await user.click(await screen.findByRole("link", { name: "設定" }));
        expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "設定" })).toHaveAttribute("aria-current", "page");
        // 手順の画面ではないので、手順の表示は出さない
        expect(screen.queryByRole("navigation", { name: "手順" })).not.toBeInTheDocument();
    });

    it("ログインする前は「設定」を出さない", async () => {
        fakeServer(notLoggedIn);
        renderApp("/login");
        await screen.findByRole("heading", { name: "パスワードを入力" });
        expect(screen.queryByRole("link", { name: "設定" })).not.toBeInTheDocument();
    });

    it("配色を選ぶと、すぐに切り替わり、このブラウザーに保存する", async () => {
        const { user } = await openPreferences();
        expect(screen.getByRole("radio", { name: "スマホの設定に合わせる" })).toBeChecked();

        await user.click(screen.getByRole("radio", { name: /ダーク/ }));
        expect(document.documentElement.dataset.theme).toBe("dark");
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");

        await user.click(screen.getByRole("radio", { name: /ライト/ }));
        expect(document.documentElement.dataset.theme).toBe("light");

        // 「スマホの設定に合わせる」に戻すと、保存した値を消す
        await user.click(screen.getByRole("radio", { name: "スマホの設定に合わせる" }));
        expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });

    it("前の画面に戻れる", async () => {
        fakeServer(loggedIn);
        const { user } = renderApp("/settings");
        await screen.findByRole("heading", { name: "速度を選ぶ" });
        await user.click(screen.getByRole("link", { name: "設定" }));
        await user.click(await screen.findByRole("button", { name: "前の画面に戻る" }));
        expect(await screen.findByRole("heading", { name: "速度を選ぶ" })).toBeInTheDocument();
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = await openPreferences();
        await expectNoA11yViolations(container);
    });
});
