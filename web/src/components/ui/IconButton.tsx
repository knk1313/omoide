import type { ButtonHTMLAttributes, Ref } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

// アイコンだけのボタン（閉じる ×、サイドバーの折りたたみ、行のメニューなど）。
// DADS にはアイコン単体のボタンの規定がないため、ボタン（テキスト / アウトライン）の状態表現と
// 44px のターゲットサイズ（sm は tap-area で上下に見えない領域を足す）を適用して設計した。
// 視覚的なラベルがないので label（aria-label）を必須にする。ツールチップが必要なら title を渡す。

export type IconButtonSize = "md" | "sm";
export type IconButtonVariant = "ghost" | "outline";
export type IconButtonTone = "default" | "error";

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
    icon: LucideIcon;
    /** ボタンの目的を表すテキスト（aria-label）。アイコンだけでは意味が伝わらないため必須。 */
    label: string;
    /** md 44px / sm 36px（sm はタップ領域を 44px に広げる）。 */
    size?: IconButtonSize;
    variant?: IconButtonVariant;
    /** error は削除など取り消せない操作。 */
    tone?: IconButtonTone;
    ref?: Ref<HTMLButtonElement>;
};

const BASE =
    "inline-flex shrink-0 items-center justify-center rounded-8 transition-colors focus-visible:focus-ring-fill disabled:border-border-disabled disabled:bg-transparent disabled:text-text-disabled";

const SIZE: Record<IconButtonSize, string> = {
    md: "size-target",
    sm: "tap-area size-9",
};

const ICON_SIZE = { md: "lg", sm: "md" } as const;

const VARIANT: Record<IconButtonTone, Record<IconButtonVariant, string>> = {
    default: {
        ghost: "border-0 bg-transparent text-text hover:bg-surface-muted hover:text-text-strong active:bg-surface-strong",
        outline:
            "border border-border-strong bg-surface text-text hover:border-border-emphasis hover:bg-surface-muted active:bg-surface-strong",
    },
    error: {
        ghost: "border-0 bg-transparent text-error hover:bg-error-surface hover:text-error-hover active:text-error-active",
        outline: "border border-current bg-surface text-error hover:bg-error-outline-hover hover:text-error-hover active:text-error-active",
    },
};

export function IconButton({ icon, label, size = "md", variant = "ghost", tone = "default", className, type = "button", ...props }: IconButtonProps) {
    return (
        <button type={type} aria-label={label} className={cn(BASE, SIZE[size], VARIANT[tone][variant], className)} {...props}>
            <Icon icon={icon} size={ICON_SIZE[size]} />
        </button>
    );
}
