import { expect, test } from "@playwright/test";
import { expectNoAxeViolations, waitForHeading } from "./helpers";
import { mockServer, PASSWORD } from "./mockServer";

// 主要な操作の流れ。移行の前後で同じ結果になることを確かめる。

test("パスワードを間違えるとエラーを表示し、正しいパスワードで手順の画面へ進む", async ({ page }) => {
    await mockServer(page, { loggedIn: false });
    await page.goto("/settings");
    await waitForHeading(page, "パスワードを入力");

    const password = page.getByLabel("パスワード", { exact: true });
    await password.fill("wrong");
    await page.getByRole("button", { name: "接続する" }).click();
    await expect(page.getByRole("alert")).toContainText("パスワードが違います");
    await expect(password).toHaveAttribute("aria-invalid", "true");
    await expectNoAxeViolations(page, "ログインのエラー");

    // 表示を切り替えると入力した文字が見える
    await password.fill(PASSWORD);
    await page.getByRole("button", { name: "パスワードを表示" }).click();
    await expect(password).toHaveAttribute("type", "text");

    await page.getByRole("button", { name: "接続する" }).click();
    // ログインを求められる前に開こうとしていた画面へ戻る
    await waitForHeading(page, "速度を選ぶ");
});

test("動画をアップロードし、撮影日を入れると一覧に加わる", async ({ page }) => {
    await mockServer(page);
    await page.goto("/videos");
    await waitForHeading(page, "動画を取り込む");

    await page.getByLabel("動画ファイル").setInputFiles({ name: "20261101.mov", mimeType: "video/quicktime", buffer: Buffer.from("x") });
    const date = page.getByLabel("この動画を撮影した日");
    await expect(date).toHaveValue("2026-11-01");
    await expectNoAxeViolations(page, "撮影日の入力");
    await date.fill("2026-11-02");
    await page.getByRole("button", { name: "この日付にする" }).click();

    await expect(page.getByLabel("20261101の撮影日")).toHaveValue("2026-11-02");
    await expect(page.getByText(/2026年11月2日.*にしました/)).toBeVisible();
});

test("撮影日にほかの動画と同じ日付や明日以降を選ぶと、保存せずに理由を出す", async ({ page }) => {
    const { calls } = await mockServer(page);
    await page.goto("/videos");
    const oct = page.getByLabel("20261012の撮影日");
    await oct.fill("2026-09-20");
    await expect(oct).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(/「20260919」の撮影日になっています/)).toBeVisible();
    await oct.fill("2099-01-01");
    await expect(page.getByText(/明日以降の日付は入力できません/)).toBeVisible();
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
    await expectNoAxeViolations(page, "撮影日のエラー");

    await oct.fill("2026-10-12");
    await expect(oct).not.toHaveAttribute("aria-invalid");
    await expect(page.getByText(/2026年10月12日.*にしました/)).toBeVisible();
});

