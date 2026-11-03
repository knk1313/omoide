import axe, { type AxeResults, type RunOptions } from "axe-core";
import { expect } from "vitest";

// jsdom では色のコントラストを計算できないため、color-contrast ルールは無効化する
// （コントラストは src/tokens/contrast.test.ts と Playwright の axe で検査する）。
const OPTIONS: RunOptions = {
    rules: { "color-contrast": { enabled: false } },
};

function describeViolations(results: AxeResults): string {
    return results.violations
        .map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `  - ${n.html}\n    ${n.failureSummary}`).join("\n")}`)
        .join("\n\n");
}

/** axe-core で描画結果を検査し、違反がゼロであることを確認する。 */
export async function expectNoA11yViolations(container: Element | Document = document): Promise<void> {
    const results = await axe.run(container, OPTIONS);
    expect(results.violations, describeViolations(results)).toHaveLength(0);
}
