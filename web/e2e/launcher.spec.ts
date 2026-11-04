import { expect, test, type Page } from "@playwright/test";
import type { LauncherStatus } from "../src/api/types";
import { expectNoAxeViolations, expectNoHorizontalOverflow, waitForHeading } from "./helpers";
import { findMisalignments } from "./layout";

// Mac のブラウザーで開く「始める」画面（setlog_join/launcher.py の代わりに、page.route で API に応える）。

const storage = { input: "/Users/me/omoide/input", output: "/Users/me/omoide/output", work: "/Users/me/omoide/.setlog-join" };
const QR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21"><path d="M0 0h7v7H0zM14 0h7v7h-7zM0 14h7v7H0z"/></svg>';

async function mockLauncher(page: Page) {
    let status: LauncherStatus = { state: "idle", url: null, ends_at: null, videos: null, notice: null, storage };
    const calls: string[] = [];
    await page.route("**/launcher/api/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        calls.push(`${request.method()} ${path}`);
        if (path === "/launcher/api/qr.svg") return route.fulfill({ status: 200, contentType: "image/svg+xml", body: QR });
        if (path === "/launcher/api/start") {
            status = { ...status, state: "running", url: "http://192.168.1.20:8080/p/abc", ends_at: new Date(Date.now() + 7200_000).toISOString(), videos: 2, notice: null };
        } else if (path === "/launcher/api/stop") {
            status = { ...status, state: "idle", url: null, ends_at: null, videos: null, notice: "共有を止めました。スマホの画面は使えなくなりました" };
        } else if (path === "/launcher/api/quit") {
            return route.fulfill({ status: 200, contentType: "application/json", body: '{"status":"ok"}' });
        }
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(status) });
    });
    return { calls };
}

test("パスワードを決めて共有を始め、QR コードを読み取れる画面になり、止めて終了できる", async ({ page }) => {
    const { calls } = await mockLauncher(page);
    await page.goto("/launcher");
    await waitForHeading(page, "omoideを始める");
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page, "始める画面");

    // 短いパスワードは送らずに理由を出す
    await page.getByLabel("パスワード※必須", { exact: false }).first().fill("abc");
    await page.getByRole("button", { name: "共有を始める" }).click();
    await expect(page.getByText("＊パスワードは4文字以上にしてください")).toBeVisible();
    expect(calls).not.toContain("POST /launcher/api/start");

    await page.getByLabel(/^パスワード※必須/).fill("secret");
    await page.getByLabel(/^パスワード（確認）/).fill("secret");
    await page.getByRole("button", { name: "共有を始める" }).click();
    await waitForHeading(page, "スマホでQRコードを読み取ってください");
    await expect(page.getByRole("img", { name: "共有のURLのQRコード" })).toBeVisible();
    await expect(page.getByText("http://192.168.1.20:8080/p/abc")).toBeVisible();
    await expectNoAxeViolations(page, "共有中");
    expect(await findMisalignments(page)).toEqual([]);

    await page.getByRole("button", { name: "共有を止める" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "止める" }).click();
    await waitForHeading(page, "omoideを始める");
    await expect(page.getByRole("heading", { name: /共有を止めました/ })).toBeVisible();

    await page.getByLabel(/^パスワード※必須/).fill("secret");
    await page.getByLabel(/^パスワード（確認）/).fill("secret");
    await page.getByRole("button", { name: "共有を始める" }).click();
    await page.getByRole("button", { name: "omoideを終了する" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "終了する" }).click();
    await waitForHeading(page, "omoideを終了しました");
    expect(calls).toContain("POST /launcher/api/quit");
});

test.describe("ダークモード", () => {
    test.use({ colorScheme: "dark" });
    test("始める画面と共有中の画面が、暗い配色でも axe の違反がない", async ({ page }) => {
        await mockLauncher(page);
        await page.goto("/launcher");
        await waitForHeading(page, "omoideを始める");
        await expectNoAxeViolations(page, "始める画面（ダーク）");
        await page.getByLabel(/^パスワード※必須/).fill("secret");
        await page.getByLabel(/^パスワード（確認）/).fill("secret");
        await page.getByRole("button", { name: "共有を始める" }).click();
        await waitForHeading(page, "スマホでQRコードを読み取ってください");
        await expectNoAxeViolations(page, "共有中（ダーク）");
    });
});
