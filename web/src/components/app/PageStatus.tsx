import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { NotificationBanner } from "@/components/ui/NotificationBanner";
import { ProgressBar, type ProgressBarProps } from "@/components/ui/ProgressBar";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/lib/cn";
import { BotAvatar } from "./BotAvatar";

// 待っている間と、読み込めなかったときの表示（omoide の業務部品）。テンプレートの Spinner・NotificationBanner・Button・ProgressBar と、
// 考え中のアバター（BotAvatar）で組む。アバターは、待つ時間の長いところ（クリップの読み込み、動画の読み取り、プレビューの生成）
// だけに出す（web/README.mdの「テンプレートとの違い」）。

/**
 * 画面のデータを読み込んでいる間。avatar を付けると、スピナーの代わりに考え中のアバターを上に出す。アバターは飾りで、状態は文言で読み上げる。
 * アバターは、読み込みが AVATAR_DELAY_MS を超えたときだけ出す。すぐ終わる読み込みで、アバターが一瞬だけ出てちらつかないようにするため。
 * 画面の全体を置き換えるとき（ログインの確認、始める画面）は title を渡す。見出し（h1）は、画面には出さずに読み上げだけに置く
 * （見出しのない画面にしないため）。
 */
export function Loading({ label = "読み込んでいます", title, avatar = false }: { label?: string; title?: string; avatar?: boolean }) {
    const shown = useShownAfter(avatar ? AVATAR_DELAY_MS : 0);
    return (
        <div className={cn("flex items-center justify-center py-16 text-16 text-text-muted", avatar ? "flex-col gap-4" : "gap-2")}>
            {title && <h1 className="sr-only">{title}</h1>}
            {avatar ? (
                <>
                    {shown && <BotAvatar className="size-avatar" />}
                    {/* 出すまでの間も、読み上げには状態を伝える */}
                    <p role="status" className={cn("m-0", !shown && "sr-only")}>
                        {label}…
                    </p>
                </>
            ) : (
                <>
                    <Spinner label={label} />
                    <span aria-hidden="true">{label}…</span>
                </>
            )}
        </div>
    );
}

/** アバターを出すまで待つ時間。これより早く読み込みが終われば、何も出さずに中身に切り替わる。 */
export const AVATAR_DELAY_MS = 400;

/** ms だけ経ったら true になる。0 なら初めから true。 */
function useShownAfter(ms: number): boolean {
    const [shown, setShown] = useState(ms === 0);
    useEffect(() => {
        if (ms === 0) return;
        const timer = setTimeout(() => setShown(true), ms);
        return () => clearTimeout(timer);
    }, [ms]);
    return shown;
}

/** 時間のかかる処理（動画の読み取り、プレビューの生成）の進み具合。アバターを上の中央に出す。 */
export function WaitingProgress({ className, ...props }: Omit<ProgressBarProps, "align">) {
    return (
        <div className="flex flex-col items-center gap-4 py-4">
            <BotAvatar className="size-avatar" />
            <ProgressBar {...props} align="center" className={cn("w-full", className)} />
        </div>
    );
}

/** 読み込めなかったとき。理由と「もう一度読み込む」を出す。 */
export function LoadFailure({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <NotificationBanner
            type="error"
            live="assertive"
            title={message}
            description="Macでserveが動いているか確かめてから、もう一度読み込んでください。"
            actions={
                <Button variant="outline" block onClick={onRetry}>
                    もう一度読み込む
                </Button>
            }
        />
    );
}
