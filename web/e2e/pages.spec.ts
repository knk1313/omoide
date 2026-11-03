import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalOverflow, waitForHeading } from "./helpers";
import { mockServer } from "./mockServer";

// 画面ごとの表示・アクセシビリティ（mobile / desktop の両方で実行する）。

const PAGES = [
    { path: "/videos", h1: "動画を取り込む" },
    { path: "/", h1: "使うクリップを選ぶ" },
    { path: "/settings", h1: "速度を選ぶ" },
    { path: "/preview", h1: "プレビューを確認" },
    { path: "/no-such-page", h1: "ページが見つかりません" },
] as const;

for (const p of PAGES) {
    test(`${p.path}を表示でき、axeの違反がなく、横にはみ出さない`, async ({ page }) => {
        await mockServer(page);
        await page.goto(p.path);
        await waitForHeading(page, p.h1);
        await expect(page.getByRole("main")).toBeVisible();
        await expectNoHorizontalOverflow(page);
        await expectNoAxeViolations(page, p.path);
    });
}

test("パスワードの画面を表示でき、axeの違反がない", async ({ page }) => {
    await mockServer(page, { loggedIn: false });
    await page.goto("/");
    await waitForHeading(page, "パスワードを入力");
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page, "/login");
});

test("動画がまだなければ、空の一覧を案内する", async ({ page }) => {
    await mockServer(page, { empty: true });
    await page.goto("/");
    // パネルが無ければ、取り込む画面へ移る
    await waitForHeading(page, "動画を取り込む");
    await expect(page.getByText("まだありません")).toBeVisible();
    await expect(page.getByRole("button", { name: "次へ" })).toBeDisabled();
    await expectNoAxeViolations(page, "/videos（空）");
});

const PROBLEMS = [
    { name: "QRコードを読み取っていない", status: 404, heading: "QRコードを読み取ってください" },
    { name: "共有の期限が切れた", status: 410, heading: "共有の期限が切れました" },
] as const;

for (const p of PROBLEMS) {
    test(`${p.name}ときの案内を表示でき、axeの違反がない`, async ({ page }) => {
        await page.route("**/api/**", (route) => route.fulfill({ status: p.status, contentType: "application/json", body: JSON.stringify({ detail: "x" }) }));
        await page.goto("/");
        await expect(page.getByRole("heading", { name: p.heading })).toBeVisible();
        await expectNoAxeViolations(page, p.name);
    });
}

test("Macにつながらないときの案内を表示し、もう一度試せる", async ({ page }) => {
    await page.route("**/api/**", (route) => route.abort("connectionrefused"));
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Macにつながりません" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "同じWi-Fi" })).toBeVisible();
    await expect(page.getByRole("button", { name: "もう一度試す" })).toBeVisible();
    await expectNoAxeViolations(page, "offline");
});
