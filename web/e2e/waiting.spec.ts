import { expect, test, type Page } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalOverflow, waitForHeading, waitForLoaded } from "./helpers";
import { mockServer } from "./mockServer";

// 待っている間の表示（components/app/PageStatus.tsx の Loading）。どの画面の読み込み中も、テンプレートのスピナーを出す。
// API の応答を止めて読み込み中のまま検査し、明るい配色と暗い配色の両方で、横にはみ出さないこと、axe の違反がないことを確かめる。

/** 読み込み中の画面と、その画面が応答を待つ API。 */
const LOADING: { name: string; path: string; waitsFor: string; text: string; loggedIn?: boolean }[] = [
    { name: "ログインの確認", path: "/", waitsFor: "/api/health", text: "確認しています" },
    { name: "ログイン画面の確認", path: "/login", waitsFor: "/api/health", text: "確認しています", loggedIn: false },
    { name: "動画", path: "/videos", waitsFor: "/api/project", text: "読み込んでいます" },
    { name: "クリップ", path: "/", waitsFor: "/api/clips", text: "読み込んでいます" },
    { name: "速度", path: "/settings", waitsFor: "/api/project", text: "読み込んでいます" },
    { name: "設定", path: "/preferences", waitsFor: "/api/storage", text: "読み込んでいます" },
];

/** スピナー（components/ui/Spinner.tsx）。 */
const spinners = (page: Page) => page.locator("main .animate-spin");

/** pattern に合う要求への応答を、返す関数を呼ぶまで止める。止めた後は、先に登録した page.route（モックの API）に渡す。 */
async function hold(page: Page, pattern: string): Promise<() => void> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(pattern, async (route) => {
        await gate;
        await route.fallback();
    });
    return release;
}

for (const scheme of ["light", "dark"] as const) {
    test.describe(`待っている間の表示（${scheme === "light" ? "明るい" : "暗い"}配色）`, () => {
        test.use({ colorScheme: scheme });

        for (const screen of LOADING) {
            test(`${screen.name}（${screen.path}）の読み込み中に、スピナーを出す`, async ({ page }) => {
                await mockServer(page, { loggedIn: screen.loggedIn ?? true });
                // ログインの確認を先に済ませ、目当ての API で止める（/api/health を止めるときは、それが最初に待つ要求になる）
                const release = await hold(page, `**${screen.waitsFor}`);
                await page.goto(screen.path);

                await expect(page.getByRole("status").filter({ hasText: screen.text })).toBeVisible();
                await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
                await expect(spinners(page)).toHaveCount(1);
                await expectNoHorizontalOverflow(page);
                await expectNoAxeViolations(page, `${screen.name}の読み込み中（${scheme}）`);

                release();
                await waitForLoaded(page);
            });
        }

        test("始める画面（/launcher）の読み込み中は、スピナーを出す", async ({ page }) => {
            let release!: () => void;
            const gate = new Promise<void>((resolve) => (release = resolve));
            await page.route("**/launcher/api/status", async (route) => {
                await gate;
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify({ state: "idle", url: null, ends_at: null, videos: null, notice: null, storage: { input: "/i", output: "/o", work: "/w" } }),
                });
            });
            await page.goto("/launcher");

            await expect(page.getByRole("status").filter({ hasText: "読み込んでいます" })).toBeVisible();
            await expect(spinners(page)).toHaveCount(1);
            await expectNoHorizontalOverflow(page);
            await expectNoAxeViolations(page, `始める画面の読み込み中（${scheme}）`);

            release();
            await waitForHeading(page, "omoideを始める");
            await expect(spinners(page)).toHaveCount(0);
        });
    });
}
