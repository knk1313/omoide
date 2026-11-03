#!/usr/bin/env node
// デザイントークン以外の色・寸法の直書きを検査する。
// 対象: src/ 配下の .ts / .tsx / .css（src/tokens/ と単体テスト *.test.ts(x) は除外。テストは「#123」のような
// 文字列を検証データとして書くことがあり、画面のスタイルではないため）。
// 検出するもの:
//   - 色コード: #rgb / #rrggbb / #rrggbbaa、rgb( / rgba( / hsl( / hsla( / oklch(
//   - 任意値クラス: [#...]、[rgb(...)]、[13px] / [1.5rem] / [85vw] など単位付きの数値
//   - Tailwind 既定の文字サイズ（text-xs / text-sm / text-base / text-lg / text-xl ...）
// テンプレート（workspace-ui-template-dads）の scripts/check-design-tokens.mjs をもとにし、単位のない任意値の検出を足した。
// `npm run lint` から呼ばれる。違反があれば 1 で終了する。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SRC = join(ROOT, "src");
const EXCLUDE_DIRS = [join(SRC, "tokens")];
const EXTENSIONS = new Set([".ts", ".tsx", ".css"]);

const RULES = [
    {
        name: "色コード（#xxx / #xxxxxx）",
        // 16 進 3 / 4 / 6 / 8 桁。#main のような ID 参照は 16 進にならないので一致しない。
        pattern: /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi,
    },
    {
        name: "色関数（rgb / hsl / oklch）",
        pattern: /\b(?:rgba?|hsla?|oklch|oklab)\(/g,
    },
    {
        name: "任意値クラス（色）",
        pattern: /-\[(?:#|rgba?\(|hsla?\(|oklch\()/g,
    },
    {
        name: "任意値クラス（単位付きの寸法）",
        pattern: /\[[^\]\s]*\d+(?:\.\d+)?(?:px|rem|em|vh|vw|dvh|svh|%|ms|s)\b[^\]]*\]/g,
    },
    {
        // omoide での追加: 単位のない任意値（grid-cols-[1fr_2fr]、h-[1lh]、z-[60]）と任意プロパティ（[text-box:…]）も検出する
        name: "任意値クラス（その他）",
        pattern: /(?:^|[\s"'`:!])-?[a-z][a-z0-9-]*-\[[^\]\s]+\]|(?:^|[\s"'`])\[[a-z-]+:[^\]\s]+\]/g,
    },
    {
        name: "Tailwind 既定の文字サイズ（DADS のサイズ text-14 / text-16 ... か text-std-* を使う）",
        pattern: /(?:^|[\s"'`:!])text-(?:xs|sm|base|lg|[2-9]?xl)\b/g,
    },
];

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (EXCLUDE_DIRS.some((d) => path === d || path.startsWith(d + "/"))) continue;
        const stat = statSync(path);
        if (stat.isDirectory()) walk(path, out);
        else if (/\.test\.tsx?$/.test(path)) continue;
        else if ([...EXTENSIONS].some((ext) => path.endsWith(ext))) out.push(path);
    }
    return out;
}

// コメント行は検査しない（説明のために色コードを書くことがある）。
function isComment(line) {
    const t = line.trim();
    return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*");
}

const violations = [];
for (const file of walk(SRC)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
        if (isComment(line)) return;
        for (const rule of RULES) {
            rule.pattern.lastIndex = 0;
            const m = rule.pattern.exec(line);
            if (m) violations.push({ file: relative(ROOT, file), line: i + 1, rule: rule.name, text: m[0] });
        }
    });
}

if (violations.length > 0) {
    console.error(`デザイントークン検査: ${violations.length} 件の直書きが見つかりました。src/tokens/ のトークンを使ってください。`);
    for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.rule}  "${v.text}"`);
    process.exit(1);
}
console.log("デザイントークン検査: OK（色コード・任意値クラスの直書きなし）");
