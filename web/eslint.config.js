import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

// テンプレート（workspace-ui-template-dads）の eslint.config.js をもとにしている。
// デザインシステムのガードレール。色・影・文字サイズ・寸法は src/tokens/ のトークンで書く。
// className に書いた文字列（通常の文字列とテンプレート文字列）を正規表現で検査する。
// 色コードや任意値クラスの網羅的な検査は scripts/check-design-tokens.mjs が行う（npm run lint に含まれる）。
const DESIGN_RULES = [
    {
        // トークン以外の影（shadow-sm / shadow-xl / shadow-[…] など）。DADS のエレベーションは shadow-1 〜 shadow-8。
        pattern: String.raw`(^|[\s:!])shadow-(?!([1-8]|none)\b)`,
        message: "影は DADS のエレベーション（shadow-1 〜 shadow-8）を使ってください。",
    },
    {
        // Tailwind 既定のパレット色（bg-gray-100 / text-white-ish など）。DADS のグレーは solid-gray-* / opacity-gray-*。
        pattern: String.raw`(^|[\s:!])(bg|text|border|ring|outline|divide|fill|stroke|from|via|to|accent|caret|decoration)-(slate|gray|zinc|neutral|stone|amber|emerald|teal|sky|indigo|violet|fuchsia|pink|rose)-\d`,
        message: "色は src/tokens/ のトークン（bg-surface / text-text-muted / border-border / bg-solid-gray-50 など）を使ってください。",
    },
    {
        // 色の任意値（bg-[#fff] / text-[rgb(…)] など）
        pattern: String.raw`-\[(#|rgb|hsl|oklch)`,
        message: "色の任意値は使わず、必要なら src/tokens/theme.css にトークンを追加してください。",
    },
    {
        // 寸法の任意値（text-[13px] / w-[68px] / max-w-[85vw] など）
        pattern: String.raw`\[[^\]\s]*\d+(\.\d+)?(px|rem|em|vh|vw|dvh|%|ms)\b`,
        message: "寸法の任意値は使わず、スペーシングスケールか src/tokens/theme.css のトークン（w-sidebar など）を使ってください。",
    },
    {
        // Tailwind 既定の文字サイズ（text-xs 12px / text-sm 14px など）。DADS は 16px 基準で 14px 未満を使わない。
        pattern: String.raw`(^|[\s:!])text-(xs|sm|base|lg|[2-9]?xl)\b`,
        message: "文字サイズは DADS のサイズ（text-14 / text-16 / text-17 ...）かテキストスタイル（text-std-16N-170 など）を使ってください。",
    },
];

export default defineConfig([
    globalIgnores(["dist", "playwright-report", "test-results", "node_modules"]),
    {
        files: ["**/*.{ts,tsx}"],
        extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat["recommended-latest"]],
        languageOptions: { globals: { ...globals.browser, ...globals.node } },
        rules: {
            "no-restricted-syntax": [
                "error",
                ...DESIGN_RULES.flatMap(({ pattern, message }) => [
                    { selector: `Literal[value=/${pattern}/]`, message },
                    { selector: `TemplateElement[value.cooked=/${pattern}/]`, message },
                ]),
            ],
        },
    },
    {
        // 移行中の、まだテンプレートの部品に移していないファイル。移し終えたら外す（docs/migration-decisions.md M-03）。
        files: [
            "src/components/{AppLayout,BottomBar,Button,Card,Checkbox,ConfirmDialog,EmptyState,ErrorBoundary,IconButton,Input,Modal,NotFoundContent,RequiredMark,Select,StatusBadge,StepPlaceholder,Textarea,Toast,Video}.tsx",
            "src/pages/**",
            "src/session/**",
        ],
        rules: { "no-restricted-syntax": "off" },
    },
    {
        // トークンのコントラスト検査は 16 進の色コードを例として書く。
        files: ["src/tokens/**"],
        rules: { "no-restricted-syntax": "off" },
    },
]);
