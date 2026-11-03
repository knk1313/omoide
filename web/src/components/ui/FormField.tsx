import { createContext, useContext, useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// DADS フォームコントロールラベル（HTML 版 form-control-label.css）。
// 項目ラベル（太字）・要否ラベル（※必須 / ※任意）・サポートテキスト・入力部品・エラーテキスト（＊で始まる）を
// この順に縦に積む。入力部品（Input / Textarea / Select / Combobox / DatePicker / FileUpload / チェックボックス群）は
// useFormField() で id・aria-describedby・aria-invalid・必須・サイズを受け取る。
//
//   <FormField label="氏名" requirement="required" supportText="全角で入力してください" errorText="氏名を入力してください">
//     <Input />
//   </FormField>
//
// チェックボックス・ラジオの集まりには as="fieldset" を使う（ラベルが legend になる）。
// エラーテキストには aria-live / role="alert" を付けない（DADS の規定）。

export type FieldSize = "sm" | "md" | "lg";

export type FormFieldContextValue = {
    /** 入力部品に付ける id。label の for と対応する。 */
    id: string;
    /** サポートテキストとエラーテキストの id。入力部品の aria-describedby に付ける。 */
    describedBy?: string;
    invalid: boolean;
    required: boolean;
    size: FieldSize;
    /** as="fieldset" のとき true。入力部品は label の for ではなく legend と関連付く。 */
    group: boolean;
};

const FormFieldContext = createContext<FormFieldContextValue | null>(null);

/** FormField の外で使ったときは undefined を返す（入力部品を単体でも使えるようにする）。 */
export function useFormField(): FormFieldContextValue | undefined {
    return useContext(FormFieldContext) ?? undefined;
}

export type FormFieldProps = {
    label: ReactNode;
    children: ReactNode;
    /** 要否ラベル。required = 「※必須」（エラー色）、optional = 「※任意」。文字列を渡すとそのまま表示する。 */
    requirement?: "required" | "optional" | string;
    /** 入力形式の条件や例。プレースホルダーの代わりに必ずここに書く。 */
    supportText?: ReactNode;
    /** エラー内容と修正方法。先頭に「＊」がなければ自動で付ける。 */
    errorText?: ReactNode;
    size?: FieldSize;
    /** ラベルを左、入力部品を右に並べる（md 以上）。 */
    direction?: "vertical" | "horizontal";
    /** チェックボックス・ラジオの集まりは fieldset にする。 */
    as?: "div" | "fieldset";
    /** 入力部品の id を固定したいとき。省略時は自動生成。 */
    id?: string;
    /** 編集不可などのステート表示（「編集不可」チップ）。 */
    status?: string;
    className?: string;
};

const ROW_GAP: Record<FieldSize, string> = { sm: "gap-y-1", md: "gap-y-2", lg: "gap-y-2" };
const LABEL_SIZE: Record<FieldSize, string> = { sm: "text-16", md: "text-17", lg: "text-18" };
const ERROR_GAP: Record<FieldSize, string> = { sm: "mt-1", md: "mt-2", lg: "mt-2" };

function withAsterisk(text: ReactNode): ReactNode {
    if (typeof text === "string" && !text.startsWith("＊") && !text.startsWith("*")) return `＊${text}`;
    return text;
}

export function FormField({
    label,
    children,
    requirement,
    supportText,
    errorText,
    size = "md",
    direction = "vertical",
    as = "div",
    id: fixedId,
    status,
    className,
}: FormFieldProps) {
    const autoId = useId();
    const id = fixedId ?? autoId;
    const supportId = `${id}-support`;
    const errorId = `${id}-error`;
    const invalid = Boolean(errorText);
    const describedBy = [supportText ? supportId : null, errorText ? errorId : null].filter(Boolean).join(" ") || undefined;
    const group = as === "fieldset";
    const required = requirement === "required";

    const requirementLabel = requirement === "required" ? "※必須" : requirement === "optional" ? "※任意" : requirement;

    const labelContent = (
        <>
            {label}
            {requirementLabel && (
                <span className={cn("ml-1 text-16 font-normal", required ? "text-error" : "text-text")}>{requirementLabel}</span>
            )}
            {status && (
                <span className="ml-1 inline-block rounded-8 bg-text-subtle p-2 text-16 font-normal leading-none tracking-2 text-text-inverse">{status}</span>
            )}
        </>
    );

    const Wrapper = as;
    const labelClass = cn("justify-self-start font-bold", LABEL_SIZE[size], direction === "horizontal" && "md:pt-3");

    return (
        <FormFieldContext.Provider value={{ id, describedBy, invalid, required, size, group }}>
            <Wrapper
                className={cn(
                    "m-0 grid min-w-0 border-0 p-0 text-16 leading-170 tracking-2 text-text break-words",
                    ROW_GAP[size],
                    direction === "horizontal" && "md:grid-cols-form md:gap-x-6",
                    className,
                )}
                aria-describedby={group ? describedBy : undefined}
                aria-invalid={group && invalid ? true : undefined}
            >
                {group ? (
                    <legend className="contents">
                        <span className={labelClass}>{labelContent}</span>
                    </legend>
                ) : (
                    <label htmlFor={id} className={labelClass}>
                        {labelContent}
                    </label>
                )}
                {supportText && (
                    <p id={supportId} className={cn("m-0 text-text-muted", direction === "horizontal" && "md:col-start-1")}>
                        {supportText}
                    </p>
                )}
                <div className={cn("min-w-0", direction === "horizontal" && "md:col-start-2 md:row-span-2 md:row-start-1")}>
                    {children}
                    {errorText && (
                        <p id={errorId} className={cn("m-0 leading-130 tracking-0 text-error", ERROR_GAP[size])}>
                            {withAsterisk(errorText)}
                        </p>
                    )}
                </div>
            </Wrapper>
        </FormFieldContext.Provider>
    );
}
