import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, waitForHeading, waitForLoaded } from "./helpers";
import { mockServer } from "./mockServer";
import { PAGES } from "./routes";

// ダークモード。テンプレート（workspace-ui-template-dads）と同じく、全画面を暗い配色で axe に通し、色のコントラストも確かめる。

test.describe("ダークモード（OSの設定が暗い配色）", () => {
    test.use({ colorScheme: "dark" });

    for (const route of PAGES) {
        test(`${route.path}: 暗い配色で表示でき、axeの違反がない`, async ({ page }) => {
            await mockServer(page, { loggedIn: route.loggedIn ?? true, jobSteps: 1 });
            await page.goto(route.path);
            await waitForHeading(page, route.h1);
            await waitForLoaded(page);
            await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
            await expectNoAxeViolations(page, `${route.path}（ダーク）`);
        });
    }

    test("再生のダイアログも、暗い配色でaxeの違反がない", async ({ page }) => {
        await mockServer(page);
        await page.goto("/");
        await waitForHeading(page, "使うクリップを選ぶ");
        await page.getByRole("button", { name: /を再生$/ }).first().click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expectNoAxeViolations(page, "再生ダイアログ（ダーク）");
    });
});

test("表示の前に配色を決め、保存した配色で開く（画面が一瞬白く光らない）", async ({ page }) => {
    await mockServer(page);
    // 最初の描画より前（index.html の先頭のスクリプト）で data-theme が付いていることを確かめる
    await page.addInitScript(() => {
        localStorage.setItem("theme-preference", "dark");
        document.addEventListener("DOMContentLoaded", () => {
            (window as unknown as { themeAtLoad: string }).themeAtLoad = document.documentElement.dataset.theme ?? "";
        });
    });
    await page.goto("/");
    await waitForHeading(page, "使うクリップを選ぶ");
    expect(await page.evaluate(() => (window as unknown as { themeAtLoad: string }).themeAtLoad)).toBe("dark");
});

test("設定画面で配色を選ぶと切り替わる", async ({ page }) => {
    await mockServer(page);
    await page.goto("/");
    await waitForHeading(page, "使うクリップを選ぶ");
    await page.getByRole("link", { name: "設定" }).click();
    await waitForHeading(page, "設定");
    await page.getByRole("radio", { name: /ダーク/ }).check();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByRole("button", { name: "前の画面に戻る" }).click();
    await waitForHeading(page, "使うクリップを選ぶ");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
