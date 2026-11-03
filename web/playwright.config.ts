import { defineConfig, devices } from "@playwright/test";

// E2E テスト（主要な画面の表示、画面遷移、フォームとエラー表示、一覧の操作、ダイアログ、モバイル幅、axe）。
// Mac 側のサーバーの代わりに e2e/mockServer.ts が API に応える。
// `npm run test:e2e`。初回は `npm run test:e2e:install` で Chromium を入れる。
export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [["github"], ["list"]] : "list",
    use: {
        baseURL: "http://localhost:4173",
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
        command: "npm run build && npm run preview -- --port 4173 --strictPort",
        url: "http://localhost:4173",
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },
});
