import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoA11yViolations } from "@/test/axe";
import { FormField } from "./FormField";
import { Radio } from "./Radio";
import { RadioGroup } from "./RadioGroup";

const OPTIONS = [
    { value: "email", label: "メール" },
    { value: "sms", label: "SMS" },
    { value: "post", label: "郵送", disabled: true },
];

function Controlled({ onChange }: { onChange?: (v: string) => void }) {
    const [value, setValue] = useState("");
    return (
        <FormField label="連絡方法" as="fieldset" requirement="required" supportText="いずれか 1 つ">
            <RadioGroup
                name="contact"
                value={value}
                onChange={(v) => {
                    setValue(v);
                    onChange?.(v);
                }}
                options={OPTIONS}
            />
        </FormField>
    );
}

describe("Radio", () => {
    it("ラベル付きで描画し、クリックで選択できる", async () => {
        const user = userEvent.setup();
        render(<Radio name="a" value="1">選択肢 1</Radio>);
        const radio = screen.getByRole("radio", { name: "選択肢 1" });
        expect(radio).not.toBeChecked();
        await user.click(radio);
        expect(radio).toBeChecked();
    });

    it("size / invalid / disabled に応じたクラスを付ける", () => {
        const { rerender } = render(<Radio aria-label="A" size="sm" />);
        expect(screen.getByRole("radio")).toHaveClass("size-5", "border-2");
        rerender(<Radio aria-label="A" size="md" />);
        expect(screen.getByRole("radio")).toHaveClass("size-6.5");
        rerender(<Radio aria-label="A" size="lg" invalid />);
        expect(screen.getByRole("radio")).toHaveClass("size-9", "border-3", "border-error");
        expect(screen.getByRole("radio")).toHaveAttribute("aria-invalid", "true");
        rerender(<Radio aria-label="A" disabled />);
        expect(screen.getByRole("radio")).toBeDisabled();
    });
});

describe("RadioGroup + FormField(fieldset)", () => {
    it("legend がグループ名になり、各 radio が同じ name を持つ", () => {
        render(<Controlled />);
        const group = screen.getByRole("group", { name: /連絡方法/ });
        expect(group).toHaveAccessibleDescription("いずれか 1 つ");
        const radios = screen.getAllByRole("radio");
        expect(radios).toHaveLength(3);
        for (const r of radios) {
            expect(r).toHaveAttribute("name", "contact");
            expect(r).toHaveAttribute("required");
        }
        expect(screen.getByRole("radio", { name: "郵送" })).toBeDisabled();
    });

    it("クリックで onChange に値を渡し、選択が 1 つだけになる", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<Controlled onChange={onChange} />);
        await user.click(screen.getByRole("radio", { name: "SMS" }));
        expect(onChange).toHaveBeenLastCalledWith("sms");
        expect(screen.getByRole("radio", { name: "SMS" })).toBeChecked();
        await user.click(screen.getByRole("radio", { name: "メール" }));
        expect(onChange).toHaveBeenLastCalledWith("email");
        expect(screen.getByRole("radio", { name: "SMS" })).not.toBeChecked();
    });

    it("矢印キーで選択を移動できる（ネイティブの挙動）", async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<Controlled onChange={onChange} />);
        await user.tab();
        expect(screen.getByRole("radio", { name: "メール" })).toHaveFocus();
        await user.keyboard("{ArrowDown}");
        expect(onChange).toHaveBeenLastCalledWith("sms");
        expect(screen.getByRole("radio", { name: "SMS" })).toHaveFocus();
    });

    it("非制御（defaultValue）と direction / エラーを反映する", () => {
        render(
            <FormField label="A" as="fieldset" errorText="選択してください">
                <RadioGroup name="a" defaultValue="sms" direction="horizontal" options={OPTIONS} />
            </FormField>,
        );
        expect(screen.getByRole("radio", { name: "SMS" })).toBeChecked();
        expect(screen.getByRole("radio", { name: "SMS" })).toHaveAttribute("aria-invalid", "true");
        expect(screen.getByRole("radio", { name: "SMS" }).closest("div")).toHaveClass("flex-row");
    });

    it("アクセシビリティ違反がない", async () => {
        const { container } = render(
            <div>
                <Controlled />
                <FormField label="B" as="fieldset" errorText="選択してください">
                    <RadioGroup name="b" options={OPTIONS} size="lg" />
                </FormField>
            </div>,
        );
        await expectNoA11yViolations(container);
    });
});
