import { cn } from "@/lib/cn";

// 進み具合の表示（DADS プログレスインジケーターの「リニア」）。テンプレートにないため、DADS の資料とテンプレートのトークンで作った
// （web/README.mdの「テンプレートとの違い」）。
//   - value（0〜1）があれば確定（割合を数字でも示す）、null なら不確定（いつ終わるか分からない処理）。
//   - 色だけに頼らず、ラベルと割合の文字を添える。バーは role="progressbar" で、読み上げにも割合を渡す。
//   - 割合の数字は等幅数字にし、増えても位置がずれないようにする。
//   - align="center" では、ラベル・割合・補足を中央にそろえる（上にアバターを置く WaitingProgress で使う）。

export type ProgressBarProps = {
    /** 画面に出すラベル（例: 「アップロードしています」）。 */
    label: string;
    /** 0〜1。null なら不確定。 */
    value: number | null;
    /** 読み上げ用の名前。画面のラベルが状態で変わるとき（「順番を待っています」など）に、変わらない名前を渡す。 */
    accessibleLabel?: string;
    /** バーの下に置く補足。 */
    description?: string;
    /** start = ラベルを左、割合を右に置く。center = ラベルと割合を並べて、補足とともに中央にそろえる。 */
    align?: "start" | "center";
    className?: string;
};

export function ProgressBar({ label, value, accessibleLabel, description, align = "start", className }: ProgressBarProps) {
    const percent = value === null ? null : Math.round(Math.min(Math.max(value, 0), 1) * 100);
    return (
        <div className={cn("flex flex-col gap-2 text-16 leading-170 tracking-2 text-text", className)}>
            <div className={cn("flex items-baseline gap-2", align === "center" ? "justify-center text-center" : "justify-between")}>
                <span>{label}</span>
                {percent !== null && <span className="nums shrink-0 text-text-muted">{percent}%</span>}
            </div>
            <div
                role="progressbar"
                aria-label={accessibleLabel ?? label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent ?? undefined}
                className="h-2 overflow-hidden rounded-full bg-surface-strong"
            >
                <div
                    className={cn(
                        "h-full rounded-full bg-primary transition-all duration-300 ease-standard",
                        percent === null && "w-full animate-pulse motion-reduce:animate-none",
                    )}
                    style={percent === null ? undefined : { width: `${percent}%` }}
                />
            </div>
            {description && <p className={cn("m-0 text-text-muted", align === "center" && "text-center")}>{description}</p>}
        </div>
    );
}
