import { defineConfig, devices } from "@playwright/test";

// E2E テスト（主要な画面の表示、画面遷移、フォームとエラー表示、一覧の操作、ダイアログ、モバイル幅、axe）。
// Mac 側のサーバーの代わりに e2e/mockServer.ts が API に応える。
// `npm run test:e2e`。初回は `npm run test:e2e:install` で Chromium を入れる。
export default defineConfig({
    testDir: "./e2e",
    // 画面の写真（PR 用）は SCREENSHOTS_DIR を指定したときだけ撮る
    testIgnore: process.env.SCREENSHOTS_DIR ? [] : ["**/screenshots.spec.ts"],
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    // E2E は API の応答や描画を待つ時間が長いので、CI のランナーのコアが少なくても（非公開のリポジトリは 2 コア）4 並列にする
    workers: process.env.CI ? 4 : undefined,
    reporter: process.env.CI ? [["github"], ["list"]] : "list",
    use: {
        baseURL: "http://localhost:4317",
        trace: "on-first-retry",
        locale: "ja-JP",
        timezoneId: "Asia/Tokyo",
    },
    // omoide はスマホで使う画面なので、スマホの幅を主にし、Mac のブラウザで開いたときの幅も確かめる
    projects: [
        { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
        { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    ],
    webServer: {
        // 型チェックは CI の check ジョブと npm run check で行うので、ここではビルドだけにする
        command: "npx vite build && npm run preview -- --port 4317 --strictPort",
        url: "http://localhost:4317",
        // 別のプロジェクトのプレビューを誤って使わないよう、毎回このプロジェクトをビルドして起動する
        reuseExistingServer: false,
        timeout: 120000,
    },
});
