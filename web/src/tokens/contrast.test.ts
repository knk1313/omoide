import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// トークンの組み合わせごとに WCAG 2.2 AA のコントラスト比を検査する。
//   テキスト: 4.5:1 以上（DADS はサイズに関わらず 4.5:1 を要求する）
//   非テキスト（枠線・アイコン・グラフの色面・フォーカス）: 3:1 以上
// disabled 状態と chart-seq-4 / 5 は要件の対象外（docs/decisions.md D-12）。

// Vite は new URL("./x", import.meta.url) をアセット参照に変換するため、パスは自前で組み立てる。
const here = dirname(fileURLToPath(import.meta.url));
const files = ["primitives.css", "theme.css"].map((f) => readFileSync(join(here, f), "utf8"));

// --name: value; を集める（@theme の中だけ）。
const raw = new Map<string, string>();
for (const css of files) {
    for (const m of css.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gim)) raw.set(m[1], m[2].trim());
}

function resolve(name: string, depth = 0): string {
    const v = raw.get(name);
    if (!v) throw new Error(`トークンが見つかりません: ${name}`);
    if (depth > 10) throw new Error(`参照が深すぎます: ${name}`);
    const ref = v.match(/^var\((--[a-z0-9-]+)\)$/);
    return ref ? resolve(ref[1], depth + 1) : v;
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace("#", "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
    const lin = [r, g, b].map((c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrast(fg: string, bg: string): number {
    const l1 = luminance(hexToRgb(fg));
    const l2 = luminance(hexToRgb(bg));
    const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
    return (hi + 0.05) / (lo + 0.05);
}

type Pair = [fg: string, bg: string];

// テキストと背景（4.5:1）
const TEXT_PAIRS: Pair[] = [
    ["text", "surface"],
    ["text", "canvas"],
    ["text", "surface-muted"],
    ["text", "surface-strong"],
    ["text", "surface-hover"],
    ["text", "surface-selected"],
    ["text", "primary-surface"],
    ["text-strong", "surface"],
    ["text-strong", "surface-strong"],
    ["text-muted", "surface"],
    ["text-muted", "canvas"],
    ["text-subtle", "canvas"],
    // 地（canvas）の上に直接置く意味色の文字（フォームの ※必須、エラーテキスト、バナーの外の補足など）
    ["error", "canvas"],
    ["success", "canvas"],
    ["warning", "canvas"],
    ["info", "canvas"],
    ["link-hover", "canvas"],
    ["link-active", "canvas"],
    ["link-visited", "canvas"],
    ["trend-up", "canvas"],
    ["trend-down", "canvas"],
    ["text-subtle", "surface"],
    ["text-on-primary", "primary"],
    ["text-on-primary", "primary-hover"],
    ["text-on-primary", "primary-active"],
    ["on-highlight", "surface-highlight"],
    ["primary", "surface"], // テキストボタン・アウトラインボタンのラベル
    ["primary", "canvas"],
    ["primary-hover", "primary-surface"], // テキストボタン hover
    ["primary-hover", "primary-outline-hover"], // アウトラインボタン hover
    ["primary-active", "primary-outline-active"],
    ["link", "surface"],
    ["link", "canvas"],
    ["link-hover", "surface"],
    ["link-active", "surface"],
    ["link-visited", "surface"],
    ["success", "surface"],
    ["error", "surface"],
    ["error-hover", "surface"],
    ["warning", "surface"],
    ["info", "surface"],
    ["neutral", "surface"],
    // 意味色の薄い面の上に置く本文は text（意味色はアイコン・枠線に使い、非テキストとして検査する）
    ["text", "success-surface"],
    ["text", "error-surface"],
    ["text", "warning-surface"],
    ["text", "info-surface"],
    ["text", "neutral-surface"],
    ["text-inverse", "error"], // エラー色の塗りボタン
    ["text-inverse", "success"],
    ["text-inverse", "warning"],
    ["text-inverse", "neutral"],
    ["trend-up", "surface"],
    ["trend-down", "surface"],
    ["text", "focus-ring"], // 黄色のフォーカス背景上の文字（テキストボタン・リンク）
    ["link", "focus-ring"],
    ["primary", "focus-ring"],
];

// 非テキスト（3:1）
const NON_TEXT_PAIRS: Pair[] = [
    ["border", "surface"],
    ["border-on-canvas", "canvas"],
    ["border-on-canvas", "surface"],
    ["border-strong", "surface"],
    ["border-table", "surface"],
    ["border-table", "surface-muted"],
    ["border-table", "surface-selected"],
    ["primary", "surface"], // 塗りボタンと背景、チェックボックスの塗り
    ["primary", "canvas"],
    ["focus", "surface"],
    ["focus", "canvas"],
    // フォーカスリングの黄色は単体では白と 3:1 を満たさないが、黒 4px アウトラインとの 2 重構造で
    // インジケーター全体として 3:1 を確保する（DADS の規定どおり変更しない）。同様に warning-chip（yellow-400）は
    // warning（#927200）の枠線の内側に置く装飾で、コントラストは枠線が担う。
    ["focus-ring", "focus"],
    ["success", "surface"],
    ["error", "surface"],
    ["warning", "surface"],
    ["info", "surface"],
    ["neutral", "surface"],
    ["success", "success-surface"],
    ["error", "error-surface"],
    ["warning", "warning-surface"],
    ["info", "info-surface"],
    ["neutral", "neutral-surface"],
    ["chart-1", "surface"],
    ["chart-2", "surface"],
    ["chart-3", "surface"],
    ["chart-4", "surface"],
    ["chart-5", "surface"],
    ["chart-seq-1", "surface"],
    ["chart-seq-2", "surface"],
    ["chart-seq-3", "surface"],
    ["chart-positive", "surface"],
    ["chart-negative", "surface"],
    ["chart-axis", "surface"],
    ["chart-reference", "surface"],
    ["surface-highlight", "canvas"],
];

describe("デザイントークンのコントラスト（WCAG 2.2 AA）", () => {
    it.each(TEXT_PAIRS)("テキスト %s / 背景 %s は 4.5:1 以上", (fg, bg) => {
        const ratio = contrast(resolve(`--color-${fg}`), resolve(`--color-${bg}`));
        expect(ratio, `${fg} (${resolve(`--color-${fg}`)}) on ${bg} (${resolve(`--color-${bg}`)}) = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
    });

    it.each(NON_TEXT_PAIRS)("非テキスト %s / 背景 %s は 3:1 以上", (fg, bg) => {
        const ratio = contrast(resolve(`--color-${fg}`), resolve(`--color-${bg}`));
        expect(ratio, `${fg} (${resolve(`--color-${fg}`)}) on ${bg} (${resolve(`--color-${bg}`)}) = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3);
    });

    it("DADS の基準値どおり、Gray-420 は白に対して 3:1、Gray-536 は 4.5:1 を満たす", () => {
        expect(contrast("#949494", "#ffffff")).toBeGreaterThanOrEqual(3);
        expect(contrast("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    });
});
