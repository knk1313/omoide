import { test } from "@playwright/test";
import { waitForHeading } from "./helpers";
import { mockServer } from "./mockServer";

// PR に載せる画面の写真を撮る。SCREENSHOTS_DIR を指定したときだけ動く。
// SCREENSHOTS_DIR=/tmp/shots npx playwright test screenshots --project=mobile
// （playwright.config.ts の testIgnore で、指定がないときは読み込まない）
const dir = process.env.SCREENSHOTS_DIR;

const SHOTS = [
    { name: "login", path: "/", h1: "パスワードを入力", loggedIn: false },
    { name: "videos", path: "/videos", h1: "動画を取り込む" },
    { name: "clips", path: "/", h1: "使うクリップを選ぶ" },
    { name: "settings", path: "/settings", h1: "速度を選ぶ" },
    { name: "preview", path: "/preview", h1: "プレビューを確認" },
    { name: "not-found", path: "/no-such-page", h1: "ページが見つかりません" },
] as const;

for (const s of SHOTS) {
    test(`${s.name} を撮る`, async ({ page }, info) => {
        await mockServer(page, { loggedIn: "loggedIn" in s ? s.loggedIn : true, jobSteps: 1 });
        await page.goto(s.path);
        await waitForHeading(page, s.h1);
        // 画像と動画の読み込みを待つ
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${dir}/${info.project.name}-${s.name}.png`, fullPage: !!process.env.FULL_PAGE });
    });
}
