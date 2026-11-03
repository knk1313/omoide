import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/cn";
import { useFormField, type FieldSize } from "./FormField";

// DADS インプットテキスト（HTML 版 input-text.css）。
// 高さ sm 40 / md 48 / lg 56、枠線 1px gray-600（hover で黒、エラーで error）、角丸 8px、パディング 12px 16px。
// 項目ラベル・サポートテキスト・エラーテキストは FormField が担当し、id / aria-describedby / aria-invalid を受け取る。
// プレースホルダー・disabled・readonly・maxlength は原則使わない（DADS の規定）。

export const INPUT_CLASS =
    "box-border max-w-full rounded-8 border border-border-strong bg-surface px-4 py-3 text-16 leading-none tracking-2 text-text-strong hover:border-border-emphasis focus-visible:focus-ring aria-invalid:border-error aria-invalid:hover:border-error-hover disabled:border-border-disabled disabled:bg-disabled-surface disabled:text-text-disabled disabled:hover:border-border-disabled read-only:border-dashed";

export const CONTROL_HEIGHT: Record<FieldSize, string> = {
    sm: "h-control-sm",
    md: "h-control-md",
    lg: "h-control-lg",
};

export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "size"> & {
    size?: FieldSize;
    /** 入力内容に相応しい幅にするときは false にして className で幅を指定する。既定は親の幅いっぱい。 */
    block?: boolean;
    invalid?: boolean;
    ref?: Ref<HTMLInputElement>;
};

export function Input({ size, block = true, invalid, className, id, required, ...props }: InputProps) {
    const field = useFormField();
    const resolvedSize = size ?? field?.size ?? "md";
    const isInvalid = invalid ?? field?.invalid ?? false;
    return (
        <input
            id={id ?? (field && !field.group ? field.id : undefined)}
            aria-describedby={props["aria-describedby"] ?? field?.describedBy}
            aria-invalid={isInvalid || undefined}
            aria-required={required ?? field?.required ? true : undefined}
            className={cn(INPUT_CLASS, CONTROL_HEIGHT[resolvedSize], block ? "w-full" : "", className)}
            {...props}
        />
    );
}