test("アップロードに失敗したら、理由を表示して選び直せる", async ({ page }) => {
    await mockServer(page, { failOnce: { "POST /api/videos": [415, "MP4 か MOV の動画を選んでください"] } });
    await page.goto("/videos");
    await page.getByLabel("動画ファイル").setInputFiles({ name: "memo.txt", mimeType: "text/plain", buffer: Buffer.from("x") });
    await expect(page.getByRole("alert")).toContainText("MP4 か MOV の動画を選んでください");
    await expectNoAxeViolations(page, "アップロードの失敗");
    await page.getByRole("button", { name: "閉じる" }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
});

test("クリップを選び、ユーザーで絞り込み、再生して閉じる", async ({ page }) => {
    const { calls } = await mockServer(page);
    await page.goto("/");
    await waitForHeading(page, "使うクリップを選ぶ");

    // 入力した撮影日が見出しになる
    const september = page.getByRole("region", { name: /2026年9月20日/ });
    await expect(september).toBeVisible();
    await expect(page.getByText(/10 件を選択/)).toBeVisible();

    // タップで除外する
    await september.getByRole("button", { name: "ユーザー1・クリップ 1（採用）" }).click();
    await expect(september.getByRole("button", { name: "ユーザー1・クリップ 1（除外）" })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText(/9 件を選択/)).toBeVisible();
    expect(calls.some((c) => c.method === "PATCH" && c.path === "/api/clips/20260919/001-1")).toBe(true);

    // ユーザー2 に絞り込み、そのユーザーだけ使う
    await page.getByRole("radio", { name: /ユーザー2/ }).check();
    await expect(page.getByRole("button", { name: /^ユーザー1・/ })).toHaveCount(0);
    await page.getByRole("button", { name: "ユーザー2だけ使う" }).click();
    await expect(page.getByText(/4 件を選択/)).toBeVisible();
    await page.getByRole("radio", { name: /全員/ }).check();
    await expect(september.getByRole("button", { name: "ユーザー1・クリップ 2（除外）" })).toBeVisible();
    await expectNoAxeViolations(page, "クリップ選択（操作後）");

    // 再生ボタンで単体を再生し、Esc で閉じる
    const play = september.getByRole("button", { name: "ユーザー2・クリップ 1を再生" });
    await play.click();
    const dialog = page.getByRole("dialog", { name: "ユーザー2・クリップ 1の再生" });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("video")).toHaveAttribute("src", "/media/clips/20260919/001-2");
    await expectNoAxeViolations(page, "再生ダイアログ");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(play).toBeFocused();

    // 閉じるボタンでも閉じる
    await play.click();
    await page.getByRole("dialog").getByRole("button", { name: "閉じる" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await page.getByRole("button", { name: "次へ" }).click();
    await waitForHeading(page, "速度を選ぶ");
});

test("速度を選び、プレビューを作って完成版を保存する", async ({ page }) => {
    const { calls } = await mockServer(page);
    await page.goto("/settings");
    await waitForHeading(page, "速度を選ぶ");

    await expect(page.getByRole("radio", { name: /^1x/ })).toBeChecked();
    await page.getByRole("radio", { name: /^2x/ }).check();
    await expect(page.getByRole("radio", { name: /^2x/ })).toBeChecked();
    expect(calls.some((c) => c.method === "PATCH" && c.path === "/api/settings")).toBe(true);
    await expect(page.getByText("約 10秒")).toBeVisible();

    await page.getByRole("button", { name: "プレビューを生成" }).click();
    await waitForHeading(page, "プレビューを確認");
    await expect(page.getByLabel("プレビュー動画")).toBeVisible();

    await page.getByRole("button", { name: "完成版を作る" }).click();
    const save = page.getByRole("link", { name: "保存する" });
    await expect(save).toBeVisible();
    await page.getByLabel("ファイル名").fill("9月の旅行");
    await expect(save).toHaveAttribute("href", `/download/output?name=${encodeURIComponent("9月の旅行")}`);
    await expectNoAxeViolations(page, "完成版の保存");
});

test("採用が 0 件なら、プレビューを作れない理由を表示する", async ({ page }) => {
    await mockServer(page);
    await page.goto("/");
    await waitForHeading(page, "使うクリップを選ぶ");
    await page.getByRole("button", { name: "全解除" }).click();
    await expect(page.getByText("1 件以上選んでください")).toBeVisible();
    await expect(page.getByRole("button", { name: "次へ" })).toBeDisabled();

    await page.goto("/settings");
    await expect(page.getByRole("alert")).toContainText("クリップ選択に戻って選んでください");
    await expect(page.getByRole("button", { name: "プレビューを生成" })).toBeDisabled();
});

test("保存に失敗したら、元に戻して知らせる", async ({ page }) => {
    await mockServer(page, { failOnce: { "PATCH /api/settings": [500, "保存できませんでした"] } });
    await page.goto("/settings");
    // 失敗するとすぐ元に戻るので、check() ではなく click() で選ぶ
    await page.getByRole("radio", { name: /^2x/ }).click();
    await expect(page.getByRole("alert")).toContainText("保存できませんでした");
    await expect(page.getByRole("radio", { name: /^1x/ })).toBeChecked();
    await expectNoAxeViolations(page, "トースト");
});

test("読み込めなければ、もう一度読み込める", async ({ page }) => {
    await mockServer(page, { failOnce: { "GET /api/clips": [500, "読み込めませんでした"] } });
    await page.goto("/");
    await expect(page.getByRole("alert")).toContainText("読み込めませんでした");
    await expectNoAxeViolations(page, "読み込みの失敗");
    await page.getByRole("button", { name: "もう一度読み込む" }).click();
    await waitForHeading(page, "使うクリップを選ぶ");
});

test("手順のナビゲーションで今いる手順が分かる", async ({ page }) => {
    await mockServer(page);
    await page.goto("/settings");
    await waitForHeading(page, "速度を選ぶ");
    await expect(page.locator("[aria-current=step]")).toContainText("速度");
});
