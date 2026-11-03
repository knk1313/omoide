import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

// テンプレート（workspace-ui-template-dads）の e2e/helpers.ts をもとにしている。

/** axe（WCAG 2.2 AA 相当のタグ + ベストプラクティス）で違反がないことを確かめる。色のコントラストも実ブラウザで検査される。 */
export async function expectNoAxeViolations(page: Page, context?: string): Promise<void> {
    // 固定ヘッダー・下部の帯の下にもぐった要素を target-size の「隠れている」と誤判定させないため、先頭に戻してから検査する。
    await page.evaluate(() => window.scrollTo(0, 0));
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"]).analyze();
    const summary = results.violations
        .map((v) => `${v.id} (${v.impact}) ${v.help}\n  ${v.nodes.map((n) => `${n.target.join(" ")}  ${n.failureSummary?.split("\n")[1] ?? ""}`).join("\n  ")}`)
        .join("\n\n");
    expect(results.violations, `${context ?? page.url()}\n${summary}`).toEqual([]);
}

/** ページ全体で横スクロールが発生していないこと（モバイル幅のリフロー確認）。 */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, "ページ全体が横にはみ出している").toBeLessThanOrEqual(0);
}

/** ページの見出し（h1）が表示されるまで待つ。 */
export async function waitForHeading(page: Page, name: string): Promise<void> {
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}
