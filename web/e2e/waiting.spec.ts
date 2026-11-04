import { expect, test, type Locator, type Page } from "@playwright/test";
import { expectNoAxeViolations, expectNoHorizontalOverflow, waitForHeading, waitForLoaded } from "./helpers";
import { mockServer } from "./mockServer";

// 待っている間の表示（components/app/PageStatus.tsx の Loading と WaitingProgress）。どの画面でも、考え中のカメラのアバター
// （open-bot-avatar）を出す。API の応答を止めて読み込み中のまま検査し、明るい配色と暗い配色の両方で、
// アバターがトークンの色で描かれること、横にはみ出さないこと、axe の違反がないことを確かめる。

/** 読み込み中の画面と、その画面が応答を待つ API。 */
const LOADING: { name: string; path: string; waitsFor: string; text: string; loggedIn?: boolean }[] = [
    { name: "ログインの確認", path: "/", waitsFor: "/api/health", text: "確認しています…" },
    { name: "ログイン画面の確認", path: "/login", waitsFor: "/api/health", text: "確認しています…", loggedIn: false },
    { name: "動画", path: "/videos", waitsFor: "/api/project", text: "読み込んでいます…" },
    { name: "クリップ", path: "/", waitsFor: "/api/clips", text: "読み込んでいます…" },
    { name: "速度", path: "/settings", waitsFor: "/api/project", text: "読み込んでいます…" },
    { name: "設定", path: "/preferences", waitsFor: "/api/storage", text: "読み込んでいます…" },
];

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

/** open-bot-avatar がエラーを出したら、テストを失敗させる。 */
function failOnConsoleError(page: Page) {
    const errors: string[] = [];
    page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    return () => expect(errors.filter((e) => e.includes("open-bot-avatar"))).toEqual([]);
}

/** アバター（open-bot-avatar の描いた箱）。 */
const avatars = (page: Page) => page.locator("[data-avatar-scene]").locator("..");

/** アバターが描かれ、体の色が --color-primary、目の色が --color-text-on-primary と同じであること。 */
async function expectAvatarInTokenColor(avatar: Locator) {
    await expect(avatar).toBeVisible();
    await expect(avatar).toHaveAttribute("aria-hidden", "true");
    const box = await avatar.boundingBox();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.width).toBeCloseTo(box!.height, 0);
    const colors = await avatar.evaluate((el) => {
        // 色の書き方（#fff と #ffffff など）をそろえて比べるため、要素に当てて計算した色にする
        const resolve = (value: string) => {
            const probe = document.createElement("span");
            probe.style.color = value.trim();
            document.body.append(probe);
            const color = getComputedStyle(probe).color;
            probe.remove();
            return color;
        };
        const style = getComputedStyle(el);
        return {
            body: style.color,
            primary: resolve(style.getPropertyValue("--color-primary")),
            eyes: resolve(style.getPropertyValue("--avatar-ink")),
            onPrimary: resolve(style.getPropertyValue("--color-text-on-primary")),
        };
    });
    expect(colors.body).toBe(colors.primary);
    expect(colors.eyes).toBe(colors.onPrimary);
}

for (const scheme of ["light", "dark"] as const) {
    test.describe(`待っている間の表示（${scheme === "light" ? "明るい" : "暗い"}配色）`, () => {
        test.use({ colorScheme: scheme });

        for (const screen of LOADING) {
            test(`${screen.name}（${screen.path}）の読み込み中に、アバターを出す`, async ({ page }) => {
                const checkConsole = failOnConsoleError(page);
                await mockServer(page, { loggedIn: screen.loggedIn ?? true });
                // ログインの確認を先に済ませ、目当ての API で止める（/api/health を止めるときは、それが最初に待つ要求になる）
                const release = await hold(page, `**${screen.waitsFor}`);
                await page.goto(screen.path);

                await expect(page.getByRole("status").filter({ hasText: screen.text })).toBeVisible();
                await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
                await expect(avatars(page)).toHaveCount(1);
                await expectAvatarInTokenColor(avatars(page));
                await expectNoHorizontalOverflow(page);
                await expectNoAxeViolations(page, `${screen.name}の読み込み中（${scheme}）`);

                release();
                await waitForLoaded(page);
                await expect(avatars(page)).toHaveCount(0);
                checkConsole();
            });
        }

        test("始める画面（/launcher）の読み込み中に、アバターを出す", async ({ page }) => {
            const checkConsole = failOnConsoleError(page);
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

            await expect(page.getByRole("status").filter({ hasText: "読み込んでいます…" })).toBeVisible();
            await expectAvatarInTokenColor(avatars(page));
            await expectNoHorizontalOverflow(page);
            await expectNoAxeViolations(page, `始める画面の読み込み中（${scheme}）`);

            release();
            await waitForHeading(page, "omoideを始める");
            await expect(avatars(page)).toHaveCount(0);
            checkConsole();
        });

        test("プレビューを作っている間は、進み具合のバーの上にアバターを出す", async ({ page }) => {
            const checkConsole = failOnConsoleError(page);
            await mockServer(page, { jobSteps: 1000 });
            await page.goto("/preview");
            await waitForHeading(page, "プレビューを確認");

            const progress = page.getByRole("progressbar", { name: "プレビューを作っています" });
            await expect(progress).toBeVisible();
            await expect(avatars(page)).toHaveCount(1);
            await expectAvatarInTokenColor(avatars(page));
            // アバターをバーの上に置き、横の中央をそろえる
            const [a, p] = [await avatars(page).boundingBox(), await progress.boundingBox()];
            expect(a!.y + a!.height).toBeLessThanOrEqual(p!.y);
            expect(Math.abs(a!.x + a!.width / 2 - (p!.x + p!.width / 2))).toBeLessThanOrEqual(1);
            await expectNoHorizontalOverflow(page);
            await expectNoAxeViolations(page, `プレビューの生成中（${scheme}）`);
            checkConsole();
        });

        test("動画を読み取っている間は、進み具合のバーの上にアバターを出す", async ({ page }) => {
            const checkConsole = failOnConsoleError(page);
            await mockServer(page, { jobSteps: 1000 });
            await page.goto("/videos");
            await waitForHeading(page, "動画を取り込む");
            await waitForLoaded(page);
            await page.getByLabel("動画ファイル").setInputFiles({ name: "20261101.mov", mimeType: "video/quicktime", buffer: Buffer.from("x") });

            await expect(page.getByRole("progressbar", { name: "20261101.movを読み取っています" })).toBeVisible();
            await expect(avatars(page)).toHaveCount(1);
            await expectAvatarInTokenColor(avatars(page));
            await expectNoHorizontalOverflow(page);
            await expectNoAxeViolations(page, `動画の読み取り中（${scheme}）`);
            checkConsole();
        });
    });
}

test("読み込み中に配色を切り替えると、アバターの色も変わる", async ({ page }) => {
    await mockServer(page);
    const release = await hold(page, "**/api/clips");
    await page.goto("/");
    const avatar = avatars(page);
    await expectAvatarInTokenColor(avatar);
    const light = await avatar.evaluate((el) => getComputedStyle(el).color);

    await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
    await expectAvatarInTokenColor(avatar);
    expect(await avatar.evaluate((el) => getComputedStyle(el).color)).not.toBe(light);
    release();
});

test("視差効果を減らす設定でも、アバターを止めた形で出す", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockServer(page);
    const release = await hold(page, "**/api/clips");
    await page.goto("/");
    await expectAvatarInTokenColor(avatars(page));
    release();
    await waitForLoaded(page);
});
