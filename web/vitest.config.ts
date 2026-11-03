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
        },
    }),
);
