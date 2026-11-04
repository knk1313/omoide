import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    delete document.documentElement.dataset.theme;
    vi.unstubAllGlobals();
});

// jsdom にない API のスタブ（テンプレートの src/test/setup.ts から、omoide で使うものだけ）。
// matchMedia: レイアウトの判定で使う。既定は「デスクトップ幅」として扱う。
if (typeof window.matchMedia === "undefined") {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
}
