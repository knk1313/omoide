import { act, render } from "@testing-library/react";
import { validateAvatar } from "open-bot-avatar";
import { describe, expect, it } from "vitest";
import { BotAvatar } from "./BotAvatar";
import { CAMERA_AVATAR } from "./cameraAvatar";

describe("BotAvatar", () => {
    it("カメラの定義は、open-bot-avatar の決まりを満たす", () => {
        expect(validateAvatar(CAMERA_AVATAR).ok).toBe(true);
    });

    it("トークンの色で描き、配色を切り替えると色を読み直す", async () => {
        const root = document.documentElement;
        root.style.setProperty("--color-primary", "#0017c1");
        // ビルドで縮めた CSS では、白は #fff になる
        root.style.setProperty("--color-text-on-primary", "#fff");
        const { container, unmount } = render(<BotAvatar className="size-avatar" />);
        const host = container.firstElementChild as HTMLElement;
        expect(host).toHaveAttribute("aria-hidden", "true");
        expect(host.style.color).toBe("rgb(0, 23, 193)");
        expect(host.style.getPropertyValue("--avatar-ink")).toBe("#fff");

        root.style.setProperty("--color-primary", "#9db7f9");
        root.dataset.theme = "dark";
        // MutationObserver はマイクロタスクで呼ばれる
        await act(async () => {});
        expect(host.style.color).toBe("rgb(157, 183, 249)");

        unmount();
        root.style.removeProperty("--color-primary");
        root.style.removeProperty("--color-text-on-primary");
    });
});
