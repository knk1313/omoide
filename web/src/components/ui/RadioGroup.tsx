import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { useFormField, type FieldSize } from "./FormField";
import { Radio } from "./Radio";

// ラジオボタンの集まり。FormField as="fieldset" と組み合わせて使う（項目ラベルが legend、サポート / エラーが fieldset に付く）。
//   <FormField label="連絡方法" as="fieldset" requirement="required">
//     <RadioGroup name="contact" value={v} onChange={setV} options={[...]} />
//   </FormField>
// 同じ name のネイティブ radio なので、矢印キーでの選択移動と Tab での出入りはブラウザが行う。
// ラジオボタンは選択解除できないため、任意項目では「該当なし」のような選択肢を用意する（DADS）。

export type RadioGroupOption = {
    value: string;
    label: ReactNode;
    disabled?: boolean;
};

export type RadioGroupProps = {
    /** 同じグループの radio に付ける name。 */
    name: string;
    options: RadioGroupOption[];
    /** 制御する場合の選択値。 */
    value?: string;
    /** 非制御の場合の初期値。 */
    defaultValue?: string;
    onChange?: (value: string) => void;
    /** 並べる方向。横並びは選択肢が短く少ないときだけ使う。 */
    direction?: "vertical" | "horizontal";
    size?: FieldSize;
    invalid?: boolean;
    className?: string;
};

export function RadioGroup({ name, options, value, defaultValue, onChange, direction = "vertical", size, invalid, className }: RadioGroupProps) {
    const field = useFormField();
    return (
        <div className={cn("flex", direction === "vertical" ? "flex-col" : "flex-row flex-wrap gap-x-6", className)}>
            {options.map((o) => (
                <Radio
                    key={o.value}
                    name={name}
                    value={o.value}
                    size={size}
                    invalid={invalid}
                    disabled={o.disabled}
                    required={field?.required || undefined}
                    checked={value != null ? value === o.value : undefined}
                    defaultChecked={value == null && defaultValue != null ? defaultValue === o.value : undefined}
                    onChange={(e) => {
                        if (e.target.checked) onChange?.(o.value);
                    }}
                >
                    {o.label}
                </Radio>
            ))}
        </div>
    );
}
