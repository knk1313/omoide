import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cn } from "@/lib/cn";
import { useFormField, type FieldSize } from "./FormField";

// DADS ラジオボタン（HTML 版 radio.css）。ネイティブの <input type="radio"> を使う（矢印キーでの移動はブラウザに任せる）。
// サイズ sm 24（丸 20 / 内側 10）、md 32（26 / 12）、lg 44（36 / 16）。枠 2px（lg は 3px）。
// 選択で key-900、hover で key-1100、エラー時は error-1。ラベル付きのときは上下 8px の余白で 44px のタップ領域を確保する。
// 複数のラジオボタンは RadioGroup + FormField as="fieldset" でグループ化する。

export type RadioProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type" | "children"> & {
    /** 選択肢ラベル。省略時は aria-label を必ず渡す。 */
    children?: ReactNode;
    size?: FieldSize;
    invalid?: boolean;
    ref?: Ref<HTMLInputElement>;
};

const SIZE: Record<FieldSize, { box: string; input: string; dot: string; gap: string; label: string; pad: string }> = {
    sm: { box: "size-6", input: "size-5 border-2", dot: "size-2.5", gap: "gap-1", label: "text-16", pad: "py-2" },
    md: { box: "size-8", input: "size-6.5 border-2", dot: "size-3", gap: "gap-2", label: "text-16", pad: "py-2" },
    lg: { box: "size-11", input: "size-9 border-3", dot: "size-4", gap: "gap-3", label: "text-17", pad: "py-3" },
};

export function Radio({ children, size, invalid, className, disabled, ...props }: RadioProps) {
    const field = useFormField();
    const resolvedSize = size ?? field?.size ?? "sm";
    const isInvalid = invalid ?? field?.invalid ?? false;
    const s = SIZE[resolvedSize];

    return (
        <label className={cn("inline-flex w-fit items-start leading-130 tracking-0", s.label, s.gap, children ? s.pad : "", disabled ? "" : "cursor-pointer", className)}>
            {/* 外側の円はホバー時の背景（gray-420）。ラベル 1 行分の高さの枠で上下中央に置き、1 行目の中央に丸をそろえる。 */}
            <span className={cn("flex shrink-0 items-center", children && "h-lh")}>
                <span className={cn("relative flex shrink-0 items-center justify-center rounded-full", s.box, !disabled && "hover:bg-solid-gray-420")}>
                    <input
                        type="radio"
                        disabled={disabled}
                        aria-invalid={isInvalid || undefined}
                        aria-describedby={props["aria-describedby"] ?? field?.describedBy}
                        className={cn(
                            "peer m-0 appearance-none rounded-full border-solid bg-surface",
                            s.input,
                            isInvalid
                                ? "border-error hover:border-error-hover checked:border-error checked:hover:border-error-hover"
                                : "border-border-strong hover:border-border-emphasis checked:border-primary checked:hover:border-primary-strong",
                            "focus-visible:focus-ring",
                            "disabled:border-border-disabled disabled:bg-disabled-surface disabled:hover:border-border-disabled disabled:checked:border-border-disabled",
                        )}
                        {...props}
                    />
                    {/* 選択時の内側の点。input の擬似要素は使えないため兄弟要素で描く。 */}
                    <span
                        aria-hidden="true"
                        className={cn(
                            "pointer-events-none absolute hidden rounded-full peer-checked:block",
                            s.dot,
                            isInvalid ? "bg-error peer-hover:bg-error-hover" : "bg-primary peer-hover:bg-primary-strong",
                            "peer-disabled:bg-disabled peer-disabled:peer-hover:bg-disabled",
                        )}
                    />
                </span>
            </span>
            {children && <span className={cn(disabled ? "text-text-disabled" : "text-text")}>{children}</span>}
        </label>
    );
}
