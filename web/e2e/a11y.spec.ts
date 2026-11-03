import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalOverflow, waitForHeading, waitForLoaded } from "./helpers";
import { mockServer } from "./mockServer";
import { PAGES, type PageRoute } from "./routes";

// axe では見つけにくいアクセシビリティの検査。テンプレート（workspace-ui-template-dads）の e2e/a11y.spec.ts を omoide の画面に合わせた。
//   - 400% 拡大（320px 幅）でのリフロー（WCAG 1.4.10）
//   - 文字間隔を広げたときに文字が切れない（WCAG 1.4.12）
//   - 見出しの構造とランドマーク（スクリーンリーダーでの移動の手がかり）
//   - 強制カラーモード（Windows のハイコントラストなど）で状態が見分けられる

async function open(page: Page, route: PageRoute) {
    await mockServer(page, { loggedIn: route.loggedIn ?? true, jobSteps: 1 });
    await page.goto(route.path);
    await waitForHeading(page, route.h1);
    await waitForLoaded(page);
}

const route = (name: string) => PAGES.find((p) => p.name === name)!;

test.describe("400%拡大（320px幅）", () => {
    test.use({ viewport: { width: 320, height: 256 } });
    for (const r of PAGES) {
        test(`${r.path}が横にはみ出さない`, async ({ page }) => {
            await open(page, r);
            await expectNoHorizontalOverflow(page);
        });
    }
});

/** はみ出しを隠している要素のうち、中の文字が切れているもの（読み上げ専用の要素は除く）。 */
async function findClippedText(page: Page): Promise<string[]> {
    return page.evaluate(() =>
        [...document.querySelectorAll("body *")]
            .filter((el) => {
                if (!el.textContent?.trim() || !el.checkVisibility()) return false;
                const style = getComputedStyle(el);
                if (style.clipPath !== "none" || style.clip !== "auto") return false; // sr-only
                const clips = ["hidden", "clip"].includes(style.overflowX) || ["hidden", "clip"].includes(style.overflowY);
                return clips && (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
            })
            .map((el) => `${el.tagName.toLowerCase()}「${el.textContent!.trim().slice(0, 20)}」`),
    );
}

for (const r of PAGES) {
    test(`${r.path}: 文字間隔を広げても文字が切れない`, async ({ page }) => {
        await open(page, r);
        // WCAG 1.4.12 の値: 行の高さ 1.5、段落の後 2 倍、文字の間隔 0.12 倍、単語の間隔 0.16 倍
        await page.addStyleTag({
            content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }",
        });
        expect(await findClippedText(page)).toEqual([]);
        await expectNoHorizontalOverflow(page);
    });
}

for (const r of PAGES) {
    test(`${r.path}: h1が1つで、見出しのレベルが飛ばず、mainが1つある`, async ({ page }) => {
        await open(page, r);
        const levels = await page.evaluate(() =>
            [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter((h) => h.checkVisibility()).map((h) => Number(h.tagName[1])),
        );
        expect(levels.filter((l) => l === 1), "h1の数").toHaveLength(1);
        const skipped = levels.flatMap((level, i) => (i > 0 && level > levels[i - 1] + 1 ? [`h${levels[i - 1]} → h${level}`] : []));
        expect(skipped, "見出しのレベルが飛んでいる箇所").toEqual([]);
        await expect(page.getByRole("main")).toHaveCount(1);
    });
}

test.describe("強制カラーモード", () => {
    test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ forcedColors: "active" });
    });

    test("ラジオボタンはOSの標準の部品で描き、選択状態が分かる", async ({ page }) => {
        await open(page, route("settings"));
        expect(await page.getByRole("radio", { name: /^1x/ }).evaluate((e) => getComputedStyle(e).appearance)).toBe("auto");
    });

    test("手順の「今いる手順」に印が出る", async ({ page }) => {
        await open(page, route("settings"));
        const outline = await page
            .getByRole("navigation", { name: "手順" })
            .locator("[aria-current=step] [data-step-marker]")
            .evaluate((el) => getComputedStyle(el).outlineStyle);
        expect(outline).toBe("solid");
    });
});
