import { Spinner } from "@/components/ui/Spinner";
import { Button } from "@/components/ui/Button";
import { NotificationBanner } from "@/components/ui/NotificationBanner";

// 画面のデータを読み込んでいる間と、読み込めなかったときの表示（omoide の業務部品）。テンプレートの Spinner・NotificationBanner・Button で組む。

/** 読み込み中。スピナーの読み上げと同じ文言を、画面にも出す。 */
export function Loading({ label = "読み込んでいます" }: { label?: string }) {
    return (
        <div className="flex items-center justify-center gap-2 py-16 text-16 text-text-muted">
            <Spinner label={label} />
            <span aria-hidden="true">{label}…</span>
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
