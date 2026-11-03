import { cn } from "@/lib/cn";
import type { IconSize } from "./Icon";

export type SpinnerProps = {
    size?: IconSize;
    /** スクリーンリーダー向けの状態テキスト。省略時は「読み込み中」。 */
    label?: string;
    /** 周囲のテキスト色を使う場合は true（ボタン内など）。既定はプライマリーカラー。 */
    inheritColor?: boolean;
    className?: string;
};

const SIZES: Record<IconSize, string> = {
    sm: "size-icon-sm border-2",
    md: "size-icon-md border-2",
    lg: "size-icon-lg border-4",
    xl: "size-icon-xl border-4",
};

// 読み込み中を示すスピナー（DADS プログレスインジケーター（不確定）相当）。
// role="status" でスクリーンリーダーに状態を伝える。色だけに頼らず label のテキストを持つ。
export function Spinner({ size = "md", label = "読み込み中", inheritColor = false, className }: SpinnerProps) {
    return (
        <span role="status" className={cn("inline-flex items-center justify-center", className)}>
            <span
                aria-hidden="true"
                className={cn(
                    "inline-block animate-spin rounded-full border-solid border-current border-r-transparent motion-reduce:animate-none",
                    inheritColor ? "" : "text-primary",
                    SIZES[size],
                )}
            />
            <span className="sr-only">{label}</span>
        </span>
    );
}
