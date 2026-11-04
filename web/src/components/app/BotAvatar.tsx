import { useEffect, useRef } from "react";
import { mountAvatar } from "open-bot-avatar/dom";
import { cn } from "@/lib/cn";
import { CAMERA_AVATAR } from "./cameraAvatar";

// 待っている間に出す、考え中のカメラのアバター（open-bot-avatar）。飾りなので読み上げない。待っていることは、隣の文言で伝える。
// open-bot-avatar は #rrggbb の色しか受け取らないので、色はトークン（--color-primary・--color-text-on-primary）を実行時に読んで渡す。
// 配色を切り替えると <html data-theme> が変わるので、そのときに読み直す。
// 視差効果を減らす設定（prefers-reduced-motion）のときは、open-bot-avatar が動きを止める。
// 大きさは className（size-avatar など）で決める。正方形の箱いっぱいに描く。

const HEX = /^#(?:[0-9a-f]{3}){1,2}$/i;

/**
 * トークンの色を #rgb か #rrggbb で返す。ビルドで CSS を縮めると、トークンの色は短い書き方（#fff や色の名前）に変わるので、
 * 16 進でないときは canvas に通して #rrggbb にそろえる。読めないとき（jsdom など）は undefined にし、open-bot-avatar の既定の色にする。
 */
function tokenHex(style: CSSStyleDeclaration, name: string): string | undefined {
    const value = style.getPropertyValue(name).trim();
    if (!value || HEX.test(value)) return value || undefined;
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return undefined;
    context.fillStyle = value;
    return HEX.test(context.fillStyle) ? context.fillStyle : undefined;
}

function themeColors(host: HTMLElement) {
    const style = getComputedStyle(host);
    return { color: tokenHex(style, "--color-primary"), eyeColor: tokenHex(style, "--color-text-on-primary") };
}

export function BotAvatar({ className }: { className?: string }) {
    const host = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = host.current!;
        const avatar = mountAvatar(el, { definition: CAMERA_AVATAR, mood: "thinking", label: "", ...themeColors(el) });
        const observer = new MutationObserver(() => avatar.update(themeColors(el)));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        return () => {
            observer.disconnect();
            avatar.destroy();
        };
    }, []);

    return <div ref={host} aria-hidden="true" className={cn("shrink-0", className)} />;
}
