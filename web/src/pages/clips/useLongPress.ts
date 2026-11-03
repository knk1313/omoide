import { useCallback, useRef } from "react";

const PRESS_MS = 500;
// これ以上指が動いたら、長押しではなくスクロールとみなす
const MOVE_TOLERANCE_PX = 10;

/**
 * 長押しを見分ける。長押しが成立したら onLongPress を呼び、続く click を 1 回だけ無視させる。
 * 返り値の handlers をボタンに渡し、click の処理では consumeClick() が true なら何もしない。
 */
export function useLongPress(onLongPress: () => void) {
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const start = useRef<{ x: number; y: number } | null>(null);
    const fired = useRef(false);

    const cancel = useCallback(() => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        start.current = null;
    }, []);

    const handlers = {
        onPointerDown: (e: React.PointerEvent) => {
            fired.current = false;
            start.current = { x: e.clientX, y: e.clientY };
            timer.current = setTimeout(() => {
                fired.current = true;
                timer.current = null;
                onLongPress();
            }, PRESS_MS);
        },
        onPointerMove: (e: React.PointerEvent) => {
            if (!start.current) return;
            if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE_PX) cancel();
        },
        onPointerUp: cancel,
        onPointerLeave: cancel,
        onPointerCancel: cancel,
        // 長押しで出る OS のメニュー（画像の保存など）を出さない
        onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    };

    const consumeClick = useCallback(() => {
        const wasLongPress = fired.current;
        fired.current = false;
        return wasLongPress;
    }, []);

    return { handlers, consumeClick };
}
