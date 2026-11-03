import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export type IconSize = "sm" | "md" | "lg" | "xl";

// DADS アイコン（Foundations: アイコン）。
// アイコンは必ずラベルと組み合わせて使い、その場合は装飾として aria-hidden にする（label を渡さない）。
// やむを得ずアイコン単体で意味を伝える場合だけ label を渡す（role="img" + aria-label になる）。
export type IconProps = {
    icon: LucideIcon;
    size?: IconSize;
    /** アイコン単体で意味を伝える場合の代替テキスト。ラベルと併用するときは渡さない。 */
    label?: string;
    className?: string;
};

const SIZES: Record<IconSize, string> = {
    sm: "size-icon-sm", // 16px
    md: "size-icon-md", // 20px
    lg: "size-icon-lg", // 24px
    xl: "size-icon-xl", // 44px
};

export function Icon({ icon: Lucide, size = "md", label, className }: IconProps) {
    return (
        <Lucide
            className={cn("shrink-0", SIZES[size], className)}
            aria-hidden={label ? undefined : true}
            role={label ? "img" : undefined}
            aria-label={label}
            focusable="false"
        />
    );
}
