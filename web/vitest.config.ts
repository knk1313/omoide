import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            environment: "jsdom",
            setupFiles: ["./src/test/setup.ts"],
            // Playwright の E2E は vitest で実行しない
            exclude: ["**/node_modules/**", "**/dist/**", "e2e/**"],
            // テストファイルごとに jsdom とモジュールを作り直さない（CI の 4 コアで 51 秒かかっていた時間の 4 割がこれだった）。
            // 後始末は src/test/setup.ts で、描画・localStorage・差し替えたグローバル（fetch など）をテストごとに戻している
            isolate: false,
        },
    }),
);
