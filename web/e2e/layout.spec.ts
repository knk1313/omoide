import { expect, test, type Page } from "@playwright/test";
import { waitForHeading, waitForLoaded } from "./helpers";
import { findMisalignments, findObscuredFocus } from "./layout";
import { mockServer } from "./mockServer";
import { PAGES, type PageRoute } from "./routes";

// 見た目の崩れを数値で検出する（スクリーンショットの比較では見落としやすい 1〜3px のずれ、固定した帯との重なり）。
// テンプレート（workspace-ui-template-dads）の e2e/layout.spec.ts を omoide の画面に合わせた。

async function open(page: Page, route: PageRoute) {
    await mockServer(page, { loggedIn: route.loggedIn ?? true, jobSteps: 1 });
    await page.goto(route.path);
    await waitForHeading(page, route.h1);
    await waitForLoaded(page);
}

for (const route of PAGES) {
    test(`${route.path}: アイコンや部品が隣の文字の1行目と上下中央でそろっている`, async ({ page }) => {
        await open(page, route);
        expect(await findMisalignments(page)).toEqual([]);
    });
}

for (const route of PAGES) {
    test(`${route.path}: Tabで移動したフォーカスが下部の帯の下に隠れない`, async ({ page }) => {
        await open(page, route);
        expect(await findObscuredFocus(page, 40, "Tab"), "Tab").toEqual([]);
        // ページの末尾から戻るとき（上方向へのスクロール）にも確かめる
        await page.evaluate(() => {
            (document.activeElement as HTMLElement | null)?.blur();
            window.scrollTo(0, document.documentElement.scrollHeight);
        });
        expect(await findObscuredFocus(page, 40, "Shift+Tab"), "Shift+Tab").toEqual([]);
    });
}
