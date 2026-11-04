import { Button } from "@/components/ui/Button";
import { NotificationBanner } from "@/components/ui/NotificationBanner";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressBar, type ProgressBarProps } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/cn";
import { BotAvatar } from "./BotAvatar";

// 待っている間と、読み込めなかったときの表示（omoide の業務部品）。テンプレートの NotificationBanner・Button・ProgressBar と、
// 考え中のアバター（BotAvatar）で組む。待っている間は、どの画面でも同じアバターを出す（web/README.mdの「テンプレートとの違い」）。

/**
 * 画面のデータを読み込んでいる間。アバターは飾りで、状態は文言で読み上げる。
 * 画面の全体を置き換えるとき（ログインの確認、始める画面）は title を渡し、見出し（h1）を出す。
 */
export function Loading({ label = "読み込んでいます", title }: { label?: string; title?: string }) {
    const body = (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-16 text-text-muted">
            <BotAvatar className="size-avatar" />
            <p role="status" className="m-0">
                {label}…
            </p>
        </div>
    );
    if (!title) return body;
    return (
        <div className="flex flex-col gap-6">
            <PageHeader title={title} />
            {body}
        </div>
    );
}

/** 時間のかかる処理（動画の読み取り、プレビューや完成版の生成）の進み具合。アバターを横に添える。 */
export function WaitingProgress({ className, ...props }: ProgressBarProps) {
    return (
        <div className="flex items-center gap-4">
            <BotAvatar className="size-avatar-sm" />
            <ProgressBar {...props} className={cn("min-w-0 flex-1", className)} />
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
